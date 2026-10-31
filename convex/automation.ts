import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { daysBetween, todayIso } from "./lib/dates";
import { notificationEventValidator } from "./lib/validators";

// The only fields n8n receives. Nothing else about either user, the tool, or the loan is sent.
export type NotificationPayload = {
  event: "requested" | "approved" | "declined" | "returned";
  loanId: string;
  toolName: string;
  status: string;
  startDate: string;
  endDate: string;
  counterpartName: string;
  recipient: { name: string; email: string };
};

export const isSent = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<boolean> => {
    const row = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row?.status === "sent";
  },
});

export const notificationPayload = internalQuery({
  args: { loanId: v.id("loans"), event: notificationEventValidator },
  handler: async (ctx, { loanId, event }): Promise<NotificationPayload | null> => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const lender = await ctx.db.get(loan.lenderId);
    const borrower = await ctx.db.get(loan.borrowerId);
    if (lender === null || borrower === null) return null;
    // A new request goes to the lender. Every answer goes back to the borrower.
    const toLender = event === "requested";
    const recipient = toLender ? lender : borrower;
    const counterpart = toLender ? borrower : lender;
    return {
      event,
      loanId,
      toolName: loan.toolName,
      status: loan.status,
      startDate: loan.startDate,
      endDate: loan.endDate,
      counterpartName: counterpart.name,
      recipient: { name: recipient.name, email: recipient.email },
    };
  },
});

// Upserts by key. A row that is already "sent" is never downgraded or duplicated, which makes retries safe.
export const record = internalMutation({
  args: {
    loanId: v.id("loans"),
    kind: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    key: v.string(),
    status: v.union(v.literal("sent"), v.literal("retrying"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ duplicate: boolean }> => {
    const existing = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing === null) {
      await ctx.db.insert("automationEvents", { ...args, updatedAt: Date.now() });
      return { duplicate: false };
    }
    if (existing.status === "sent") return { duplicate: true };
    await ctx.db.patch(existing._id, { status: args.status, detail: args.detail, updatedAt: Date.now() });
    return { duplicate: false };
  },
});

export type OverdueItem = {
  loanId: string;
  reminderKey: string;
  toolName: string;
  endDate: string;
  daysOverdue: number;
  lenderName: string;
  borrower: { name: string; email: string };
};

// Approved loans past their end date that have not been reminded today. A retried run of the
// workflow therefore gets an empty list for loans whose reminder already went out.
export const overdue = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ today: string; loans: OverdueItem[] }> => {
    const today = todayIso();
    const approved = await ctx.db.query("loans").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    const loans: OverdueItem[] = [];
    for (const loan of approved) {
      if (loan.endDate >= today) continue;
      const reminderKey = `${loan._id}:overdue:${today}`;
      const done = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("key", reminderKey)).unique();
      if (done?.status === "sent") continue;
      const borrower = await ctx.db.get(loan.borrowerId);
      const lender = await ctx.db.get(loan.lenderId);
      if (borrower === null || lender === null) continue;
      loans.push({
        loanId: loan._id,
        reminderKey,
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        lenderName: lender.name,
        borrower: { name: borrower.name, email: borrower.email },
      });
    }
    return { today, loans };
  },
});

export const validLoanId = internalQuery({
  args: { loanId: v.string() },
  handler: async (ctx, { loanId }) => {
    const id = ctx.db.normalizeId("loans", loanId);
    if (id === null) return null;
    return (await ctx.db.get(id)) === null ? null : id;
  },
});
