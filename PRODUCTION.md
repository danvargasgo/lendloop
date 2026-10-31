# Running LendLoop in production

What I would change, in the order I would do it.

**Identity and access**
- Use a Clerk production instance, require MFA for admins, and manage the admin list through a reviewed process instead of a CLI command on a laptop. Log every role change.
- Add rate limits on the mutations that create data (listings, requests) and on the two HTTP actions.

**Secrets and signing**
- Move `WEBHOOK_SECRET` to a secrets manager and support two keys at once, so it can be rotated without dropping events. Add a nonce store, or shorten the window, to close the five minute replay gap.
- Give n8n its own credentials for the email provider through n8n credentials, never environment variables in a compose file.

**n8n**
- Run n8n in queue mode on PostgreSQL with external task runners, behind TLS, with the editor not exposed to the internet and execution retention set deliberately.
- Replace the mock send with a real provider and pass the idempotency key as its idempotency header. If the provider has none, keep a durable record of handled keys (a database table or Redis), since n8n's static data proved unreliable here.
- Enable the alert node in the error workflow and alert on any `failed` automation event as well.

**Data and privacy**
- Decide retention: delete or anonymize loans and events after a set period, and support a user's right to deletion across Convex and n8n execution history.
- Store dates in each user's time zone. The lab compares UTC calendar days, which is simple and consistent but can be a day off for some users.
- Add an audit log for sensitive actions (admin removals, role and trust changes).

**Web security**
- Add a Content Security Policy tailored to Clerk, and keep the existing headers.
- Dependency and secret scanning in CI, and pinned base images.

**Reliability and operations**
- Separate Convex development and production deployments with deploy keys in CI, and run migrations deliberately.
- Dashboards and alerts on the failed event rate, retry counts, and the age of the oldest pending reminder.
- End to end tests with a browser against a test Clerk instance, which this exercise lacks.
- Back up n8n's database, and keep the workflow JSON in git as the source of truth.
