# QA SECURITY REPORT — MYRECRUITER TIER 2

**Audit Date:** October 16, 2026  
**Auditor:** Application Security & Reliability Engineering  
**Standard:** OWASP Top 10 (Web & API Security)  

---

## 1. Executive Summary
An in-depth security analysis of MyRecruiter Tier-2 was conducted across authentication boundaries, role authorization enforcement, API input validation, database query construction, token entropy, and local system command execution.

**Overall Security Posture:** **STRONG**  
- Zero critical vulnerabilities (S0) detected.
- All database operations utilize parameterized queries (`convertSql` translating `?` to `$1, $2` for PostgreSQL).
- Local file execution (`/api/open-file`) strictly restricts extensions to whitelist (`.pdf`, `.docx`, `.doc`, `.txt`, `.rtf`) and uses `execFile` rather than shell `exec` to prevent command injection.
- Zero-login client review tokens utilize 40-character cryptographically secure hex strings (`crypto.randomBytes(20)`).

---

## 2. Threat Vector Assessment & Verification Evidence

### A. Injection Vulnerabilities (OWASP A03:2021)
- **SQL / NoSQL Injection:**
  - *Mechanism:* All SQL statements are processed through `PgWrapper` (`get`, `all`, `run`) which converts parameterized `?` placeholders into indexed `$1, $2, ...` positional parameters for node-postgres.
  - *Test Performed:* Injected `' OR 1=1 --` into candidate search query `/api/candidates?q=...` and `' OR '1'='1` into job filter `/api/jobs?client_id=...`.
  - *Outcome:* Safe execution. Database treated payload strictly as literal strings; 0 SQL syntax errors or data leakages occurred.
- **Command Injection:**
  - *Endpoint:* `POST /api/open-file` (opens candidate CV on host machine).
  - *Protection:* Strict extension whitelist validation (`allowedExtensions.includes(ext)`), path resolution with `path.resolve`, and execution via `execFile('cmd', ['/c', 'start', '""', resolvedPath])` instead of shell interpolation.
  - *Outcome:* Non-whitelisted extensions (e.g. `.exe`, `.bat`, `.ps1`) are rejected with `HTTP 403 Forbidden`.

### B. Broken Authentication & Session Management (OWASP A07:2021)
- **Credential Storage:** User accounts utilize password verification in `POST /api/auth/login`.
- **Invalid Credential Handling:** Attempting to authenticate with non-existent or incorrect passwords yields a generic `401 Invalid email or password` without revealing user existence.
- **Review Token Security:**
  - Token entropy: 160 bits (40 hex characters from `crypto.randomBytes(20)`).
  - Token enumeration resistance: Brute-force attacks against `/api/portal/submission/:token` are infeasible due to $2^{160}$ keyspace.
  - Test with invalid token `/api/portal/submission/bad_forged_token_12345` returned `HTTP 404 Submission link not found or expired`.

### C. Broken Access Control (OWASP A01:2021)
- **Role Isolation:**
  - Client Creation: Restricted to `AccountManager` and `Management` roles.
  - Team Lead QC: Only Team Leads can approve/reject recruiter submissions at the QC stage.
  - Commercial Client UI: Cleanly removed from Team Lead sidebar navigation.
  - Spoke Evaluation: Client Spoke is strictly sandboxed to their assigned candidate token and cannot browse other candidates, jobs, or organizational analytics.

### D. Security Misconfiguration & Error Disclosure (OWASP A05:2021)
- **Database Error Sanitization:** Endpoints catch database exceptions and return standard JSON error structures without exposing raw stack traces in production responses.
- **Cache Control:** HTML responses enforce `no-store, no-cache, must-revalidate` headers to prevent sensitive candidate PII from lingering in intermediate caches.

### E. Data Integrity & Concurrency
- **Duplicate Active Submission Guard:**
  - The submission service explicitly checks:
    `SELECT id, status FROM submissions WHERE candidate_id = ? AND job_id = ? AND status NOT IN ('Rejected by TL', 'Interviews Rejected', 'Backout')`
  - Re-submitting an active candidate is blocked with `400 Candidate is already active for this job`.
- **Candidate Deduplication:**
  - Sourcing routes inspect both email address and standardized phone digits, preventing duplicate talent records from fragmenting candidate timelines.

---

## 3. Residual Security Recommendations (Hardening for Future Milestones)
1. **Password Hashing:** Currently default seed users use plaintext passwords in development. For public multi-tenant SaaS deployment, implement `bcrypt` or `argon2` hashing with salting.
2. **Rate Limiting:** Implement Express rate-limiting middleware (`express-rate-limit`) on public routes (`/api/portal/feedback/:token` and `/api/auth/login`) to guard against automated spam or DDoS.
3. **Audit Trail Logging:** Maintain structured JSON security logs for critical authorization changes and data exports.
