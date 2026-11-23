# Email sign-in setup (Resend + Cloudflare Pages)

Nobody can open the app (pages, scripts or data) without verifying their email with a 6-digit code.
Until the variables below are set, the site shows a "temporarily closed" page.

## 1. Resend
1. Create a free account at https://resend.com (3,000 emails/month, 100/day).
2. **Domains → Add domain** and add the DNS records it shows. Without a verified domain Resend only
   delivers to your own account email, so other people would not get their code.
3. **API Keys → Create API key** (permission: Sending access). Copy it (starts with `re_`).

No domain? Use Brevo instead (https://brevo.com, 300 emails/day, a verified sender address is enough):
set `BREVO_API_KEY` instead of `RESEND_API_KEY`.

## 2. Cloudflare Pages → your project → Settings → Variables and Secrets (Production)
| Name | Value |
|---|---|
| `AUTH_SECRET` | a long random string (e.g. from https://www.random.org/strings or `openssl rand -hex 32`) — type **Secret** |
| `RESEND_API_KEY` | the `re_...` key — type **Secret** |
| `MAIL_FROM` | `Baqer Sniper <login@yourdomain.com>` (an address on the verified domain) |
| `OWNER_EMAIL` | your email (optional, marks you as owner) |
| `ALLOWED_EMAILS` | optional, comma-separated: only these emails may enter. Leave empty = anyone who verifies |

Needed for the owner panel: **Workers & Pages → KV → Create namespace** `baqer-auth`, then in the Pages project
**Settings → Bindings → Add → KV namespace**, variable name `AUTH_KV`. It stores the owner panel
(official signals, analyst note, banner, profile links, maintenance mode, members list) and makes the
sign-in limits exact. Without it the app works, but owner changes cannot be saved.

## 3. Redeploy
Deployments → latest → Retry deployment (variables only apply to new deployments).

Sessions last 30 days. Changing `AUTH_SECRET` signs everybody out.

## The app
- `/` is the gold app (index.html + radar.js): live prices (biquote for gold/silver/FX, Binance for crypto),
  five schools on 15m / 1H / 4H from closed candles only, automatic signals announced once, journal,
  owner panel (More → لوحة التحكم, visible only to OWNER_EMAIL).
- `/classic.html` is the previous app, kept as a fallback.
