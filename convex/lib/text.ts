import { fail } from "./errors";

export function clean(value: string, field: string, max: number, min = 1): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < min) fail("INVALID", `${field} is required.`);
  if (trimmed.length > max) fail("INVALID", `${field} must be at most ${max} characters.`);
  return trimmed;
}
