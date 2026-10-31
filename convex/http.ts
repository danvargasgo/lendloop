import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { isFresh, verify } from "./lib/hmac";

const http = httpRouter();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Inbound calls from n8n must carry a fresh timestamp and an HMAC of `${timestamp}.${path}.${body}`.
// Binding the path means a signature captured for one endpoint cannot be replayed against the other.
async function authenticate(request: Request, rawBody: string): Promise<Response | null> {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return json(503, { error: "Automation is not configured." });

  const timestamp = request.headers.get("x-lendloop-timestamp") ?? "";
  const signature = request.headers.get("x-lendloop-signature") ?? "";
  if (!isFresh(timestamp)) return json(401, { error: "Stale or missing timestamp." });

  const path = new URL(request.url).pathname;
  if (!(await verify(secret, `${timestamp}.${path}.${rawBody}`, signature))) return json(401, { error: "Invalid signature." });
  return null;
}

http.route({
  path: "/automation/overdue",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const denied = await authenticate(request, "");
    if (denied) return denied;
    return json(200, await ctx.runQuery(internal.automation.overdue, {}));
  }),
});

const REMINDER_KEY = /^[a-z0-9]+:overdue:\d{4}-\d{2}-\d{2}$/;

// Write back the outcome of a reminder. Posting the same key twice is harmless.
http.route({
  path: "/automation/reminders",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const denied = await authenticate(request, rawBody);
    if (denied) return denied;

    let data: unknown;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "Body must be JSON." });
    }
    const { key, loanId, status, detail } = (data ?? {}) as Record<string, unknown>;
    if (typeof key !== "string" || !REMINDER_KEY.test(key) || typeof loanId !== "string") return json(400, { error: "Invalid key or loanId." });
    if (status !== "sent" && status !== "failed") return json(400, { error: "status must be sent or failed." });
    if (!key.startsWith(`${loanId}:`)) return json(400, { error: "key does not belong to this loan." });
    if (detail !== undefined && (typeof detail !== "string" || detail.length > 300)) return json(400, { error: "Invalid detail." });

    const validId = await ctx.runQuery(internal.automation.validLoanId, { loanId });
    if (validId === null) return json(404, { error: "Loan not found." });

    const result = await ctx.runMutation(internal.automation.record, {
      loanId: validId,
      kind: "overdue_reminder",
      key,
      status,
      detail,
    });
    return json(200, { ok: true, duplicate: result.duplicate });
  }),
});

export default http;
