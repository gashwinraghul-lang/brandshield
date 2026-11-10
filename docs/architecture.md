# Architecture

BrandShield.ai separates **deterministic brand enforcement** from **optional AI interpretation**, and keeps **human decisions** outside both. This document explains the main boundaries and why they exist.

## System shape

```text
Browser (React + Vite)
   │  fetch /api/* (session cookie + x-csrf-token)
   ▼
Express API
   ├─ auth middleware ......... sessions, CSRF, RBAC
   ├─ routes .................. auth, library, submissions, dashboard,
   │                            settings, users, workspaces, audit
   ├─ review pipeline ......... rule engine → masking → LLM provider → normalise
   ├─ services ................ submissions, accounts, workspaces, invitations,
   │                            email, insights, masking, review
   └─ SQLite adapter .......... SQL migrations, append-only history tables
```

- **Frontend:** React Router pages with CSS Modules and shared design tokens in `client/src/styles/global.css`. Public account pages share `AuthShell` and `AccountPages.module.css`. The API client in `client/src/api.js` attaches the session cookie automatically and mirrors the readable CSRF cookie into `x-csrf-token` for mutations.
- **Backend:** Express 5 routers are thin. Domain logic lives in `server/src/services/`. Routes enforce authentication, CSRF and role checks before calling services.
- **Database:** SQL migrations in `server/src/db/migrations/` define the schema. `001_init.sql` covers library, review and audit tables; `002_accounts_workspaces.sql` additively adds account types/states, verification and reset tokens, brand workspaces, workspace membership, invitations and a submission `brand_workspace_id`. Foreign keys, check constraints and unique `(parent, version)` pairs protect history integrity. Library items are deactivated, not deleted.

## The review pipeline

`runReview()` in `server/src/services/reviewService.js` executes:

1. **Load the live library.** Active guidelines (with current version body), active facts (including successor facts), active terminology and active rules. Inactive items are invisible to review.
2. **Run the deterministic rule engine** over the submission content, alt text, type and channel.
3. **Resolve the AI provider.** External AI requires *both* the Settings switch and an API key. Otherwise the MOCK provider is used and the UI is told why.
4. **Mask confidential values** (only before an external call). Configured patterns such as project codenames and staff emails are replaced, then restored in returned findings.
5. **Call the provider with a timeout.** A timeout or error does not discard deterministic results; the review records `llmStatus` and a notice, and the run is marked incomplete.
6. **Normalise every finding.** References are validated against live library IDs; spans are clamped to the content; a finding with no valid reference is demoted to `suggestion` with an explanatory note.
7. **Replace the current issue set and append an audit event.** Re-running analysis replaces prior issues for that submission. Human decisions remain in `review_actions` and version history.

### Why the rule engine is data, not code

Each rule is a row in `rules` with `type`, `severity`, `guideline_ref`, optional `channel` and a JSON `config`. The engine in `server/src/services/ruleEngine.js` switches on the type:

| Type | Check |
| --- | --- |
| `banned_phrase` | Banned marketing phrases with optional replacement wording |
| `required_term` | Required first mention / minimum count on a channel |
| `claim` | Absolute or ranking claims that need an approved fact |
| `length` | Character or word limits per channel |
| `alt_text` | Image submissions without usable alt text |
| `reading_level` | Approximate reading grade ceiling |
| `heading_order` | Markdown heading level jumps |
| `link_text` | Non-descriptive link labels such as “click here” |
| `contrast` | A human review note for text-over-image and clear-space checks |

Terminology is checked separately from active `terminology_entries`, so brand vocabulary can change without editing code. Adding a rule type requires an engine case; adding a rule of an existing type requires only a database row.

### Evidence and references

Findings may reference a guideline (`guideline_ref`), a rule (`rule_ref`) or an approved fact (`fact_ref`). Fact findings attach structured evidence: the flagged fact, its source, owner, expiry state, and the nearest successor fact when one exists. This is how an expired certification is distinguished from a current one — and why the UI can show the reviewer exactly what needs checking.

### Safety invariant: nothing auto-applies

- Analysis only **creates issues**. It never edits submission content.
- `applyDecision()` changes content only for an explicit `accepted` or `edited` decision by an authorised human.
- A decision is recorded in `review_actions` before/with the new immutable submission version.
- Accepted replacements shift the spans of later sibling findings so later decisions still target the right passage. The shift is the net content-length delta, not the replacement length.
- Reviewer actions (`approve`, `reject`, `request_changes`) update review status only. Publishing is deliberately outside this product.

## Accounts, verification and workspaces

Sign-up is public for four account types. Admin is never a sign-up option.

| Account type | Default role | Activation |
| --- | --- | --- |
| Creator | `creator` | Active immediately; content submission unlocks after email verification |
| Reviewer / Brand Manager | `reviewer` | Active immediately; content submission unlocks after email verification |
| Agency or partner | `agency` | Active immediately with a valid invitation code (linked to its workspace); otherwise `pending` until an admin approves and assigns a workspace |
| Leadership | `leadership` | Active immediately after email verification |

`users.account_type` records the self-serve choice and is kept aligned with `role_key` for new accounts. `users.account_state` is `active`, `pending` or `suspended`. A pending account can sign in but is redirected to the waiting screen and blocked from protected routes.

### Email verification and password reset

`server/src/services/email.js` is a MOCK email provider. It stores the complete message in `email_outbox` — readable from **Settings → Sent emails** — and writes it to the server console. Verification tokens and reset tokens are stored only as SHA-256 hashes with an expiry. Verification links expire after 24 hours; reset links after one hour and invalidate other sessions on use. An unverified account can browse but `POST /api/submissions` and submit actions return `403` with `details.code = "EMAIL_UNVERIFIED"`.

### Brand workspaces and invitations

- `brand_workspaces` group content by client or partner, and `brand_workspace_members` joins people to workspaces.
- `submissions.brand_workspace_id` scopes every submission. Agency users may only create and list content inside workspaces they belong to; reviewers and admins see all workspaces.
- `invitations` stores only `code_hash`, `expires_at` and `used_by_user_id`. A single-use plaintext code is returned once when an admin creates it from **Settings → Workspaces & invitations**.
- Redeeming a valid invitation at agency sign-up activates the account and inserts workspace membership in the same transaction. An invalid, expired or used code fails validation; the account then falls back to pending approval.
- Admins approve pending accounts and manage memberships in **Settings → User roles**.

The first administrator is bootstrapped outside sign-up with `npm run create-admin` (or `npm run seed` for the fictional demo). Demo accounts and data are documented as demo-only in the README.

## Provider abstraction

`server/src/services/llm/index.js` returns an object with:

```js
{ name, version, external, review({ text, channel, type, title, altText, guidelines, facts }) }
```

- `mock.js` is deterministic and offline. It is the default for tests and demos.
- `openai.js` calls an OpenAI-compatible `/chat/completions` endpoint with `fetch`. It backs the custom endpoint, Groq and OpenRouter configurations. It parses JSON findings and never receives unmasked content when used externally.
- `gemini.js` calls Google Gemini's generateContent endpoint. `pollinations.js` calls the keyless Pollinations text endpoint.
- `resolveProvider()` is the single swap point. In `auto` mode it chooses the first configured keyed provider in the order Gemini → Groq → OpenRouter → custom, otherwise MOCK. Pollinations is never selected by `auto` because it is external and keyless.
- The Settings API exposes a provider catalog (`id`, `label`, `external`, `requiresKey`, `configured`) so admins can see what is ready without exposing keys.
- The timeout helper races the provider call and annotates the result, preserving rule-engine coverage.

## Authentication and authorisation

- Passwords are hashed with bcryptjs.
- Login creates a server-side session row containing a hashed token and a CSRF token. The browser receives an httpOnly session cookie and a readable CSRF cookie.
- Mutations require `x-csrf-token` matching the session token (double-submit pattern with constant-time comparison).
- RBAC is enforced server-side:
  - **admin:** everything, including library, settings, users, approvals, workspaces, invitations, retention and audit.
  - **reviewer:** queue and review decisions, insights.
  - **creator:** create/edit submissions and resolve issues on their work.
  - **agency:** create/edit their own submissions inside assigned brand workspaces only.
  - **leadership:** read-only dashboard and insights.
- Pending accounts are redirected to the waiting page and cannot reach protected API routes that require a normal active account. Unverified accounts can browse but cannot create or submit content.
- The client hides unavailable routes, but server checks are authoritative.

## History and audit

- `brand_guideline_versions` is append-only per guideline version.
- `submission_versions` captures every content-changing decision with a note and actor.
- `review_actions` records submit, issue decisions, reviewer decisions and comments.
- `audit_log` records authentication, library changes, review runs, settings, users, exports and purges. The audit CSV export includes a hash chain; **Verify** recomputes it to detect tampering.

## 3D "Ink Vault" and graceful degradation

`client/src/components/InkVaultScene.jsx` renders an animated Three.js ribbon field. It deliberately falls back to a static CSS/SVG treatment when any of these is true:

- `prefers-reduced-motion: reduce`
- no WebGL context
- viewport narrower than 720 px
- `navigator.connection.saveData`
- fewer than 4 logical cores
- page hidden (animation paused via visibility state)

The 3D layer is decorative (`aria-hidden`) and never blocks content. Three.js is split into its own chunk (`ink-vault`) so the main application shell stays small.

## Accessibility choices

- Skip link to main content in the app shell.
- Roving-tab keyboard support (Arrow keys, Home, End) for library, settings and review tabs via `client/src/utils/tabs.js`.
- Modal focus trap, Escape to close and focus restoration.
- Live regions for async status and decision feedback.
- Visible focus styles, semantic headings, labelled forms and errors tied to inputs.
- Responsive issue cards and disabled connector lines below 1120 px so content remains readable on narrow screens.
- Reduced-motion handling for transitions and the 3D scene.

## Extension points

- **Database:** implement the same query surface over Postgres and select it in `server/src/db/index.js`; keep SQL migrations dialect-specific if needed.
- **AI:** add a provider module and extend `resolveProvider()`.
- **Rules:** add a type case plus rule rows, or use existing types with new configs.
- **Publishing:** integrate downstream CMS/publishing systems only after an explicit human approval event; this repository intentionally stops at the decision.
