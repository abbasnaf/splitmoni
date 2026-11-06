# SplitMoni Product Roadmap

This is the working checklist for taking SplitMoni from its current single-instance MVP to a reliable, collaborative expense-sharing product. Update the checkboxes and acceptance notes in this file as work is completed; keep newly discovered work in the appropriate phase.

## Status and priority

- `[x]` Implemented and verified
- `[ ]` Not complete
- **P0 — Foundation:** required before treating the app as production-ready
- **P1 — Core product:** complete the primary group and account workflows
- **P2 — Product depth:** useful quality-of-life features
- **P3 — Optional:** integrations and advanced capabilities

Priorities indicate recommended order, not a promise of dates. Items may be split into smaller issues or pull requests as implementation begins.

## Current baseline

- [x] Email/password sign-up and sign-in with HTTP-only sessions
- [x] Group creation starts with the signed-in owner; membership is based on real accounts
- [x] Send Resend invitations with secure, seven-day, single-use acceptance links
- [x] Accept or decline invitations after sign-in/sign-up; require the invited email address
- [x] Show invitation status and allow the owner to resend or revoke invitations
- [x] Enforce owner/member permissions for group and invitation management
- [x] Rename groups, change currency before ledger activity, transfer ownership, and remove members when safe
- [x] Archive and restore groups while preserving history and preventing archived-group writes
- [x] Create, edit, and delete expenses
- [x] Equal, exact-amount, percentage, and share-based expense splits
- [x] Derive balances from expenses and confirmed repayments
- [x] Suggest a simplified repayment plan; require recipient confirmation
- [x] Dashboard, group, balance, activity, and settings screens
- [x] Search and filter activity by group, activity type, and month
- [x] Responsive navigation and a persisted light/dark theme preference
- [x] Apple-inspired, minimal visual styling
- [x] Use local SQLite with transactional writes for this single-instance MVP

## Phase 0 — Reliability, safety, and operability (P0)

### Correctness and automated verification

- [x] Resolve the TypeScript error in `components/expense-composer.tsx` (`useSyncExternalStore` subscription cleanup type); verified with `npx tsc --noEmit` and targeted ESLint.
- [x] Resolve existing ESLint hook/immutability findings in `components/expense-history.tsx`, `components/expense-list.tsx`, and `components/splitwise-app.tsx`; `npm run lint` passes without suppressions.
- [x] Add unit tests for split calculations, rounding/remainder allocation, currency formatting, and simplified settlements, including zero, one-member, and large-value cases (`tests/split-engine.test.ts`, 25 tests via `node:test`, `npm test`).
- [x] Add database/API tests for authentication, access control, group membership, expense validation, transactional rollback, and settlement confirmation (`tests/api.test.mjs` — runs the production build over HTTP against a throwaway database).
- [ ] Add end-to-end smoke tests for sign-up/sign-in/sign-out, group creation/invites, expense create/edit/delete, activity filtering, and repayment confirmation.
- [x] Add CI checks for lint, type-check, tests, and production build; all must pass for a pull request (`.github/workflows/ci.yml`).

### Security and data integrity

- [x] Add rate limits and abuse protection for sign-in, sign-up, invitations, and other mutation endpoints (`proxy.ts` in-memory per-IP buckets).
- [x] Enforce request origin/CSRF protections for cookie-authenticated mutations (`proxy.ts` same-site Origin/Referer check); verified cross-origin requests cannot change account data.
- [ ] Review authorization on every read and write route so users can only access groups and records they belong to; cover each check with tests.
- [ ] Validate request payload shapes, lengths, enum values, dates, split membership, and invitation email addresses at the server boundary; return consistent actionable errors.
- [ ] Prevent duplicate mutation side effects with idempotency or conflict handling where retries can create duplicate expenses, invites, or payments.
- [ ] Add account/session controls: revoke sessions on sign-out and password change, expire and clean up stale sessions, and provide a way to revoke other sessions.
- [ ] Add a documented privacy and data-retention policy, including treatment of deleted accounts and financial records.

### Hosting and operations

- [ ] Move from host-local SQLite to a managed PostgreSQL database before running multiple app instances; add and verify a migration path that preserves users, groups, expenses, splits, invitations, and settlements.
- [ ] Add deployment configuration and a documented production setup for secrets, database connectivity, secure cookies, and environment validation.
- [ ] Set up database backup and restore procedures; perform a restore test and document recovery expectations.
- [ ] Add structured server logging, error reporting, and basic service/database health checks without logging passwords, session tokens, or sensitive financial details.
- [ ] Add a deployment checklist and verify the production build and critical workflows in the deployment environment.

## Phase 1 — Complete the core shared-expense experience (P1)

### Real group invitations and membership

- [x] Send invitation emails with a secure, expiring, single-use acceptance link. Requires server-side Resend configuration.
- [x] Add invitation accept/decline flows, including sign-up/sign-in before acceptance when needed.
- [x] Show pending, accepted, declined, expired, and revoked invitation states; allow the owner to resend or revoke invitations.
- [x] Define owner/member roles and enforce owner-only group and invitation management on the server.
- [x] Allow the owner to rename a group, change its currency before ledger activity, and manage members.
- [x] Add safe member removal and group ownership transfer; block member removal after ledger activity to preserve historical splits.
- [x] Add group archive/restore behavior with confirmation; retain historical records and make archived groups read-only.

### Account and session management

- [x] Allow users to edit their name and default currency.
- [x] Add a change-password flow that verifies the current password and invalidates other sessions.
- [x] Add verified email change and email verification flows.
- [x] Add password reset by expiring, one-time email link; never reveal whether an email address has an account.
- [x] Add account deletion with re-authentication, clear consequences, and a defined policy for shared financial history.
- [x] Replace the seeded demo credential as the production onboarding path; document how demo data is isolated or disabled in production.

### Ledger clarity and recovery

- [x] Add an audit history for expense edits/deletions and repayment state changes, showing actor and timestamp (`audit_events` table, `GET /api/groups/[id]/audit`, "Audit history" panel in the group view).
- [ ] Add explicit handling for edits to expenses that already affect settled balances; warn users and recalculate safely.
- [ ] Add clear loading, empty, validation, permission-denied, and network-error states for every primary workflow.
- [ ] Add accessible confirmation and recovery flows for destructive actions; preserve entered form data when a request fails.

## Phase 2 — Everyday quality-of-life features (P2)

### Expense collaboration

- [x] Attach receipt images or documents to expenses using validated, access-controlled storage; support preview and removal. JPEG, PNG, WebP, and PDF are signature-checked; files are private in SQLite and limited to 5 MB each, 5 per expense.
- [x] Add expense comments with author, timestamp, edit/delete rules, and membership-based visibility (verified: `expense_comments` table + comment routes; implemented by the parallel work stream and present in the current build).
- [x] Add recurring expenses with schedule, next-run date, pause/resume, and safe handling of missed runs (verified: `recurring_expenses` table + routes).
- [x] Add expense duplication to quickly create a similar entry without duplicating its identifier or history (verified: `duplicateId` template flow in `expense-composer.tsx`).
- [x] Add useful expense metadata such as category and optional merchant/location, with filtering (verified: schema columns + composer fields; `expense-history.tsx` references them).

### Notifications and reminders

- [ ] Build an in-app notification center for invitations, expense changes, comments, and repayment confirmations.
- [ ] Add user-controlled notification preferences and delivery-channel settings.
- [ ] Add opt-in email notifications and settlement reminders with unsubscribe controls and delivery failure handling.
- [ ] Ensure notification jobs are retryable and idempotent; avoid sending duplicate messages.

### Reports and data portability

- [ ] Add date-range spending summaries and breakdowns by group, member, and category.
- [ ] Add CSV export for a group's expenses, settlements, and balances with explicit currency and date columns.
- [ ] Add a user data export covering their profile and accessible ledger records.
- [ ] Add print-friendly statements; only add PDF generation if user needs justify the maintenance cost.

### Accessibility and responsive polish

- [ ] Audit keyboard navigation, visible focus, screen-reader names, color contrast, and reduced-motion behavior across light and dark themes.
- [ ] Test primary screens at narrow mobile, tablet, and desktop sizes; prevent horizontal overflow and inaccessible fixed navigation.
- [ ] Verify all forms have associated labels, clear validation messaging, and appropriate input types/autocomplete.
- [ ] Add browser-based visual regression coverage for the dashboard, group, expense form, activity, and settings screens.

## Phase 3 — Advanced and optional capabilities (P3)

### Multiple currencies

- [ ] Keep each group's ledger and balance in its native currency; never combine unlike currencies without conversion.
- [ ] Add exchange-rate source, timestamp, and conversion-display preferences before showing cross-currency totals.
- [ ] Show converted totals as estimates with the applied rate and original amounts still available.
- [ ] Add tests for rounding, stale/missing rates, and historical rate behavior.

### Payment integrations

- [ ] Evaluate supported payment providers and regions before selecting an integration.
- [ ] Add an opt-in payment flow that does not alter a group balance until payment status is verified.
- [ ] Verify provider webhooks, signature checks, idempotency, refunds/failures, and reconciliation before launch.
- [ ] Keep manual off-app repayment recording available as a fallback.

### Further enhancements

- [ ] Evaluate OAuth/social sign-in only if it improves onboarding for the target audience.
- [ ] Evaluate shared links, richer group roles, and additional settlement workflows based on user feedback.
- [ ] Add localization and region-specific currencies/date formats when there is a defined audience and translation process.

## Release readiness checklist

- [ ] Phase 0 correctness, security, and operations items are complete.
- [ ] Core workflows pass automated tests in CI and in the target deployment environment.
- [ ] Invitations, account recovery, and data retention are documented and operational.
- [ ] Database backup restoration and incident response have been exercised.
- [ ] Accessibility and responsive checks pass for both themes.
- [ ] No known data-integrity or authorization defects remain open.

## Update log

- **2026-11-06:** Created the initial roadmap from the current repository and documented MVP behavior, known verification blockers, product gaps, and recommended release phases.
- **2026-11-06:** Fixed the expense composer client-readiness store subscription and verified TypeScript plus targeted ESLint.
- **2026-11-06:** Implemented Resend invitations, email-matched single-use acceptance/decline, owner/member authorization, group management, safe membership changes, and read-only archives. Documented setup; verified with TypeScript, production build, focused lint, and API smoke tests.
- **2026-11-06:** Account and session management (phase 1): editable profile name and default currency (`PATCH /api/user`), change-password flow that revokes other sessions (`PUT /api/user/password`), and password reset via expiring one-time email link (`POST /api/auth/password-reset` + `/confirm`, `/forgot-password` and `/reset-password` pages). Reset responses stay identical whether or not an account exists; shared email sending helpers moved to `lib/mail.ts`.
- **2026-11-06:** Verified email change and email verification (phase 1): verified badge and actions in settings, `POST /api/user/email` to request an email change (re-auth with password, confirmation link to the new address) and `PUT /api/user/email` to re-request verification, public `POST /api/auth/email/confirm` consumed by the `/verify-email` page, plus a best-effort verification email at sign-up. One-hour single-use tokens stored hashed in `email_verifications`; confirming marks `users.email_verified_at`.
- **2026-11-06:** Account deletion (phase 1): `DELETE /api/user` with password re-authentication and a progressible danger-zone section in settings. Policy: solo-owned groups deleted with their ledger records; owned groups with members transferred to the longest-standing member; inactive memberships removed, activity-linked memberships and splits retained under an anonymized "Deleted account" placeholder; logins wiped. Policy documented in README.
- **2026-11-06:** Demo seeding (phase 1): `seed()` and the seeded demo credential are opt-in behind `SPLITMONI_DEMO_ENABLED=1`; production onboarding is plain sign-up. Demo behavior documented in README. Remaining: client-side mock-data fallbacks in `localStorage` stores briefly show seeded demo records before `/api/state` sync overwrites them.
- **2026-11-06:** Added private receipt uploads, signature/size/count validation, member-only preview, uploader/owner removal, and read-only archived previews. Verified with TypeScript, production build, focused lint, API security/idempotency smoke tests, and browser upload/preview/removal.
- **2026-11-06:** Resolved remaining ESLint hook/immutability findings without suppressions: month headers in `expense-history.tsx` / `expense-list.tsx` now compare against the previous item via index instead of mutating render-phase variables; monthly state in `splitwise-app.tsx` is set via deferred timer callback preserving post-hydration client computation; settlement IDs generated by `makeSettlementId` in `lib/settlement-store.ts` (mirrors `makeExpenseId`). Verified: `npm run lint` (0 errors, only 2 pre-existing warnings in `lib/expense-store.ts`), `npx tsc --noEmit`, `npm run build`.
- **2026-11-06:** Added split-engine unit tests (`tests/split-engine.test.ts`, 25 tests with `node:test`, `npm test`): all four split methods with total preservation, remainder allocation, zero/one-member/large-value cases, currency formatting (incl. zero-decimal JPY), group balances with confirmed vs pending settlements, and debt simplification that zeroes balances. Enabled `allowImportingTsExtensions` in `tsconfig.json` so Node can run the TS test directly; verified `npm test`, `npx tsc --noEmit`, and ESLint.
- **2026-11-06:** Added database/API tests (`tests/api.test.mjs`, 7 tests via `npm test`): boots the production build on a throwaway database and covers authentication, unauthenticated access, group creation/membership visibility, expense payload validation with rollback (no partial rows for invalid splits), non-member write blocking, settlement pending → recipient-only confirmation, and sign-out session invalidation.
- **2026-11-06:** Added `proxy.ts` (Next.js 16) with same-site Origin/Referer checks for cookie-authenticated mutations (403 on cross-site) and in-memory per-IP rate limits for credential (30/10 min), password-reset/email-confirm (20/h), and invitation-creation (30/h) endpoints. Extended API tests to 9 covering cross-site rejection, same-site allowance, and 429 after the credential limit. Added `.github/workflows/ci.yml` (lint, `tsc --noEmit`, production build, `npm test`). Verified: `npm test` (34 pass), `tsc` clean, build clean.
- **2026-11-06:** Added audit history: `audit_events` table writes on expense create/update/delete and settlement record/confirm (inside the same transactions), `listAuditEvents` with actor names (tombstoned authors show as "Deleted account"), `GET /api/groups/[id]/audit` (member-only), and an "Audit history" panel in the group view. Also purge expired sessions at server start alongside the existing token cleanups. Verified: `npm test` (35 pass), `tsc` clean, focused ESLint clean, production build clean.
- **2026-11-06:** Verified (via routes, schema, and production build) that the parallel work stream's Phase 2 expense-collaboration items are implemented: expense comments, recurring expenses, expense duplication, and category/merchant/location metadata; those roadmap boxes are checked.
