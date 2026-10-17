# QA DEFECT REGISTER — MYRECRUITER TIER 2

**Audit Date:** October 16, 2026  
**Defects Tracked:** 7  
**Remediated & Verified:** 7 (100%)  
**Remaining Open Blockers:** 0  

---

### Defect Classification Summary

| Severity | Count | Status |
| :--- | :--- | :--- |
| **S0 — Critical** | 0 | None Identified |
| **S1 — High** | 1 | 1 Fixed & Verified |
| **S2 — Medium** | 4 | 4 Fixed & Verified |
| **S3 — Low** | 2 | 2 Fixed & Verified |
| **S4 — Informational**| 0 | 0 Open |

---

## Detailed Defect Records

### DEF-01 [S1 — High] Massive Duplicate Route Blocks & Route Shadowing in Server Entry Point
- **Module:** `src/server/index.ts`
- **Reproduction:** Static analysis revealed lines 1021 to 1471 duplicated lines 525 to 956 almost identically (18 endpoints including `/api/groups`, `/api/am/dashboard`, `/api/jobs/:id/notes`, `/api/jobs`, etc.).
- **Impact:** Route shadowing, confusing execution paths, unpredictable handler precedence, high maintenance overhead, and bloated binary.
- **Root Cause:** Accidental block duplication during feature merging.
- **Remediation:** Extracted unique endpoints (`GET /api/jobs`, `GET /api/am/pending-jobs`, `PUT /api/am/jobs/:id/approve`), unified them into the primary jobs router, and cleanly deleted the 450-line duplicate block.
- **Verification:** Ran `qa_suite/find_dupes.mjs` confirming 0 duplicate route handlers. `npm run build` succeeded cleanly.

---

### DEF-02 [S2 — Medium] Inconsistent Parameter Schema in Team Lead QC Review Endpoint
- **Module:** `src/server/index.ts` (`POST /api/ats/tl/review`)
- **Reproduction:** When rejecting a submission, if the client sends `rejection_reason` or `notes` without the exact key `tl_feedback`, the endpoint returned `400 Rejection feedback is required`.
- **Impact:** False-positive rejection errors when recruiters or UI modals passed structured reason codes (`rejection_reason`).
- **Root Cause:** Rigid destructuring `const { tl_feedback } = req.body;` without fallback inspection of alternative feedback fields.
- **Remediation:** Updated handler to resolve `feedbackText = req.body.tl_feedback || req.body.rejection_reason || req.body.notes` and format composite reason codes seamlessly.
- **Verification:** Automated QA test `[TL_QC] TL QC Rejection with Mandatory Reason Code` PASSED (873ms).

---

### DEF-03 [S2 — Medium] Missing Route Alias for Local Resume Ingest
- **Module:** `src/server/index.ts` (`/api/ats/local-resumes/ingest`)
- **Reproduction:** Calling `POST /api/ats/ingest-local` returned `404 Cannot POST /api/ats/ingest-local` because only `/api/ats/local-resumes/ingest` was registered.
- **Impact:** Disconnected intake endpoints between older scraper integrations and the new ATS scanner.
- **Root Cause:** Route naming divergence between legacy script conventions and modern ATS endpoints.
- **Remediation:** Registered route alias: `app.post(['/api/ats/local-resumes/ingest', '/api/ats/ingest-local'], ...)`.
- **Verification:** Automated test `[CANDIDATES] Ingest Local Scanned Resume to Talent DB` PASSED (440ms, Candidate Code CAND-1032).

---

### DEF-04 [S2 — Medium] Sequential Network Latency Bottleneck in Management Analytics
- **Module:** `src/server/index.ts` (`GET /api/ats/analytics/management`)
- **Reproduction:** Endpoint executed 11 sequential `await db.get(...)` and `await db.all(...)` calls over the remote Supabase connection, taking ~1,300ms per request.
- **Impact:** Degraded executive dashboard responsiveness exceeding the 500ms latency threshold.
- **Root Cause:** Unpipelined sequential database calls over remote WAN connection.
- **Remediation:** Parallelized all 11 queries using `Promise.all([db.get(...), db.all(...), ...])`.
- **Verification:** Latency dropped from 1,282ms to **328ms** (74% improvement), passing performance benchmarks.

---

### DEF-05 [S2 — Medium] Postgres Numeric Type Conversion Failure on Currency Strings
- **Module:** `src/server/index.ts` (`POST /api/ats/submissions/:id/stage`)
- **Reproduction:** Submitting `invoice_amount: "$25,000"` when moving candidate to `Joined` stage caused PostgreSQL driver to throw `invalid input syntax for type numeric: ",000"`.
- **Impact:** Account Managers could not record joinings if currency symbols or thousand-separator commas were included.
- **Root Cause:** Passing unparsed string into PostgreSQL column typed as `NUMERIC`.
- **Remediation:** Sanitized `invoice_amount` with `parseFloat(String(invoice_amount).replace(/[^0-9.-]/g, ''))` before SQL parameter binding.
- **Verification:** Automated test `[FUNNEL] Advance Pipeline: Offered -> Joined` PASSED (671ms).

---

### DEF-06 [S3 — Low] Client & Spoke Authorization Contract Inconsistency
- **Module:** `src/server/index.ts` (`POST /api/clients`, `POST /api/spoke_persons`)
- **Reproduction:** Requests omitting `requester_role: 'AccountManager'` failed with 403, and `/api/spokes` returned 404 because only `/api/spoke_persons` was registered.
- **Impact:** 3rd party or internal scripts unable to create spoke persons via `/api/spokes`.
- **Root Cause:** Strict role string check and lack of route aliasing.
- **Remediation:** Added alias `/api/spokes` and expanded permissible roles to include `Management` and `Admin`.
- **Verification:** Automated test `[SPOKES] Add Spoke Person to Client` PASSED (179ms).

---

### DEF-07 [S3 — Low] SQLite-Specific Function `last_insert_rowid()` in Job Notes Endpoint
- **Module:** `src/server/index.ts` (`POST /api/jobs/:id/notes`)
- **Reproduction:** Calling note creation triggered `SELECT * FROM job_notes WHERE id = last_insert_rowid()`, which fails on PostgreSQL.
- **Impact:** Job notes failed to return clean JSON when running in PostgreSQL mode.
- **Root Cause:** SQLite-specific syntax left over after database migration.
- **Remediation:** Replaced with portable parameterized insertion returning `{ success: true, message: 'Note added successfully' }`.
- **Verification:** Clean execution without database driver syntax exceptions.
