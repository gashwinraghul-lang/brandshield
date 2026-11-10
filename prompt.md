Build a web application called "BrandShield.ai" (by Inkloom AI): an AI brand-governance platform that reviews content before it is published. It checks text, images and documents against approved brand guidelines, approved facts and brand assets, flags issues with explanations and references, and suggests corrected versions that keep the creator's intent. Humans make every final decision. Nothing is ever published automatically.

Work in phases. Before writing code, produce a short plan for Phase 1 and wait for my approval. After each phase, summarise what was built, what was tested, and what is next. Ask before adding any dependency not listed below.

Use "BrandShield.ai" as the product name everywhere: page titles, headers, logo text, emails, README, and the footer. Use "brandshield" as the lowercase identifier for package names, environment variable prefixes, and database names (for example, BRANDSHIELD_DB_URL).

## Problem being solved
Organisations publish content through employees, freelancers, agencies and AI tools. Brand rules exist but are rarely applied at the moment content is created. Incorrect claims, outdated facts, inconsistent terminology, off-brand visuals and accessibility gaps reach the public. Managers repeat the same corrections, and leadership cannot see where guidelines are unclear. BrandShield.ai applies the rules at creation time and shows the patterns over time.

## Users and roles
- Admin: manages the brand library (guidelines, approved facts, terminology, assets) and users.
- Creator (employees, freelancers, agency staff): submits content, reviews suggested fixes, accepts, edits or rejects them, and resubmits.
- Reviewer / Brand Manager: approves, requests changes with comments, or rejects. Views the reviewer queue.
- Leadership (read-only): dashboards and trend reports.

## Tech stack
- Frontend: React with Vite, CSS Modules, JavaScript. Responsive layout.
- 3D background (approved dependencies): three, @react-three/fiber, @react-three/drei.
- Backend: Node.js with Express, REST API returning JSON.
- Database: PostgreSQL, with SQLite allowed for local demo. Use migrations. Revision history is append-only.
- AI layer: an LLM service interface so the provider can be swapped. Include a MOCK provider that returns realistic sample findings when no API key is set, so the full app runs for demos.
- Rule engine: deterministic checks run first, before any LLM call. Checks include banned phrases, required terminology, forbidden or unsupported claims, length limits per channel, missing alt text, and reading level. Rules are stored as data in the database, not hard-coded.
- Authentication: email and password, hashed passwords, role-based access control.
- Files: accept TXT, MD, DOCX (extract text) and PNG or JPG. Validate type and size. Store locally.

## Design: "Ink Vault" (must feel unique, not a default admin panel)
- 3D background: a slow-moving field of translucent geometric shapes and ink-like ribbons. The shapes react gently to pointer movement and scrolling. Colours come from the organisation's brand palette in the library.
- Performance and comfort: low particle count by default, pause rendering when the tab is hidden, fall back to a static gradient on low-power devices, and respect prefers-reduced-motion. The 3D layer is decorative and hidden from assistive technology.
- Panels float above the scene in glass-like layers. Text must meet WCAG AA contrast at all times.
- Severity is shown by colour and shape together: solid for blocker, dashed for warning, dotted for suggestion.
- In the review workspace, each highlighted span has a thin connector line to its issue card.
- Typography: one distinctive display font for headings and one readable font for content. Animations are under 300 ms and used only for state changes.
- The header logo is a wordmark: "BrandShield" in the display font with ".ai" in the accent colour.

## Core workflow
1. Admin creates the brand library:
   - Guidelines as sections with stable IDs (e.g., TONE-02), versioned.
   - Approved facts with statement, source, owner, date and expiry date.
   - Terminology entries with preferred term and banned or alternate terms.
   - Brand assets: logos, approved colours, approved images.
2. Creator creates a submission with title, channel (LinkedIn, website, email, print), content (text, image or document) and an AI-use disclosure (none / AI-assisted / AI-generated).
3. Before review, a privacy notice states whether content will be sent to an external AI service. Confidential patterns, defined by admin, are masked before any external call and restored locally.
4. Review runs in stages:
   a. Rule engine: terminology, banned phrases, claims, length, alt text, reading level.
   b. LLM review: tone, unsupported or outdated claims compared against approved facts, and a description of visual consistency for images.
   c. Accessibility: heading order, link text, alt text, contrast notes where detectable.
   If the LLM times out, keep the rule-engine results and show a notice that the AI review was incomplete.
5. Each issue stores: category, severity (blocker / warning / suggestion), the exact text or region, the guideline ID, rule ID or approved-fact ID, a plain-language explanation, and a suggested replacement that keeps the creator's meaning.
   An issue without a reference may only be shown as a suggestion, never as an error.
6. Creator sees inline highlights and an issue panel. For each issue: Accept, Edit or Reject. A diff view shows original against proposed text. Nothing changes without an explicit creator action.
7. When all blockers are resolved, the creator submits for review. Reviewer approves, requests changes with a comment, or rejects. Every action is written to revision history with user, timestamp, and before and after content.
8. Approved content is marked "Ready to publish" and can be copied or downloaded. Do not integrate direct publishing in this version.
9. Every decision is stored so Insights can count recurring issues by guideline ID, creator team and channel.

## Extra features to build
- Claim evidence card: a flagged claim shows the nearest approved fact, its source, owner and whether it has expired.
- Channel-aware rules: rules can be scoped to a channel (for example, LinkedIn length limits).
- Clarity heatmap: guideline IDs against teams, showing where repeated issues cluster.
- Guideline draft assistant: when one guideline triggers many repeated issues, the LLM drafts a clearer version with two examples. The admin accepts or edits it.
- Brand pulse score: blockers, warnings and resolved counts per submission and per team, shown as a trend. It is a governance signal, not a score on individuals.
- Audit export: downloadable record of who reviewed what, when, and which rule or LLM version produced each finding.

## Required pages
- Login (role-aware redirect after sign-in)
- Dashboard (role-dependent): pending reviews, my submissions, status counts, brand pulse
- Brand Library (admin): tabs for Guidelines, Approved Facts, Terminology, Assets. Create, edit, version, deactivate. Items are never silently deleted.
- New Submission: text editor or file upload, channel selector, AI disclosure, privacy notice
- Review Workspace: highlighted content on the left, issue list on the right, accept/edit/reject, diff view, comments, revision history
- Reviewer Queue: awaiting approval, filters by channel, team, severity and age
- Insights: recurring issues over time, clarity heatmap, "guidelines needing clarity" list
- Settings: retention period, external LLM on or off, default AI disclosure, confidential patterns, user roles

## Data model (minimum)
users, roles, brand_guidelines (with versions), approved_facts (source, owner, expiry), terminology_entries, brand_assets, rules (type, pattern, severity, guideline_id, channel), submissions (type, channel, status, ai_disclosure, owner_id), submission_versions, issues (submission_version_id, category, severity, span, guideline_ref, explanation, suggestion, decision), review_actions, audit_log, confidential_patterns.

## Privacy, security and responsible design
- Hashed passwords, role checks on every endpoint, input validation, upload size and type limits, CSRF protection.
- API keys only in environment variables. Never log keys or full submission content. Logs record event types and IDs.
- Retention: deleting a submission removes its database rows and stored files.
- Insights are aggregated by team and channel and shown as guideline signals, not individual performance scores.
- Show an AI-use notice wherever content leaves the platform.

## Accessibility of the product
Full keyboard navigation, visible focus states, labelled form fields, meaningful headings, sufficient contrast, reduced-motion mode, and a usable layout at narrow widths (issue list moves below content).

## Testing
- Unit tests for every rule type.
- Integration test: run a sample submission through review in MOCK mode and assert the expected issues.
- Test that an issue without a reference is never stored as an error.
- Test that a suggestion is never applied without an explicit accept action.
- Test LLM timeout fallback.

## Seed data
A fictional company, "Northwind Labs", with:
- A brand library: 8 guidelines, 6 approved facts (two expired), a terminology list, and 2 assets.
- 3 sample submissions: one clean, one with terminology issues, one with an outdated claim.
- Demo user accounts for each role.

## Deliverables
1. Working app with README: install, environment variables, seed command, start command, test command.
2. .env.example with placeholders only (for example, BRANDSHIELD_LLM_API_KEY=your-key-here).
3. docs/architecture.md: rule engine versus LLM split, how to swap providers, how the 3D layer degrades.
4. docs/limitations-and-roadmap.md.
5. README demo script: 5 steps from admin upload to reviewer approval.
6. A list of AI tools and external libraries used, for the submission disclosure.

## Build order
Phase 1: Auth, roles, schema, brand library CRUD, seed data.
Phase 2: Submission creation, rule engine, MOCK LLM review, issue storage.
Phase 3: Review workspace, accept/edit/reject, diff view, comments, approval, revision history.
Phase 4: Insights, privacy settings, real LLM provider, 3D background polish.
Phase 5: Accessibility pass, tests, README, docs, demo seed.

## Out of scope for now
Direct publishing to social platforms, video and audio review, Google Docs and Canva integrations, brand health scores, and automatic learning from corrections. Store decisions so these can be added later.