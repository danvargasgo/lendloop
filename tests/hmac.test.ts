import { describe, expect, test } from "vitest";
import { isFresh, sign, verify } from "../convex/lib/hmac";
import { daysBetween, isIsoDate, overlaps } from "../convex/lib/dates";

describe("hmac", () => {
  test("a signature verifies for the same secret and message only", async () => {
    const signature = await sign("secret", "1700000000.{}");
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await verify("secret", "1700000000.{}", signature)).toBe(true);
    expect(await verify("other", "1700000000.{}", signature)).toBe(false);
    expect(await verify("secret", "1700000000.{ }", signature)).toBe(false);
  });

  test("malformed signatures are rejected without throwing", async () => {
    for (const bad of ["", "zz", "abc", "00".repeat(31)]) expect(await verify("secret", "m", bad)).toBe(false);
  });

  test("timestamps outside the five minute window are stale", () => {
    const now = 1_700_000_000_000;
    expect(isFresh("1700000000", now)).toBe(true);
    expect(isFresh("1699999800", now)).toBe(true);
    expect(isFresh("1699999600", now)).toBe(false);
    expect(isFresh("1700000400", now)).toBe(false);
    expect(isFresh("", now)).toBe(false);
    expect(isFresh("abc", now)).toBe(false);
  });
});

describe("dates", () => {
  test("validation, spans and overlaps", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-2-3")).toBe(false);
    expect(daysBetween("2026-01-01", "2026-01-04")).toBe(3);
    expect(overlaps("2026-01-01", "2026-01-05", "2026-01-05", "2026-01-09")).toBe(true);
    expect(overlaps("2026-01-01", "2026-01-04", "2026-01-05", "2026-01-09")).toBe(false);
  });
});
