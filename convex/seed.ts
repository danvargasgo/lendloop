import { internalMutation } from "./_generated/server";

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

// Development helpers. They are internal, so they cannot be called from the browser, only with the Convex CLI.
//   npx convex run seed:overdueDemo   creates two demo users and a loan that ended three days ago
//   npx convex run seed:clearDemo     removes everything the seed created
// The demo users have fake identities and cannot sign in. They exist to exercise the overdue reminder workflow.
export const overdueDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const lenderId = await ctx.db.insert("users", {
      tokenIdentifier: "seed|ana",
      name: "Ana (demo)",
      email: "ana.demo@example.com",
      role: "user",
      trustedLender: true,
    });
    const borrowerId = await ctx.db.insert("users", {
      tokenIdentifier: "seed|ben",
      name: "Ben (demo)",
      email: "ben.demo@example.com",
      role: "user",
      trustedLender: false,
    });
    const toolId = await ctx.db.insert("tools", {
      ownerId: lenderId,
      name: "Extension ladder",
      category: "hand tools",
      condition: "good",
      description: "Demo listing for the overdue reminder workflow.",
    });
    return await ctx.db.insert("loans", {
      toolId,
      toolName: "Extension ladder",
      borrowerId,
      lenderId,
      startDate: daysAgo(10),
      endDate: daysAgo(3),
      status: "approved",
    });
  },
});

export const clearDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const demoUsers = (await ctx.db.query("users").collect()).filter((u) => u.tokenIdentifier.startsWith("seed|"));
    let removed = 0;
    for (const user of demoUsers) {
      for (const loan of await ctx.db.query("loans").withIndex("by_lender", (q) => q.eq("lenderId", user._id)).collect()) {
        for (const event of await ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loan._id)).collect()) {
          await ctx.db.delete(event._id);
        }
        await ctx.db.delete(loan._id);
        removed++;
      }
      for (const tool of await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect()) {
        await ctx.db.delete(tool._id);
      }
      await ctx.db.delete(user._id);
    }
    return { users: demoUsers.length, loans: removed };
  },
});
