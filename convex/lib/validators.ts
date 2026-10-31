import { v } from "convex/values";

export const CATEGORIES = [
  "power tools",
  "hand tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;
export const CONDITIONS = ["like new", "good", "fair", "worn"] as const;

export const categoryValidator = v.union(
  v.literal("power tools"),
  v.literal("hand tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const conditionValidator = v.union(
  v.literal("like new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const loanStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);

export const roleValidator = v.union(v.literal("admin"), v.literal("user"));

export const notificationEventValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
);
