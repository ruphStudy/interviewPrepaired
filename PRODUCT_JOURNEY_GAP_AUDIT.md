# EnterSkill Deep Product Journey Gap Audit

Branch: `product-journey-gap-audit`  
Baseline: `manual-setOfQuestion` at `76d98744139e3d99a9f488cb48d4f659d9980d94` (`PR-REGRESSION`)

## Purpose

This audit is intentionally separate from the 32 feature sprints and the 45 production-readiness prompts. It checks complete product journeys across frontend, backend, recovery/failure behavior, privacy, billing and operational support rather than treating the existence of a model/API/page as proof that a user can complete the journey.

## Journeys reviewed

- B2C registration/authentication -> interview setup -> AI/uploaded interview -> answer capture -> report/history -> credits -> pricing/billing -> account/privacy.
- Institute organization/student/trainer lifecycle, including credit-backed interview usage and completion linkage.
- Employer/HR organization -> job/candidate/application -> invitation -> public candidate assessment lifecycle.
- Admin/support user management and operational/privacy consequences.
- Cross-cutting authentication/session, retry/recovery, microphone/browser support, API error propagation and tenant/privacy safety.

## Confirmed gaps fixed on this branch

### 1. Transient auth bootstrap failures looked like logout — HIGH / frontend

`AuthContext` previously removed the saved auth token for any `/auth/me` failure, including network/5xx failures. A short backend outage therefore appeared to sign the user out.

Fixed:
- clear auth only on a real 401;
- retain the token on transient failures;
- ProtectedRoute renders a retryable session-verification state;
- `logout-all` no longer claims success and clears the device if server-side revocation fails.

### 2. Structured interview errors were lost — HIGH / frontend

The interview API interceptor created structured errors, but method-level catches wrapped them in new `Error` objects. `INSUFFICIENT_INTERVIEW_CREDITS` and other recovery codes were therefore lost before the UI could show the correct upgrade/top-up journey.

Fixed by preserving backend `code` and `balance` metadata through the API layer.

### 3. Dashboard opened resumable interviews as reports — HIGH / frontend

Recent interviews always navigated to `/report/:id`, including `created`, `in-progress` and `paused` sessions.

Fixed:
- resumable lifecycle states route to `/interview/:id`;
- completed/evaluated sessions route to report;
- row action communicates Resume/Report/Details;
- dashboard fetch failure is visible and retryable rather than silently looking empty.

### 4. Speech-recognition failure could dead-end or submit a fake answer — BLOCKER/HIGH / frontend

The voice hook could silently fail when browser recognition was unsupported/blocked and could submit the literal fallback `No answer provided`.

Fixed:
- explicit unsupported/permission/no-speech/network states;
- no fake answer submission;
- short/empty capture is rejected;
- typed-answer fallback is always available;
- TTS failure is non-blocking;
- candidate can switch between microphone and typed input.

### 5. Interview answer retry could strand or corrupt a session — BLOCKER / frontend+backend

The existing core service persisted `answerText` before AI evaluation. If evaluation/next-question generation failed, a retry was rejected as `Question already answered`. A different failure mode was worse: if the first request completed but the HTTP response was lost, the browser still displayed the old question while the server had advanced; retrying the old answer could be applied to the next question because the request contained only interviewId + answer.

Implemented a compatibility orchestration layer:
- new clients send the displayed 1-based `questionNumber`;
- retry must match the exact persisted question and the exact normalized answer;
- completed mutations replay persisted state without another AI call;
- interrupted persisted answers can recover evaluation/progression;
- persisted next question is reused rather than regenerated;
- uploaded-mode progression reuses stored questions;
- terminal recovery completes assignment/report flow best-effort;
- a Mongo-backed recovery claim protects duplicate recovery workers;
- legacy callers that do not send `questionNumber` continue through the previous core path.

This is security/data-integrity-sensitive and MUST be compiled and concurrency-tested locally before merge.

### 6. Admin user deletion bypassed the privacy lifecycle — BLOCKER / backend

Two legacy admin deletion paths hard-deleted the User row. The main `/admin/users/:id` implementation also deleted interviews directly. That bypassed PR-PRIVACY behavior such as session revocation, account anonymization, email suppression, asynchronous cleanup, privacy audit and preservation of billing/financial audit records.

Fixed:
- `AccountDeletionService` now supports an authorized admin-initiated deletion path using the same privacy-safe lifecycle as self-service deletion;
- legacy `/users/:id` admin deletion uses that service;
- the long-standing `/api/v1/admin/users/:id` public contract is intercepted before the legacy admin router and routed to a privacy-safe handler so the current Admin UI remains compatible;
- self-delete from the admin user-management endpoint is rejected.

Local cross-check should remove/replace the now-obsolete hard-delete implementation inside `admin.controller.ts` once route compatibility is verified, so there is one obvious implementation rather than a compatibility shim plus dead code.

## Confirmed remaining code gaps for local cross-check/fix

### A. Report Progress History is hard-coded empty — HIGH / frontend

`frontend/src/pages/ReportDashboard.tsx` contains a `Fetch Interview History` effect that explicitly sets `historyData` to `[]` with a comment saying the history endpoint would be new. The endpoint and `interviewApi.getHistory()` already exist. Consequently the Progress History tab can be permanently empty even when the user has real completed interviews.

Required fix:
- load real paginated history through `interviewApi.getHistory()`;
- map `answeredQuestions`/`overallScore` safely;
- include only appropriate scored/completed records in the trend if that is what the graph requires;
- show loading/error/empty states instead of silently rendering fake emptiness.

### B. Audit-branch TypeScript/runtime verification is required — BLOCKER before merge

The GitHub connector can inspect and modify repository files, but it cannot run this repository locally in this environment. In particular, independently verify the new answer-recovery service for:
- TypeScript/Mongoose update typing;
- unique recovery-claim index behavior;
- original request + retry racing concurrently;
- response-loss after evaluation but before next-question response;
- retry after answer persistence but before evaluation;
- retry after next question persisted;
- duplicate retry from two app instances;
- uploaded-question mode;
- last-question completion and final-report recovery;
- no duplicate AI evaluation/next-question cost in races;
- institute assignment completion remains correct.

If a simpler implementation provides stronger idempotency, prefer correctness over preserving this exact implementation.

### C. Admin/support frontend is much narrower than backend operational capabilities — MEDIUM/HIGH / frontend

The active AdminDashboard exposes dashboard/users/interviews/analytics, while backend production-readiness APIs also expose payment troubleshooting/refunds/reconciliation, email delivery visibility, operational failed jobs/retry/diagnostics, storage orphan diagnostics, privacy audit and enterprise/manual contract operations.

This is not necessarily a public-user launch blocker, but before calling support operations complete, decide whether these controls need a minimal Admin UI for the launch team or are intentionally API-only. Do not build a large admin redesign unless product operations require it.

### D. Browser-level and provider-level behavior still needs local/live validation — EXTERNAL/RUNTIME

GitHub static analysis cannot prove:
- real microphone permission behavior across supported browsers;
- Razorpay checkout/callback/webhook behavior with merchant credentials;
- Resend delivery and verified sender/webhook behavior;
- S3 bucket permissions/signed URLs;
- OpenAI quota/model/timeout behavior;
- worker/process restart behavior;
- production Mongo indexes after schema changes.

## External launch dependencies (not code gaps)

- OpenAI production credentials/quota/model configuration.
- Razorpay production credentials + webhook/public configuration.
- Resend API key + verified sender/domain + webhook configuration.
- S3-compatible bucket/credentials/policy.
- legal Terms/Privacy URLs, versions and retention-period sign-off.
- production backup scheduling/durable backup storage and deployment monitoring configuration.

## Merge rule

Do NOT merge this branch into `manual-setOfQuestion` based only on this static audit. First perform the independent local Claude cross-check, compile backend/frontend, run focused tests and live-exercise B2C/Institute/Employer/Admin failure/recovery journeys. Any confirmed issue found during cross-check should be fixed on this audit branch, pushed, and then re-verified before merge.
