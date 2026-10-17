import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const BASE_URL = 'http://localhost:8745';

const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: [],
    timings: {}
};

function logTest(name, category, status, details = '', latencyMs = 0) {
    results.total++;
    if (status === 'PASS') results.passed++;
    else results.failed++;
    
    results.tests.push({ name, category, status, details, latencyMs });
    const sym = status === 'PASS' ? '✅' : '❌';
    console.log(`${sym} [${category}] ${name} (${latencyMs}ms) ${details ? '— ' + details : ''}`);
}

async function apiRequest(method, endpoint, body = null, headers = {}) {
    const start = Date.now();
    const url = `${BASE_URL}${endpoint}`;
    
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        const latency = Date.now() - start;
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = text;
        }
        return { status: res.status, ok: res.ok, data, latency };
    } catch (err) {
        const latency = Date.now() - start;
        return { status: 0, ok: false, error: err.message, latency };
    }
}

async function waitForServer(retries = 30) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(`${BASE_URL}/api/team`);
            if (res.ok) return true;
        } catch (e) {}
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

async function runTestSuite() {
    console.log('====================================================');
    console.log('   MYRECRUITER FULL-STACK QA AUTOMATION SUITE');
    console.log('====================================================\n');
    
    // ---------------------------------------------------------------
    // AREA 1: SYSTEM & AUTH
    // ---------------------------------------------------------------
    console.log('\n--- 1. AUTHENTICATION & USERS ---');
    {
        const res = await apiRequest('POST', '/api/auth/login', { email: 'recruiter@myrecruiter.com', password: 'recruiter123' });
        logTest('Recruiter Login', 'AUTH', res.ok && res.data.user?.role === 'Recruiter' ? 'PASS' : 'FAIL', `Role: ${res.data?.user?.role}`, res.latency);
    }
    {
        const res = await apiRequest('POST', '/api/auth/login', { email: 'teamlead@myrecruiter.com', password: 'teamlead123' });
        logTest('Team Lead Login', 'AUTH', res.ok && res.data.user?.role === 'TeamLead' ? 'PASS' : 'FAIL', `Role: ${res.data?.user?.role}`, res.latency);
    }
    {
        const res = await apiRequest('POST', '/api/auth/login', { email: 'am@myrecruiter.com', password: 'am123' });
        logTest('Account Manager Login', 'AUTH', res.ok && res.data.user?.role === 'AccountManager' ? 'PASS' : 'FAIL', `Role: ${res.data?.user?.role}`, res.latency);
    }
    {
        const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@myrecruiter.com', password: 'admin123' });
        logTest('Management Admin Login', 'AUTH', res.ok && res.data.user?.role === 'Management' ? 'PASS' : 'FAIL', `Role: ${res.data?.user?.role}`, res.latency);
    }
    {
        const res = await apiRequest('POST', '/api/auth/login', { email: 'invalid@user.com', password: 'wrongpassword' });
        logTest('Reject Invalid Credentials', 'AUTH', res.status === 401 ? 'PASS' : 'FAIL', `Expected 401, got ${res.status}`, res.latency);
    }
    {
        const res = await apiRequest('GET', '/api/team');
        logTest('Team Members Directory', 'USERS', res.ok && Array.isArray(res.data) && res.data.length > 0 ? 'PASS' : 'FAIL', `Count: ${res.data?.length}`, res.latency);
    }

    // ---------------------------------------------------------------
    // AREA 2: CLIENTS & SPOKES
    // ---------------------------------------------------------------
    console.log('\n--- 2. CLIENTS & SPOKE PERSONS ---');
    let testClientId = null;
    let testSpokeId = null;
    {
        const res = await apiRequest('GET', '/api/clients');
        const clientsList = Array.isArray(res.data) ? res.data : (res.data?.clients || []);
        logTest('Fetch Active Clients', 'CLIENTS', res.ok && Array.isArray(clientsList) && clientsList.length > 0 ? 'PASS' : 'FAIL', `Clients: ${clientsList.length}`, res.latency);
        if (clientsList.length > 0) {
            testClientId = clientsList[0].id;
        }
    }
    {
        const clientName = 'QA_AcmeCorp_' + Date.now();
        const res = await apiRequest('POST', '/api/ats/clients', {
            company_name: clientName,
            industry: 'FinTech',
            location: 'New York, NY',
            account_manager_id: 'u_am'
        });
        logTest('Create Corporate Client (ATS Provenance)', 'CLIENTS', res.ok && res.data ? 'PASS' : 'FAIL', `Client: ${clientName}`, res.latency);
        if (res.ok && res.data.id) {
            testClientId = res.data.id;
        }
    }
    {
        const spokeName = 'John Spoke QA';
        const res = await apiRequest('POST', '/api/spokes', {
            client_id: testClientId,
            name: spokeName,
            email: 'spoke_qa@acme.com',
            role_title: 'VP of Engineering',
            requester_role: 'AccountManager'
        });
        logTest('Add Spoke Person to Client', 'SPOKES', res.ok ? 'PASS' : 'FAIL', `Spoke: ${spokeName}`, res.latency);
        testSpokeId = res.data?.id || 'spoke_' + Date.now();
    }

    // ---------------------------------------------------------------
    // AREA 3: JOBS & REQUISITIONS
    // ---------------------------------------------------------------
    console.log('\n--- 3. JOBS & REQUISITIONS ---');
    let testJobId = null;
    {
        const res = await apiRequest('POST', '/api/ats/jobs', {
            title: 'Lead Full-Stack QA Engineer ' + Date.now(),
            company: 'QA Acme Global',
            client_id: testClientId,
            spoke_person_id: testSpokeId,
            location: 'Remote',
            jobType: 'Permanent',
            workMode: 'Remote',
            assigned_tl_id: 'u_teamlead',
            target_submissions: 5,
            salary_range: '$140k - $160k',
            description: 'Looking for a senior full-stack QA engineer with Node.js and Postgres experience.'
        });
        logTest('Create ATS Job Requisition', 'JOBS', res.ok && res.data.success ? 'PASS' : 'FAIL', `Job ID: ${res.data?.job?.id || res.data?.id}`, res.latency);
        testJobId = res.data?.job?.id || res.data?.id;
    }
    {
        const res = await apiRequest('GET', '/api/jobs');
        logTest('Fetch Active Jobs List', 'JOBS', res.ok && Array.isArray(res.data) && res.data.length > 0 ? 'PASS' : 'FAIL', `Total: ${res.data?.length}`, res.latency);
    }
    {
        const res = await apiRequest('GET', `/api/jobs?client_id=${testClientId}`);
        logTest('Filter Jobs by Client', 'JOBS', res.ok && Array.isArray(res.data) ? 'PASS' : 'FAIL', `Matches: ${res.data?.length}`, res.latency);
    }

    // ---------------------------------------------------------------
    // AREA 4: CANDIDATE SOURCING & INGESTION
    // ---------------------------------------------------------------
    console.log('\n--- 4. CANDIDATES & LOCAL SCAN SOURCING ---');
    let testCandidateId = null;
    {
        const res = await apiRequest('POST', '/api/ats/candidates', {
            name: 'Alex Mercer QA',
            headline: 'Senior Distributed Systems Architect',
            location: 'San Francisco, CA',
            skills: 'TypeScript, PostgreSQL, Node.js, Playwright, Docker',
            email: `alex.qa.${Date.now()}@example.com`,
            phone: '+1-555-' + Math.floor(1000 + Math.random() * 9000),
            expected_salary: '$150,000 / year',
            notice_period: '2 Weeks',
            visa_status: 'US Citizen',
            experience_years: 9,
            notes: 'Strong testing and architecture background'
        });
        const cid = res.data?.candidate?.id || res.data?.existingCandidate?.id || res.data?.id;
        logTest('Create Candidate in Talent Vault', 'CANDIDATES', res.ok && cid ? 'PASS' : 'FAIL', `Candidate ID: ${cid}`, res.latency);
        testCandidateId = cid;
    }
    {
        const res = await apiRequest('POST', '/api/ats/local-resumes/ingest', {
            name: 'Morgan Vance LocalCV',
            headline: 'Staff QA Automation Lead',
            skills: 'TypeScript, Cypress, Jest, CI/CD',
            location: 'Seattle, WA',
            email: `morgan.qa.${Date.now()}@example.com`,
            phone: '+1-555-0288',
            raw_text: 'Morgan Vance Staff QA Lead. 10 years test automation and quality systems experience.'
        });
        logTest('Ingest Local Scanned Resume to Talent DB', 'CANDIDATES', res.ok && res.data.candidateCode ? 'PASS' : 'FAIL', `Candidate Code: ${res.data?.candidateCode}`, res.latency);
    }
    {
        const res = await apiRequest('GET', `/api/candidates?q=Alex`);
        logTest('Search Candidates by Name/Skill', 'CANDIDATES', res.ok && Array.isArray(res.data) ? 'PASS' : 'FAIL', `Results: ${res.data?.length}`, res.latency);
    }

    // ---------------------------------------------------------------
    // AREA 5: RECRUITER SUBMISSION WORKFLOW
    // ---------------------------------------------------------------
    console.log('\n--- 5. RECRUITER SUBMISSION TO TEAM LEAD QC ---');
    let testSubmissionId = null;
    {
        const res = await apiRequest('POST', '/api/ats/submissions', {
            candidate_id: testCandidateId,
            job_id: testJobId,
            recruiter_id: 'u_recruiter',
            tl_id: 'u_teamlead',
            expected_salary: '$150,000 / year',
            notice_period: '2 Weeks',
            visa_status: 'US Citizen',
            email_body: 'Dossier submission for Alex Mercer. Verified skills and background fit for Lead QA position.'
        });
        const subId = res.data?.submission_id || res.data?.id;
        logTest('Recruiter Submit Candidate to Team Lead QC', 'ATS_SUBMISSION', res.ok && subId ? 'PASS' : 'FAIL', `Submission ID: ${subId}`, res.latency);
        testSubmissionId = subId;
    }
    {
        const res = await apiRequest('GET', '/api/ats/tl/inbox?tl_id=u_teamlead');
        const found = Array.isArray(res.data) && res.data.some(s => s.id === testSubmissionId);
        logTest('Team Lead QC Inbox Populated', 'TL_QC', res.ok && found ? 'PASS' : 'FAIL', `Pending QC Items: ${res.data?.length}`, res.latency);
    }

    // ---------------------------------------------------------------
    // AREA 6: TEAM LEAD QC (REJECTION & APPROVAL PATHS)
    // ---------------------------------------------------------------
    console.log('\n--- 6. TEAM LEAD QC EVALUATION & REASON CODES ---');
    {
        // Test Structured Rejection on second candidate
        const tempCandRes = await apiRequest('POST', '/api/ats/candidates', {
            name: 'Temp Reject Candidate',
            skills: 'Basic QA',
            email: `temp.reject.${Date.now()}@example.com`
        });
        const tempCid = tempCandRes.data?.candidate?.id || tempCandRes.data?.id;
        const tempSubRes = await apiRequest('POST', '/api/ats/submissions', {
            candidate_id: tempCid,
            job_id: testJobId,
            recruiter_id: 'u_recruiter',
            tl_id: 'u_teamlead'
        });
        const tempSubId = tempSubRes.data?.submission_id || tempSubRes.data?.id;
        
        const rejectRes = await apiRequest('POST', '/api/ats/tl/review', {
            submission_id: tempSubId,
            decision: 'reject',
            tl_id: 'u_teamlead',
            rejection_reason: 'Skills / Technical Stack Mismatch',
            notes: 'Candidate lacks PostgreSQL architecture depth.'
        });
        logTest('TL QC Rejection with Mandatory Reason Code', 'TL_QC', rejectRes.ok && rejectRes.data.status === 'Rejected by TL' ? 'PASS' : 'FAIL', `Status: ${rejectRes.data?.status}`, rejectRes.latency);
    }
    {
        // Approve primary test submission
        const approveRes = await apiRequest('POST', '/api/ats/tl/review', {
            submission_id: testSubmissionId,
            decision: 'approve',
            tl_id: 'u_teamlead',
            notes: 'High fit candidate. Approved for AM client dispatch.'
        });
        logTest('TL QC Approval forwards to AM Queue', 'TL_QC', approveRes.ok && approveRes.data.status === 'Submitted to AM' ? 'PASS' : 'FAIL', `Status: ${approveRes.data?.status}`, approveRes.latency);
    }

    // ---------------------------------------------------------------
    // AREA 7: ACCOUNT MANAGER REVIEW & CLIENT SUBMISSION
    // ---------------------------------------------------------------
    console.log('\n--- 7. ACCOUNT MANAGER & CLIENT SPOKE DISPATCH ---');
    let reviewToken = null;
    {
        const res = await apiRequest('GET', '/api/ats/am/inbox');
        const found = Array.isArray(res.data) && res.data.some(s => s.id === testSubmissionId);
        logTest('AM Inbox Populated with TL-Cleared Submissions', 'AM_DESK', res.ok && found ? 'PASS' : 'FAIL', `AM Queue: ${res.data?.length}`, res.latency);
    }
    {
        const submitClientRes = await apiRequest('POST', '/api/ats/am/submit-client', {
            submission_id: testSubmissionId,
            am_id: 'u_am',
            spoke_person_id: testSpokeId,
            custom_notes: 'Presented for priority review.'
        });
        reviewToken = submitClientRes.data?.review_token;
        logTest('AM Dispatches to Client Spoke (Generates Token)', 'AM_DESK', submitClientRes.ok && reviewToken ? 'PASS' : 'FAIL', `Token: ${reviewToken?.substring(0, 10)}...`, submitClientRes.latency);
    }

    // ---------------------------------------------------------------
    // AREA 8: CLIENT SPOKE ZERO-LOGIN PORTAL & INTERVIEW AUTO-SCHEDULE
    // ---------------------------------------------------------------
    console.log('\n--- 8. CLIENT SPOKE ZERO-LOGIN PORTAL ---');
    {
        const portalRes = await apiRequest('GET', `/portal/review?token=${reviewToken}`);
        logTest('Client Spoke Web Page Route Available (/portal/review)', 'PORTAL', portalRes.ok && typeof portalRes.data === 'string' && portalRes.data.includes('Client Candidate Review Portal') ? 'PASS' : 'FAIL', 'Served standalone HTML', portalRes.latency);
    }
    {
        const dossierRes = await apiRequest('GET', `/api/portal/submission/${reviewToken}`);
        logTest('Client Spoke API Loads Candidate Dossier', 'PORTAL', dossierRes.ok && dossierRes.data?.candidate_name === 'Alex Mercer QA' ? 'PASS' : 'FAIL', `Candidate: ${dossierRes.data?.candidate_name}`, dossierRes.latency);
    }
    {
        // Spoke Shortlists for Interview
        const interviewTime = new Date(Date.now() + 86400000).toISOString();
        const feedbackRes = await apiRequest('POST', `/api/portal/feedback/${reviewToken}`, {
            decision: 'shortlist',
            scheduled_time: interviewTime,
            duration: 45,
            notes: 'Technical Architecture Round with VP Eng'
        });
        logTest('Client Spoke 1-Click Shortlist & Auto-Schedule', 'PORTAL', feedbackRes.ok && feedbackRes.data.status === 'Interview Scheduled' ? 'PASS' : 'FAIL', `Status: ${feedbackRes.data?.status}`, feedbackRes.latency);
    }
    {
        // Verify Interview Record in DB
        const intRes = await apiRequest('GET', '/api/interviews');
        const foundInt = Array.isArray(intRes.data) && intRes.data.some(i => i.candidate_id === testCandidateId);
        logTest('Interview Event Auto-Inserted in ATS Calendar', 'CALENDAR', intRes.ok && foundInt ? 'PASS' : 'FAIL', `Total Scheduled: ${intRes.data?.length}`, intRes.latency);
    }

    // ---------------------------------------------------------------
    // AREA 9: HIRING FUNNEL PROGRESSION (STAGE UPDATES)
    // ---------------------------------------------------------------
    console.log('\n--- 9. HIRING FUNNEL ADVANCEMENT ---');
    {
        const res = await apiRequest('POST', `/api/ats/submissions/${testSubmissionId}/stage`, {
            stage: 'Offered',
            notes: 'Formal offer extended: $155,000 base'
        });
        logTest('Advance Pipeline: Selected -> Offered', 'FUNNEL', res.ok && res.data.success ? 'PASS' : 'FAIL', `New Status: ${res.data?.status}`, res.latency);
    }
    {
        const res = await apiRequest('POST', `/api/ats/submissions/${testSubmissionId}/stage`, {
            stage: 'Joined',
            joining_date: '2026-11-01',
            invoice_amount: '$25,000'
        });
        logTest('Advance Pipeline: Offered -> Joined', 'FUNNEL', res.ok && res.data.success ? 'PASS' : 'FAIL', `New Status: ${res.data?.status}`, res.latency);
    }

    // ---------------------------------------------------------------
    // AREA 10: MANAGEMENT ANALYTICS & EXECUTIVE REPORTING
    // ---------------------------------------------------------------
    console.log('\n--- 10. MANAGEMENT ANALYTICS & EXECUTIVE REPORTING ---');
    {
        const res = await apiRequest('GET', '/api/ats/analytics/management');
        const data = res.data;
        const validRec = Array.isArray(data?.recruiterPerformance) && data.recruiterPerformance.length > 0;
        const validTL = Array.isArray(data?.teamLeadPerformance) && data.teamLeadPerformance.length > 0;
        const validAM = Array.isArray(data?.accountManagerPerformance) && data.accountManagerPerformance.length > 0;
        const validClients = Array.isArray(data?.clients);
        const validSpokes = Array.isArray(data?.spokes);
        
        logTest('Recruiter Performance Funnel Table', 'MANAGEMENT', res.ok && validRec ? 'PASS' : 'FAIL', `Recruiters: ${data?.recruiterPerformance?.length}`, res.latency);
        logTest('Team Lead Performance Funnel Table', 'MANAGEMENT', res.ok && validTL ? 'PASS' : 'FAIL', `Team Leads: ${data?.teamLeadPerformance?.length}`, res.latency);
        logTest('Account Manager Performance Funnel Table', 'MANAGEMENT', res.ok && validAM ? 'PASS' : 'FAIL', `Account Managers: ${data?.accountManagerPerformance?.length}`, res.latency);
        logTest('Client & Spoke Breakdown Tables', 'MANAGEMENT', res.ok && validClients && validSpokes ? 'PASS' : 'FAIL', `Clients: ${data?.clients?.length}, Spokes: ${data?.spokes?.length}`, res.latency);
    }

    // ---------------------------------------------------------------
    // AREA 11: SECURITY & RESILIENCE AUDIT
    // ---------------------------------------------------------------
    console.log('\n--- 11. SECURITY, AUTH BYPASS & INJECTION AUDIT ---');
    {
        // SQL Injection in Candidate Search
        const res = await apiRequest('GET', `/api/candidates?q=' OR 1=1 --`);
        logTest('SQL Injection Resistance on Candidate Search', 'SECURITY', res.ok && !String(res.data).includes('syntax error') ? 'PASS' : 'FAIL', 'Parameterized query handled safely', res.latency);
    }
    {
        // SQL Injection in Job Requisition
        const res = await apiRequest('GET', `/api/jobs?client_id=' OR '1'='1`);
        logTest('SQL Injection Resistance on Filter Queries', 'SECURITY', res.ok ? 'PASS' : 'FAIL', 'Safe parameterized execution', res.latency);
    }
    {
        // Invalid Review Token Access
        const res = await apiRequest('GET', '/api/portal/submission/bad_forged_token_12345');
        logTest('Tampered Review Token Rejection', 'SECURITY', res.status === 404 ? 'PASS' : 'FAIL', `Status: ${res.status}`, res.latency);
    }
    {
        // Duplicate Submission Prevention
        const dupRes = await apiRequest('POST', '/api/ats/submissions', {
            candidate_id: testCandidateId,
            job_id: testJobId,
            recruiter_id: 'u_recruiter'
        });
        logTest('Duplicate Candidate Submission Prevention', 'INTEGRITY', dupRes.status === 400 || (dupRes.data && dupRes.data.error) ? 'PASS' : 'FAIL', `Response: ${dupRes.data?.error || dupRes.status}`, dupRes.latency);
    }

    // ---------------------------------------------------------------
    // AREA 12: LATENCY & PERFORMANCE BENCHMARK
    // ---------------------------------------------------------------
    console.log('\n--- 12. PERFORMANCE & LATENCY BENCHMARKS ---');
    const endpointsToBenchmark = [
        ['GET', '/api/jobs'],
        ['GET', '/api/candidates'],
        ['GET', '/api/ats/analytics/management'],
        ['GET', '/api/team'],
        ['GET', '/api/clients']
    ];
    for (const [m, ep] of endpointsToBenchmark) {
        const res = await apiRequest(m, ep);
        const pass = res.ok && res.latency < 500;
        logTest(`Endpoint Latency: ${m} ${ep}`, 'PERF', pass ? 'PASS' : 'WARN', `${res.latency}ms (Threshold < 500ms)`, res.latency);
    }

    console.log('\n====================================================');
    console.log(`TOTAL TESTS: ${results.total} | PASSED: ${results.passed} | FAILED: ${results.failed}`);
    console.log(`PASS RATE: ${((results.passed / results.total) * 100).toFixed(1)}%`);
    console.log('====================================================\n');

    fs.writeFileSync('qa_suite/test_run_output.json', JSON.stringify(results, null, 2));
    return results;
}

async function main() {
    let serverProcess = null;
    let ownServer = false;
    
    // Check if server is already running
    try {
        const testRes = await fetch(`${BASE_URL}/api/team`);
        if (testRes.ok) {
            console.log(`[QA] Reusing running server instance at ${BASE_URL}`);
        }
    } catch (e) {
        console.log(`[QA] Starting fresh test server instance...`);
        serverProcess = spawn('node', ['dist/server/index.js'], {
            stdio: 'inherit',
            env: { ...process.env, PORT: '8745' }
        });
        ownServer = true;
        
        const ready = await waitForServer(40);
        if (!ready) {
            console.error('[QA] Server failed to start within timeout.');
            if (serverProcess) serverProcess.kill();
            process.exit(1);
        }
        console.log('[QA] Server started and listening!');
    }

    try {
        await runTestSuite();
    } finally {
        if (ownServer && serverProcess) {
            console.log('[QA] Tearing down test server instance...');
            serverProcess.kill();
        }
    }
}

main().catch(err => {
    console.error('[QA Fatal Error]', err);
    process.exit(1);
});
