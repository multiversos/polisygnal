# PolySignal Incident Response Runbook

Last updated: 2026-05-10

Use this checklist when something looks unsafe in production. Keep the first
response calm, reversible, and auditable.

## If A Secret Leaks

1. Revoke or rotate the exposed secret immediately.
2. Redeploy services that use the rotated secret.
3. Search recent commits, build logs, workflow logs, and application logs for
   the exposed value.
4. Remove the secret from tracked files if it was committed, then rotate anyway.
5. Document the exposure window and affected systems.
6. Add or update a test/check that would have caught the leak.

## If Customer Or User Data Is Exposed

1. Isolate the route, feature, or deployment causing exposure.
2. Disable the public path temporarily if needed.
3. Review access logs and determine what data was visible.
4. Preserve evidence without copying secrets into new documents.
5. Prepare user communication if customer data was actually exposed.
6. Add a regression test before re-enabling the route.

## If `/analyze` Is Abused

1. Temporarily disable or hide the analyzer if traffic is disruptive.
2. Activate rate limiting for `/analyze`.
3. Add WAF/IP blocks for obvious automated abuse.
4. Confirm the analyzer still does not fetch arbitrary external URLs.
5. Review logs for submitted payload patterns without storing sensitive inputs.

## If The Frontend Proxy Fails Open

1. Disable or narrow `/api/backend/[...path]`.
2. Confirm the allow-list only contains expected backend route prefixes.
3. Confirm absolute URLs and long query strings are blocked.
4. Redeploy and run production smoke.
5. Review whether any backend hostnames or internal errors were exposed.

## If A Market Import Or Refresh Goes Wrong

1. Do not delete production data automatically.
2. Stop further apply/import/scoring jobs.
3. Document the bad candidates or stale records.
4. Prefer hiding or filtering bad data in frontend while investigating.
5. Prepare a supervised correction plan with dry-run output first.

## Post-Incident Checklist

1. Write a short timeline.
2. Record root cause and blast radius.
3. List customer/user impact, if any.
4. Record secrets rotated or disabled.
5. Record deployments made.
6. Add tests, smoke checks, docs, or monitoring to prevent recurrence.
7. Review whether rate limits, auth, or route ownership need to change.
