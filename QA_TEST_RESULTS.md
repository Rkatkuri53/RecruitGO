# QA TEST RESULTS — MYRECRUITER TIER 2

**Test Date:** October 16, 2026  
**Test Suite:** `qa_suite/run_full_qa.mjs`  
**Total Tests:** 40  
**Passed:** 40  
**Failed:** 0  
**Pass Rate:** 100.0%  

---

## 1. Test Execution Summary by Functional Category

| Category | Description | Total Tests | Passed | Failed | Pass Rate | Avg Latency |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **AUTH** | Authentication, RBAC Login, Invalid Credentials | 5 | 5 | 0 | 100% | 224 ms |
| **USERS** | Team Members Directory & Hierarchies | 1 | 1 | 0 | 100% | 176 ms |
| **CLIENTS** | Corporate Clients Catalog, Provenance Ingestion | 2 | 2 | 0 | 100% | 259 ms |
| **SPOKES** | Client Spoke Association | 1 | 1 | 0 | 100% | 179 ms |
| **JOBS** | ATS Job Requisitions, Client Filtering | 3 | 3 | 0 | 100% | 300 ms |
| **CANDIDATES**| Candidate Sourcing, Local Resume Scanner, Search | 3 | 3 | 0 | 100% | 503 ms |
| **ATS_SUBMISSION**| Recruiter Submissions to Team Lead QC | 1 | 1 | 0 | 100% | 1325 ms |
| **TL_QC** | Team Lead QC Inbox, Reason Codes, Approval | 3 | 3 | 0 | 100% | 963 ms |
| **AM_DESK** | AM Review Desk, Client Spoke Token Dispatch | 2 | 2 | 0 | 100% | 646 ms |
| **PORTAL** | Zero-Login External Web Portal, 1-Click Shortlist | 3 | 3 | 0 | 100% | 451 ms |
| **CALENDAR** | Calendar Sync, Interview Auto-Scheduling | 1 | 1 | 0 | 100% | 188 ms |
| **FUNNEL** | Hiring Funnel Stages (Offered, Joined) | 2 | 2 | 0 | 100% | 932 ms |
| **MANAGEMENT**| Recruiter / TL / AM / Client / Spoke Funnel Tables | 4 | 4 | 0 | 100% | 938 ms |
| **SECURITY** | SQLi Defense, Token Tampering, Deduplication | 4 | 4 | 0 | 100% | 132 ms |
| **PERF** | Latency Benchmarks (< 500ms Threshold) | 5 | 5 | 0 | 100% | 205 ms |

---

## 2. Individual Test Results & Evidence Log

| # | Test Case Name | Category | Status | Latency | Verification Evidence / Return Payload |
|---|:---|:---:|:---:|:---:|:---|
| 1 | Recruiter Login | AUTH | ✅ PASS | 256ms | HTTP 200, Role: `Recruiter`, user: `recruiter@myrecruiter.com` |
| 2 | Team Lead Login | AUTH | ✅ PASS | 415ms | HTTP 200, Role: `TeamLead`, user: `teamlead@myrecruiter.com` |
| 3 | Account Manager Login | AUTH | ✅ PASS | 105ms | HTTP 200, Role: `AccountManager`, user: `am@myrecruiter.com` |
| 4 | Management Admin Login | AUTH | ✅ PASS | 187ms | HTTP 200, Role: `Management`, user: `admin@myrecruiter.com` |
| 5 | Reject Invalid Credentials | AUTH | ✅ PASS | 108ms | HTTP 401, Invalid email or password correctly blocked |
| 6 | Team Members Directory | USERS | ✅ PASS | 176ms | HTTP 200, Returned 12 active organizational user accounts |
| 7 | Fetch Active Clients | CLIENTS | ✅ PASS | 136ms | HTTP 200, Returned 6 active corporate clients |
| 8 | Create Corporate Client (ATS Provenance) | CLIENTS | ✅ PASS | 382ms | HTTP 200, Client onboarded: `QA_AcmeCorp_1792145413303` |
| 9 | Add Spoke Person to Client | SPOKES | ✅ PASS | 179ms | HTTP 200, Spoke added: `John Spoke QA` |
| 10 | Create ATS Job Requisition | JOBS | ✅ PASS | 513ms | HTTP 200, Job ID: `job_1792145413864liar`, Status: `active` |
| 11 | Fetch Active Jobs List | JOBS | ✅ PASS | 176ms | HTTP 200, Returned 8 active job requisitions |
| 12 | Filter Jobs by Client | JOBS | ✅ PASS | 212ms | HTTP 200, Scoped query matched client jobs accurately |
| 13 | Create Candidate in Talent Vault | CANDIDATES | ✅ PASS | 756ms | HTTP 200, Candidate ID: `cand_1792145415023kfpq` |
| 14 | Ingest Local Scanned Resume to Talent DB | CANDIDATES | ✅ PASS | 440ms | HTTP 200, Ingested local file, assigned code `CAND-1032` |
| 15 | Search Candidates by Name/Skill | CANDIDATES | ✅ PASS | 313ms | HTTP 200, Returned 37 candidate profiles with match scores |
| 16 | Recruiter Submit Candidate to Team Lead QC | ATS_SUBMISSION | ✅ PASS | 1325ms | HTTP 200, Submission ID: `SUB-3010`, Status: `Submitted to TL` |
| 17 | Team Lead QC Inbox Populated | TL_QC | ✅ PASS | 205ms | HTTP 200, Found `SUB-3010` in `u_teamlead` pending queue |
| 18 | TL QC Rejection with Mandatory Reason Code | TL_QC | ✅ PASS | 1672ms | HTTP 200, Status: `Rejected by TL`, Feedback logged in remarks |
| 19 | TL QC Approval forwards to AM Queue | TL_QC | ✅ PASS | 1012ms | HTTP 200, Status: `Submitted to AM`, Stage logged in pipeline |
| 20 | AM Inbox Populated with TL-Cleared Submissions | AM_DESK | ✅ PASS | 315ms | HTTP 200, Found approved submission in AM queue |
| 21 | AM Dispatches to Client Spoke (Generates Token) | AM_DESK | ✅ PASS | 978ms | HTTP 200, Token generated: `8b20425def...`, Status: `Client Submitted` |
| 22 | Client Spoke Web Page Route Available (`/portal/review`) | PORTAL | ✅ PASS | 21ms | HTTP 200, Zero-login standalone HTML rendered cleanly |
| 23 | Client Spoke API Loads Candidate Dossier | PORTAL | ✅ PASS | 276ms | HTTP 200, Candidate `Alex Mercer QA`, rates, skills loaded |
| 24 | Client Spoke 1-Click Shortlist & Auto-Schedule | PORTAL | ✅ PASS | 1056ms | HTTP 200, Status: `Interview Scheduled`, duration: 45 min |
| 25 | Interview Event Auto-Inserted in ATS Calendar | CALENDAR | ✅ PASS | 188ms | HTTP 200, Interview event verified in database (8 total) |
| 26 | Advance Pipeline: Selected -> Offered | FUNNEL | ✅ PASS | 1193ms | HTTP 200, Status updated to `Offered`, pipeline logged |
| 27 | Advance Pipeline: Offered -> Joined | FUNNEL | ✅ PASS | 671ms | HTTP 200, Status updated to `Joined`, invoice $25,000 saved |
| 28 | Recruiter Performance Funnel Table | MANAGEMENT | ✅ PASS | 938ms | HTTP 200, 5 recruiters with complete stage conversion funnels |
| 29 | Team Lead Performance Funnel Table | MANAGEMENT | ✅ PASS | 938ms | HTTP 200, 3 team leads with submissions, interviews, joinings |
| 30 | Account Manager Performance Funnel Table | MANAGEMENT | ✅ PASS | 938ms | HTTP 200, 9 AM rows mapped by Spoke, Client, Roles, Offers |
| 31 | Client & Spoke Breakdown Tables | MANAGEMENT | ✅ PASS | 938ms | HTTP 200, 7 Clients and 6 Spokes breakdown confirmed |
| 32 | SQL Injection Resistance on Candidate Search | SECURITY | ✅ PASS | 154ms | HTTP 200, Injection payload `' OR 1=1 --` safely parameterized |
| 33 | SQL Injection Resistance on Filter Queries | SECURITY | ✅ PASS | 111ms | HTTP 200, Injection payload `' OR '1'='1` safely parameterized |
| 34 | Tampered Review Token Rejection | SECURITY | ✅ PASS | 105ms | HTTP 404, Unauthorized forged token access denied |
| 35 | Duplicate Candidate Submission Prevention | INTEGRITY | ✅ PASS | 101ms | HTTP 400, Duplicate active submission blocked with message |
| 36 | Endpoint Latency: GET /api/jobs | PERF | ✅ PASS | 216ms | 216ms (< 500ms SLA target) |
| 37 | Endpoint Latency: GET /api/candidates | PERF | ✅ PASS | 200ms | 200ms (< 500ms SLA target) |
| 38 | Endpoint Latency: GET /api/ats/analytics/management | PERF | ✅ PASS | 328ms | 328ms (< 500ms SLA target, down from 1282ms) |
| 39 | Endpoint Latency: GET /api/team | PERF | ✅ PASS | 143ms | 143ms (< 500ms SLA target) |
| 40 | Endpoint Latency: GET /api/clients | PERF | ✅ PASS | 140ms | 140ms (< 500ms SLA target) |
