# BrandShield.ai

**Brand governance before publishing.** BrandShield.ai is a review workspace by **Inkloom AI** that checks content against an organisation's brand guidelines, approved facts, terminology and visual assets — then leaves every final decision to a human.

Nothing in BrandShield.ai publishes automatically. Suggestions can be accepted, edited, rejected or left pending, and every decision is recorded in an append-only history.

---

## What is included

| Area | Capability |
| --- | --- |
| Brand library | Guidelines with versions, approved facts (expiry + successor facts), terminology, brand assets |
| Accounts | Self-serve creator, reviewer, agency/partner and leadership sign-up; email verification; admin approval for agencies without a code |
| Workspaces | Brand workspaces with agency invitations, membership scoping and per-workspace review queues |
| Content intake | Typed text or `.txt`, `.md`, `.docx`, `.png`, `.jpg` uploads with server-side extraction |
| Deterministic review | 9 data-driven rule types plus terminology checks, all stored as editable database records |
| AI assist | Mock LLM provider by default; optional Gemini, Groq, OpenRouter, Pollinations or custom OpenAI-compatible providers, clearly labelled as external |
| Human review | Issue-by-issue accept / edit / reject, reviewer queue, approve / request changes / reject |
| Safety | Confidential-value masking before AI, expired-fact detection, no auto-publish, suggestion-only unreferenced findings |
| Governance | Hashed passwords, server sessions, CSRF protection, RBAC, audit log with CSV export + integrity verification |
| Insights | Dashboard, brand pulse, weekly trends, category heatmap, guideline draft assistant |
| Accessibility | Keyboard tabs, skip link, focus-trapped modal, live regions, reduced-motion and mobile fallbacks |

## Stack

- **Frontend:** React 19, Vite, React Router, CSS Modules, `three` + `@react-three/fiber` + `@react-three/drei`
- **Backend:** Node.js 20+, Express 5, `better-sqlite3`, `multer`, `mammoth`
- **Auth:** bcryptjs password hashes, server-side session cookie, double-submit CSRF token
- **Tests:** Vitest + Supertest

The local demo uses SQLite. Migration SQL lives in `server/src/db/migrations/` and the data-access layer is isolated in `server/src/db/`, so a Postgres adapter can replace SQLite without changing routes or UI.

---

## Quick start

Prerequisites: **Node.js 20 or newer** and npm.

```powershell
npm install
npm run seed
npm run dev
```

Open <http://localhost:5173>. The API runs on <http://localhost:4100> and Vite proxies `/api` to it.

### Single-server mode

```powershell
npm run build
npm start
```

Open <http://localhost:4100>. The Express server serves the built client. Set `NODE_ENV=production` to enable the strict Content-Security-Policy.

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API + Vite dev server together |
| `npm run seed` | Reset and reseed the Northwind Labs demo |
| `npm run migrate` | Apply SQL migrations |
| `npm run create-admin` | Bootstrap the first administrator (prompts, or pass `--email --name --password --team`) |
| `npm test` | Run the server test suite (58 tests) |
| `npm run build` | Build the client into `client/dist` |
| `npm start` | Start the API and serve the built client |

---

## Demo accounts

> **Demo-only.** Every seeded account, person, workspace, fact and invitation below is fictional seed data for evaluation. Do not use demo accounts or the Northwind Labs workspace for real client content.

Every seeded account uses the password **`BrandShield!23`**.

| Email | Name | Account type / role | Team | Use it for |
| --- | --- | --- | --- | --- |
| `admin@northwindlabs.example` | Maya Chen | admin | Brand | Library, settings, approvals, users, audit, all reviews |
| `creator@northwindlabs.example` | Theo Martins | creator | Marketing | New submissions, fix issues, submit for review |
| `reviewer@northwindlabs.example` | Priya Nair | reviewer | Brand | Queue, approve / request changes / reject |
| `agency@northwindlabs.example` | Jules Bennett | agency (Harbor & Finch) | Partnerships | Workspace-scoped agency submissions |
| `leadership@northwindlabs.example` | Sam Okafor | leadership | Executive | Read-only dashboard and insights |

`npm run seed` also creates the **Northwind Labs brand workspace** and prints a single-use agency invitation code. Demo accounts are for evaluation only.

> Change `BRANDSHIELD_DEMO_PASSWORD` before seeding if you want a different demo password.

## Creating an account

The landing page offers **Sign in** and **Create an account** as equal choices. Sign-up is self-serve for four account types; **admin is never offered**.

1. Choose an account type:
   - **Creator** — submits content and decides which suggestions to accept. Active immediately after email verification. An optional team name is available.
   - **Reviewer / Brand Manager** — reviews and makes the final decision. Active immediately after email verification.
   - **Agency or partner** — works inside invited brand workspaces. Requires an agency name. Active immediately only with a valid invitation code; otherwise the account is **pending** until an administrator approves it and assigns a workspace.
   - **Leadership** — read-only dashboards, trends and audit exports. Active immediately after email verification.
2. Enter your name, work email, password, confirm password, and accept the terms and privacy notice. Passwords require at least 10 characters with upper-case, lower-case, number and symbol.
3. Verification email: this demo has **no SMTP service**. The full message and action link are written to the **server console** and to **Settings → Sent emails** (admin only). Verify the address to unlock content submission.
4. Unverified accounts can sign in and explore, but the app shows a banner and blocks creating or submitting content until the email is verified. Use the banner to resend the link.
5. Pending agency accounts see a waiting-for-approval page. An administrator approves them from **Settings → User roles**, choosing a role and workspace.

Related admin flows:

- **Settings → Workspaces & invitations** creates brand workspaces and single-use invitation codes. The plaintext code is shown once; only its hash is stored.
- **Settings → User roles** approves pending accounts and manages workspace membership.
- **Forgot password?** on the sign-in page sends a mock one-hour reset link to the console and Sent emails panel.

The first real administrator is bootstrapped with `npm run create-admin` (or `npm run seed` for the demo). After that, admins create the rest of the team and workspaces from Settings.

## Five-step demo script

1. **Sign in as Theo (creator)** and open **New submission**.
   - Choose a channel (for example LinkedIn), paste:
     > Our new chatbot is world-class. Customers can login to try it — we are guaranteed to save 100 hours a week. Northwind Labs is ISO 27001 certified.
   - Click **Run review**. Show that findings are grouped by severity and each cites a guideline, fact or terminology entry.
2. **Review the findings in the workspace.**
   - Accept the `chatbot → AI assistant` terminology fix.
   - Use **Edit and accept** on a suggestion to show that the human controls the wording.
   - Reject one finding and explain that rejection changes nothing in the content.
   - Show the revision history and the decision log.
3. **Submit for review**, then sign in as **Priya (reviewer)**.
   - Open **Review queue**, choose the submission, read the evidence and comments.
   - Click **Request changes** and enter a comment (required), or **Approve** the clean seeded submission.
   - Point out that approval does not publish anything; it records the human decision.
4. **Sign in as Maya (admin)** and open **Brand library**.
   - Edit a guideline, save a new version with a change note, then inspect **History**.
   - Deactivate an outdated fact and see the corresponding evidence state.
   - Open **Settings** to switch external AI on/off, edit confidential patterns, add a user, or run a retention purge.
5. **Open Insights** as Maya or Sam.
   - Show brand pulse, weekly trend and category heatmap.
   - Use the guideline draft assistant (a draft, never an auto-saved guideline).
   - Export the audit CSV and click **Verify** to confirm the hash chain.

### Resetting the demo

`npm run seed` deletes demo review data, sessions, users and audit entries and recreates the Northwind Labs workspace. Run it after a demo or before a fresh walkthrough.

---

## Configuration

Copy `.env.example` to `.env` and adjust as needed. Values are read from `.env` or `server/.env`.

| Variable | Default | Notes |
| --- | --- | --- |
| `BRANDSHIELD_DB_URL` | `sqlite:./data/brandshield.db` | Local SQLite path, or a Postgres URL for a future adapter |
| `BRANDSHIELD_PORT` | `4100` | API/server port |
| `BRANDSHIELD_WEB_ORIGIN` | `http://localhost:5173` | Expected browser origin (reserved; the demo uses Vite's same-origin proxy) |
| `BRANDSHIELD_PUBLIC_URL` | falls back to `BRANDSHIELD_WEB_ORIGIN` | Origin used inside verification and password-reset links |
| `BRANDSHIELD_SESSION_DAYS` | `7` | Session lifetime |
| `BRANDSHIELD_UPLOAD_DIR` | `./data/uploads` | Uploaded and extracted files |
| `BRANDSHIELD_MAX_UPLOAD_MB` | `10` | Upload size limit |
| `BRANDSHIELD_LLM_PROVIDER` | `auto` | `auto`, `mock`, `gemini`, `groq`, `openrouter`, `pollinations` or `openai-compatible` |
| `BRANDSHIELD_LLM_API_KEY` | empty | Custom OpenAI-compatible key |
| `BRANDSHIELD_LLM_MODEL` | `gpt-4o-mini` | Model name sent to the custom provider |
| `BRANDSHIELD_LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `BRANDSHIELD_LLM_TIMEOUT_MS` | `8000` | External call timeout; rule-engine results survive timeouts |
| `BRANDSHIELD_GEMINI_API_KEY` | empty | Google Gemini key (free tier) |
| `BRANDSHIELD_GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model |
| `BRANDSHIELD_GROQ_API_KEY` | empty | Groq key (free tier) |
| `BRANDSHIELD_GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model |
| `BRANDSHIELD_OPENROUTER_API_KEY` | empty | OpenRouter key (free models) |
| `BRANDSHIELD_OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | OpenRouter model |
| `BRANDSHIELD_POLLINATIONS_MODEL` | `openai` | Pollinations model; keyless and only used when selected explicitly |
| `BRANDSHIELD_EMAIL_PROVIDER` | `mock` | Mock email delivery to the console and Sent emails panel |
| `BRANDSHIELD_DEMO_PASSWORD` | `BrandShield!23` | Password applied by the seed command |
| `BRANDSHIELD_ADMIN_EMAIL` / `_NAME` / `_TEAM` / `_PASSWORD` | empty | Optional non-interactive values for `npm run create-admin` |

External AI is **off by default**. It also requires `external_llm_enabled` to be switched on in **Settings** and a configured key (or an explicit Pollinations selection). **Auto** chooses the first configured keyed provider in the order Gemini → Groq → OpenRouter → custom OpenAI-compatible, then falls back to MOCK. Confidential patterns are masked before any external request. Keys can only be supplied through these server-side variables; they cannot be generated or embedded from the browser.

---

## Project structure

```text
brand shield/
├─ client/                  React + Vite frontend
│  ├─ src/components/       App shell, shared auth shell, 3D Ink Vault, diff, modal, charts
│  ├─ src/pages/            Landing, sign-up, verification, dashboard, library, submission, queue, workspace, insights, settings
│  ├─ src/styles/           Design tokens and shared primitives
│  └─ vite.config.js        Dev proxy + manual chunking
├─ server/
│  ├─ src/auth/             Sessions, CSRF, RBAC middleware
│  ├─ src/db/               SQLite adapter, SQL migrations, seed
│  ├─ src/routes/           REST API
│  ├─ src/services/         Rule engine, review pipeline, masking, insights, LLM providers
│  └─ test/                 Rule-engine and API integration tests
├─ scripts/dev.js           Runs API + client together
├─ docs/                    Architecture, limitations and roadmap
└─ .env.example
```

## Tests

```powershell
npm test
```

The suite covers password rules, sign-up validation and account types, invitation validation, workspace scoping and admin approvals, seeded library shape, login/CSRF, submission creation and analysis, suggestion safety, span alignment after edits, LLM timeout fallback, RBAC, and the creator → analysis → decision → submit → reviewer approval flow. It includes a full creator sign-up → verify email → dashboard flow and proves unverified accounts cannot submit content.

## AI tools and external libraries

BrandShield.ai was built with AI coding assistance. The principal external libraries are React, Vite, React Router, Express, `better-sqlite3`, `bcryptjs`, `cookie-parser`, `multer`, `mammoth`, `three`, `@react-three/fiber`, `@react-three/drei`, Vitest and Supertest. The optional AI review call uses an OpenAI-compatible HTTP endpoint; the offline **MOCK provider** is the default so the demo never needs a key or network access.

See [`docs/architecture.md`](docs/architecture.md) for the rule-engine / LLM split and [`docs/limitations-and-roadmap.md`](docs/limitations-and-roadmap.md) for known limits.
