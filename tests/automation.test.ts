import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { sign, verify } from "../convex/lib/hmac";
import { todayIso } from "../convex/lib/dates";
import { inDays, newBackend, signIn } from "./helpers";
import type { Backend } from "./helpers";

const SECRET = "test-secret";
const drill = { name: "Cordless drill", category: "power tools", condition: "good", description: "18V" } as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("WEBHOOK_SECRET", SECRET);
  vi.stubEnv("N8N_WEBHOOK_URL", "http://n8n.test/webhook/lendloop/request-events");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function scene() {
  const t = newBackend();
  const ana = await signIn(t, "ana", "Ana");
  const ben = await signIn(t, "ben", "Ben");
  const toolId = await ana.mutation(api.tools.create, drill);
  return { t, ana, ben, toolId };
}

const events = (t: Backend) => t.run(async (ctx) => await ctx.db.query("automationEvents").collect());

describe("notifications sent to n8n", () => {
  test("a new request sends one signed event with only the fields n8n needs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, ben, toolId } = await scene();

    await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://n8n.test/webhook/lendloop/request-events");

    const body = String(init?.body);
    const payload = JSON.parse(body);
    expect(Object.keys(payload).sort()).toEqual(["counterpartName", "endDate", "event", "loanId", "recipient", "startDate", "status", "toolName"]);
    expect(Object.keys(payload.recipient).sort()).toEqual(["email", "name"]);
    expect(payload.event).toBe("requested");
    expect(payload.recipient.name).toBe("Ana"); // the lender is told about a new request
    expect(payload.counterpartName).toBe("Ben");

    const headers = init?.headers as Record<string, string>;
    expect(await verify(SECRET, `${headers["x-lendloop-timestamp"]}.${body}`, headers["x-lendloop-signature"])).toBe(true);
    expect(headers["x-lendloop-idempotency-key"]).toBe(`${payload.loanId}:notify:requested`);
  });

  test("answers go back to the borrower", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, ana, ben, toolId } = await scene();
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await ana.mutation(api.loans.decide, { loanId, decision: "approve" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    const approved = sent.find((p) => p.event === "approved");
    expect(approved.recipient.name).toBe("Ben");
    expect(approved.status).toBe("approved");
  });

  test("a failing webhook is retried, then recorded as failed and shown on the loan", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, ben, toolId } = await scene();

    await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const rows = await events(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("failed");
    expect(rows[0].detail).toContain("Gave up after 5 attempts");
    expect((await ben.query(api.loans.myRequests, {}))[0].automation[0].status).toBe("failed");
  });

  test("a webhook that recovers stops the retries", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, ben, toolId } = await scene();

    await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await events(t))[0].status).toBe("sent");
  });

  test("dispatching the same event again does not notify twice", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, ben, toolId } = await scene();
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.action(internal.notifications.dispatch, { loanId, event: "requested", attempt: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await events(t)).toHaveLength(1);
  });

  test("missing configuration is recorded instead of failing silently", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { t, ben, toolId } = await scene();

    await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await events(t))[0].status).toBe("failed");
  });
});

describe("endpoints called by n8n", () => {
  async function signedHeaders(path: string, body = "", overrides: { secret?: string; timestamp?: string } = {}) {
    const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    const signature = await sign(overrides.secret ?? SECRET, `${timestamp}.${path}.${body}`);
    return { "x-lendloop-timestamp": timestamp, "x-lendloop-signature": signature, "content-type": "application/json" };
  }

  async function overdueLoan(t: Backend) {
    return await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const lender = users.find((u) => u.name === "Ana")!;
      const borrower = users.find((u) => u.name === "Ben")!;
      const toolId = await ctx.db.insert("tools", { ownerId: lender._id, ...drill });
      return await ctx.db.insert("loans", {
        toolId,
        toolName: drill.name,
        borrowerId: borrower._id,
        lenderId: lender._id,
        startDate: "2020-01-01",
        endDate: "2020-01-05",
        status: "approved",
      });
    });
  }

  test("requests without a valid signature are refused", async () => {
    const { t } = await scene();
    const path = "/automation/overdue";
    expect((await t.fetch(path, { method: "GET" })).status).toBe(401);
    expect((await t.fetch(path, { method: "GET", headers: await signedHeaders(path, "", { secret: "wrong" }) })).status).toBe(401);
    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    expect((await t.fetch(path, { method: "GET", headers: await signedHeaders(path, "", { timestamp: stale }) })).status).toBe(401);
    // A signature made for the other endpoint cannot be replayed here.
    expect((await t.fetch(path, { method: "GET", headers: await signedHeaders("/automation/reminders") })).status).toBe(401);
  });

  test("the overdue list contains approved loans past their end date, with only what a reminder needs", async () => {
    const { t, ben, toolId } = await scene();
    await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(2) }); // not approved
    await overdueLoan(t);

    const path = "/automation/overdue";
    const response = await t.fetch(path, { method: "GET", headers: await signedHeaders(path) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.loans).toHaveLength(1);
    expect(Object.keys(data.loans[0]).sort()).toEqual(["borrower", "daysOverdue", "endDate", "lenderName", "loanId", "reminderKey", "toolName"]);
    expect(data.loans[0].borrower).toEqual({ name: "Ben", email: "ben@example.com" });
    expect(data.loans[0].reminderKey).toBe(`${data.loans[0].loanId}:overdue:${todayIso()}`);
  });

  test("writing back the same reminder twice creates one record, and the loan drops off the list", async () => {
    const { t } = await scene();
    const loanId = await overdueLoan(t);
    const path = "/automation/reminders";
    const body = JSON.stringify({ key: `${loanId}:overdue:${todayIso()}`, loanId, status: "sent" });

    const first = await t.fetch(path, { method: "POST", headers: await signedHeaders(path, body), body });
    const second = await t.fetch(path, { method: "POST", headers: await signedHeaders(path, body), body });
    expect(await first.json()).toEqual({ ok: true, duplicate: false });
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect(await events(t)).toHaveLength(1);

    const list = "/automation/overdue";
    const overdue = await (await t.fetch(list, { method: "GET", headers: await signedHeaders(list) })).json();
    expect(overdue.loans).toEqual([]);
  });

  test("a failed reminder can be retried to success, but a sent one is never downgraded", async () => {
    const { t } = await scene();
    const loanId = await overdueLoan(t);
    const path = "/automation/reminders";
    const post = async (status: string) => {
      const body = JSON.stringify({ key: `${loanId}:overdue:${todayIso()}`, loanId, status, detail: "x" });
      return await t.fetch(path, { method: "POST", headers: await signedHeaders(path, body), body });
    };

    await post("failed");
    expect((await events(t))[0].status).toBe("failed");
    await post("sent");
    expect((await events(t))[0].status).toBe("sent");
    await post("failed");
    expect((await events(t))[0].status).toBe("sent");
    expect(await events(t)).toHaveLength(1);
  });

  test("malformed write backs are rejected", async () => {
    const { t } = await scene();
    const loanId = await overdueLoan(t);
    const path = "/automation/reminders";
    const post = async (payload: unknown) => {
      const body = typeof payload === "string" ? payload : JSON.stringify(payload);
      return (await t.fetch(path, { method: "POST", headers: await signedHeaders(path, body), body })).status;
    };
    const key = `${loanId}:overdue:${todayIso()}`;

    expect(await post("not json")).toBe(400);
    expect(await post({ key: "nope", loanId, status: "sent" })).toBe(400);
    expect(await post({ key, loanId, status: "done" })).toBe(400);
    expect(await post({ key: `othe:overdue:${todayIso()}`, loanId, status: "sent" })).toBe(400);
    expect(await post({ key, loanId, status: "sent", detail: "x".repeat(301) })).toBe(400);
    const ghost = "a".repeat(32);
    expect(await post({ key: `${ghost}:overdue:${todayIso()}`, loanId: ghost, status: "sent" })).toBe(404);
    expect(await events(t)).toHaveLength(0);
  });
});
