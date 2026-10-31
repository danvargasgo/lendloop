import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { sign } from "./lib/hmac";
import { notificationEventValidator } from "./lib/validators";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;

// Sends one signed event to n8n. Failures retry with backoff, and the outcome is stored on the loan
// so a failed automation is visible in the app instead of disappearing.
export const dispatch = internalAction({
  args: { loanId: v.id("loans"), event: notificationEventValidator, attempt: v.number() },
  handler: async (ctx, { loanId, event, attempt }): Promise<void> => {
    const key = `${loanId}:notify:${event}`;
    const record = (status: "sent" | "retrying" | "failed", detail?: string) =>
      ctx.runMutation(internal.automation.record, { loanId, kind: "request_notification", key, status, detail });

    if (await ctx.runQuery(internal.automation.isSent, { key })) return;

    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.WEBHOOK_SECRET;
    if (!url || !secret) {
      await record("failed", "Automation is not configured (N8N_WEBHOOK_URL or WEBHOOK_SECRET missing).");
      return;
    }

    const payload = await ctx.runQuery(internal.automation.notificationPayload, { loanId, event });
    if (payload === null) return;

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await sign(secret, `${timestamp}.${body}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lendloop-timestamp": timestamp,
          "x-lendloop-signature": signature,
          "x-lendloop-idempotency-key": key,
        },
        body,
      });
      if (!response.ok) throw new Error(`n8n answered with status ${response.status}`);
      await record("sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (attempt >= MAX_ATTEMPTS) {
        await record("failed", `Gave up after ${attempt} attempts: ${message}`);
        return;
      }
      await record("retrying", `Attempt ${attempt} failed: ${message}`);
      await ctx.scheduler.runAfter(BASE_DELAY_MS * 2 ** (attempt - 1), internal.notifications.dispatch, {
        loanId,
        event,
        attempt: attempt + 1,
      });
    }
  },
});
