# Limitations and roadmap

BrandShield.ai is a complete, runnable demo of a human-in-the-loop brand-governance workflow. These are the deliberate scope boundaries and the natural next steps.

## Current limitations

### Platform and data

- **SQLite is the only implemented adapter.** The schema, migrations and data-access layer are isolated for a Postgres port, but no Postgres driver or dialect-specific migration is bundled. The `BRANDSHIELD_DB_URL` Postgres form is recognised in configuration only.
- **Single workspace.** The seed and settings model one organisation. There is no tenant column, per-tenant isolation or workspace switching.
- **No background jobs.** Analysis runs inline in the request. Large documents and slow external providers are bounded by the upload limit and timeout, but there is no queue, retry policy or worker.
- **Session cleanup is lazy.** Expired sessions are ignored, but there is no scheduled purge job. Retention purge covers review data, not sessions.
- **No rate limiting or login lockout.** CSRF, RBAC and hashed passwords are present; brute-force throttling, account lockout and CAPTCHA are not.

### Content and review

- **Images are not OCR'd or visually analysed.** A PNG/JPG submission is stored and reviewed for alt text and metadata context only. There is no contrast measurement over pixels, logo detection or clear-space check.
- **DOCX extraction is text-only.** `mammoth` extracts body text; embedded images, comments, tracked changes and complex tables are not reviewed.
- **Reading level is approximate.** It uses a syllable heuristic, not a validated readability formula per language.
- **Markdown and structure checks are heuristic.** Heading-order and link-text checks cover common Markdown patterns; they do not parse every HTML variant.
- **Terminology matching is literal.** It is case-insensitive phrase matching, not stemming or semantic equivalence.
- **No real publishing integration.** Approval records a decision. There is intentionally no CMS, social scheduler or webhook that publishes content.
- **No notifications.** There is no email, Slack or in-app notification when a review is assigned or changes are requested.
- **Comments are flat.** There are no threads, mentions, reactions or resolution states.

### AI

- **MOCK provider is rule-shaped.** Offline findings are deterministic and useful for demos/tests, not a substitute for a general language model.
- **External provider is OpenAI-compatible only.** It expects a chat-completions JSON response shape. There is no provider-specific SDK, streaming, retry/backoff or token accounting.
- **Masking is pattern-based.** Confidential patterns catch configured shapes such as codenames and internal emails. Free-form sensitive data that matches no pattern can still reach an external provider.
- **Prompt and output are not formally evaluated.** No benchmark suite measures false positives/negatives against a labelled brand corpus.
- **External calls are not exercised by the test suite.** Tests inject a fake/slow provider; they do not make network calls.

### Governance and security

- **Audit hash chain is local integrity evidence, not notarisation.** It detects casual tampering with exported rows, but anyone with database write access could rebuild the chain.
- **No SSO/SAML/OIDC.** Authentication is local accounts only.
- **No fine-grained permissions.** Roles are fixed; there are no per-team or per-guideline scopes.
- **No upload malware scanning.** File type, size and extension are validated, but content is not antivirus-scanned.
- **CSP is production-only.** Development intentionally relaxes CSP for Vite HMR.

### Frontend and accessibility

- **Accessibility is implemented but not certified.** Keyboard tabs, focus trap, live regions, skip link and reduced motion are covered; no formal WCAG audit or screen-reader matrix has been completed.
- **No end-to-end browser tests.** Backend behaviour is covered by Vitest/Supertest; UI flows rely on manual smoke testing.
- **3D chunk is large.** Three.js is isolated into `ink-vault` (~875 kB raw, ~235 kB gzip) and is not lazy-loaded yet. It degrades to static visuals on low-power/reduced-motion devices.
- **English-only interface and checks.** No localisation or right-to-left layout support.
- **Limited offline behaviour.** The app shell requires the API; there is no service worker or offline review queue.

## Roadmap

### Near term

1. **Postgres adapter + migrations.** Implement the same query surface, add dialect-specific migrations and run integration tests against a containerised Postgres.
2. **Lazy-load the Ink Vault scene.** Use `React.lazy` + `Suspense` so the 3D chunk never blocks first interaction.
3. **Invite and notification flow.** Email/in-app notifications for queue assignments, change requests and approvals.
4. **Auth hardening.** Login throttling, lockout, session cleanup job and optional TOTP.
5. **Richer test coverage.** Add Playwright flows for login, review decisions, queue approval, library versioning and keyboard navigation; add axe checks.

### Medium term

6. **Visual brand checks.** Upload image assets, run pixel-level palette/contrast checks, logo detection and clear-space measurement, then surface results as evidence-backed findings.
7. **Document fidelity.** Extract DOCX headers/footers, embedded images and tracked changes; add PDF intake.
8. **Provider plugin interface.** Add Anthropic, Azure OpenAI and local-model providers behind the same contract, with retry/backoff, token budgets and evaluation fixtures.
9. **Multi-workspace and scoped roles.** Tenant isolation, team-scoped reviewers and per-library permissions.
10. **Publishing hand-off.** Optional approved-content export/webhook to a CMS, gated strictly on a recorded human approval.

### Longer term

11. **Evaluation and calibration.** A labelled corpus, precision/recall dashboards and per-rule tuning.
12. **Custom rule authoring UI.** Safe, validated rule configs without SQL, with preview and versioning.
13. **Localisation.** Translatable UI and locale-aware terminology, readability and date handling.
14. **Analytics depth.** Time-to-review, decision mix by team, recurring-finding clustering and guideline effectiveness.
15. **External audit anchoring.** Optional append-only external store or signed checkpoints for stronger tamper evidence.
