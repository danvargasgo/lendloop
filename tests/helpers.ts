/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { internal } from "../convex/_generated/api";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

export const modules = import.meta.glob("../convex/**/!(*.*.*)*.*s");

export const newBackend = () => convexTest(schema, modules);
export type Backend = ReturnType<typeof newBackend>;

// Signs in as a Clerk style user and stores them, the way the app does right after sign in.
export async function signIn(t: Backend, subject: string, name: string) {
  const as = t.withIdentity({ subject, issuer: "https://clerk.test", name, email: `${subject}@example.com` });
  await as.mutation(api.users.store, {});
  return as;
}

export async function makeAdmin(t: Backend, subject: string, name: string) {
  const as = await signIn(t, subject, name);
  await t.mutation(internal.users.setRole, { email: `${subject}@example.com`, role: "admin" });
  return as;
}

export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect((error as { data?: { code?: string } }).data?.code).toBe(code);
    return;
  }
  throw new Error(`Expected the call to fail with ${code}, but it succeeded.`);
}
