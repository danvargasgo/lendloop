# LendLoop

Borrow what you need. Lend what you don't.

LendLoop is a neighborhood tool lending board. Neighbors list tools they are happy to lend, ask to borrow each other's tools for a date range, and get automatic notifications and overdue reminders. It is a take-home exercise built with Next.js (App Router), Clerk, Convex, n8n and TypeScript.

## What it does

| Requirement | Where it lives |
| --- | --- |
| Public page with name, tagline, a read-only list (name and category only) and a Clerk sign-in button | `app/page.tsx`, `components/PublicTools.tsx`, `convex/tools.ts` (`listPublic`) |
| List a tool (name, category, condition, description), request to borrow for a date range, approve or decline, mark returned | `convex/tools.ts`, `convex/loans.ts`, `components/` |
| All tools with availability, filterable by category, plus My listings, My requests, Incoming requests | `components/Dashboard.tsx` and its tabs |
| Roles `admin` and `user`, enforced in Convex functions | `convex/lib/auth.ts` and every mutation and query |
| Admin: remove any listing, view all loans, mark a Trusted Lender | `components/AdminPanel.tsx`, `convex/users.ts`, `convex/loans.ts` (`adminAll`) |
| n8n workflow: request notification | `n8n/workflows/request-notifications.json` |
| n8n workflow: daily overdue reminders with write-back | `n8n/workflows/overdue-reminders.json` |
| Signed payloads in both directions, secrets out of code, idempotent write-backs | `convex/lib/hmac.ts`, `convex/http.ts`, `convex/notifications.ts` |
| Retries and an error workflow, no silent failures | `convex/notifications.ts`, `n8n/workflows/error-handler.json` |
| Bonus: automation activity shown on each loan | `AutomationNote` in `components/RequestLists.tsx` |

## Architecture

```
Browser (Next.js, Clerk session)
   |  Clerk JWT                                  public list needs no session
   v
Convex  <-- every query and mutation checks identity and role itself
   |   \
   |    \  mutation schedules  notifications:dispatch   (internal action)
   |     \                         |
   |      \                        |  POST, HMAC signed, minimal payload
   |       \                       v
   |        \              n8n  "request notifications"  --> (mock) notify the user
   |         \
   |          \  <---- GET  /automation/overdue   (HMAC signed)      n8n "overdue reminders"
   |           \  <--- POST /automation/reminders (HMAC signed, idempotent)   runs daily at 9:00
   v
 Convex tables: users, tools, loans, automationEvents
```

Authorization lives in Convex, not in the UI. The dashboard hides tabs a user cannot use, but hiding is a convenience. Every function loads the caller from the verified Clerk identity and checks their role and ownership before touching data.

## Run it locally

You need Node 22 or newer, Docker, and a free Clerk account.

**1. Install**

```bash
npm install
cp .env.example .env.local
cp .env.n8n.example .env.n8n
```

**2. Clerk**

Create a Clerk application and, in its dashboard, activate the Convex integration. Put the test keys in `.env.local` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`). Copy the application's Frontend API URL for the next step.

**3. Convex**

```bash
npx convex dev
```

This creates a deployment and writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` into `.env.local`. Then set the deployment's environment variables, using one shared random value for the signing secret:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set WEBHOOK_SECRET "$(openssl rand -hex 32)"
npx convex env set N8N_WEBHOOK_URL http://localhost:5678/webhook/lendloop/request-events
npx convex env get WEBHOOK_SECRET        # copy this into .env.n8n as WEBHOOK_SECRET=...
```

**4. n8n**

```bash
CONVEX_SITE_URL=<your NEXT_PUBLIC_CONVEX_SITE_URL, see the note below> docker compose up -d
npm run n8n:import
docker compose exec n8n n8n publish:workflow --id=lendloop-error-handler
docker compose exec n8n n8n publish:workflow --id=lendloop-request-events
docker compose exec n8n n8n publish:workflow --id=lendloop-overdue-reminders
docker compose restart n8n
```

Open http://localhost:5678 once to create the n8n owner account. Runs show up under Executions.

> **Cloud Convex cannot reach localhost.** A hosted Convex deployment calls `N8N_WEBHOOK_URL` from the internet, so with a hosted deployment expose n8n through a tunnel (and set `WEBHOOK_URL` and `N8N_WEBHOOK_URL` to the public address). The alternative is a local Convex deployment, where everything stays on your machine. I ran my checks that way (`CONVEX_AGENT_MODE=anonymous npx convex dev`). Inside Docker, n8n reaches a local Convex at `http://host.docker.internal:3211`, which is the default for `CONVEX_SITE_URL`.

**5. Run the app and create the first admin**

```bash
npm run dev
```

Sign in once, then promote yourself. This function is internal, so it cannot be called from a browser:

```bash
npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
```

### Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `.env.local` | Clerk test keys |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` | written by `npx convex dev` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex deployment | lets Convex validate Clerk tokens |
| `WEBHOOK_SECRET` | Convex deployment and `.env.n8n` | shared HMAC key for both directions |
| `N8N_WEBHOOK_URL` | Convex deployment | where Convex sends request events |
| `CONVEX_SITE_URL` | shell, passed to `docker compose` | where n8n reaches the Convex HTTP actions |
| `ALERT_WEBHOOK_URL` | `.env.n8n`, optional | alert target for the error workflow |

No secret is stored in code, in `docker-compose.yml`, or in the exported workflow JSON. CI scans the exports for anything that looks like one.

## Roles and rules

| Action | user | admin |
| --- | --- | --- |
| See name and category of available tools (public) | yes | yes |
| See all tools, owner first name, condition, availability | signed in | signed in |
| List a tool, edit or delete **own** listings | yes | yes |
| Edit someone else's listing | no | no |
| Remove someone else's listing | no | yes (open loans are cancelled) |
| Request to borrow, cancel **own** pending request | yes | yes |
| Approve, decline, mark returned on **own** tools | yes | yes |
| Approve or decline on someone else's tool | no | no |
| View all loans, mark a Trusted Lender | no | yes |

Admins are deliberately not allowed to decide other people's requests or edit their text. Admin power is limited to what the brief gives it. Roles are stored in Convex, never in anything the client can set, and the only way to grant one is the internal `users:setRole` function.

## Automation

**Request notification.** When a request is created, approved, declined or returned, a Convex mutation schedules an internal action. The action builds a minimal payload, signs it and POSTs it to n8n. n8n verifies the signature, builds the message and (in this exercise) mock sends it. A new request goes to the lender, and every answer goes back to the borrower.

**Overdue reminders.** n8n runs daily at 09:00 (and on demand through the "Run now" trigger). It signs a request to `GET /automation/overdue`, sends one reminder per loan, and writes the result back to `POST /automation/reminders`.

**Signing.** Both directions use HMAC SHA 256 with a shared secret and a timestamp, and reject anything older than five minutes. Outbound events sign `timestamp.body`. Inbound calls from n8n sign `timestamp.path.body`, so a signature captured for one endpoint cannot be replayed against the other. Verification uses a constant time comparison.

**Idempotency.**
- Every notification has a key (`loanId:notify:event`). Convex records it and never sends a key already marked `sent`.
- Every reminder has a key (`loanId:overdue:YYYY-MM-DD`). Writing the same key again returns `duplicate: true` and changes nothing, and a `sent` record is never downgraded. A loan reminded today also drops off the overdue list, so a retried workflow run sends nothing twice.
- The idempotency key is forwarded in a header and in n8n's output. With a real email provider, pass it as that provider's idempotency header so a replayed delivery is not sent twice (the mock send has nothing to dedupe against).

**Failure handling.**
- A failing webhook is retried up to five times with exponential backoff starting at 30 seconds. Each attempt updates a record on the loan, and after the last one it is marked `failed`. Users and admins see "Notification failed" on the loan, so nothing disappears quietly.
- The n8n HTTP requests retry three times. Both workflows name the error workflow, which logs a structured failure and has an optional alert node (disabled until you set `ALERT_WEBHOOK_URL`).
- A signed event that n8n cannot process returns a 500, which is what triggers Convex's retry.

## Security and data minimization

- **Server side authorization everywhere.** Each function derives the caller from the verified Clerk token, never from an argument. Tests cover each role boundary.
- **Identity key.** Users are matched on Clerk's `tokenIdentifier` (issuer plus subject), which a user cannot change, and not on their email.
- **No self promotion.** Signing in cannot change a role. The one way to grant admin is an internal function.
- **Public data.** The public list returns exactly an id, name and category. No owner, no description, no condition.
- **Signed in data.** Other users appear by name only. Emails are never sent to the browser.
- **n8n receives only what it needs.** Event, loan id, tool name, status, the two dates, the other party's first name, and the recipient's name and email. Nothing else about either user, no ids of users, no descriptions. Reminders carry the borrower's name and email, the tool name, the due date and days overdue.
- **n8n logs are masked.** The mock send keeps only `a***@example.com` and the subject.
- **Input validation on the server.** Names and descriptions are trimmed and length checked, categories and conditions are enumerations, dates must be real calendar dates, a loan is at most 30 days and cannot start in the past, and overlapping approved loans are rejected.
- **Least privilege.** The overdue and write-back endpoints are the only HTTP surface Convex exposes, and both require a valid signature. Internal functions (`seed`, `setRole`, `dispatch`, record keeping) cannot be called from a browser.
- **Secrets.** In environment variables on Convex and in n8n's environment. The generated workflows contain no secret and CI checks that.
- **Headers.** `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a restrictive permissions policy. No powered-by header.
- **Known gap.** There is no Content Security Policy, because Clerk's hosted components need a tailored one. It is on the production list.

## Tests

```bash
npm run check    # typecheck, lint and tests
npm test         # 34 tests
```

The tests run the real Convex functions in memory with `convex-test`. They cover the public list, anonymous access, every role boundary, listing and loan rules, overlap handling, the signed delivery to n8n (headers, payload keys and signature), retries and the final failed state, an event that is not sent twice, and the HTTP endpoints (bad, stale and replayed signatures, idempotent write-backs, malformed input). I checked that they can fail by deleting one authorization check and watching a test break.

## What I verified, and what I did not

Verified:
- All 34 tests, typecheck and lint pass, and the production build succeeds.
- On a clean n8n 2.45.7 install with the exported workflows: a signed event is accepted, and a tampered, stale or unsigned one is refused with 401.
- Convex itself dispatched a real signed event and n8n accepted it.
- The overdue workflow ran against a local Convex deployment, wrote its result back, and a second run created no duplicate.
- A signed but malformed event fails loudly with a 500.
- By hand in a browser, against a hosted Convex development deployment and a Clerk test application: sign up and sign in with two accounts, create listings, request, approve and return a loan, the admin views, and a request notification delivered to the local n8n through a tunnel.

Not verified:
- Delivery through a real email or chat provider. The workflows mock send.
- A production deployment. `PRODUCTION.md` lists what I would change first.
- n8n's own deduplication. I tried to make the notification workflow skip repeated keys with n8n's static data. It worked in isolated tests but not in the real workflow, so I removed it. Duplicate protection lives in Convex, where it is tested.

## Repo map

```
app/                 Next.js routes (public page, dashboard)
components/          UI
convex/              schema, functions, HTTP actions, shared helpers
  lib/               auth checks, HMAC, dates, validators
tests/               convex-test suites
n8n/workflows/       exported workflows (import with npm run n8n:import)
scripts/             send-test-event.mjs signs and sends a sample event to n8n
docker-compose.yml   n8n 2.45.7, pinned
PRODUCTION.md        what I would change before running this for real
```

Useful commands: `npm run n8n:test-event` (with `-- --tamper`, `--stale` or `--broken`), `npx convex run seed:overdueDemo` and `seed:clearDemo` (a demo overdue loan, development only), and, to run the reminder workflow once without waiting for 9:00:

```bash
docker compose run --rm --no-deps -e N8N_RUNNERS_BROKER_PORT=5680 n8n execute --id=lendloop-overdue-reminders
```
