import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";
import { fail } from "./lib/errors";
import { clean } from "./lib/text";
import { categoryValidator, conditionValidator } from "./lib/validators";

async function isOnLoan(ctx: QueryCtx, toolId: Id<"tools">): Promise<boolean> {
  const active = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .first();
  return active !== null;
}

// Public: no sign in. Exactly name and category, nothing about who owns the tool.
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").take(60);
    const out: { id: Id<"tools">; name: string; category: string }[] = [];
    for (const tool of tools) {
      if (!(await isOnLoan(ctx, tool._id))) out.push({ id: tool._id, name: tool.name, category: tool.category });
    }
    return out;
  },
});

// Signed in users also see the owner's first name, condition and availability, but never an email.
export const listAll = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return [];
    const tools =
      category === undefined
        ? await ctx.db.query("tools").order("desc").take(200)
        : await ctx.db.query("tools").withIndex("by_category", (q) => q.eq("category", category)).order("desc").take(200);

    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          ownerName: owner?.name ?? "Unknown",
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: tool.ownerId === user._id,
          available: !(await isOnLoan(ctx, tool._id)),
        };
      }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return [];
    const tools = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).order("desc").take(200);
    return await Promise.all(
      tools.map(async (tool) => ({
        id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        available: !(await isOnLoan(ctx, tool._id)),
      })),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name: clean(args.name, "Name", 80),
      category: args.category,
      condition: args.condition,
      description: clean(args.description, "Description", 500, 0),
    });
  },
});

// Only the owner edits. Admins can remove a listing but cannot rewrite someone else's words.
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, { toolId, ...fields }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (tool === null) fail("NOT_FOUND", "Listing not found.");
    if (tool.ownerId !== user._id) fail("FORBIDDEN", "You can only edit your own listings.");
    await ctx.db.patch(toolId, {
      name: clean(fields.name, "Name", 80),
      category: fields.category,
      condition: fields.condition,
      description: clean(fields.description, "Description", 500, 0),
    });
  },
});

// Owners can remove their own listing unless it is out on loan. Admins can remove any listing,
// and open loans on it are cancelled so nothing is left pointing at a deleted tool.
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (tool === null) fail("NOT_FOUND", "Listing not found.");
    const isOwner = tool.ownerId === user._id;
    if (!isOwner && user.role !== "admin") fail("FORBIDDEN", "You can only remove your own listings.");

    const loans = await ctx.db.query("loans").withIndex("by_tool_status", (q) => q.eq("toolId", toolId)).collect();
    const open = loans.filter((l) => l.status === "requested" || l.status === "approved");
    if (user.role !== "admin" && open.some((l) => l.status === "approved")) {
      fail("CONFLICT", "This tool is out on loan. Mark it returned before removing it.");
    }
    for (const loan of open) await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: Date.now() });
    await ctx.db.delete(toolId);
  },
});
