import { ConvexError } from "convex/values";

// Server functions throw ConvexError({ code, message }) for expected problems. Anything else is shown generically.
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Please try again.";
}

export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// The same UTC calendar day the server uses to validate dates.
export const todayIso = () => new Date().toISOString().slice(0, 10);
