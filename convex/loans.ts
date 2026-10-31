import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getCurrentUser, requireAdmin, requireUser } from "./lib/auth";
import { daysBetween, isIsoDate, overlaps, todayIso } from "./lib/dates";
import { fail } from "./lib/errors";

const MAX_LOAN_DAYS = 30;

async function automationFor(ctx: QueryCtx, loanId: Id<"loans">) {
  const events = await ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loanId)).order("desc").take(3);
  return events.map((e) => ({ kind: e.kind, status: e.status, updatedAt: e.updatedAt }));
}

async function nameOf(ctx: QueryCtx, userId: Id<"users">): Promise<string> {
  return (await ctx.db.get(userId))?.name ?? "Unknown";
}

async function approvedLoansFor(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  return await ctx.db.query("loans").withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved")).collect();
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const user = await requireUser(ctx);
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("INVALID", "Dates must look like 2026-11-30.");
    if (startDate < todayIso()) fail("INVALID", "The start date cannot be in the past.");
    if (endDate < startDate) fail("INVALID", "The end date must not be before the start date.");
    if (daysBetween(startDate, endDate) + 1 > MAX_LOAN_DAYS) fail("INVALID", `You can borrow a tool for at most ${MAX_LOAN_DAYS} days.`);

    const tool = await ctx.db.get(toolId);
    if (tool === null) fail("NOT_FOUND", "Listing not found.");
    if (tool.ownerId === user._id) fail("INVALID", "You cannot borrow your own tool.");

    const booked = (await approvedLoansFor(ctx, toolId)).some((l) => overlaps(startDate, endDate, l.startDate, l.endDate));
    if (booked) fail("CONFLICT", "That tool is already booked for those dates.");

    const myLoans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).collect();
    const duplicate = myLoans.some(
      (l) => l.toolId === toolId && l.status === "requested" && overlaps(startDate, endDate, l.startDate, l.endDate),
    );
    if (duplicate) fail("CONFLICT", "You already have a pending request for those dates.");

    const loanId = await ctx.db.insert("loans", {
      toolId,
      toolName: tool.name,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      startDate,
      endDate,
      status: "requested",
    });
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { loanId, event: "requested", attempt: 1 });
    return loanId;
  },
});

// Only the lender can decide, and only while the request is still open. Admins have no say here.
export const decide = mutation({
  args: { loanId: v.id("loans"), decision: v.union(v.literal("approve"), v.literal("decline")) },
  handler: async (ctx, { loanId, decision }) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) fail("NOT_FOUND", "Request not found.");
    if (loan.lenderId !== user._id) fail("FORBIDDEN", "Only the tool's owner can answer this request.");
    if (loan.status !== "requested") fail("CONFLICT", `This request is already ${loan.status}.`);

    if (decision === "approve") {
      const clash = (await approvedLoansFor(ctx, loan.toolId)).some((l) => overlaps(loan.startDate, loan.endDate, l.startDate, l.endDate));
      if (clash) fail("CONFLICT", "Another approved loan already covers those dates.");
    }
    const status = decision === "approve" ? "approved" : "declined";
    await ctx.db.patch(loanId, { status, decidedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { loanId, event: status, attempt: 1 });
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) fail("NOT_FOUND", "Loan not found.");
    if (loan.lenderId !== user._id) fail("FORBIDDEN", "Only the tool's owner can mark it returned.");
    if (loan.status !== "approved") fail("CONFLICT", "Only an approved loan can be marked returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, { loanId, event: "returned", attempt: 1 });
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) fail("NOT_FOUND", "Request not found.");
    if (loan.borrowerId !== user._id) fail("FORBIDDEN", "You can only cancel your own requests.");
    if (loan.status !== "requested") fail("CONFLICT", "Only a pending request can be cancelled.");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return [];
    const loans = await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).order("desc").take(100);
    return await Promise.all(
      loans.map(async (l) => ({
        id: l._id,
        toolName: l.toolName,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        counterpartName: await nameOf(ctx, l.lenderId),
        automation: await automationFor(ctx, l._id),
      })),
    );
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return [];
    const loans = await ctx.db.query("loans").withIndex("by_lender", (q) => q.eq("lenderId", user._id)).order("desc").take(100);
    return await Promise.all(
      loans.map(async (l) => ({
        id: l._id,
        toolName: l.toolName,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        counterpartName: await nameOf(ctx, l.borrowerId),
        automation: await automationFor(ctx, l._id),
      })),
    );
  },
});

export const adminAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    const today = todayIso();
    return await Promise.all(
      loans.map(async (l) => ({
        id: l._id,
        toolName: l.toolName,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        overdue: l.status === "approved" && l.endDate < today,
        borrowerName: await nameOf(ctx, l.borrowerId),
        lenderName: await nameOf(ctx, l.lenderId),
        automation: await automationFor(ctx, l._id),
      })),
    );
  },
});
