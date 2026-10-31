import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { expectCode, inDays, makeAdmin, newBackend, signIn } from "./helpers";

// Scheduled notifications are queued by the loan mutations. Fake timers keep them from firing here.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const drill = { name: "Cordless drill", category: "power tools", condition: "good", description: "18V, two batteries" } as const;

describe("public and anonymous access", () => {
  test("the public list shows name and category only", async () => {
    const t = newBackend();
    const ana = await signIn(t, "ana", "Ana");
    await ana.mutation(api.tools.create, drill);

    const list = await t.query(api.tools.listPublic, {});
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["category", "id", "name"]);
  });

  test("anonymous callers cannot write", async () => {
    const t = newBackend();
    await expectCode(t.mutation(api.tools.create, drill), "UNAUTHENTICATED");
    await expectCode(t.mutation(api.users.store, {}), "UNAUTHENTICATED");
  });

  test("anonymous callers get nothing from the private lists", async () => {
    const t = newBackend();
    expect(await t.query(api.tools.listAll, {})).toEqual([]);
    expect(await t.query(api.loans.incoming, {})).toEqual([]);
    expect(await t.query(api.loans.myRequests, {})).toEqual([]);
  });

  test("signed in lists never expose an email address", async () => {
    const t = newBackend();
    const ana = await signIn(t, "ana", "Ana");
    const ben = await signIn(t, "ben", "Ben");
    await ana.mutation(api.tools.create, drill);
    const all = await ben.query(api.tools.listAll, {});
    expect(JSON.stringify(all)).not.toContain("example.com");
    expect(all[0].ownerName).toBe("Ana");
  });
});

describe("roles", () => {
  test("signing in never grants admin, and users cannot promote themselves", async () => {
    const t = newBackend();
    const ana = await signIn(t, "ana", "Ana");
    expect((await ana.query(api.users.me, {}))?.role).toBe("user");
    await ana.mutation(api.users.store, {});
    expect((await ana.query(api.users.me, {}))?.role).toBe("user");
  });

  test("admin only functions reject normal users", async () => {
    const t = newBackend();
    const ana = await signIn(t, "ana", "Ana");
    const ben = await signIn(t, "ben", "Ben");
    const benId = (await ben.query(api.users.me, {}))!.id;
    await expectCode(ana.query(api.users.adminList, {}), "FORBIDDEN");
    await expectCode(ana.query(api.loans.adminAll, {}), "FORBIDDEN");
    await expectCode(ana.mutation(api.users.setTrustedLender, { userId: benId, trusted: true }), "FORBIDDEN");
  });

  test("an admin can list loans and mark a lender as trusted", async () => {
    const t = newBackend();
    const admin = await makeAdmin(t, "root", "Root");
    const ana = await signIn(t, "ana", "Ana");
    const anaId = (await ana.query(api.users.me, {}))!.id;
    await admin.mutation(api.users.setTrustedLender, { userId: anaId, trusted: true });
    expect((await ana.query(api.users.me, {}))?.trustedLender).toBe(true);
    expect(await admin.query(api.loans.adminAll, {})).toEqual([]);
  });
});

describe("listings", () => {
  test("only the owner can edit a listing, not even an admin", async () => {
    const t = newBackend();
    const admin = await makeAdmin(t, "root", "Root");
    const ana = await signIn(t, "ana", "Ana");
    const ben = await signIn(t, "ben", "Ben");
    const toolId = await ana.mutation(api.tools.create, drill);
    const edit = { toolId, ...drill, name: "Renamed" };

    await expectCode(ben.mutation(api.tools.update, edit), "FORBIDDEN");
    await expectCode(admin.mutation(api.tools.update, edit), "FORBIDDEN");
    await ana.mutation(api.tools.update, edit);
    expect((await ana.query(api.tools.mine, {}))[0].name).toBe("Renamed");
  });

  test("other users cannot remove a listing, but the owner and an admin can", async () => {
    const t = newBackend();
    const admin = await makeAdmin(t, "root", "Root");
    const ana = await signIn(t, "ana", "Ana");
    const ben = await signIn(t, "ben", "Ben");
    const first = await ana.mutation(api.tools.create, drill);
    const second = await ana.mutation(api.tools.create, { ...drill, name: "Saw" });

    await expectCode(ben.mutation(api.tools.remove, { toolId: first }), "FORBIDDEN");
    await ana.mutation(api.tools.remove, { toolId: first });
    await admin.mutation(api.tools.remove, { toolId: second });
    expect(await ana.query(api.tools.mine, {})).toEqual([]);
  });

  test("an owner cannot remove a tool that is out on loan, but an admin can and the loan is cancelled", async () => {
    const t = newBackend();
    const admin = await makeAdmin(t, "root", "Root");
    const ana = await signIn(t, "ana", "Ana");
    const ben = await signIn(t, "ben", "Ben");
    const toolId = await ana.mutation(api.tools.create, drill);
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await ana.mutation(api.loans.decide, { loanId, decision: "approve" });

    await expectCode(ana.mutation(api.tools.remove, { toolId }), "CONFLICT");
    await admin.mutation(api.tools.remove, { toolId });
    const loans = await ben.query(api.loans.myRequests, {});
    expect(loans[0].status).toBe("cancelled");
  });

  test("input is validated on the server", async () => {
    const t = newBackend();
    const ana = await signIn(t, "ana", "Ana");
    await expectCode(ana.mutation(api.tools.create, { ...drill, name: "   " }), "INVALID");
    await expectCode(ana.mutation(api.tools.create, { ...drill, name: "x".repeat(81) }), "INVALID");
    await expect(ana.mutation(api.tools.create, { ...drill, category: "weapons" as never })).rejects.toThrow();
  });
});

describe("loans", () => {
  async function scene() {
    const t = newBackend();
    const admin = await makeAdmin(t, "root", "Root");
    const ana = await signIn(t, "ana", "Ana");
    const ben = await signIn(t, "ben", "Ben");
    const cy = await signIn(t, "cy", "Cy");
    const toolId = await ana.mutation(api.tools.create, drill);
    return { t, admin, ana, ben, cy, toolId };
  }

  test("borrowing your own tool, bad dates and long loans are rejected", async () => {
    const { ana, ben, toolId } = await scene();
    await expectCode(ana.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(2) }), "INVALID");
    await expectCode(ben.mutation(api.loans.request, { toolId, startDate: "2020-01-01", endDate: "2020-01-02" }), "INVALID");
    await expectCode(ben.mutation(api.loans.request, { toolId, startDate: inDays(3), endDate: inDays(2) }), "INVALID");
    await expectCode(ben.mutation(api.loans.request, { toolId, startDate: "soon", endDate: "later" }), "INVALID");
    await expectCode(ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(40) }), "INVALID");
  });

  test("only the lender can approve or decline, never the borrower, a stranger or an admin", async () => {
    const { admin, ana, ben, cy, toolId } = await scene();
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });

    await expectCode(ben.mutation(api.loans.decide, { loanId, decision: "approve" }), "FORBIDDEN");
    await expectCode(cy.mutation(api.loans.decide, { loanId, decision: "approve" }), "FORBIDDEN");
    await expectCode(admin.mutation(api.loans.decide, { loanId, decision: "approve" }), "FORBIDDEN");
    await ana.mutation(api.loans.decide, { loanId, decision: "approve" });
    await expectCode(ana.mutation(api.loans.decide, { loanId, decision: "decline" }), "CONFLICT");
  });

  test("overlapping dates cannot be approved twice", async () => {
    const { ana, ben, cy, toolId } = await scene();
    const first = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(5) });
    const second = await cy.mutation(api.loans.request, { toolId, startDate: inDays(4), endDate: inDays(8) });
    await ana.mutation(api.loans.decide, { loanId: first, decision: "approve" });

    await expectCode(ana.mutation(api.loans.decide, { loanId: second, decision: "approve" }), "CONFLICT");
    await expectCode(cy.mutation(api.loans.request, { toolId, startDate: inDays(2), endDate: inDays(3) }), "CONFLICT");
    // Different dates are fine.
    await cy.mutation(api.loans.request, { toolId, startDate: inDays(10), endDate: inDays(12) });
  });

  test("only the lender can mark a loan returned, and only once it is approved", async () => {
    const { ana, ben, toolId } = await scene();
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });

    await expectCode(ana.mutation(api.loans.markReturned, { loanId }), "CONFLICT");
    await ana.mutation(api.loans.decide, { loanId, decision: "approve" });
    await expectCode(ben.mutation(api.loans.markReturned, { loanId }), "FORBIDDEN");
    await ana.mutation(api.loans.markReturned, { loanId });
    expect((await ben.query(api.loans.myRequests, {}))[0].status).toBe("returned");
  });

  test("only the borrower can cancel, and only a pending request", async () => {
    const { ana, ben, toolId } = await scene();
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    await expectCode(ana.mutation(api.loans.cancel, { loanId }), "FORBIDDEN");
    await ben.mutation(api.loans.cancel, { loanId });
    await expectCode(ben.mutation(api.loans.cancel, { loanId }), "CONFLICT");
  });

  test("each person sees only their own requests and incoming requests", async () => {
    const { ana, ben, cy, toolId } = await scene();
    await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });

    expect(await ben.query(api.loans.myRequests, {})).toHaveLength(1);
    expect(await ana.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await cy.query(api.loans.myRequests, {})).toEqual([]);
    expect(await cy.query(api.loans.incoming, {})).toEqual([]);
    expect(await ben.query(api.loans.incoming, {})).toEqual([]);
  });

  test("an approved loan makes the tool unavailable and hides it from the public list", async () => {
    const { t, ana, ben, toolId } = await scene();
    const loanId = await ben.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(3) });
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(1);
    await ana.mutation(api.loans.decide, { loanId, decision: "approve" });
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);
    expect((await ben.query(api.tools.listAll, {}))[0].available).toBe(false);
  });

  test("the category filter narrows the list", async () => {
    const { ana, ben } = await scene();
    await ana.mutation(api.tools.create, { ...drill, name: "Tent", category: "camping" });
    expect(await ben.query(api.tools.listAll, {})).toHaveLength(2);
    const camping = await ben.query(api.tools.listAll, { category: "camping" });
    expect(camping.map((x) => x.name)).toEqual(["Tent"]);
  });
});
