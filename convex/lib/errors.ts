import { ConvexError } from "convex/values";

export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

// ConvexError carries structured data to the client. Plain Errors are redacted in production.
export function fail(code: AppErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}
