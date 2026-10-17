# QA FEATURE INVENTORY — MYRECRUITER TIER 2

**Generated on:** October 16, 2026  
**Application Architecture:** Electron Desktop + Express 5 Backend + PostgreSQL (Supabase) + LanceDB + Vanilla ES6 Frontend  

---

## 1. User Roles & Capabilities Matrix

| User Role | Primary Views | Core Responsibilities & Workflows | Key API Endpoints Used |
| :--- | :--- | :--- | :--- |
| **Recruiter** | `recruiter-view`, `ats-view-jobs`, `ats-view-candidates`, `ats-view-submissions`, `ats-view-scan-resumes` | Sourcing candidates, resume parsing, local folder scanning, candidate profile management, submitting candidate to Team Lead QC. | `POST /api/ats/submissions`<br>`POST /api/ats/scan-local-resumes`<br>`POST /api/ats/ingest-local`<br>`GET /api/candidates`<br>`GET /api/jobs` |
| **Team Lead (TL)** | `teamlead-view`, `ats-view-tl-qc`, `ats-view-jobs`, `ats-view-candidates`, `ats-view-submissions`, `ats-view-scan-resumes` | Quality Control (QC) review of recruiter submissions, candidate qualification, approving to AM queue, rejecting with structured reason. | `GET /api/ats/tl/inbox`<br>`POST /api/ats/tl/review` (approve/reject)<br>`GET /api/ats/tl/stats`<br>`GET /api/ats/submissions` |
| **Account Manager (AM)** | `account-manager-view`, `ats-view-clients`, `ats-view-jobs`, `ats-view-candidates`, `ats-view-submissions`, `ats-view-scan-resumes` | Client relationship management, job requisition approval, submitting candidate to Client Spoke with secure token, progressing hiring funnel. | `GET /api/ats/am/inbox`<br>`POST /api/ats/am/submit-client`<br>`POST /api/ats/am/reject`<br>`POST /api/ats/submissions/:id/stage`<br>`GET /api/clients`<br>`POST /api/clients` |
| **Client Spoke (External)** | Zero-Login External Web Portal (`/portal/review?token=...`), In-App Modal (`ats-spoke-review-modal`) | Evaluating submitted candidate dossier without login, 1-click Shortlisting for interview, Screening rejection, Salary negotiation counter. | `GET /api/portal/submission/:token`<br>`POST /api/portal/feedback/:token` |
| **Management / Admin** | `management-view`, `ats-view-team-info`, `ats-view-ai-insights`, `ats-view-settings` | Executive governance, conversion analytics, Recruiter / TL / AM performance tracking, team hierarchy management, AI strategy generation. | `GET /api/ats/analytics/management`<br>`GET /api/team`<br>`POST /api/team`<br>`GET /api/ats/ai-insights`<br>`POST /api/settings/email` |

---

## 2. Screen & Modal Inventory

### Primary Navigation Views (`.ats-view`):
1. `ats-view-dashboard`: Role-conditioned dashboard container hosting:
   - `recruiter-view` (Recruiter Dashboard)
   - `teamlead-view` (Team Lead QC & Team Dashboard)
   - `account-manager-view` (Account Manager Dashboard & Client Hub)
   - `management-view` (Executive Command Center & Performance Tables)
2. `ats-view-jobs`: Job requisitions catalog, search, creation, and detail views.
3. `ats-view-candidates`: Talent database, resume previews, match score calculation.
4. `ats-view-submissions`: Submissions tracking across all stages.
5. `ats-view-tl-qc`: Dedicated Team Lead candidate quality control review desk.
6. `ats-view-clients`: Client companies, spoke persons, and commercial profiles.
7. `ats-view-scan-resumes`: Local filesystem folder scanning & intelligent talent ingestion.
8. `ats-view-team-info`: Organizational hierarchy, reporting structures, and user management.
9. `ats-view-calendar`: Interview schedule view, call links, and agenda management.
10. `ats-view-ai-insights`: Gemini AI executive recruitment strategy and analytics.

### Key Modals:
1. `ats-submission-modal`: Recruiter submission creation with candidate, job, CTC, notice period, and email dossier generation.
2. `ats-tl-reject-modal`: Team Lead QC rejection modal requiring structured rejection reason code and feedback note.
3. `ats-am-reject-modal`: Account Manager rejection modal requiring feedback rationale.
4. `ats-spoke-review-modal`: In-app preview of external Client Spoke review portal.
5. `scanned-cv-preview-modal`: Local resume scanner dossier preview and 1-click ingestion.
6. `add-client-modal` & `add-spoke-modal`: Client company and spoke person registration.
7. `add-candidate-modal` & `edit-candidate-modal`: Candidate profile authoring.
8. `auth-modal` & `account-modal`: User authentication and role switching.
9. `schedule-modal` & `interview-details-modal`: Interview scheduling and management.

---

## 3. Database Entities (PostgreSQL Relational Tables)

| Entity Table | Primary Key | Key Relationships | Purpose |
| :--- | :--- | :--- | :--- |
| `users` | `id` (VARCHAR) | `agency_id`, `manager_id` | User accounts, roles (Recruiter, TeamLead, AccountManager, Management), credentials. |
| `jobs` | `id` (VARCHAR) | `client_id`, `spoke_person_id`, `assigned_tl_id` | Requisitions, job codes, descriptions, budgets, hiring requirements. |
| `candidates` | `id` (VARCHAR) | `job_id`, `created_by_user_id` | Sourced candidates, skills, experience details, contact info, status. |
| `submissions` | `id` (VARCHAR) | `candidate_id`, `job_id`, `recruiter_id`, `tl_id`, `am_id` | Candidate submissions flowing through the recruitment supply chain. |
| `clients` | `id` (VARCHAR) | `account_manager_id` | Corporate clients, commercial terms, billing models. |
| `spoke_persons` | `id` (VARCHAR) | `client_id` | Hiring managers and client contacts associated with requisitions. |
| `candidate_pipeline` | `id` (VARCHAR) | `candidate_id` | Chronological audit trail of stage progressions. |
| `candidate_remarks` | `id` (SERIAL) | `candidate_id`, `author_id` | Feedback, notes, and rejection reasons logged by recruiters, TLs, and AMs. |
| `interviews` | `id` (VARCHAR) | `candidate_id`, `job_id` | Scheduled technical/screening rounds, dates, video links, status. |
| `resume_vectors` | `id` (SERIAL) | `candidate_id` | LanceDB / pgvector semantic embeddings for resume search. |
| `daily_limits` | `id` (SERIAL) | Composite `(action_type, date)` | Anti-abuse and daily activity quotas. |
| `chat_groups` / `messages` | `id` (VARCHAR) | `group_id`, `sender_id` | Internal team collaboration and requisition messaging. |

---

## 4. External Integrations
1. **Google Gemini Generative AI:** Requisition analysis, candidate fit scoring, executive recruitment insights.
2. **LanceDB Vector Storage:** Local vector embeddings for semantic resume matching.
3. **Nodemailer / IMAP / Mailparser:** Email template dispatch and candidate outreach.
4. **Document Parsers (`mammoth`, `pdf-parse`):** Automated CV text extraction from `.pdf`, `.docx`, and `.txt` files.
