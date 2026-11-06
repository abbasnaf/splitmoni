# SplitMoni

SplitMoni is a shared-expense ledger MVP. Groups, invitations, expenses, expense splits, and repayments are stored in a local SQLite database. Balances are derived from those records; the app does not store mutable balance totals.

## Requirements

- Node.js 22.13 or newer (the app uses Node's built-in SQLite module)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The database is created and seeded automatically at `.data/splitmoni.sqlite`. Set `SPLITMONI_DB_PATH` to use a different database file. Keep `.data` out of source control and back it up if you need to preserve local records.

To use the development server from another device on your local network, start it with `npm run dev -- --hostname 0.0.0.0` and open this computer's LAN address. The current LAN address (`192.168.88.11`) is allowed for development assets in `next.config.ts`; update `allowedDevOrigins` there if the address changes. Only expose the development server on a trusted network.

## Invitation email setup

Group invitations are sent through Resend. Configure these server-side environment variables before sending invitations:

- `RESEND_API_KEY` — Resend API key
- `SPLITMONI_FROM_EMAIL` — a sender address verified with Resend
- `APP_URL` — the absolute base URL used in invitation links (for local development, `http://localhost:3000`; use HTTPS in production)

Do not commit real credentials. Invitation links expire after seven days and can be used once; invitees must sign in or register with the invited email address. Only the group owner can send, resend, or revoke invitations. If Resend delivery fails, the invitation remains pending and can be resent after correcting the configuration.

## Included

- Owner/member groups with real email invitations, single-use acceptance links, invitation status, and group management
- Email and password accounts with HTTP-only sessions
- Equal, exact amount, percentage, and share based expense splitting
- Expense receipt uploads with membership-checked previews and removal (JPEG, PNG, WebP, or PDF; 5 MB per file, up to 5 files per expense)
- Server-side validation and transactional SQLite writes
- Balance calculation from expenses and confirmed settlements
- Simplified repayment suggestions and payer/recipient settlement confirmation
- Dashboard, group, balance, activity, and settings screens

## Product roadmap

See [ROADMAP.md](./ROADMAP.md) for the tracked implementation plan, current baseline, priorities, and release-readiness checklist. Update its checkboxes and update log as roadmap work is completed.

## Current boundary

This is a single-instance MVP, not a production multi-instance service. Database reads and writes are scoped to the signed-in account's groups, and settlement reports require recipient confirmation. Archived groups are read-only; member removal is blocked once ledger activity exists to preserve historical splits. Payment processing is not included. The SQLite file is local to the app host; a hosted multi-instance deployment should move the repository to PostgreSQL and add rate limiting, account recovery, and deployment-grade session management before exposing it broadly.

## Demo data (optional)

Production onboarding goes through sign-up; no demo data is seeded by default. On a fresh database, set `SPLITMONI_DEMO_ENABLED=1` to restore the seeded demo users and the demo account `amanat@example.com` / `password123`. Existing databases are never re-seeded.

Note the browser caches seeded demo records in `localStorage` until `GET /api/state` replaces them; a production account syncs empty state on first load.

## Account deletion policy

Sign in, open Settings → "Delete account", enter your password, and confirm. Deletion is permanent:

- Groups you own alone are deleted along with their expenses, splits, receipts, comments, recurring rules, invitations, and repayments.
- Groups you own with other members are transferred to the longest-standing remaining member before access is removed.
- Your membership is removed from groups that have no ledger activity. Memberships inside group history are kept so past splits and balances stay reconcilable.
- All sessions are signed out immediately and cannot be restored; your login credentials are destroyed.
- Where shared financial history references you (expenses, splits, repayments), your identity is kept only as an anonymized "Deleted account" placeholder with an unreachable email, so balances never break. Personal profile data is not retained.
- Pending invitations addressed to your email are removed; invitations you created lose their actor reference.
