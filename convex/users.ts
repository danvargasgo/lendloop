import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";
import { roleValidator } from "./lib/validators";

// Called once after sign in. It never touches `role`, so a user cannot promote themselves through it.
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) fail("UNAUTHENTICATED", "Sign in to continue.");

    const email = (identity.email ?? "").slice(0, 200);
    const name = (identity.name ?? identity.givenName ?? (email.split("@")[0] || "Neighbor")).slice(0, 80);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing !== null) {
      if (existing.name !== name || existing.email !== email) await ctx.db.patch(existing._id, { name, email });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return { id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});

// Admin only. Names and the trusted flag are enough to pick who to trust, so emails stay out.
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(200);
    return users.map((u) => ({ id: u._id, name: u.name, role: u.role, trustedLender: u.trustedLender }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (target === null) fail("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

// Internal, so it is not callable from the browser. Run it with the Convex CLI to create the first admin:
//   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const matches = (await ctx.db.query("users").collect()).filter((u) => u.email.toLowerCase() === email.toLowerCase());
    if (matches.length !== 1) fail("NOT_FOUND", `Expected one user with that email, found ${matches.length}. Sign in once first.`);
    await ctx.db.patch(matches[0]._id, { role });
  },
});
