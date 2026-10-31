// Sends one signed sample event to the n8n webhook, the same way Convex does.
// Usage: node --env-file=.env.n8n scripts/send-test-event.mjs [--tamper] [--stale] [--broken]
//   --tamper  changes the signature, --stale  uses an old timestamp, --broken  signs a payload that is missing fields
import { createHmac } from "node:crypto";

const secret = process.env.WEBHOOK_SECRET;
if (!secret) throw new Error("WEBHOOK_SECRET is missing. Run with: node --env-file=.env.n8n scripts/send-test-event.mjs");
const url = process.env.N8N_WEBHOOK_URL ?? "http://localhost:5678/webhook/lendloop/request-events";

const payload = {
  event: "requested",
  loanId: "test0000000000000000000000000001",
  toolName: "Cordless drill",
  status: "requested",
  startDate: "2026-12-01",
  endDate: "2026-12-03",
  counterpartName: "Ben",
  recipient: { name: "Ana", email: "ana@example.com" },
};
if (process.argv.includes("--broken")) delete payload.recipient; // a valid signature on a payload the workflow cannot process
const body = JSON.stringify(payload);
const age = process.argv.includes("--stale") ? 3600 : 0;
const timestamp = String(Math.floor(Date.now() / 1000) - age);
const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-lendloop-timestamp": timestamp,
    "x-lendloop-signature": process.argv.includes("--tamper") ? signature.replace(/.$/, (c) => (c === "0" ? "1" : "0")) : signature,
    "x-lendloop-idempotency-key": `${payload.loanId}:notify:requested`,
  },
  body,
});
console.log(response.status, await response.text());
