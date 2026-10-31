import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
  roleValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    // Clerk issuer + subject. Stable, and unlike an email it cannot be changed by the user.
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: roleValidator,
    trustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    // A snapshot, so a loan still reads well after its listing is removed.
    toolName: v.string(),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD, inclusive
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status", ["status"]),

  // One row per automation attempt, keyed so that retries never create duplicates.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    key: v.string(),
    status: v.union(v.literal("sent"), v.literal("retrying"), v.literal("failed")),
    detail: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"]),
});
