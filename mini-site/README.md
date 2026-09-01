# GCP MSP customer onboard mini-site

Public, unauthenticated Next.js mini-app for [WIV4-2](https://linear.app/wiv/issue/WIV4-2): MSP customers open a one-time link and complete GCP keyless onboarding without a Wiv login.

## Route

`/gcp-onboard/:token`

Backend-issued links use this path (e.g. `https://<host>/gcp-onboard/<raw-token>`). After Google OAuth, the callback redirects to the same path with `?step=configure` (or `?fail=oauth` on grant failure).

## Talks to app-server (token-only)

`NEXT_PUBLIC_APP_SERVER_URL` (default `https://dev-app-server.wiv.ai`):

| Step | Method | Path |
|------|--------|------|
| Connect metadata | GET | `/integrations/gcp/onboard/:token` |
| Start OAuth | GET | `/integrations/gcp/onboard/:token/oauth/start` |
| Configure load | GET | `/integrations/gcp/onboard/:token/session` |
| Configure apply | POST | `/integrations/gcp/onboard/:token/session` |
| Provision poll | GET | `/integrations/gcp/onboard/:token/status` |
| Failure CSV | GET | `/integrations/gcp/onboard/:token/report` |

No Wiv JWT, no impersonation headers from the browser. The path token is the credential.

After a successful provision, the **backend** finalizes the customer-tenant integration (this UI only drives the public wizard).

## Local

```bash
cd mini-site
bun install
cp env.example .env.local   # set NEXT_PUBLIC_APP_SERVER_URL if needed
bun run dev                  # http://localhost:3000/gcp-onboard/<token>
bun run test
bun run typecheck
```

## Layout

This package lives in `gcponboarding/mini-site` so it stays separate from `web-app` and from the Cloud Shell shell scripts in the repo root.
