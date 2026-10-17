// =========================================================================
// RECRUITGO ATS & MEDIATED WORKFLOW ENGINE
// Mediator: Recruiter <-> Team Lead <-> Account Manager <-> Client Spoke
// =========================================================================

let currentSubmissionsList = [];
let currentCandidatesList = [];
let assignedJobsList = [];
let currentSpokeToken = null;

// Helper: Escape HTML
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------------------
// ROLE PERMISSION HELPERS (AM / MANAGEMENT ACCESS RESTRICTION)
// -------------------------------------------------------------------------
window.isUserAccountManager = function() {
    try {
        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : null;
        if (!user || !user.role) return true; // Default allow if unauthenticated in dev
        const r = String(user.role).toLowerCase();
        return r === 'accountmanager' || r === 'account_manager' || r === 'management' || r === 'admin' || r === 'superadmin';
    } catch (e) {
        return true;
    }
};

window.updateAtsRolePermissions = function() {
    const isAm = window.isUserAccountManager();
    const btnCreateJob = document.getElementById('btn-create-job-requisition');
    if (btnCreateJob) {
        btnCreateJob.style.display = isAm ? 'inline-flex' : 'none';
    }
    document.querySelectorAll('.role-am-only').forEach(el => {
        el.style.display = isAm ? '' : 'none';
    });

    try {
        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : null;
        const role = user ? String(user.role).toLowerCase().replace(/[\s_-]/g, '') : '';
        if (role === 'management' || role === 'admin') {
            ['nav-jobs', 'nav-candidates', 'nav-clients', 'nav-submissions', 'nav-calendar', 'nav-tl-qc'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            ['nav-dashboard', 'nav-team-info', 'nav-ai-insights', 'nav-settings'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'flex';
            });
        }
    } catch (e) {}
};

// -------------------------------------------------------------------------
// 1. NAVIGATION & ATS VIEW SWITCHER
// -------------------------------------------------------------------------
window.switchAtsView = function(viewId) {
    if (!viewId) return;

    window.updateAtsRolePermissions();

    // Hide all ats views
    document.querySelectorAll('.ats-view').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    // Hide all role dashboard sub-views on ANY view switch
    ['recruiter-view', 'teamlead-view', 'management-view', 'account-manager-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Unselect nav items
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Show target view
    const target = document.getElementById('ats-view-' + viewId);
    if (target) {
        target.style.display = (viewId === 'pipeline') ? 'flex' : 'block';
        target.classList.add('active');
    }

    // Highlight nav item
    const nav = document.getElementById('nav-' + viewId);
    if (nav) nav.classList.add('active');

    // Trigger data loading based on active view
    if (viewId === 'jobs') {
        if (typeof window.loadDetailedJobs === 'function') {
            window.loadDetailedJobs();
        }
    } else if (viewId === 'clients') {
        if (typeof window.loadDetailedClients === 'function') {
            window.loadDetailedClients();
        }
    } else if (viewId === 'tl-qc') {
        if (typeof window.loadTlInbox === 'function') {
            window.loadTlInbox();
        } else if (typeof loadTlInbox === 'function') {
            loadTlInbox();
        }
    } else if (viewId === 'submissions') {
        if (typeof window.loadSubmissions === 'function') {
            window.loadSubmissions();
        } else if (typeof loadSubmissions === 'function') {
            loadSubmissions();
        }
    } else if (viewId === 'candidates') {
        if (typeof window.loadAtsCandidates === 'function') {
            window.loadAtsCandidates();
        } else if (typeof loadAtsCandidates === 'function') {
            loadAtsCandidates();
        }
    } else if (viewId === 'clients-roles') {
        if (typeof window.loadDetailedClients === 'function') {
            window.loadDetailedClients();
        }
    } else if (viewId === 'team-info') {
        if (typeof window.loadTeamHierarchy === 'function') {
            window.loadTeamHierarchy();
        } else if (typeof loadTeamHierarchy === 'function') {
            loadTeamHierarchy();
        }
    } else if (viewId === 'ai-insights') {
        if (typeof window.generateAiInsights === 'function') {
            window.generateAiInsights();
        } else if (typeof generateAiInsights === 'function') {
            generateAiInsights();
        }
    } else if (viewId === 'calendar') {
        if (typeof loadInterviews === 'function') loadInterviews();
        setTimeout(() => { if (typeof calendar !== 'undefined' && calendar) calendar.render(); }, 150);
    } else if (viewId === 'pipeline') {
        if (typeof loadPipeline === 'function') loadPipeline();
    } else if (viewId === 'dashboard') {
        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : null;
        const role = user ? String(user.role).toLowerCase().replace(/[\s_-]/g, '') : '';
        
        ['recruiter-view', 'teamlead-view', 'management-view', 'account-manager-view'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        if (role === 'recruiter') {
            const rv = document.getElementById('recruiter-view');
            if (rv) rv.style.display = 'block';
            if (typeof window.loadRecruiterDashboard === 'function') window.loadRecruiterDashboard();
        } else if (role === 'teamlead' || role === 'tl') {
            const tlv = document.getElementById('teamlead-view');
            if (tlv) tlv.style.display = 'block';
            if (typeof window.loadTeamLeadDashboard === 'function') window.loadTeamLeadDashboard();
        } else if (role === 'management' || role === 'admin') {
            const mv = document.getElementById('management-view');
            if (mv) mv.style.display = 'block';
            if (typeof loadManagementAnalytics === 'function') loadManagementAnalytics();
        } else if (role === 'accountmanager' || role === 'am' || role.includes('account')) {
            const amv = document.getElementById('account-manager-view');
            if (amv) amv.style.display = 'block';
            if (typeof loadAMDashboard === 'function') loadAMDashboard();
            if (typeof loadAMPendingJobs === 'function') loadAMPendingJobs();
            if (typeof loadAmInbox === 'function') loadAmInbox();
            if (typeof loadAmFunnel === 'function') loadAmFunnel();
        }
    }
};

// Hook into selectLocalRole
const _origSelectLocalRole = window.selectLocalRole;
window.selectLocalRole = function(role) {
    if (typeof _origSelectLocalRole === 'function') {
        _origSelectLocalRole(role);
    }
    
    // Auto-load relevant data depending on active role
    if (role === 'Recruiter') {
        loadAtsCandidates();
        loadRecruiterAssignedRoles();
        loadRecruiterFunnel();
        if (typeof window.loadRecruiterDashboard === 'function') window.loadRecruiterDashboard();
    } else if (role === 'TeamLead') {
        loadTlInbox();
        loadAtsCandidates();
    } else if (role === 'AccountManager') {
        if (typeof window.loadAMDashboard === 'function') window.loadAMDashboard();
        if (typeof window.loadAMPendingJobs === 'function') window.loadAMPendingJobs();
        if (typeof window.loadAmInbox === 'function') window.loadAmInbox();
        if (typeof window.loadAmFunnel === 'function') window.loadAmFunnel();
    } else if (role === 'Management' || role === 'Admin') {
        ['nav-jobs', 'nav-candidates', 'nav-clients', 'nav-submissions', 'nav-calendar', 'nav-tl-qc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        ['nav-dashboard', 'nav-team-info', 'nav-ai-insights', 'nav-settings'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'flex';
        });
        if (typeof window.loadManagementAnalytics === 'function') window.loadManagementAnalytics();
    }
};

// -------------------------------------------------------------------------
// 2. CANDIDATE INGESTION & DEDUPLICATION (Manual + CV Parsing)
// -------------------------------------------------------------------------
window.openAddCandidateModal = function() {
    const modal = document.getElementById('add-candidate-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    // Reset banner and form
    hideDupBanner();
    resetCandidateForm();
    switchIngestionTab('cv');
};

window.closeAddCandidateModal = function() {
    const modal = document.getElementById('add-candidate-modal');
    if (modal) modal.style.display = 'none';
};

window.switchIngestionTab = function(tab) {
    const cvTab = document.getElementById('ingest-tab-cv');
    const manualTab = document.getElementById('ingest-tab-manual');
    const btnCv = document.getElementById('tab-btn-cv');
    const btnManual = document.getElementById('tab-btn-manual');

    if (tab === 'cv') {
        if (cvTab) cvTab.style.display = 'block';
        if (manualTab) manualTab.style.display = 'none';
        if (btnCv) btnCv.classList.add('active');
        if (btnManual) btnManual.classList.remove('active');
    } else {
        if (cvTab) cvTab.style.display = 'none';
        if (manualTab) manualTab.style.display = 'block';
        if (btnCv) btnCv.classList.remove('active');
        if (btnManual) btnManual.classList.add('active');
    }
};

function resetCandidateForm() {
    ['add-cand-name', 'add-cand-email', 'add-cand-phone', 'add-cand-headline',
     'add-cand-company', 'add-cand-location', 'add-cand-exp', 'add-cand-current-salary',
     'add-cand-expected-salary', 'add-cand-skills', 'add-cand-cv-path', 'add-cand-rtr-path'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const chk = document.getElementById('add-cand-rtr-confirmed');
    if (chk) chk.checked = true;
    const saveBtn = document.getElementById('btn-save-candidate');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
    }
}

function showDupBanner(message, existingCand) {
    const banner = document.getElementById('cand-dup-banner');
    const title = document.getElementById('dup-banner-title');
    const text = document.getElementById('dup-banner-text');
    const action = document.getElementById('dup-banner-action');
    const saveBtn = document.getElementById('btn-save-candidate');

    if (!banner) return;
    banner.style.display = 'block';
    banner.className = 'dup-banner'; // error red
    title.innerText = '⚠️ Duplicate Candidate Detected In Database!';
    text.innerHTML = `<strong>${escHtml(existingCand.name)}</strong> (${escHtml(existingCand.candidate_code || 'ID')}) is already registered with email <em>${escHtml(existingCand.email)}</em> or phone <em>${escHtml(existingCand.phone)}</em>.<br>A candidate cannot be added multiple times to the ATS.`;
    
    action.innerHTML = `
        <button type="button" class="btn-primary" style="padding: 6px 14px; font-size: 0.82rem; background: #3b82f6;" onclick="closeAddCandidateModal(); openAtsSubmitModal('${existingCand.id}')">
            ⚡ Submit Existing Candidate (${existingCand.candidate_code || existingCand.name}) to a Job Instead
        </button>
    `;

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
    }
}

function hideDupBanner() {
    const banner = document.getElementById('cand-dup-banner');
    if (banner) banner.style.display = 'none';
    const saveBtn = document.getElementById('btn-save-candidate');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
    }
}

window.checkCandidateDuplicate = async function(field, val) {
    const v = (val || '').trim();
    if (!v) return;

    try {
        const payload = field === 'email' ? { email: v } : { phone: v };
        const res = await fetch('/api/ats/candidates/check-duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.exists && data.candidate) {
            showDupBanner(data.message, data.candidate);
        } else {
            hideDupBanner();
        }
    } catch (e) {
        console.error('Duplicate check error:', e);
    }
};

window.handleCvUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loading = document.getElementById('cv-upload-loading');
    const dropZone = document.getElementById('cv-drop-zone');
    if (loading) loading.style.display = 'block';
    if (dropZone) dropZone.style.display = 'none';

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result.split(',')[1];
        try {
            const res = await fetch('/api/parse-cv-base64', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, base64: base64Data })
            });
            const result = await res.json();

            if (result.success && result.data) {
                const d = result.data;
                const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
                setVal('add-cand-name', d.name);
                setVal('add-cand-email', d.email);
                setVal('add-cand-phone', d.phone);
                setVal('add-cand-headline', d.headline || d.title);
                setVal('add-cand-company', d.current_company || d.company);
                setVal('add-cand-location', d.location);
                setVal('add-cand-exp', d.experience_years || d.experience);
                setVal('add-cand-skills', Array.isArray(d.skills) ? d.skills.join(', ') : d.skills);
                setVal('add-cand-cv-path', 'resumes/' + file.name);

                // Switch to manual tab so user can review/edit
                switchIngestionTab('manual');
                
                // Immediately perform duplicate check on parsed email or phone
                if (d.email) checkCandidateDuplicate('email', d.email);
                else if (d.phone) checkCandidateDuplicate('phone', d.phone);

                if (typeof window.showToast === 'function') window.showToast('success', 'CV Parsed & Auto-Filled Successfully!');
            } else {
                if (typeof window.showToast === 'function') window.showToast('warn', 'Could not extract all CV fields. Please verify manually.');
                switchIngestionTab('manual');
            }
        } catch (err) {
            console.error('CV upload error:', err);
            if (typeof window.showToast === 'function') window.showToast('error', 'Network error during CV parsing');
            switchIngestionTab('manual');
        } finally {
            if (loading) loading.style.display = 'none';
            if (dropZone) dropZone.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
};

window.submitNewCandidate = async function() {
    const saveBtn = document.getElementById('btn-save-candidate');
    const name = document.getElementById('add-cand-name')?.value.trim();
    const email = document.getElementById('add-cand-email')?.value.trim();
    const phone = document.getElementById('add-cand-phone')?.value.trim();

    const notify = (type, msg) => {
        if (typeof window.showToast === 'function') window.showToast(type, msg);
        else if (typeof showToast === 'function') showToast(type, msg);
        else alert(msg);
    };

    if (!name) {
        notify('error', 'Candidate Full Name is required.');
        return;
    }

    if (!email && !phone) {
        notify('error', 'Please provide either an Email address or Phone number for deduplication.');
        return;
    }

    const userStr = localStorage.getItem('currentUser');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    const payload = {
        name,
        email,
        phone,
        headline: document.getElementById('add-cand-headline')?.value.trim(),
        current_company: document.getElementById('add-cand-company')?.value.trim(),
        location: document.getElementById('add-cand-location')?.value.trim(),
        relocation_preferred: document.getElementById('add-cand-relocation')?.value,
        experience_years: document.getElementById('add-cand-exp')?.value.trim(),
        current_salary: document.getElementById('add-cand-current-salary')?.value.trim(),
        expected_salary: document.getElementById('add-cand-expected-salary')?.value.trim(),
        notice_period: document.getElementById('add-cand-notice')?.value,
        visa_status: document.getElementById('add-cand-visa')?.value,
        source: document.getElementById('add-cand-source')?.value,
        skills: document.getElementById('add-cand-skills')?.value.trim(),
        resume_path: document.getElementById('add-cand-cv-path')?.value.trim(),
        rtr_path: document.getElementById('add-cand-rtr-path')?.value.trim(),
        rtr_confirmed: document.getElementById('add-cand-rtr-confirmed')?.checked,
        recruiter_id: currentUser ? currentUser.id : null,
        created_by_user_id: currentUser ? currentUser.id : null,
        created_by_name: currentUser ? currentUser.name : null,
        created_by_role: currentUser ? currentUser.role : null
    };

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = '⏳ Saving Candidate...';
    }

    try {
        const res = await fetch('/api/ats/candidates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.status === 409) {
            showDupBanner(data.error, data.candidate);
            return;
        }

        if (data.success) {
            closeAddCandidateModal();
            const candCode = data.candidate_code || (data.candidate && data.candidate.candidate_code) || '';
            notify('success', `Candidate ${candCode ? `(${candCode}) ` : ''}saved to ATS database!`);
            if (typeof loadAtsCandidates === 'function') loadAtsCandidates();
            if (typeof window.loadAtsCandidates === 'function' && window.loadAtsCandidates !== loadAtsCandidates) window.loadAtsCandidates();
            const candJobId = document.getElementById('cand-job-id')?.value;
            if (candJobId && typeof loadCandidates === 'function') loadCandidates(candJobId);
        } else {
            notify('error', 'Error creating candidate: ' + (data.error || 'Server error'));
        }
    } catch (e) {
        console.error('Save candidate error:', e);
        notify('error', 'Network error communicating with ATS backend: ' + e.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = '💾 Save Candidate to ATS Database';
        }
    }
};

// -------------------------------------------------------------------------
// 3. INTERNAL TALENT DATABASE VIEW (Search, Filter, 1:N Submit)
// -------------------------------------------------------------------------
window.loadAtsCandidates = async function(query = '') {
    const tbody = document.getElementById('candidates-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; opacity:0.6;">Loading candidate database...</td></tr>';

    try {
        const url = query ? `/api/ats/candidates?search=${encodeURIComponent(query)}` : '/api/ats/candidates';
        const res = await fetch(url);
        const candidates = await res.json();
        currentCandidatesList = Array.isArray(candidates) ? candidates : [];

        renderCandidatesTable(currentCandidatesList);
    } catch (e) {
        console.error('Error loading candidates:', e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#f87171;">Failed to load candidate database.</td></tr>';
    }
};

function renderCandidatesTable(list) {
    const tbody = document.getElementById('candidates-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; opacity:0.6;">
            No candidates matching search criteria. Click "+ Add Candidate to ATS" to ingest new talent.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => {
        const skillsArray = (c.skills || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
        const skillsHtml = skillsArray.length > 0 
            ? skillsArray.map(s => `<span class="skill-tag">${escHtml(s)}</span>`).join('') 
            : '<span style="opacity:0.5; font-size:0.75rem;">None listed</span>';

        // Submissions history badges
        let subsHtml = '<span style="opacity:0.5; font-size:0.75rem;">No active submissions</span>';
        if (c.submissions && c.submissions.length > 0) {
            subsHtml = c.submissions.map(s => `
                <div style="margin-bottom:3px; font-size:0.75rem;">
                    <span class="code-badge code-job" style="font-size:0.68rem;">${escHtml(s.job_code || 'JOB')}</span>
                    <span style="font-weight:600; color:#e2e8f0;">${escHtml(s.job_title || 'Role')}</span>
                    <span style="opacity:0.7;">(${escHtml(s.client_name || 'Client')})</span>
                    <span style="font-size:0.68rem; color:#a78bfa; margin-left:4px;">● ${escHtml(s.status)}</span>
                </div>
            `).join('');
        }

        const rtrBadge = c.rtr_confirmed 
            ? '<span style="color:#10b981; font-weight:bold; font-size:0.75rem;">✓ RTR Confirmed</span>' 
            : '<span style="opacity:0.5; font-size:0.75rem;">RTR Pending</span>';

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); transition: background 0.15s;">
                <!-- 1. Candidate ID -->
                <td style="padding: 14px 12px; font-family: monospace; font-size: 0.85rem; color: #94a3b8; font-weight: 600;">
                    <span class="code-badge code-cand">${escHtml(c.candidate_code || ('CAND-' + String(c.id).substring(0, 6).toUpperCase()))}</span>
                </td>

                <!-- 2. Candidate Name (Clickable to View & Edit Profile) -->
                <td style="padding: 14px 12px;">
                    <a href="javascript:void(0)" onclick="openEditCandidateModal('${c.id}')" style="font-weight: 700; color: #38bdf8; font-size: 0.95rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Click to View & Edit Profile">
                        <span style="font-size: 1.05rem;">👤</span>
                        <span>${escHtml(c.name || 'Unnamed Candidate')}</span>
                    </a>
                </td>

                <!-- 3. Contact Details (Separate Column: Email & Phone) -->
                <td style="padding: 14px 12px;">
                    <div style="display:flex; flex-direction:column; gap:4px; font-size:0.82rem;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span>📧</span>
                            ${c.email ? `<a href="mailto:${escHtml(c.email)}" style="color:#93c5fd; text-decoration:none; word-break:break-all;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escHtml(c.email)}</a>` : '<span style="color:#64748b; font-size:0.78rem;">No email</span>'}
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span>📱</span>
                            ${c.phone ? `<a href="tel:${escHtml(c.phone)}" style="color:#cbd5e1; text-decoration:none;">${escHtml(c.phone)}</a>` : '<span style="color:#64748b; font-size:0.78rem;">No phone</span>'}
                        </div>
                    </div>
                </td>

                <!-- 4. Title & Company -->
                <td style="padding: 14px 12px;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <div style="font-weight: 600; color: #f1f5f9; font-size: 0.88rem;">${escHtml(c.headline || c.title || 'Senior Full Stack Engineer')}</div>
                        <div style="font-size: 0.8rem; color: #94a3b8;">${escHtml(c.current_company || c.company || 'Acme Software')}</div>
                    </div>
                </td>

                <!-- 5. Core Skills -->
                <td style="padding: 14px 12px;">
                    <div style="max-width: 220px; display: flex; flex-wrap: wrap; gap: 4px;">
                        ${skillsHtml}
                    </div>
                </td>

                <!-- 6. Location -->
                <td style="padding: 14px 12px; font-size: 0.82rem; color: #cbd5e1;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span>📍</span>
                        <span>${escHtml(c.location || 'Remote, NY')}</span>
                    </div>
                </td>

                <!-- 7. Sourced By / Provenance -->
                <td style="padding: 14px 12px; font-size: 0.82rem;">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <span style="font-weight:600; color:#e2e8f0; display:inline-flex; align-items:center; gap:4px;">
                            <span>👤</span> ${escHtml(c.created_by_name || c.recruiter_name || 'System')}
                        </span>
                        <span style="font-size:0.72rem; color:#a78bfa;">${escHtml(c.created_by_role ? (c.created_by_role + ' • ' + (c.source || 'Direct')) : (c.source || 'ATS Database'))}</span>
                    </div>
                </td>

                <!-- 8. Stage / Status -->
                <td style="padding: 14px 12px;">
                    <div style="font-size: 0.8rem;">
                        ${subsHtml}
                    </div>
                </td>

                <!-- 9. Actions -->
                <td style="padding: 14px 12px; text-align: right;">
                    <div style="display:flex; justify-content:flex-end; align-items:center; gap:6px;">
                        <button type="button" class="btn-outline" style="padding:5px 10px; font-size:0.78rem; border-color:#38bdf8; color:#38bdf8; border-radius:6px; cursor:pointer; background:rgba(56,189,248,0.06); display:inline-flex; align-items:center; gap:4px;" onclick="openEditCandidateModal('${c.id}')" title="View & Edit Profile">
                            <span>✏️</span> Edit
                        </button>
                        <button type="button" class="btn-primary" style="padding:6px 12px; font-size:0.78rem; font-weight:700; background:#8b5cf6; border:none; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" onclick="openAtsSubmitModal('${c.id}')" title="Submit to Job">
                            <span>⚡</span> Submit
                        </button>
                        <button type="button" class="btn-outline" style="padding:5px 8px; font-size:0.75rem; border-radius:6px; border-color:rgba(255,255,255,0.2); color:#94a3b8; cursor:pointer;" onclick="openCandidateHistoryModal('${c.id}')" title="Submission History & Audit Trail">
                            📜 History
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.openEditCandidateModal = function(id) {
    let candidate = (currentCandidatesList || []).find(c => String(c.id) === String(id));
    if (!candidate && typeof allLoadedCandidates !== 'undefined') {
        candidate = (allLoadedCandidates || []).find(c => String(c.id) === String(id));
    }
    if (!candidate) {
        fetch(`/api/candidates/${id}`)
            .then(r => r.json())
            .then(data => {
                const c = (data && data.candidate) ? data.candidate : data;
                if (c && !c.error) {
                    populateAndShowEditModal(c);
                } else {
                    if (typeof showToast === 'function') showToast('error', (data && data.error) || 'Candidate not found');
                }
            })
            .catch(err => {
                if (typeof showToast === 'function') showToast('error', 'Could not load candidate details: ' + err.message);
            });
        return;
    }
    populateAndShowEditModal(candidate);
};

function populateAndShowEditModal(c) {
    if (!c) return;
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== null && val !== undefined) ? val : '';
    };

    setValue('ec-id', c.id);
    const titleEl = document.getElementById('ec-modal-title');
    if (titleEl) titleEl.textContent = `Candidate Profile: ${c.name || 'Candidate'}`;
    const badgeEl = document.getElementById('ec-candidate-id-badge');
    if (badgeEl) badgeEl.textContent = `ID: ${c.candidate_code || ('CAND-' + String(c.id).substring(0, 6).toUpperCase())}`;

    setValue('ec-name', c.name);
    setValue('ec-email', c.email);
    setValue('ec-phone', c.phone);
    setValue('ec-location', c.location);
    setValue('ec-title', c.headline || c.title);
    setValue('ec-company', c.current_company || c.company);
    setValue('ec-experience-years', c.experience_years);

    const statusSelect = document.getElementById('ec-status');
    if (statusSelect) {
        statusSelect.value = c.status || 'Sourced';
        if (c.status && !Array.from(statusSelect.options).some(o => o.value === c.status)) {
            const opt = document.createElement('option');
            opt.value = c.status;
            opt.textContent = c.status;
            statusSelect.appendChild(opt);
            statusSelect.value = c.status;
        }
    }

    setValue('ec-skills', c.skills);
    setValue('ec-current-salary', c.current_salary || c.salary);
    setValue('ec-expected-salary', c.expected_salary);
    setValue('ec-notice-period', c.notice_period);
    setValue('ec-visa-status', c.visa_status);
    setValue('ec-experience-summary', c.experience_summary);

    // Render Active Submissions summary
    const subContainer = document.getElementById('ec-submissions-container');
    const subList = document.getElementById('ec-submissions-list');
    const subCount = document.getElementById('ec-submissions-count');
    const historyBtn = document.getElementById('ec-view-history-btn');
    if (subContainer && subList) {
        subContainer.style.display = 'block';
        if (historyBtn) {
            historyBtn.onclick = () => {
                if (typeof openCandidateHistoryModal === 'function') {
                    openCandidateHistoryModal(c.id);
                }
            };
        }
        const subs = Array.isArray(c.submissions) ? c.submissions : [];
        if (subCount) subCount.textContent = subs.length;
        if (subs.length > 0) {
            subList.innerHTML = subs.map(s => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.6); padding:8px 12px; border-radius:6px; font-size:0.8rem; border:1px solid rgba(255,255,255,0.06);">
                    <div>
                        <span class="code-badge code-job" style="font-size:0.7rem; margin-right:6px;">${escHtml(s.job_code || 'JOB')}</span>
                        <strong style="color:#f1f5f9;">${escHtml(s.job_title || 'Role')}</strong>
                        <span style="color:#94a3b8; margin-left:6px;">@ ${escHtml(s.client_name || 'Client')}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.75rem; color:#c084fc; font-weight:700; background:rgba(139,92,246,0.15); padding:2px 8px; border-radius:6px; border:1px solid rgba(139,92,246,0.3);">
                            ● ${escHtml(s.status || 'Active')}
                        </span>
                    </div>
                </div>
            `).join('');
        } else {
            subList.innerHTML = `<div style="font-size:0.78rem; color:#94a3b8; font-style:italic; padding:4px 0;">No active submissions for this candidate. Available for job requisitions.</div>`;
        }
    }

    // Populate dynamic experience details
    const expListContainer = document.getElementById('ec-experience-list');
    if (expListContainer) {
        expListContainer.innerHTML = '';
        let experiences = [];
        if (c.experience_details) {
            try {
                experiences = typeof c.experience_details === 'string'
                    ? JSON.parse(c.experience_details)
                    : c.experience_details;
                if (!Array.isArray(experiences)) experiences = [];
            } catch(e) {
                experiences = [];
            }
        }
        
        // If candidate doesn't have multiple experiences yet, seed current role
        if (experiences.length === 0 && (c.title || c.headline || c.company || c.current_company)) {
            experiences.push({
                title: c.title || c.headline || '',
                company: c.company || c.current_company || '',
                period: c.experience_years ? `${c.experience_years} Years` : 'Current Role',
                location: c.location || '',
                description: c.experience_summary || ''
            });
        }
        
        if (experiences.length > 0) {
            experiences.forEach(exp => window.addCandidateExperienceItem(exp));
        } else {
            renumberExperienceItems();
        }
    }

    const modal = document.getElementById('edit-candidate-modal');
    if (modal) modal.style.display = 'flex';
}

window.addCandidateExperienceItem = function(exp = {}) {
    const list = document.getElementById('ec-experience-list');
    const emptyNotice = document.getElementById('ec-experience-empty');
    if (!list) return;
    if (emptyNotice) emptyNotice.style.display = 'none';

    const count = list.children.length + 1;
    const card = document.createElement('div');
    card.className = 'ec-exp-card';
    card.style.cssText = 'background:rgba(15,23,42,0.65); border:1px solid rgba(56,189,248,0.25); border-radius:10px; padding:14px; position:relative; margin-bottom:4px;';
    
    const safeTitle = typeof escHtml === 'function' ? escHtml(exp.title || '') : (exp.title || '');
    const safeCompany = typeof escHtml === 'function' ? escHtml(exp.company || '') : (exp.company || '');
    const safePeriod = typeof escHtml === 'function' ? escHtml(exp.period || '') : (exp.period || '');
    const safeLocation = typeof escHtml === 'function' ? escHtml(exp.location || '') : (exp.location || '');
    const safeDescription = typeof escHtml === 'function' ? escHtml(exp.description || '') : (exp.description || '');

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:0.8rem; font-weight:700; color:#38bdf8; display:flex; align-items:center; gap:5px;">
                <span>💼</span> Experience Entry #<span class="ec-exp-idx">${count}</span>
            </span>
            <button type="button" onclick="removeCandidateExperienceItem(this)" style="background:transparent; border:none; color:#f87171; font-size:0.75rem; cursor:pointer; display:flex; align-items:center; gap:3px; padding:2px 6px; border-radius:4px;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">
                <span>🗑️</span> Remove
            </button>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
            <div>
                <label style="font-size:0.72rem; color:#94a3b8; display:block; margin-bottom:3px; font-weight:600;">Job Title / Designation *</label>
                <input type="text" class="form-input ec-exp-title" placeholder="e.g. Senior Java Developer" style="margin:0; width:100%; box-sizing:border-box; font-size:0.82rem; padding:7px 10px;" value="${safeTitle}">
            </div>
            <div>
                <label style="font-size:0.72rem; color:#94a3b8; display:block; margin-bottom:3px; font-weight:600;">Company Name *</label>
                <input type="text" class="form-input ec-exp-company" placeholder="e.g. Acme Software Inc" style="margin:0; width:100%; box-sizing:border-box; font-size:0.82rem; padding:7px 10px;" value="${safeCompany}">
            </div>
            <div>
                <label style="font-size:0.72rem; color:#94a3b8; display:block; margin-bottom:3px;">Employment Duration / Dates</label>
                <input type="text" class="form-input ec-exp-period" placeholder="e.g. Jan 2021 - Present / 3 Years" style="margin:0; width:100%; box-sizing:border-box; font-size:0.82rem; padding:7px 10px;" value="${safePeriod}">
            </div>
            <div>
                <label style="font-size:0.72rem; color:#94a3b8; display:block; margin-bottom:3px;">Location / Work Mode</label>
                <input type="text" class="form-input ec-exp-location" placeholder="e.g. New York, NY (Hybrid / Remote)" style="margin:0; width:100%; box-sizing:border-box; font-size:0.82rem; padding:7px 10px;" value="${safeLocation}">
            </div>
        </div>
        <div>
            <label style="font-size:0.72rem; color:#94a3b8; display:block; margin-bottom:3px;">Key Responsibilities, Achievements & Tech Stack</label>
            <textarea class="form-input ec-exp-description" rows="2" placeholder="Describe roles, architectures built, microservices, databases, or key projects..." style="margin:0; width:100%; box-sizing:border-box; font-size:0.8rem; padding:7px 10px; resize:vertical;">${safeDescription}</textarea>
        </div>
    `;

    list.appendChild(card);
    renumberExperienceItems();
};

window.removeCandidateExperienceItem = function(btn) {
    const card = btn.closest('.ec-exp-card');
    if (card) card.remove();
    renumberExperienceItems();
};

function renumberExperienceItems() {
    const list = document.getElementById('ec-experience-list');
    const emptyNotice = document.getElementById('ec-experience-empty');
    if (!list) return;

    const cards = list.querySelectorAll('.ec-exp-card');
    if (cards.length === 0) {
        if (emptyNotice) emptyNotice.style.display = 'block';
    } else {
        if (emptyNotice) emptyNotice.style.display = 'none';
        cards.forEach((c, i) => {
            const idxEl = c.querySelector('.ec-exp-idx');
            if (idxEl) idxEl.textContent = String(i + 1);
        });
    }
}

window.closeEditCandidateModal = function() {
    const modal = document.getElementById('edit-candidate-modal');
    if (modal) modal.style.display = 'none';
};

window.saveCandidateProfile = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    const id = document.getElementById('ec-id').value;
    if (!id) {
        if (typeof showToast === 'function') showToast('error', 'Missing candidate ID');
        return;
    }

    const name = document.getElementById('ec-name').value.trim();
    if (!name) {
        if (typeof showToast === 'function') showToast('error', 'Candidate Full Name is required');
        return;
    }

    const expCards = document.querySelectorAll('#ec-experience-list .ec-exp-card');
    const expList = [];
    expCards.forEach(card => {
        const title = card.querySelector('.ec-exp-title')?.value.trim() || '';
        const company = card.querySelector('.ec-exp-company')?.value.trim() || '';
        const period = card.querySelector('.ec-exp-period')?.value.trim() || '';
        const location = card.querySelector('.ec-exp-location')?.value.trim() || '';
        const description = card.querySelector('.ec-exp-description')?.value.trim() || '';
        if (title || company || description || period) {
            expList.push({ title, company, period, location, description });
        }
    });

    const expYearsVal = document.getElementById('ec-experience-years').value;
    const payload = {
        name: name,
        email: document.getElementById('ec-email').value.trim(),
        phone: document.getElementById('ec-phone').value.trim(),
        location: document.getElementById('ec-location').value.trim(),
        title: document.getElementById('ec-title').value.trim(),
        headline: document.getElementById('ec-title').value.trim(),
        company: document.getElementById('ec-company').value.trim(),
        current_company: document.getElementById('ec-company').value.trim(),
        experience_years: expYearsVal !== '' ? parseFloat(expYearsVal) : null,
        status: document.getElementById('ec-status').value,
        skills: document.getElementById('ec-skills').value.trim(),
        current_salary: document.getElementById('ec-current-salary').value.trim(),
        salary: document.getElementById('ec-current-salary').value.trim(),
        expected_salary: document.getElementById('ec-expected-salary').value.trim(),
        notice_period: document.getElementById('ec-notice-period').value.trim(),
        visa_status: document.getElementById('ec-visa-status').value.trim(),
        experience_summary: document.getElementById('ec-experience-summary').value.trim(),
        experience_details: JSON.stringify(expList)
    };

    try {
        const res = await fetch(`/api/candidates/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            if (typeof showToast === 'function') showToast('success', `Candidate "${name}" details saved successfully!`);
            window.closeEditCandidateModal();
            if (typeof loadAtsCandidates === 'function') await loadAtsCandidates();
        } else {
            const err = await res.json();
            if (typeof showToast === 'function') showToast('error', err.error || 'Failed to update candidate');
        }
    } catch(err) {
        if (typeof showToast === 'function') showToast('error', 'Network error: ' + err.message);
    }
};

window.filterCandidates = function() {
    const query = document.getElementById('candidate-search')?.value.toLowerCase().trim() || '';
    const sourceFilter = document.getElementById('candidate-source-filter')?.value || '';

    let filtered = currentCandidatesList.filter(c => {
        const matchesQuery = !query || 
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.candidate_code && c.candidate_code.toLowerCase().includes(query)) ||
            (c.skills && c.skills.toLowerCase().includes(query)) ||
            (c.location && c.location.toLowerCase().includes(query));

        const matchesSource = !sourceFilter || c.source === sourceFilter;
        return matchesQuery && matchesSource;
    });

    renderCandidatesTable(filtered);
};

window.resetCandidateFilters = function() {
    if (document.getElementById('candidate-search')) document.getElementById('candidate-search').value = '';
    if (document.getElementById('candidate-source-filter')) document.getElementById('candidate-source-filter').value = '';
    renderCandidatesTable(currentCandidatesList);
};

// -------------------------------------------------------------------------
// 4. EMAIL-STYLE SUBMISSION ENGINE (Recruiter -> Team Lead QC)
// -------------------------------------------------------------------------
async function loadRecruiterAssignedRoles() {
    try {
        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : null;
        const url = user ? `/api/ats/my-roles?recruiter_id=${user.id}` : '/api/ats/my-roles';
        const res = await fetch(url);
        assignedJobsList = await res.json();
        if (!Array.isArray(assignedJobsList)) assignedJobsList = [];
        if (typeof window.renderRecruiterAssignedRoles === 'function') {
            window.renderRecruiterAssignedRoles(assignedJobsList);
        }
    } catch (e) {
        console.error('Error fetching assigned roles:', e);
    }
}

// -------------------------------------------------------------------------
// 4. CLIENT SUBMISSION DOSSIER ENGINE (Multi-Client Formats & Candidate Tagging)
// -------------------------------------------------------------------------
window.cachedSubmissionCandidates = [];
window.cachedSubmissionJobs = [];
window.cachedSubmissionClients = [];

window.openAtsSubmitModal = async function(preSelectedCandidateId = null, preSelectedJobId = null) {
    const modal = document.getElementById('ats-submission-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    // Fetch Candidates, Live Jobs, and Clients in parallel
    try {
        const [candRes, jobRes, clientRes] = await Promise.all([
            fetch('/api/ats/candidates'),
            fetch('/api/ats/jobs/detailed'),
            fetch('/api/ats/clients/detailed')
        ]);
        window.cachedSubmissionCandidates = await candRes.json();
        window.cachedSubmissionJobs = await jobRes.json();
        window.cachedSubmissionClients = await clientRes.json();
    } catch (e) {
        console.error('Error fetching data for submission dossier modal:', e);
    }

    if (!Array.isArray(window.cachedSubmissionCandidates)) window.cachedSubmissionCandidates = [];
    if (!Array.isArray(window.cachedSubmissionJobs)) window.cachedSubmissionJobs = [];
    if (!Array.isArray(window.cachedSubmissionClients)) window.cachedSubmissionClients = [];

    // 1. Populate Candidate Tagging Dropdown
    const candSelect = document.getElementById('sub-modal-cand-select');
    if (candSelect) {
        if (window.cachedSubmissionCandidates.length === 0) {
            candSelect.innerHTML = '<option value="">⚠️ No candidates in ATS. Add candidate first.</option>';
        } else {
            candSelect.innerHTML = '<option value="">-- Select Candidate to Tag * --</option>' +
                window.cachedSubmissionCandidates.map(c => `
                    <option value="${c.id}" ${preSelectedCandidateId === c.id ? 'selected' : ''}>
                        ${escHtml(c.name)} (${escHtml(c.candidate_code || 'CAND')} - ${escHtml(c.headline || c.skills || 'Candidate')})
                    </option>
                `).join('');
            
            // Auto-select candidate if none preselected
            if (!preSelectedCandidateId && window.cachedSubmissionCandidates.length > 0) {
                candSelect.value = window.cachedSubmissionCandidates[0].id;
            }
        }
    }

    // 2. Populate Target Live Role Dropdown
    const jobSelect = document.getElementById('sub-modal-job-select');
    if (jobSelect) {
        if (window.cachedSubmissionJobs.length === 0) {
            jobSelect.innerHTML = '<option value="">⚠️ No open live roles found.</option>';
        } else {
            jobSelect.innerHTML = '<option value="">-- Select Target Live Role * --</option>' +
                window.cachedSubmissionJobs.map(j => `
                    <option value="${j.id}" ${preSelectedJobId === j.id ? 'selected' : ''}>
                        ${escHtml(j.job_code || 'REQ')} - ${escHtml(j.title)} (${escHtml(j.client_name || j.company || 'Client')})
                    </option>
                `).join('');
            
            // Auto-select role if none preselected
            if (!preSelectedJobId && window.cachedSubmissionJobs.length > 0) {
                jobSelect.value = window.cachedSubmissionJobs[0].id;
            }
        }
    }

    // 3. Populate Client Formats Group
    const clientGroup = document.getElementById('sub-modal-client-formats-group');
    if (clientGroup) {
        clientGroup.innerHTML = window.cachedSubmissionClients.map(c => `
            <option value="client_${c.id}">🏢 ${escHtml(c.company_name)} - Custom Client Format</option>
        `).join('');
    }

    // Default to auto-matched client format
    const formatSelect = document.getElementById('sub-modal-format-select');
    if (formatSelect) {
        formatSelect.value = 'client_auto';
    }

    // Trigger candidate change to update preview and generate email
    window.onSubmissionCandidateChange();
};

window.onSubmissionCandidateChange = function() {
    const candSelect = document.getElementById('sub-modal-cand-select');
    const candId = candSelect ? candSelect.value : document.getElementById('sub-modal-cand-id')?.value;
    if (document.getElementById('sub-modal-cand-id')) {
        document.getElementById('sub-modal-cand-id').value = candId || '';
    }

    const cand = (window.cachedSubmissionCandidates || []).find(c => String(c.id) === String(candId));
    window.updateSubmissionCandidatePreview(cand);

    // Update CV chip
    const cvChip = document.getElementById('sub-modal-cv-name');
    if (cvChip) {
        if (cand?.resume_path) {
            const fname = cand.resume_path.split(/[\\/]/).pop();
            cvChip.innerText = fname || 'Candidate CV Attached';
        } else {
            cvChip.innerText = 'Candidate CV Attached';
        }
    }

    window.regenerateSubmissionTemplate();
};

window.onSubmissionJobChange = function() {
    const jobSelect = document.getElementById('sub-modal-job-select');
    const jobId = jobSelect ? jobSelect.value : null;
    const job = (window.cachedSubmissionJobs || []).find(j => String(j.id) === String(jobId));

    const badge = document.getElementById('sub-modal-format-badge');
    const formatSelect = document.getElementById('sub-modal-format-select');

    if (badge && job) {
        const clientName = job.client_name || job.company || 'Client';
        if (formatSelect && formatSelect.value === 'client_auto') {
            badge.innerText = `Auto: ${clientName}`;
            badge.style.color = '#38bdf8';
        }
    }

    window.regenerateSubmissionTemplate();
};

window.onSubmissionFormatChange = function() {
    const formatSelect = document.getElementById('sub-modal-format-select');
    const badge = document.getElementById('sub-modal-format-badge');
    const jobSelect = document.getElementById('sub-modal-job-select');
    const job = (window.cachedSubmissionJobs || []).find(j => String(j.id) === String(jobSelect?.value));

    if (badge && formatSelect) {
        if (formatSelect.value === 'client_auto') {
            badge.innerText = job ? `Auto: ${job.client_name || 'Client'}` : 'Auto-Matched';
            badge.style.color = '#38bdf8';
        } else if (formatSelect.value.startsWith('client_')) {
            const cid = formatSelect.value.replace('client_', '');
            const cl = (window.cachedSubmissionClients || []).find(c => String(c.id) === String(cid));
            badge.innerText = cl ? `${cl.company_name} Format` : 'Client Format';
            badge.style.color = '#34d399';
        } else {
            badge.innerText = 'Standard Industry Format';
            badge.style.color = '#c084fc';
        }
    }

    window.regenerateSubmissionTemplate();
};

window.updateSubmissionCandidatePreview = function(cand) {
    const card = document.getElementById('sub-modal-cand-card');
    if (!card) return;
    if (!cand) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px; margin-bottom:8px;">
            <span style="font-weight:700; color:#38bdf8; font-size:0.85rem;">👤 ${escHtml(cand.name)} <span style="color:#94a3b8; font-weight:normal;">(${escHtml(cand.candidate_code || 'ID')})</span></span>
            <span style="color:#a78bfa; font-weight:600;">${escHtml(cand.headline || 'Technical Candidate')}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:6px 12px; font-size:0.75rem;">
            <div>📍 <strong>Location:</strong> ${escHtml(cand.location || 'N/A')}</div>
            <div>💰 <strong>Exp Salary:</strong> <span style="color:#34d399; font-weight:700;">${escHtml(cand.expected_salary || 'N/A')}</span> (Cur: ${escHtml(cand.current_salary || 'N/A')})</div>
            <div>⏳ <strong>Notice:</strong> ${escHtml(cand.notice_period || 'Immediate')}</div>
            <div>🛡️ <strong>Visa:</strong> ${escHtml(cand.visa_status || 'Authorized')}</div>
            <div>💼 <strong>Company:</strong> ${escHtml(cand.current_company || 'N/A')}</div>
            <div>⏱️ <strong>Experience:</strong> ${escHtml(cand.experience_years ? cand.experience_years + ' Yrs' : 'N/A')}</div>
        </div>
        <div style="margin-top:6px; font-size:0.75rem; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            🛠️ <strong>Skills:</strong> <span style="color:#cbd5e1;">${escHtml(cand.skills || 'N/A')}</span>
        </div>
    `;
};

window.regenerateSubmissionTemplate = function() {
    const candSelect = document.getElementById('sub-modal-cand-select');
    const jobSelect = document.getElementById('sub-modal-job-select');
    const formatSelect = document.getElementById('sub-modal-format-select');

    const candId = candSelect ? candSelect.value : null;
    const jobId = jobSelect ? jobSelect.value : null;
    const formatKey = formatSelect ? formatSelect.value : 'client_auto';

    const cand = (window.cachedSubmissionCandidates || []).find(c => String(c.id) === String(candId));
    const job = (window.cachedSubmissionJobs || []).find(j => String(j.id) === String(jobId));

    if (!cand || !job) {
        if (!cand && candSelect && candSelect.options.length > 1) {
            candSelect.selectedIndex = 1;
            return window.onSubmissionCandidateChange();
        }
        if (!job && jobSelect && jobSelect.options.length > 1) {
            jobSelect.selectedIndex = 1;
            return window.onSubmissionJobChange();
        }
        return;
    }

    const { subject, body } = window.generateFormattedEmailContent(cand, job, formatKey);
    const subInput = document.getElementById('sub-modal-subject');
    const bodyInput = document.getElementById('sub-modal-body');

    if (subInput) subInput.value = subject;
    if (bodyInput) bodyInput.value = body;
};

window.generateFormattedEmailContent = function(candidate, job, formatKey) {
    if (!candidate || !job) return { subject: '', body: '' };

    let clientName = job.client_name || job.company || 'Enterprise Client';
    // If a specific client format was picked, override client name from client object
    if (formatKey.startsWith('client_') && formatKey !== 'client_auto') {
        const cid = formatKey.replace('client_', '');
        const cl = (window.cachedSubmissionClients || []).find(c => String(c.id) === String(cid));
        if (cl) clientName = cl.company_name;
    }

    const spokeName = job.spoke_name || 'Hiring Lead';
    const jobTitle = job.title || 'Software Engineer';
    const jobCode = job.job_code || `REQ-${job.id}`;
    const jobLocation = job.location || 'Remote / Hybrid';
    const workMode = job.workmode || job.workMode || 'Full-Time';
    const jobSalary = job.salary_range || 'Competitive';

    const candName = candidate.name || 'Candidate';
    const candCode = candidate.candidate_code || `CAND-${candidate.id}`;
    const candHeadline = candidate.headline || 'Technical Professional';
    const candCompany = candidate.current_company || 'Current Organization';
    const candEmail = candidate.email || '';
    const candPhone = candidate.phone || '';
    const candLocation = candidate.location || 'USA';
    const candRelocation = candidate.relocation_preferred || 'Yes (Open to Relocation)';
    const candVisa = candidate.visa_status || 'US Citizen / Authorized';
    const candExp = candidate.experience_years ? `${candidate.experience_years} Years` : 'Comprehensive Experience';
    const candCurSalary = candidate.current_salary || 'Available on discussion';
    const candExpSalary = candidate.expected_salary || 'Market Rate';
    const candNotice = candidate.notice_period || 'Immediate / 2 Weeks';
    const candSkills = candidate.skills || 'Core Technologies';

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const recruiterName = user?.name || 'Recruiter';
    const recruiterRole = user?.role || 'Talent Acquisition';

    const subject = `Candidate Submission: ${candName} (${candCode}) for ${jobTitle} (${jobCode}) - ${clientName}`;

    let body = '';

    // FORMAT 1: Tailored Client Submission Dossier
    if (formatKey === 'client_auto' || formatKey.startsWith('client_') || !formatKey) {
        body = `Hi Team Lead / Reviewer,

Please review the candidate profile dossier prepared for ${clientName}:

================================================================================
CLIENT SUBMISSION DOSSIER | ${clientName.toUpperCase()}
================================================================================
Position / Requisition:   ${jobTitle} (${jobCode})
Client Account:           ${clientName}
Client Spoke Person:      ${spokeName}
Work Mode & Location:     ${jobLocation} (${workMode})
Target Rate / Salary:     ${jobSalary}

--------------------------------------------------------------------------------
CANDIDATE PROFILE & CONTACT DETAILS
--------------------------------------------------------------------------------
• Candidate Legal Name:   ${candName} (${candCode})
• Current Title / Role:   ${candHeadline}
• Current Employer:       ${candCompany}
• Contact Information:    Email: ${candEmail} | Phone: ${candPhone}
• Current Location:       ${candLocation}
• Open to Relocation:     ${candRelocation}
• Work Authorization:     ${candVisa}
• Total / Relevant Exp:   ${candExp}
• Current Compensation:   ${candCurSalary}
• Expected Compensation:  ${candExpSalary}
• Notice Period:          ${candNotice}
• Availability for Intrv: 24-48 Hours Notice (Video / Phone)

TECHNICAL EXPERTISE & CORE SKILLS:
${candSkills}

SCREENING NOTES & FITMENT HIGHLIGHTS:
1. Technical Fit: Directly matches mandatory requirements for ${jobTitle} at ${clientName}.
2. Verified strong communication, architectural problem solving, and hands-on delivery.
3. Candidate pre-closed on target compensation (${candExpSalary}) and notice period (${candNotice}).
4. Right to Represent (RTR) confirmed. Resume attached.

Attachments:
1. Candidate CV Attached
2. RTR Confirmation

Submitted by: ${recruiterName} (${recruiterRole})
MyRecruiter Talent Operations`;

    // FORMAT 2: US IT Staffing Rate & Skill Matrix (W2 / C2C)
    } else if (formatKey === 'us_staffing_matrix') {
        body = `Hi Team Lead,

Submitting candidate profile for ${jobTitle} (${jobCode}) at ${clientName}:

==================================================
US IT STAFFING RATE & SKILL MATRIX
==================================================
• Candidate Legal Name:   ${candName}
• Candidate ID:           ${candCode}
• Contact Information:    ${candEmail} | ${candPhone}
• Current Location:       ${candLocation}
• Work Authorization:     ${candVisa}
• Total US Experience:    ${candExp}
• Current Compensation:   ${candCurSalary}
• Expected Rate / Sal:    ${candExpSalary}
• Notice Period:          ${candNotice}
• Availability:           Immediate / 24 Hours Notice
• RTR Status:             Confirmed & On File

PRIMARY SKILLS & TECH STACK:
${candSkills}

RECRUITER QC CHECKLIST:
[x] RTR Confirmed & Signed
[x] Skills match 100% against client job description
[x] Rate / Compensation pre-aligned
[x] Direct screening conducted by recruiter

Best regards,
${recruiterName}`;

    // FORMAT 3: Enterprise VMS Format
    } else if (formatKey === 'vms_enterprise') {
        body = `==================================================
VMS CANDIDATE SUBMISSION SHEET
==================================================
Requisition Code:         ${jobCode}
Requisition Title:        ${jobTitle}
End Client:               ${clientName}
Client Spoke Person:      ${spokeName}
Supplier Partner:         MyRecruiter Tier-2 Operations

CANDIDATE PARAMETERS:
• Full Legal Name:        ${candName}
• Unique Candidate ID:    ${candCode}
• Current City, State:    ${candLocation}
• Relocation Willingness: ${candRelocation}
• Work Permit Status:     ${candVisa}
• Availability / Notice:  ${candNotice}
• Bill Rate / Salary:     ${candExpSalary}
• Total Experience:       ${candExp}

MANDATORY TECHNICAL QUALIFICATIONS:
${candSkills}

SUMMARY OF FITMENT:
Candidate has been thoroughly evaluated and validated for ${clientName}. Technical and behavioral screening passed. Ready for hiring manager review.`;

    // FORMAT 4: Executive Search & Direct-Hire Dossier
    } else if (formatKey === 'direct_hire_exec') {
        body = `EXECUTIVE CANDIDATE DOSSIER | PERMANENT PLACEMENT
--------------------------------------------------
Candidate:                ${candName} (${candCode})
Target Role:              ${jobTitle}
Client:                   ${clientName}
Current Title & Org:      ${candHeadline} at ${candCompany}
Location / Mobility:      ${candLocation} (Relocation: ${candRelocation})
Work Authorization:       ${candVisa}

COMPENSATION & AVAILABILITY:
• Current Compensation:   ${candCurSalary}
• Target Base + Equity:   ${candExpSalary}
• Notice / Start Date:    ${candNotice}

EXECUTIVE SUMMARY & ACCOMPLISHMENTS:
${candSkills}

${candName} brings ${candExp} of industry leadership and hands-on execution. Exceptional communicator with proven ability to align technical strategy with organizational goals at ${clientName}.

Attached: Executive Resume & Verified Credentials.`;

    // FORMAT 5: 1-Page Technical Screening Summary
    } else if (formatKey === 'tech_summary') {
        body = `QUICK TECHNICAL SCREENING SUMMARY
--------------------------------------------------
Candidate: ${candName} (${candCode})
Role: ${jobTitle} (${clientName})
Location: ${candLocation} | Visa: ${candVisa}
Compensation: ${candExpSalary} | Notice: ${candNotice}

TECH STACK & CORE SKILLS:
${candSkills}

SCREENING HIGHLIGHTS:
• Strong architectural background with ${candExp} of experience.
• Fully available on 24 hours notice for interviews.
• RTR Confirmed. Resume attached.`;
    }

    return { subject, body };
};

window.dispatchAtsSubmission = async function() {
    const candSelect = document.getElementById('sub-modal-cand-select');
    const candidateId = candSelect ? candSelect.value : document.getElementById('sub-modal-cand-id')?.value;
    const jobId = document.getElementById('sub-modal-job-select')?.value;
    const subject = document.getElementById('sub-modal-subject')?.value;
    const body = document.getElementById('sub-modal-body')?.value;

    if (!candidateId || !jobId) {
        if (typeof window.showToast === 'function') window.showToast('error', 'Please select both a candidate and a live role before submitting.');
        else alert('Please select both a candidate and a live role before submitting.');
        return;
    }

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    try {
        const res = await fetch('/api/ats/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                candidate_id: candidateId,
                job_id: jobId,
                recruiter_id: user ? user.id : 'recruiter',
                email_subject: subject,
                email_body: body
            })
        });

        const data = await res.json();
        if (data.success) {
            document.getElementById('ats-submission-modal').style.display = 'none';
            if (typeof window.showToast === 'function') {
                window.showToast('success', `Submission ${data.submission_id || ''} dispatched to Team Lead (QC)!`);
            }
            if (typeof loadAtsCandidates === 'function') loadAtsCandidates();
            if (typeof loadSubmissions === 'function') loadSubmissions();
            if (typeof window.loadDetailedJobs === 'function') window.loadDetailedJobs();
        } else {
            if (typeof window.showToast === 'function') window.showToast('error', 'Failed to dispatch: ' + (data.error || 'Server error'));
            else alert('Failed to dispatch: ' + (data.error || 'Server error'));
        }
    } catch (e) {
        console.error('Dispatch error:', e);
        if (typeof window.showToast === 'function') window.showToast('error', 'Network error dispatching submission.');
        else alert('Network error dispatching submission: ' + e.message);
    }
};

// -------------------------------------------------------------------------
// 5. TEAM LEAD QC REVIEW INBOX
// -------------------------------------------------------------------------
window.loadTlInbox = async function() {
    const container = document.getElementById('tl-qc-cards-container');
    if (!container) return;
    container.innerHTML = '<div class="card" style="text-align:center; padding:30px; opacity:0.6;">Loading pending submissions...</div>';

    try {
        const res = await fetch('/api/ats/tl/inbox');
        const list = await res.json();

        if (!Array.isArray(list) || list.length === 0) {
            container.innerHTML = `
                <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 40px; border: 1px dashed rgba(255,255,255,0.15);">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">🎉</div>
                    <div style="font-weight: 700; font-size: 1.1rem; color: #a78bfa;">All Caught Up!</div>
                    <div style="color: #94a3b8; font-size: 0.85rem; margin-top: 4px;">No candidate submissions are currently pending Team Lead quality check.</div>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(sub => `
            <div class="card" style="border-left: 4px solid #a78bfa; background: #0f172a; padding: 20px; border-radius: 10px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <span class="code-badge code-sub">${escHtml(sub.id)}</span>
                            <span class="code-badge code-cand" style="margin-left: 4px;">${escHtml(sub.candidate_code || 'CAND')}</span>
                            <h3 style="margin: 8px 0 2px 0; font-size: 1.15rem; color: white;">${escHtml(sub.candidate_name)}</h3>
                            <div style="font-size: 0.8rem; color: #94a3b8;">Sourced by: <strong>${escHtml(sub.recruiter_name || 'Recruiter')}</strong></div>
                        </div>
                        <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px;">
                            ${new Date(sub.created_at).toLocaleDateString()}
                        </span>
                    </div>

                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px; margin-bottom: 12px; font-size: 0.82rem;">
                        <div style="color: #60a5fa; font-weight: 700; margin-bottom: 4px;">
                            ${escHtml(sub.job_code || 'JOB')} - ${escHtml(sub.job_title)}
                        </div>
                        <div style="opacity: 0.8;">Client: <strong>${escHtml(sub.client_name || 'Client')}</strong> (Spoke: ${escHtml(sub.spoke_name || 'Default')})</div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem; margin-bottom: 12px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;">
                        <div>Curr Comp: <strong>${escHtml(sub.current_salary || 'N/A')}</strong></div>
                        <div>Exp Comp: <strong style="color: #6ee7b7;">${escHtml(sub.expected_salary || 'N/A')}</strong></div>
                        <div>Notice: <strong>${escHtml(sub.notice_period || 'Immediate')}</strong></div>
                        <div>Visa: <strong>${escHtml(sub.visa_status || 'Authorized')}</strong></div>
                    </div>

                    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                        <span style="padding: 4px 8px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: #93c5fd; font-size: 0.75rem;">📎 CV Attached</span>
                        <span style="padding: 4px 8px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #6ee7b7; font-size: 0.75rem;">✓ RTR Confirmed</span>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px;">
                    <button class="btn-primary" style="background: #10b981; flex: 1; padding: 10px; font-weight: 700; border-radius: 6px;" onclick="reviewTlSubmission('${sub.id}', 'approve')">
                        ✅ Approve (Send to AM)
                    </button>
                    <button class="btn-primary" style="background: #ef4444; flex: 1; padding: 10px; font-weight: 700; border-radius: 6px;" onclick="openTlRejectModal('${sub.id}')">
                        ❌ Reject (Return)
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error loading TL inbox:', e);
        container.innerHTML = '<div class="card" style="color: #ef4444; padding: 20px;">Failed to load TL inbox.</div>';
    }
};

window.reviewTlSubmission = async function(submissionId, decision, feedback = '') {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    try {
        const res = await fetch('/api/ats/tl/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: submissionId,
                decision,
                tl_id: user ? user.id : 'tl',
                tl_feedback: feedback
            })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof window.showToast === 'function') {
                window.showToast('success', decision === 'approve' ? 'Approved! Forwarded to Account Manager.' : 'Rejected! Feedback returned to Recruiter.');
            }
            loadTlInbox();
            if (typeof window.loadTeamLeadDashboard === 'function') {
                window.loadTeamLeadDashboard();
            }
        } else {
            if (typeof window.showToast === 'function') window.showToast('error', 'Review failed: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        console.error('TL review error:', e);
    }
};

window.openTlRejectModal = function(submissionId) {
    const subIdInput = document.getElementById('tl-reject-sub-id');
    const catSelect = document.getElementById('tl-reject-category');
    const notesInput = document.getElementById('tl-reject-reason');
    if (subIdInput) subIdInput.value = submissionId;
    if (catSelect) catSelect.value = '';
    if (notesInput) notesInput.value = '';
    const modal = document.getElementById('ats-tl-reject-modal');
    if (modal) modal.style.display = 'flex';
};

window.confirmTlRejection = function() {
    const subId = document.getElementById('tl-reject-sub-id')?.value;
    const category = (document.getElementById('tl-reject-category')?.value || '').trim();
    const notes = (document.getElementById('tl-reject-reason')?.value || '').trim();

    if (!category && !notes) {
        if (typeof window.showToast === 'function') {
            window.showToast('error', 'Please select a rejection reason or provide feedback notes.');
        } else {
            alert('Please select a rejection reason or provide feedback notes.');
        }
        return;
    }

    const fullReason = category ? (notes ? `[${category}] ${notes}` : category) : notes;

    const modal = document.getElementById('ats-tl-reject-modal');
    if (modal) modal.style.display = 'none';
    reviewTlSubmission(subId, 'reject', fullReason);
};

window.openAmRejectModal = function(submissionId) {
    const subIdInput = document.getElementById('am-reject-sub-id');
    const catSelect = document.getElementById('am-reject-category');
    const notesInput = document.getElementById('am-reject-notes');
    if (subIdInput) subIdInput.value = submissionId;
    if (catSelect) catSelect.value = '';
    if (notesInput) notesInput.value = '';
    const modal = document.getElementById('ats-am-reject-modal');
    if (modal) modal.style.display = 'flex';
};

window.confirmAmRejection = async function() {
    const subId = document.getElementById('am-reject-sub-id')?.value;
    const category = (document.getElementById('am-reject-category')?.value || '').trim();
    const notes = (document.getElementById('am-reject-notes')?.value || '').trim();

    if (!category && !notes) {
        if (typeof window.showToast === 'function') {
            window.showToast('error', 'Please select an AM rejection reason or provide feedback.');
        } else {
            alert('Please select an AM rejection reason or provide feedback.');
        }
        return;
    }

    const fullReason = category ? (notes ? `[${category}] ${notes}` : category) : notes;
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    try {
        const res = await fetch('/api/ats/am/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: subId,
                am_id: user ? user.id : 'am',
                am_feedback: fullReason
            })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof window.showToast === 'function') {
                window.showToast('success', 'Candidate rejected & returned with feedback.');
            }
            const modal = document.getElementById('ats-am-reject-modal');
            if (modal) modal.style.display = 'none';
            if (typeof window.loadAmInbox === 'function') window.loadAmInbox();
            if (typeof window.loadAMDashboard === 'function') window.loadAMDashboard();
        } else {
            if (typeof window.showToast === 'function') window.showToast('error', 'Rejection failed: ' + (data.error || 'Server error'));
        }
    } catch (e) {
        console.error('AM reject error:', e);
        if (typeof window.showToast === 'function') window.showToast('error', 'Network error during rejection.');
    }
};

// -------------------------------------------------------------------------
// 6. ACCOUNT MANAGER CLIENT SUBMISSIONS QUEUE & SPOKE DISPATCH
// -------------------------------------------------------------------------
window.loadAmInbox = async function() {
    const tbody = document.getElementById('am-inbox-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; opacity:0.6;">Loading approved submissions...</td></tr>';

    try {
        const res = await fetch('/api/ats/am/inbox');
        const list = await res.json();

        if (!Array.isArray(list) || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; opacity:0.6;">No candidates currently waiting for client submission.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(sub => {
            const hasReviewToken = Boolean(sub.review_token);
            const statusColor = sub.status === 'Client Submitted' ? '#3b82f6' : (sub.status.includes('Interview') ? '#10b981' : (sub.status.includes('Reject') ? '#ef4444' : '#f59e0b'));

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <td style="padding: 10px;">
                        <span class="code-badge code-sub">${escHtml(sub.id)}</span>
                    </td>
                    <td style="padding: 10px;">
                        <div style="font-weight: 700; color: white;">${escHtml(sub.candidate_name)}</div>
                        <div style="font-size: 0.75rem; opacity: 0.7;">${escHtml(sub.candidate_code || '')}</div>
                    </td>
                    <td style="padding: 10px;">
                        <div style="font-weight: 600; color: #93c5fd; font-size: 0.85rem;">${escHtml(sub.job_title)}</div>
                        <div style="font-size: 0.75rem; opacity: 0.7;">${escHtml(sub.client_name || 'Client')} (${escHtml(sub.job_code || '')})</div>
                    </td>
                    <td style="padding: 10px; font-size: 0.8rem;">
                        <div>${escHtml(sub.spoke_name || 'Default Spoke')}</div>
                        <div style="font-size: 0.72rem; opacity: 0.7;">${escHtml(sub.spoke_email || '')}</div>
                    </td>
                    <td style="padding: 10px; font-size: 0.8rem;">
                        <div>Exp: <strong style="color: #6ee7b7;">${escHtml(sub.expected_salary || 'N/A')}</strong></div>
                        <div style="font-size: 0.72rem; opacity: 0.7;">Notice: ${escHtml(sub.notice_period || 'Immediate')}</div>
                    </td>
                    <td style="padding: 10px; font-size: 0.78rem;">
                        <span style="color: #10b981; font-weight: bold;">✓ TL Verified</span>
                        ${sub.tl_feedback ? `<div style="color:#fca5a5; font-size:0.72rem; margin-top:2px;">"${escHtml(sub.tl_feedback)}"</div>` : ''}
                        ${sub.am_notes ? `<div style="color:#f472b6; font-size:0.72rem; margin-top:2px;">AM: "${escHtml(sub.am_notes)}"</div>` : ''}
                    </td>
                    <td style="padding: 10px;">
                        <span style="display:inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; background: rgba(255,255,255,0.06); color: ${statusColor}; border: 1px solid ${statusColor}44;">
                            ${escHtml(sub.status)}
                        </span>
                    </td>
                    <td style="padding: 10px; text-align: right;">
                        <div style="display: flex; gap: 6px; justify-content: flex-end;">
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 700; background: #ec4899; border: none; border-radius: 6px; cursor: pointer;" onclick="submitToClientSpoke('${sub.id}')">
                                🚀 Submit Spoke
                            </button>
                            <button class="btn-outline" style="padding: 6px 10px; font-size: 0.75rem; border-color: #ef4444; color: #fca5a5; border-radius: 6px; cursor: pointer;" title="Reject Candidate Submission" onclick="openAmRejectModal('${sub.id}')">
                                ❌ Reject
                            </button>
                            <button class="btn-outline" style="padding: 6px 10px; font-size: 0.75rem; border-radius: 6px;" title="Copy Client Submission Email" onclick="copyClientSubmissionEmail('${sub.id}')">
                                📋 Copy
                            </button>
                            ${hasReviewToken ? `
                            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.75rem; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; border-radius: 6px;" title="Preview Spoke Portal" onclick="openSpokeReviewModal('${sub.review_token}')">
                                🌐 Portal
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading AM inbox:', e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#ef4444;">Failed to load queue.</td></tr>';
    }
};

window.submitToClientSpoke = async function(submissionId) {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    try {
        const res = await fetch('/api/ats/am/submit-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submission_id: submissionId, am_id: user ? user.id : 'am' })
        });
        const data = await res.json();

        if (data.success) {
            const portalUrl = `${window.location.origin}/portal/review?token=${data.review_token}`;
            if (typeof window.showToast === 'function') {
                window.showToast('success', `Candidate submitted to Client Spoke! Pipeline advanced.`);
            }
            alert(`Candidate successfully submitted to Client Spoke!\n\nZero-Login Review Portal Link:\n${portalUrl}\n\nClient Spoke can 1-click Shortlist for Interview, Reject, or Negotiate.`);
            loadAmInbox();
            loadAmFunnel();
        } else {
            alert('Error submitting to client: ' + (data.error || 'Server error'));
        }
    } catch (e) {
        console.error('AM submit error:', e);
    }
};

window.copyClientSubmissionEmail = async function(submissionId) {
    try {
        const res = await fetch('/api/ats/am/inbox');
        const list = await res.json();
        const sub = list.find(s => s.id === submissionId);
        if (!sub) return;

        const emailText = `Subject: ${sub.email_subject || 'Candidate Submission'}\n\n${sub.email_body || ''}`;
        await navigator.clipboard.writeText(emailText);
        if (typeof window.showToast === 'function') {
            window.showToast('success', 'Client submission email copied to clipboard!');
        } else {
            alert('Client submission email copied to clipboard!');
        }
    } catch (e) {
        console.error('Copy email error:', e);
    }
};

// -------------------------------------------------------------------------
// 7. CLIENT SPOKE ZERO-LOGIN PORTAL & AUTOMATION MODAL
// -------------------------------------------------------------------------
window.openSpokeReviewModal = async function(token) {
    const modal = document.getElementById('ats-spoke-review-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    currentSpokeToken = token;
    document.getElementById('spoke-review-token').value = token;

    // Reset action sub-forms
    ['spoke-form-shortlist', 'spoke-form-reject', 'spoke-form-negotiate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    const card = document.getElementById('spoke-modal-candidate-card');
    card.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.6;">Loading candidate dossier...</div>';

    try {
        const res = await fetch(`/api/portal/submission/${token}`);
        const data = await res.json();

        if (data.error) {
            card.innerHTML = `<div style="color:#ef4444; padding:20px;">${escHtml(data.error)}</div>`;
            return;
        }

        const skillsArr = (data.candidate_skills || '').split(',').map(s => s.trim()).filter(Boolean);
        const skillsTags = skillsArr.map(s => `<span class="skill-tag">${escHtml(s)}</span>`).join('');

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
                <div>
                    <span class="code-badge code-cand">${escHtml(data.candidate_code || 'CAND')}</span>
                    <h2 style="margin: 6px 0 2px 0; color: white; font-size: 1.3rem;">${escHtml(data.candidate_name)}</h2>
                    <div style="color: #60a5fa; font-weight: 600;">${escHtml(data.candidate_headline || 'Senior Software Engineer')}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.8rem; color: #94a3b8;">Applying for:</div>
                    <div style="font-weight: 700; color: #34d399;">${escHtml(data.job_title)}</div>
                    <div style="font-size: 0.75rem; opacity: 0.7;">Client: ${escHtml(data.client_name || 'Client')}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 0.85rem; margin-bottom: 14px; background: rgba(0,0,0,0.25); padding: 12px; border-radius: 8px;">
                <div>Expected Salary: <strong style="color: #6ee7b7;">${escHtml(data.expected_salary || 'N/A')}</strong></div>
                <div>Notice Period: <strong>${escHtml(data.notice_period || 'Immediate')}</strong></div>
                <div>Work Auth: <strong>${escHtml(data.visa_status || 'Authorized')}</strong></div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 700; margin-bottom: 4px;">KEY SKILLS:</div>
                <div>${skillsTags}</div>
            </div>

            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; font-size: 0.82rem; font-family: 'Cascadia Code', monospace; white-space: pre-wrap; line-height: 1.5; color: #cbd5e1; max-height: 180px; overflow-y: auto;">
                ${escHtml(data.email_body || 'Candidate dossier summary.')}
            </div>
        `;
    } catch (e) {
        console.error('Portal modal error:', e);
        card.innerHTML = '<div style="color:#ef4444; padding:20px;">Network error loading candidate.</div>';
    }
};

window.showSpokeActionForm = function(action) {
    document.getElementById('spoke-form-shortlist').style.display = action === 'shortlist' ? 'block' : 'none';
    document.getElementById('spoke-form-reject').style.display = action === 'reject' ? 'block' : 'none';
    document.getElementById('spoke-form-negotiate').style.display = action === 'negotiate' ? 'block' : 'none';

    if (action === 'shortlist') {
        // default time to tomorrow at 10:00 AM
        const tomorrow = new Date(Date.now() + 86400000);
        tomorrow.setHours(10, 0, 0, 0);
        const iso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const timeInput = document.getElementById('spoke-int-time');
        if (timeInput && !timeInput.value) timeInput.value = iso;
    }
};

window.submitSpokeFeedback = async function(decision) {
    const token = currentSpokeToken || document.getElementById('spoke-review-token')?.value;
    if (!token) return;

    let payload = { decision };

    if (decision === 'shortlist') {
        const scheduled_time = document.getElementById('spoke-int-time')?.value;
        const duration = document.getElementById('spoke-int-duration')?.value;
        const notes = document.getElementById('spoke-int-title')?.value;
        if (!scheduled_time) {
            alert('Please select proposed interview date and time.');
            return;
        }
        payload.scheduled_time = scheduled_time;
        payload.duration = duration;
        payload.notes = notes;
    } else if (decision === 'reject') {
        payload.rejection_reason = document.getElementById('spoke-reject-reason')?.value;
        payload.notes = document.getElementById('spoke-reject-notes')?.value;
    } else if (decision === 'negotiate') {
        const counter = document.getElementById('spoke-counter-salary')?.value.trim();
        if (!counter) {
            alert('Please enter counter salary amount.');
            return;
        }
        payload.counter_salary = counter;
    }

    try {
        const res = await fetch(`/api/portal/feedback/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            document.getElementById('ats-spoke-review-modal').style.display = 'none';
            if (decision === 'shortlist') {
                if (typeof window.showToast === 'function') {
                    window.showToast('success', 'Shortlisted! Interview auto-scheduled in calendar & Funnel advanced.');
                }
                alert('Success! Candidate shortlisted for interview.\n• Calendar interview event scheduled\n• Pipeline automatically moved to Interviews stage.');
            } else if (decision === 'reject') {
                alert('Feedback recorded: Candidate marked as Rejected.');
            } else {
                alert('Counter offer recorded: Account Manager notified.');
            }
            loadAmInbox();
            loadAmFunnel();
        } else {
            alert('Error submitting feedback: ' + (data.error || 'Server error'));
        }
    } catch (e) {
        console.error('Spoke feedback error:', e);
        alert('Network error submitting feedback.');
    }
};

// -------------------------------------------------------------------------
// 8. 11-STAGE REAL-TIME HIRING FUNNEL (Management & AM)
// -------------------------------------------------------------------------
const FUNNEL_11_STAGES = [
    'Submissions',
    'Interviews',
    'Interviews Rejected',
    'Selections',
    'Offers Released',
    'Offer Accepted',
    'Offer Rejected',
    'Backout',
    'Joined',
    'Invoice Raised',
    'Paid/Pending'
];

window.loadAmFunnel = async function() {
    const container = document.getElementById('am-funnel-stages-container');
    if (!container) return;

    try {
        const res = await fetch('/api/management/pipeline');
        const rows = await res.json();

        // Categorize candidates under the 11 stages
        const stageBuckets = {};
        FUNNEL_11_STAGES.forEach(s => { stageBuckets[s] = []; });

        if (Array.isArray(rows)) {
            rows.forEach(item => {
                let st = item.status || 'Submissions';
                if (st.includes('Submitted')) stageBuckets['Submissions'].push(item);
                else if (st === 'Interview Scheduled' || st.includes('Interview Scheduled') || st.includes('Interview Completed')) stageBuckets['Interviews'].push(item);
                else if (st.includes('Interviews Rejected') || st === 'Rejected') stageBuckets['Interviews Rejected'].push(item);
                else if (st.includes('Select')) stageBuckets['Selections'].push(item);
                else if (st.includes('Released') || st === 'Offered') stageBuckets['Offers Released'].push(item);
                else if (st.includes('Offer Accepted')) stageBuckets['Offer Accepted'].push(item);
                else if (st.includes('Offer Rejected')) stageBuckets['Offer Rejected'].push(item);
                else if (st.includes('Backout')) stageBuckets['Backout'].push(item);
                else if (st.includes('Joined') || st.includes('Placed')) stageBuckets['Joined'].push(item);
                else if (st.includes('Invoice')) stageBuckets['Invoice Raised'].push(item);
                else if (st.includes('Paid')) stageBuckets['Paid/Pending'].push(item);
                else stageBuckets['Submissions'].push(item);
            });
        }

        container.innerHTML = FUNNEL_11_STAGES.map(stage => {
            const count = stageBuckets[stage].length;
            const cards = stageBuckets[stage].map(c => `
                <div class="funnel-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span class="code-badge code-cand" style="font-size:0.65rem;">${escHtml(c.candidate_code || 'CAND')}</span>
                        <span style="font-size:0.7rem; opacity:0.6;">${escHtml(c.job_code || '')}</span>
                    </div>
                    <div style="font-weight:700; color:white; font-size:0.85rem;">${escHtml(c.name || c.candidate_name)}</div>
                    <div style="font-size:0.75rem; color:#93c5fd; margin-top:2px;">${escHtml(c.job_title || 'Role')}</div>
                    <div style="font-size:0.7rem; opacity:0.7;">Client: ${escHtml(c.client_name || 'Acme')}</div>
                    
                    <div style="margin-top:6px; display:flex; justify-content:flex-end;">
                        <select onchange="advanceFunnelStage('${c.submission_id || c.id}', this.value)" style="font-size:0.7rem; padding:2px 4px; background:rgba(0,0,0,0.5); color:white; border:1px solid rgba(255,255,255,0.15); border-radius:4px;">
                            <option value="">Move Stage...</option>
                            ${FUNNEL_11_STAGES.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `).join('');

            return `
                <div class="funnel-col">
                    <div class="funnel-col-header">
                        <span style="color:#e2e8f0;">${stage}</span>
                        <span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:10px; font-size:0.75rem;">${count}</span>
                    </div>
                    <div class="funnel-cards">
                        ${cards || '<div style="opacity:0.3; font-size:0.75rem; text-align:center; padding:20px 0;">Empty</div>'}
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Error loading AM funnel:', e);
    }
};

window.advanceFunnelStage = async function(id, newStage) {
    if (!newStage || !id) return;

    try {
        const res = await fetch(`/api/ats/submissions/${id}/stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage: newStage })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof window.showToast === 'function') {
                window.showToast('success', `Candidate moved to ${newStage}`);
            }
            loadAmFunnel();
            loadAmInbox();
            if (typeof window.loadManagementAnalytics === 'function') window.loadManagementAnalytics();
        }
    } catch (e) {
        console.error('Advance funnel error:', e);
    }
};

// -------------------------------------------------------------------------
// 9. SUBMISSIONS HUB VIEW
// -------------------------------------------------------------------------
window.loadSubmissions = async function() {
    const tbody = document.getElementById('submissions-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; opacity:0.6;">Loading submissions...</td></tr>';

    try {
        const userStr = localStorage.getItem('currentUser');
        const user = userStr ? JSON.parse(userStr) : null;

        const titleEl = document.getElementById('submissions-view-title');
        const subTitleEl = document.getElementById('submissions-view-subtitle');

        let url = '/api/ats/submissions';
        if (user && user.role === 'Recruiter') {
            url += `?recruiter_id=${encodeURIComponent(user.id)}`;
            if (titleEl) titleEl.innerText = `My Submissions (${user.name || 'Recruiter'})`;
            if (subTitleEl) subTitleEl.innerText = `Showing only candidate submissions dispatched by you (${user.name || 'Recruiter'}).`;
        } else {
            if (titleEl) titleEl.innerText = 'Candidate Submissions & Workflow';
            if (subTitleEl) subTitleEl.innerText = 'Full lifecycle tracking across all recruiters: Recruiter → Team Lead QC → Account Manager → Client Spoke → Interviews.';
        }

        const res = await fetch(url);
        currentSubmissionsList = await res.json();
        if (!Array.isArray(currentSubmissionsList)) currentSubmissionsList = [];

        updateSubmissionsCounts();
        renderSubmissionsTable(currentSubmissionsList);
    } catch (e) {
        console.error('Error loading submissions:', e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#ef4444;">Failed to load submissions.</td></tr>';
    }
};

function updateSubmissionsCounts() {
    const setCnt = (id, count) => { const el = document.getElementById(id); if (el) el.innerText = count; };
    setCnt('sub-cnt-all', currentSubmissionsList.length);
    setCnt('sub-cnt-tl', currentSubmissionsList.filter(s => s.status === 'Submitted to TL').length);
    setCnt('sub-cnt-am', currentSubmissionsList.filter(s => s.status === 'Submitted to AM').length);
    setCnt('sub-cnt-client', currentSubmissionsList.filter(s => s.status === 'Client Submitted').length);
    setCnt('sub-cnt-int', currentSubmissionsList.filter(s => s.status.includes('Interview')).length);
    setCnt('sub-cnt-rej', currentSubmissionsList.filter(s => s.status.includes('Reject')).length);
}

window.filterSubmissionsTab = function(filter, btn) {
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    let filtered = currentSubmissionsList;
    if (filter !== 'all') {
        if (filter === 'Rejected') {
            filtered = currentSubmissionsList.filter(s => s.status.includes('Reject'));
        } else if (filter === 'Interview Scheduled') {
            filtered = currentSubmissionsList.filter(s => s.status.includes('Interview'));
        } else {
            filtered = currentSubmissionsList.filter(s => s.status === filter);
        }
    }
    renderSubmissionsTable(filtered);
};

function renderSubmissionsTable(list) {
    const tbody = document.getElementById('submissions-list');
    if (!tbody) return;

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; opacity:0.6;">No submissions found for selected filter.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(sub => {
        let statusStyle = 'color: #94a3b8; border-color: #475569;';
        if (sub.status === 'Submitted to TL') statusStyle = 'color: #a78bfa; border-color: #a78bfa; background: rgba(167,139,250,0.1);';
        else if (sub.status === 'Submitted to AM') statusStyle = 'color: #f59e0b; border-color: #f59e0b; background: rgba(245,158,11,0.1);';
        else if (sub.status === 'Client Submitted') statusStyle = 'color: #38bdf8; border-color: #38bdf8; background: rgba(56,189,248,0.1);';
        else if (sub.status.includes('Interview')) statusStyle = 'color: #10b981; border-color: #10b981; background: rgba(16,185,129,0.1);';
        else if (sub.status.includes('Reject')) statusStyle = 'color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.1);';

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                <td style="padding: 12px;">
                    <span class="code-badge code-sub">${escHtml(sub.id)}</span>
                </td>
                <td style="padding: 12px;">
                    <div style="font-weight: 700; color: white;">${escHtml(sub.candidate_name)}</div>
                    <div style="font-size: 0.75rem; opacity: 0.7;">${escHtml(sub.candidate_code || '')}</div>
                </td>
                <td style="padding: 12px;">
                    <div style="font-weight: 600; color: #93c5fd; font-size: 0.85rem;">${escHtml(sub.job_title)}</div>
                    <div style="font-size: 0.75rem; opacity: 0.7;">${escHtml(sub.client_name || 'Client')} (${escHtml(sub.job_code || '')})</div>
                </td>
                <td style="padding: 12px; font-size: 0.8rem;">
                    ${escHtml(sub.recruiter_name || 'Recruiter')}
                </td>
                <td style="padding: 12px;">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; border: 1px solid; ${statusStyle}">
                        ${escHtml(sub.status)}
                    </span>
                </td>
                <td style="padding: 12px; font-size: 0.78rem; max-width: 240px;">
                    ${sub.tl_feedback ? `<div style="color:#fca5a5; margin-bottom:3px; background:rgba(239,68,68,0.1); padding:3px 6px; border-radius:4px; border-left:2px solid #ef4444;"><b>TL:</b> "${escHtml(sub.tl_feedback)}"</div>` : ''}
                    ${sub.am_notes ? `<div style="color:#f472b6; margin-bottom:3px; background:rgba(236,72,153,0.1); padding:3px 6px; border-radius:4px; border-left:2px solid #ec4899;"><b>AM:</b> "${escHtml(sub.am_notes)}"</div>` : ''}
                    ${sub.client_feedback_notes ? `<div style="color:#fcd34d; background:rgba(245,158,11,0.1); padding:3px 6px; border-radius:4px; border-left:2px solid #f59e0b;"><b>Client:</b> "${escHtml(sub.client_feedback_notes)}"</div>` : ''}
                    ${!sub.tl_feedback && !sub.am_notes && !sub.client_feedback_notes ? '<span style="opacity:0.4;">-</span>' : ''}
                </td>
                <td style="padding: 12px; font-size: 0.78rem; opacity: 0.8;">
                    ${new Date(sub.created_at).toLocaleDateString()}
                </td>
                <td style="padding: 12px; text-align: right;">
                    ${sub.review_token ? `
                        <button class="btn-outline" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openSpokeReviewModal('${sub.review_token}')">
                            Spoke View
                        </button>
                    ` : '<span style="opacity:0.4; font-size:0.75rem;">-</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

// -------------------------------------------------------------------------
// 10. RECRUITER DASHBOARD, FUNNEL METRICS & WORKSPACE LOGIC
// -------------------------------------------------------------------------
async function loadRecruiterFunnel() {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const role = user ? String(user.role).toLowerCase().replace(/[\s_-]/g, '') : '';
    if (role !== 'recruiter') return;

    try {
        const res = await fetch(`/api/funnel?user_id=${user.id}`);
        const funnel = await res.json();

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val || 0; };
        setVal('stat-submissions', funnel.Submissions);
        setVal('stat-interviews-sch', funnel.InterviewsScheduled);
        setVal('stat-interviews-comp', funnel.InterviewsCompleted);
        setVal('stat-selections', funnel.Selections);
        setVal('stat-offers', funnel.Offers);
        setVal('stat-joinings', funnel.Joinings);
        setVal('stat-backouts', funnel.Backouts);
    } catch (e) {
        console.error('Error loading funnel:', e);
    }
}

window.loadRecruiterDashboard = async function() {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const role = user ? String(user.role).toLowerCase().replace(/[\s_-]/g, '') : '';
    if (role !== 'recruiter') return;

    // Set greeting name
    const nameEl = document.getElementById('rec-header-name');
    if (nameEl) nameEl.innerText = user.name || 'Recruiter';

    // 1. Fetch & render assigned roles
    await loadRecruiterAssignedRoles();
    const rolesStat = document.getElementById('rec-stat-roles');
    if (rolesStat) rolesStat.innerText = Array.isArray(assignedJobsList) ? assignedJobsList.length : 0;

    // 2. Fetch total candidates count for KPI
    try {
        const candRes = await fetch('/api/ats/candidates');
        const cands = await candRes.json();
        const candStat = document.getElementById('rec-stat-candidates');
        if (candStat) candStat.innerText = Array.isArray(cands) ? cands.length : 0;
    } catch(e) {}

    // 3. Fetch recruiter's submissions for KPI & recent feed
    try {
        const subRes = await fetch(`/api/ats/submissions?recruiter_id=${encodeURIComponent(user.id)}`);
        const subs = await subRes.json();
        const subsList = Array.isArray(subs) ? subs : [];
        
        const subStat = document.getElementById('rec-stat-submissions');
        if (subStat) subStat.innerText = subsList.length;

        const intCount = subsList.filter(s => (s.status || '').includes('Interview')).length;
        const intStat = document.getElementById('rec-stat-interviews');
        if (intStat) intStat.innerText = intCount;

        renderRecruiterRecentSubmissions(subsList);
    } catch(e) {}

    // 4. Load Funnel
    loadRecruiterFunnel();
};

window.renderRecruiterAssignedRoles = function(list) {
    const container = document.getElementById('rec-assigned-roles-list');
    if (!container) return;

    if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:35px 20px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px dashed rgba(255,255,255,0.1);">
                <div style="font-size:2rem; margin-bottom:8px;">💼</div>
                <div style="font-weight:700; color:#e2e8f0; font-size:1rem;">No Live Roles Assigned Yet</div>
                <div style="font-size:0.82rem; color:#94a3b8; margin-top:4px;">
                    You do not currently have live job assignments. You can still browse the Live Roles hub or ingest new candidates.
                </div>
                <button type="button" class="btn-outline" style="width:auto; margin-top:14px; padding:6px 14px; font-size:0.8rem; border-color:#38bdf8; color:#38bdf8;" onclick="openLiveRoles()">
                    🟢 Browse All Live Roles
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(j => {
        const jobCode = j.job_code || `JOB-${j.id}`;
        const totalSubs = j.total_submissions || 0;
        const interviews = j.interviews_count || 0;
        const workMode = j.workMode || 'Onsite';
        const location = j.location || 'Remote';
        const clientName = j.client_name || j.company || 'Direct Client';

        return `
            <div class="card" style="margin-bottom:0; padding:15px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-left:4px solid #60a5fa; border-radius:10px; transition:transform 0.15s, border-color 0.15s;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                            <span class="code-badge code-job" style="font-size:0.7rem; font-weight:700;">${escHtml(jobCode)}</span>
                            <span style="font-size:0.75rem; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px; color:#94a3b8;">${escHtml(workMode)} • ${escHtml(location)}</span>
                        </div>
                        <h4 style="margin:0; font-size:1.05rem; color:white; font-weight:700;">${escHtml(j.title)}</h4>
                        <div style="font-size:0.82rem; color:#93c5fd; margin-top:3px;">
                            🏢 <strong>${escHtml(clientName)}</strong> ${j.spoke_name ? `• Spoke: ${escHtml(j.spoke_name)}` : ''}
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                        <span style="font-size:0.75rem; padding:3px 8px; border-radius:12px; font-weight:600; background:rgba(59,130,246,0.15); color:#93c5fd; border:1px solid rgba(59,130,246,0.3);">
                            ${totalSubs} Submissions
                        </span>
                        ${interviews > 0 ? `
                        <span style="font-size:0.7rem; padding:2px 6px; border-radius:10px; font-weight:600; background:rgba(16,185,129,0.15); color:#6ee7b7;">
                            📅 ${interviews} Interviews
                        </span>` : ''}
                    </div>
                </div>

                <!-- Action Toolbar for this role -->
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06);">
                    <button type="button" class="btn-primary" style="flex:1; min-width:120px; padding:6px 12px; font-size:0.75rem; font-weight:700; background:#8b5cf6; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; gap:5px;" onclick="openAtsSubmitModal('', '${j.id}')">
                        <span>⚡</span> Submit Candidate
                    </button>
                    <button type="button" class="btn-outline" style="padding:6px 9px; font-size:0.73rem; border-radius:6px; border-color:#8b5cf6; color:#c084fc; cursor:pointer;" title="AI Job Requirement Analysis" onclick="event.stopPropagation();openReqModal('${j.id}')">
                        📊 Req Analysis
                    </button>
                    <button type="button" class="btn-outline" style="padding:6px 9px; font-size:0.73rem; border-radius:6px; border-color:#10b981; color:#34d399; cursor:pointer;" title="LinkedIn Connection Request Approach Note" onclick="event.stopPropagation();openApproachModal('${j.id}')">
                        🤝 Approach Note
                    </button>
                    <button type="button" class="btn-outline" style="padding:6px 9px; font-size:0.73rem; border-radius:6px; border-color:#f59e0b; color:#fbbf24; cursor:pointer;" title="LinkedIn InMail Message Pitch" onclick="event.stopPropagation();openInmailModal('${j.id}')">
                        ✉️ InMail Message
                    </button>
                    <button type="button" class="btn-outline" style="padding:6px 9px; font-size:0.73rem; border-radius:6px; border-color:#3b82f6; color:#60a5fa; cursor:pointer;" title="Social Feed Job Posting" onclick="event.stopPropagation();openPostModal('${j.id}')">
                        📢 Feed Posting
                    </button>
                    <button type="button" class="btn-outline" style="padding:6px 9px; font-size:0.73rem; border-radius:6px; border-color:#ec4899; color:#f472b6; cursor:pointer;" title="AI Technical Screening Questions" onclick="event.stopPropagation();openPreScreeningModal('${j.id}')">
                        📋 Pre-Screening Qs
                    </button>
                    <button type="button" class="btn-outline" style="padding:6px 9px; font-size:0.73rem; border-radius:6px; border-color:#14b8a6; color:#2dd4bf; cursor:pointer;" title="Source Talent For This Role" onclick="event.stopPropagation();openSourcingHubWithRole('${escHtml(j.title)}')">
                        🔍 Source
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.filterRecruiterRoles = function() {
    const q = (document.getElementById('rec-roles-search')?.value || '').toLowerCase().trim();
    if (!q) {
        renderRecruiterAssignedRoles(assignedJobsList);
        return;
    }
    const filtered = (assignedJobsList || []).filter(j => {
        return (j.title && j.title.toLowerCase().includes(q)) ||
               (j.job_code && j.job_code.toLowerCase().includes(q)) ||
               (j.client_name && j.client_name.toLowerCase().includes(q)) ||
               (j.company && j.company.toLowerCase().includes(q)) ||
               (j.location && j.location.toLowerCase().includes(q));
    });
    renderRecruiterAssignedRoles(filtered);
};

window.openSourcingHubWithRole = function(roleTitle) {
    if (typeof window.openSourcingHub === 'function') {
        window.openSourcingHub();
    } else {
        const modal = document.getElementById('sourcing-hub-modal');
        if (modal) modal.style.display = 'flex';
        if (typeof populateSourcingRoles === 'function') populateSourcingRoles();
    }
    setTimeout(() => {
        const select = document.getElementById('sourcing-role-select');
        if (select) {
            for (let opt of select.options) {
                if (opt.text.toLowerCase().includes(roleTitle.toLowerCase())) {
                    select.value = opt.value;
                    if (typeof loadRoleBooleans === 'function') loadRoleBooleans();
                    break;
                }
            }
        }
    }, 250);
};

window.renderRecruiterRecentSubmissions = function(subsList) {
    const container = document.getElementById('rec-recent-submissions-list');
    if (!container) return;

    if (!Array.isArray(subsList) || subsList.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:35px 20px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px dashed rgba(255,255,255,0.1);">
                <div style="font-size:2rem; margin-bottom:8px;">📤</div>
                <div style="font-weight:700; color:#e2e8f0; font-size:1rem;">No Submissions Dispatched Yet</div>
                <div style="font-size:0.82rem; color:#94a3b8; margin-top:4px;">
                    When you submit candidates to assigned live roles, their status and Team Lead / Client feedback will appear here.
                </div>
            </div>
        `;
        return;
    }

    const recent = subsList.slice(0, 8); // Top 8 recent submissions

    container.innerHTML = recent.map(s => {
        let statusColor = '#94a3b8';
        let statusBg = 'rgba(255,255,255,0.06)';
        if (s.status === 'Submitted to TL') {
            statusColor = '#c084fc';
            statusBg = 'rgba(168,85,247,0.15)';
        } else if (s.status === 'Submitted to AM') {
            statusColor = '#fbbf24';
            statusBg = 'rgba(245,158,11,0.15)';
        } else if (s.status === 'Client Submitted') {
            statusColor = '#38bdf8';
            statusBg = 'rgba(56,189,248,0.15)';
        } else if (s.status.includes('Interview')) {
            statusColor = '#34d399';
            statusBg = 'rgba(16,185,129,0.15)';
        } else if (s.status.includes('Reject')) {
            statusColor = '#f87171';
            statusBg = 'rgba(239,68,68,0.15)';
        }

        const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Recent';

        return `
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="code-badge code-sub" style="font-size:0.68rem;">${escHtml(s.id)}</span>
                            <span class="code-badge code-cand" style="font-size:0.68rem;">${escHtml(s.candidate_code || 'CAND')}</span>
                        </div>
                        <div style="font-weight:700; color:white; font-size:0.92rem; margin-top:3px;">
                            ${escHtml(s.candidate_name)}
                        </div>
                    </div>
                    <span style="font-size:0.72rem; padding:3px 8px; border-radius:4px; font-weight:700; color:${statusColor}; background:${statusBg}; border:1px solid ${statusColor}44; white-space:nowrap;">
                        ${escHtml(s.status)}
                    </span>
                </div>

                <div style="font-size:0.78rem; color:#93c5fd; display:flex; justify-content:space-between; align-items:center;">
                    <span>💼 ${escHtml(s.job_title || 'Role')} (${escHtml(s.client_name || 'Client')})</span>
                    <span style="color:#94a3b8; font-size:0.72rem;">${dateStr}</span>
                </div>

                ${s.tl_feedback ? `
                <div style="font-size:0.73rem; background:rgba(239,68,68,0.1); border-left:3px solid #ef4444; padding:4px 8px; border-radius:3px; color:#fca5a5; margin-top:2px;">
                    TL Note: "${escHtml(s.tl_feedback)}"
                </div>` : ''}

                ${s.client_feedback_notes ? `
                <div style="font-size:0.73rem; background:rgba(245,158,11,0.1); border-left:3px solid #f59e0b; padding:4px 8px; border-radius:3px; color:#fde68a; margin-top:2px;">
                    Client Feedback: "${escHtml(s.client_feedback_notes)}"
                </div>` : ''}
            </div>
        `;
    }).join('');
};

// Clients & Roles loader (for AM and Management)
window.loadClientsRoles = async function() {
    const content = document.getElementById('clients-roles-content');
    if (!content) return;

    try {
        const res = await fetch('/api/am/clients-spokes');
        const data = await res.json();
        const clients = data.clients || [];
        const spokes = data.spokes || [];

        if (clients.length === 0) {
            content.innerHTML = '<p style="padding:20px; color:#aaa;">No clients found. Add a client to get started.</p>';
            return;
        }

        let html = '<div class="clients-accordion">';
        clients.forEach(client => {
            const clientSpokes = spokes.filter(s => s.client_id === client.id);
            html += `
            <div class="accordion-item" style="margin-bottom: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                <div class="accordion-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" style="padding: 15px; cursor: pointer; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                    <span>🏢 ${escHtml(client.company_name)}</span>
                    <span style="font-size: 0.8em; color: #aaa;">${clientSpokes.length} Spokespersons ▼</span>
                </div>
                <div class="accordion-body" style="display: none; padding: 0 15px 15px 15px;">
                    ${clientSpokes.length > 0 ? `
                    <table class="data-table" style="margin: 0; width: 100%;">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Contact Info</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${clientSpokes.map(s => `
                            <tr>
                                <td>${escHtml(s.name)}</td>
                                <td>${escHtml(s.email)}</td>
                                <td>${escHtml(s.contact_info)}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : '<p style="color:#aaa; font-style:italic;">No spokespersons assigned to this client.</p>'}
                </div>
            </div>`;
        });
        html += '</div>';
        content.innerHTML = html;
    } catch (e) {
        console.error('Failed to load clients and roles:', e);
    }
};

// -------------------------------------------------------------------------
// 11. TEAM LEAD DASHBOARD & QUALITY CONTROL WORKFLOW
// -------------------------------------------------------------------------
let tlPendingSubmissionsList = [];

window.loadTeamLeadDashboard = async function() {
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;
    const role = user ? String(user.role).toLowerCase().replace(/[\s_-]/g, '') : '';
    if (role !== 'teamlead' && role !== 'tl') return;

    const nameEl = document.getElementById('tl-header-name');
    if (nameEl) nameEl.innerText = user.name || 'Team Lead';

    let data = null;
    try {
        const res = await fetch('/api/ats/tl/dashboard');
        if (res.ok) {
            data = await res.json();
        }
    } catch (e) {}

    // Resilient fallback for live instances: compose from existing endpoints
    if (!data) {
        try {
            const [inboxRes, subsRes, jobsRes] = await Promise.all([
                fetch('/api/ats/tl/inbox').then(r => r.json()).catch(() => []),
                fetch('/api/ats/submissions').then(r => r.json()).catch(() => []),
                fetch('/api/ats/my-roles').then(r => r.json()).catch(() => [])
            ]);

            const pendingSubs = Array.isArray(inboxRes) ? inboxRes : [];
            const allSubs = Array.isArray(subsRes) ? subsRes : [];
            const activeJobs = Array.isArray(jobsRes) ? jobsRes : [];

            const pendingCount = pendingSubs.length;
            const approvedCount = allSubs.filter(s => s.status !== 'Submitted to TL' && s.status !== 'Rejected by TL').length;
            const rejectedCount = allSubs.filter(s => s.status === 'Rejected by TL').length;
            const totalReviewed = approvedCount + rejectedCount;
            const passRate = totalReviewed > 0 ? Math.round((approvedCount / totalReviewed) * 100) : 100;

            const recruiterMap = {};
            allSubs.forEach(s => {
                const rId = s.recruiter_id || 'unknown';
                const rName = s.recruiter_name || 'Recruiter';
                if (!recruiterMap[rId]) {
                    recruiterMap[rId] = { id: rId, name: rName, total: 0, approved: 0, rejected: 0, pending: 0 };
                }
                recruiterMap[rId].total++;
                if (s.status === 'Submitted to TL') recruiterMap[rId].pending++;
                else if (s.status === 'Rejected by TL') recruiterMap[rId].rejected++;
                else recruiterMap[rId].approved++;
            });

            const recentDecisions = allSubs
                .filter(s => s.status === 'Rejected by TL' || s.status === 'Submitted to AM' || s.status === 'Client Submitted')
                .slice(0, 10);

            data = {
                pendingCount,
                approvedCount,
                rejectedCount,
                passRate,
                pendingSubmissions: pendingSubs,
                recruiters: Object.values(recruiterMap),
                recentDecisions,
                activeJobs
            };
        } catch (err) {
            console.error('Fallback TL dashboard error:', err);
            return;
        }
    }

    try {
        // 1. Set KPI Metrics
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val !== undefined ? val : 0; };
        setVal('tl-kpi-pending-qc', data.pendingCount);
        setVal('tl-hero-qc-badge', `${data.pendingCount || 0} Pending`);
        setVal('tl-queue-count', `${data.pendingCount || 0} Pending`);
        setVal('tl-kpi-approved', data.approvedCount);
        setVal('tl-kpi-rejected', data.rejectedCount);
        setVal('tl-kpi-pass-rate', `${data.passRate || 100}%`);
        setVal('tl-kpi-roles', Array.isArray(data.activeJobs) ? data.activeJobs.length : 0);

        // 2. Set Delivery Workflow Funnel
        const totalDossiers = (data.pendingCount || 0) + (data.approvedCount || 0) + (data.rejectedCount || 0);
        setVal('tl-step-total', totalDossiers);
        setVal('tl-step-pending', data.pendingCount || 0);
        setVal('tl-step-approved', data.approvedCount || 0);
        
        let clientSubCount = 0;
        let interviewCount = 0;
        if (Array.isArray(data.recentDecisions)) {
            clientSubCount = data.recentDecisions.filter(s => s.status === 'Client Submitted' || (s.status && s.status.includes('Interview'))).length;
            interviewCount = data.recentDecisions.filter(s => s.status && s.status.includes('Interview')).length;
        }
        setVal('tl-step-client', clientSubCount);
        setVal('tl-step-interviews', interviewCount);

        // 3. Render Pending QC Queue
        tlPendingSubmissionsList = Array.isArray(data.pendingSubmissions) ? data.pendingSubmissions : [];
        renderTeamLeadPendingQc(tlPendingSubmissionsList);

        // 4. Render Recruiter Leaderboard
        renderTeamLeadRecruiters(Array.isArray(data.recruiters) ? data.recruiters : []);

        // 5. Render Active Roles
        renderTeamLeadRoles(Array.isArray(data.activeJobs) ? data.activeJobs : []);

        // 6. Render Audit History
        renderTeamLeadAudit(Array.isArray(data.recentDecisions) ? data.recentDecisions : []);

    } catch (e) {
        console.error('Error rendering Team Lead Dashboard:', e);
    }
};

window.renderTeamLeadPendingQc = function(list) {
    const container = document.getElementById('tl-dashboard-qc-list');
    if (!container) return;

    if (!Array.isArray(list) || list.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:45px 20px; background:rgba(255,255,255,0.02); border-radius:10px; border:1px dashed rgba(255,255,255,0.12);">
                <div style="font-size:2.4rem; margin-bottom:8px;">🎉</div>
                <div style="font-weight:700; color:#c084fc; font-size:1.05rem;">All Caught Up!</div>
                <div style="font-size:0.83rem; color:#94a3b8; margin-top:4px;">
                    Zero candidate submissions are currently pending Team Lead QC. Your pod is operating smoothly.
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(sub => {
        const candidateCode = sub.candidate_code || 'CAND';
        const jobCode = sub.job_code || 'JOB';
        const createdDate = sub.created_at ? new Date(sub.created_at).toLocaleDateString() : 'Recent';

        return `
            <div class="card" style="margin-bottom:0; padding:15px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-left:4px solid #a78bfa; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span class="code-badge code-sub" style="font-size:0.68rem;">${escHtml(sub.id)}</span>
                            <span class="code-badge code-cand" style="font-size:0.68rem;">${escHtml(candidateCode)}</span>
                            <span style="font-size:0.72rem; color:#94a3b8;">📅 ${createdDate}</span>
                        </div>
                        <div style="font-weight:700; color:white; font-size:1rem; margin-top:3px;">
                            ${escHtml(sub.candidate_name)}
                        </div>
                        <div style="font-size:0.8rem; color:#c084fc; margin-top:2px;">
                            Sourced by: <strong>${escHtml(sub.recruiter_name || 'Recruiter')}</strong>
                        </div>
                    </div>
                    <span style="font-size:0.72rem; padding:3px 8px; border-radius:10px; font-weight:700; color:#c084fc; background:rgba(167,139,250,0.15); border:1px solid rgba(167,139,250,0.3); white-space:nowrap;">
                        Pending QC
                    </span>
                </div>

                <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:10px; margin-bottom:10px; font-size:0.8rem;">
                    <div style="color:#60a5fa; font-weight:700; margin-bottom:2px;">
                        💼 ${escHtml(jobCode)} - ${escHtml(sub.job_title)}
                    </div>
                    <div style="color:#cbd5e1; font-size:0.75rem;">
                        🏢 Client: <strong>${escHtml(sub.client_name || 'Direct Client')}</strong> ${sub.spoke_name ? `(Spoke: ${escHtml(sub.spoke_name)})` : ''}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px; font-size:0.76rem; margin-bottom:10px; background:rgba(255,255,255,0.02); padding:8px; border-radius:6px; color:#cbd5e1;">
                    <div>Curr: <strong>${escHtml(sub.current_salary || 'N/A')}</strong></div>
                    <div>Exp: <strong style="color:#6ee7b7;">${escHtml(sub.expected_salary || 'N/A')}</strong></div>
                    <div>Notice: <strong>${escHtml(sub.notice_period || 'Immediate')}</strong></div>
                    <div>Visa: <strong>${escHtml(sub.visa_status || 'Authorized')}</strong></div>
                </div>

                <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap;">
                    <span style="padding:2px 7px; border-radius:4px; background:rgba(59,130,246,0.15); color:#93c5fd; font-size:0.7rem;">📎 CV Attached</span>
                    <span style="padding:2px 7px; border-radius:4px; background:rgba(16,185,129,0.15); color:#6ee7b7; font-size:0.7rem;">✓ RTR Confirmed</span>
                    ${sub.candidate_skills ? `<span style="padding:2px 7px; border-radius:4px; background:rgba(255,255,255,0.06); color:#cbd5e1; font-size:0.7rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🏷️ ${escHtml(sub.candidate_skills)}</span>` : ''}
                </div>

                <!-- Action Toolbar for QC -->
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn-primary" style="background:#10b981; flex:1; padding:7px 12px; font-weight:700; font-size:0.78rem; border-radius:6px;" onclick="reviewTlSubmission('${sub.id}', 'approve')">
                        ✅ Approve (Send to AM)
                    </button>
                    <button type="button" class="btn-primary" style="background:#ef4444; flex:1; padding:7px 12px; font-weight:700; font-size:0.78rem; border-radius:6px;" onclick="openTlRejectModal('${sub.id}')">
                        ❌ Reject (Return)
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.filterTlDashboardQc = function() {
    const q = (document.getElementById('tl-qc-search')?.value || '').toLowerCase().trim();
    if (!q) {
        renderTeamLeadPendingQc(tlPendingSubmissionsList);
        return;
    }
    const filtered = (tlPendingSubmissionsList || []).filter(sub => {
        return (sub.candidate_name && sub.candidate_name.toLowerCase().includes(q)) ||
               (sub.candidate_code && sub.candidate_code.toLowerCase().includes(q)) ||
               (sub.recruiter_name && sub.recruiter_name.toLowerCase().includes(q)) ||
               (sub.job_title && sub.job_title.toLowerCase().includes(q)) ||
               (sub.client_name && sub.client_name.toLowerCase().includes(q));
    });
    renderTeamLeadPendingQc(filtered);
};

window.renderTeamLeadRecruiters = function(recruiters) {
    const tbody = document.getElementById('tl-recruiters-tbody');
    if (!tbody) return;

    if (!Array.isArray(recruiters) || recruiters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">No recruiter activity recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = recruiters.map(r => {
        const total = r.total || 0;
        const approved = r.approved || 0;
        const passPct = total > 0 ? Math.round((approved / total) * 100) : 100;
        const passColor = passPct >= 80 ? '#6ee7b7' : (passPct >= 50 ? '#fcd34d' : '#fca5a5');

        return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px 6px;">
                    <div style="font-weight:700; color:white;">${escHtml(r.name)}</div>
                    <div style="font-size:0.7rem; color:#94a3b8;">${r.pending || 0} pending QC</div>
                </td>
                <td style="padding:8px 6px; text-align:center; font-weight:700; color:#e2e8f0;">${total}</td>
                <td style="padding:8px 6px; text-align:center; font-weight:700; color:#6ee7b7;">${approved}</td>
                <td style="padding:8px 6px; text-align:center;">
                    <span style="font-weight:800; color:${passColor};">${passPct}%</span>
                </td>
            </tr>
        `;
    }).join('');
};

window.renderTeamLeadRoles = function(roles) {
    const container = document.getElementById('tl-roles-feed');
    if (!container) return;

    if (!Array.isArray(roles) || roles.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:15px; color:#94a3b8; font-size:0.8rem;">No active roles found.</div>';
        return;
    }

    container.innerHTML = roles.slice(0, 5).map(j => {
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px;">
                <div style="min-width:0;">
                    <div style="font-weight:700; color:white; font-size:0.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${escHtml(j.title)}
                    </div>
                    <div style="font-size:0.72rem; color:#93c5fd;">
                        🏢 ${escHtml(j.client_name || 'Client')} • ${escHtml(j.job_code || `JOB-${j.id}`)}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <span style="font-size:0.7rem; padding:2px 6px; border-radius:10px; background:rgba(59,130,246,0.15); color:#93c5fd; font-weight:700;">
                        ${j.total_submissions || 0} subs
                    </span>
                    <button type="button" class="btn-outline" style="padding:3px 7px; font-size:0.7rem; border-color:#8b5cf6; color:#c084fc;" onclick="openAtsSubmitModal('', '${j.id}')">
                        ⚡ Submit
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.renderTeamLeadAudit = function(decisions) {
    const tbody = document.getElementById('tl-audit-tbody');
    if (!tbody) return;

    if (!Array.isArray(decisions) || decisions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">No recent quality control decisions recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = decisions.map(d => {
        const isApproved = d.status !== 'Rejected by TL';
        const statusBadge = isApproved
            ? `<span style="padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.72rem; background:rgba(16,185,129,0.15); color:#6ee7b7; border:1px solid rgba(16,185,129,0.3);">✅ Approved (To AM)</span>`
            : `<span style="padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.72rem; background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3);">❌ Rejected by TL</span>`;

        const feedbackText = d.tl_feedback ? `"${escHtml(d.tl_feedback)}"` : (isApproved ? 'Dossier verified & passed to AM' : 'Returned for revision');
        const timeStr = d.updated_at ? new Date(d.updated_at).toLocaleString() : (d.created_at ? new Date(d.created_at).toLocaleString() : 'Recent');

        return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px 10px;">
                    <div style="font-weight:700; color:white;">${escHtml(d.candidate_name)}</div>
                    <div style="font-size:0.7rem; opacity:0.7;">${escHtml(d.candidate_code || 'CAND')}</div>
                </td>
                <td style="padding:8px 10px;">
                    <div style="font-size:0.8rem; color:#93c5fd; font-weight:600;">${escHtml(d.job_title)}</div>
                    <div style="font-size:0.7rem; opacity:0.7;">${escHtml(d.client_name || 'Client')} (${escHtml(d.job_code || '')})</div>
                </td>
                <td style="padding:8px 10px; font-size:0.8rem; color:#cbd5e1;">
                    ${escHtml(d.recruiter_name || 'Recruiter')}
                </td>
                <td style="padding:8px 10px;">
                    ${statusBadge}
                </td>
                <td style="padding:8px 10px; font-size:0.78rem; color:#e2e8f0; max-width:260px;">
                    ${feedbackText}
                </td>
                <td style="padding:8px 10px; font-size:0.75rem; color:#94a3b8; white-space:nowrap;">
                    ${timeStr}
                </td>
            </tr>
        `;
    }).join('');
};

console.log('RecruitGO Mediated ATS Engine Loaded Successfully.');

// =========================================================================
// 1. DEDICATED JOB ROLES VIEW CONTROLLER
// =========================================================================
window.allDetailedJobsList = [];

window.loadDetailedJobs = async function() {
    try {
        const container = document.getElementById('jobs-detailed-container');
        if (container) container.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.6; grid-column:1/-1;">Loading live job requisitions...</div>';

        const res = await fetch('/api/ats/jobs/detailed');
        const jobs = await res.json();
        window.allDetailedJobsList = Array.isArray(jobs) ? jobs : [];

        // Populate client dropdown filter if available
        const clientFilter = document.getElementById('jobs-client-filter');
        if (clientFilter) {
            const currentVal = clientFilter.value;
            const uniqueClients = [...new Set(window.allDetailedJobsList.map(j => j.client_name).filter(Boolean))].sort();
            clientFilter.innerHTML = '<option value="">All Clients</option>' + uniqueClients.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
            clientFilter.value = currentVal;
        }

        window.renderDetailedJobsCards(window.allDetailedJobsList);
    } catch (e) {
        console.error('loadDetailedJobs error:', e);
        const container = document.getElementById('jobs-detailed-container');
        if (container) container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444; grid-column:1/-1;">Failed to load job roles: ${escHtml(e.message)}</div>`;
    }
};

window.renderDetailedJobsCards = function(jobs) {
    const container = document.getElementById('jobs-detailed-container');
    if (!container) return;

    if (!jobs || jobs.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: rgba(30,41,59,0.5); border: 1px dashed rgba(255,255,255,0.15); border-radius: 12px;">
                <div style="font-size: 2.2rem; margin-bottom: 10px;">💼</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #e2e8f0; margin-bottom: 6px;">No Job Requisitions Found</div>
                <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 18px;">Create a new requisition or check your search filters.</div>
                ${window.isUserAccountManager() ? `
                <button type="button" class="btn-primary role-am-only" style="padding: 10px 20px; font-weight: 700; border-radius: 8px; cursor:pointer;" onclick="openAddJobModal()">
                    ➕ Create First Requisition
                </button>
                ` : ''}
            </div>
        `;
        return;
    }

    container.innerHTML = jobs.map(j => {
        let spokeBadge = '';
        if (j.spoke_name) {
            spokeBadge = `
                <div style="font-size:0.75rem; color:#38bdf8; background:rgba(14,165,233,0.1); border:1px solid rgba(14,165,233,0.25); border-radius:6px; padding:6px 10px; margin-bottom:8px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span>🎯 <strong>Client Spoke:</strong> ${escHtml(j.spoke_name)} ${j.spoke_role ? `(${escHtml(j.spoke_role)})` : ''}</span>
                    <span style="color:#94a3b8;">➔</span>
                    <span>💼 <strong>AM:</strong> ${escHtml(j.source_am_email || 'Assigned AM')}</span>
                    <span style="color:#64748b;">•</span>
                    <span style="color:#94a3b8;">via <strong style="color:#f1f5f9; text-transform:capitalize;">${escHtml((j.source_type || 'email').replace('_', ' '))}</strong></span>
                </div>
            `;
        } else if (j.source_type === 'email_ingestion') {
            spokeBadge = `
                <div style="font-size:0.75rem; color:#f59e0b; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); border-radius:6px; padding:6px 10px; margin-bottom:8px; display:inline-flex; align-items:center; gap:6px;">
                    <span>📧</span> <span>Auto-Fetched from AM Email: <strong>${escHtml(j.source_am_email || 'Direct AM Mail')}</strong></span>
                </div>
            `;
        }

        const creatorBadge = `
            <div style="font-size:0.73rem; color:#94a3b8; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:5px; padding:4px 8px; margin-bottom:12px; display:inline-flex; align-items:center; gap:6px;">
                <span>👤</span> <span>Added in ATS by: <strong>${escHtml(j.created_by_name || 'Admin')}</strong> (${escHtml(j.created_by_role || 'Staff')})</span>
            </div>
        `;
        const provenanceBadge = spokeBadge + creatorBadge;

        const totalSubs = parseInt(j.total_submissions || 0);
        const pendingTl = parseInt(j.pending_tl_count || 0);
        const pendingAm = parseInt(j.pending_am_count || 0);
        const clientSub = parseInt(j.client_submitted_count || 0);
        const interviews = parseInt(j.interview_count || 0);
        const joined = parseInt(j.joined_count || 0);

        return `
            <div class="card" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between; border:1px solid rgba(255,255,255,0.08); background:rgba(30,41,59,0.7); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
                <div>
                    <!-- Header with REQ Code and Status -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                        <div>
                            <span class="code-badge code-job" style="font-size:0.75rem; padding:3px 8px; font-weight:700;">${escHtml(j.job_code || 'REQ-' + String(j.id).slice(-4))}</span>
                            <h3 style="margin:8px 0 4px; font-size:1.15rem; color:#f8fafc; font-weight:800; line-height:1.3;">
                                ${escHtml(j.title)}
                            </h3>
                            <div style="font-size:0.85rem; color:#60a5fa; font-weight:600; display:flex; align-items:center; gap:6px;">
                                <span>🏢</span> <span>${escHtml(j.client_name || j.company || 'Direct Client')}</span>
                                ${j.spoke_name ? `<span style="color:#94a3b8; font-weight:normal;">• Spoke: ${escHtml(j.spoke_name)}</span>` : ''}
                            </div>
                        </div>
                        <span style="padding:3px 10px; border-radius:12px; font-size:0.72rem; font-weight:700; text-transform:uppercase; background:${j.status === 'open' ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)'}; color:${j.status === 'open' ? '#34d399' : '#94a3b8'}; border:1px solid ${j.status === 'open' ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.3)'};">
                            ● ${escHtml(j.status || 'open')}
                        </span>
                    </div>

                    <!-- Provenance Tag -->
                    ${provenanceBadge}

                    <!-- Key Attributes Badges -->
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
                        <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,0.06); color:#cbd5e1;">📍 ${escHtml(j.location || 'Remote')}</span>
                        <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,0.06); color:#cbd5e1;">💼 ${escHtml(j.workmode || j.workMode || 'Onsite')}</span>
                        <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,0.06); color:#cbd5e1;">⏳ ${escHtml(j.jobtype || j.jobType || 'Full-time')}</span>
                        ${j.salary_range ? `<span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:rgba(16,185,129,0.1); color:#6ee7b7;">💰 ${escHtml(j.salary_range)}</span>` : ''}
                        ${j.tl_name ? `<span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:rgba(139,92,246,0.12); color:#c084fc;">🛡️ TL: ${escHtml(j.tl_name)}</span>` : ''}
                    </div>

                    <!-- Live Funnel Pipeline Tracker -->
                    <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:12px; margin-bottom:18px;">
                        <div style="font-size:0.72rem; color:#94a3b8; text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:8px; display:flex; justify-content:space-between;">
                            <span>Candidate Funnel</span>
                            <span style="color:#e2e8f0;">${totalSubs} Total Submissions</span>
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:6px; text-align:center;">
                            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:6px 2px;">
                                <div style="font-size:1.1rem; font-weight:800; color:#c084fc;">${pendingTl}</div>
                                <div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;">TL QC</div>
                            </div>
                            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:6px 2px;">
                                <div style="font-size:1.1rem; font-weight:800; color:#60a5fa;">${pendingAm}</div>
                                <div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;">AM Review</div>
                            </div>
                            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:6px 2px;">
                                <div style="font-size:1.1rem; font-weight:800; color:#38bdf8;">${clientSub}</div>
                                <div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;">Client Spoke</div>
                            </div>
                            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:6px 2px;">
                                <div style="font-size:1.1rem; font-weight:800; color:#fbbf24;">${interviews}</div>
                                <div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;">Interviews</div>
                            </div>
                            <div style="background:rgba(255,255,255,0.04); border-radius:6px; padding:6px 2px;">
                                <div style="font-size:1.1rem; font-weight:800; color:#34d399;">${joined}</div>
                                <div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;">Placed</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- AI Recruitment & Outreach Toolkit -->
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:12px; padding:10px; background:rgba(0,0,0,0.25); border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
                    <button type="button" class="btn-outline" style="border-color:#8b5cf6; color:#c084fc; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer;" onclick="event.stopPropagation();openReqModal('${j.id}')" title="AI Requirement Analysis & Search Strings">📊 Req Analysis</button>
                    <button type="button" class="btn-outline" style="border-color:#10b981; color:#34d399; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer;" onclick="event.stopPropagation();openApproachModal('${j.id}')" title="LinkedIn Connection Request Approach Note">🤝 Approach Note</button>
                    <button type="button" class="btn-outline" style="border-color:#f59e0b; color:#fbbf24; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer;" onclick="event.stopPropagation();openInmailModal('${j.id}')" title="Direct LinkedIn InMail Pitch">✉️ InMail Message</button>
                    <button type="button" class="btn-outline" style="border-color:#3b82f6; color:#60a5fa; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer;" onclick="event.stopPropagation();openPostModal('${j.id}')" title="Social Feed Job Posting">📢 Feed Posting</button>
                    <button type="button" class="btn-outline" style="border-color:#ec4899; color:#f472b6; font-size:0.75rem; padding:5px 10px; border-radius:6px; cursor:pointer;" onclick="event.stopPropagation();openPreScreeningModal('${j.id}')" title="Technical Pre-Screening Questions">📋 Pre-Screening Qs</button>
                </div>

                <!-- Action Toolbar -->
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:14px;">
                    <button type="button" class="btn-primary" style="flex:1; padding:8px 12px; font-size:0.8rem; font-weight:700; background:#8b5cf6; border-radius:6px; display:inline-flex; justify-content:center; align-items:center; gap:5px; cursor:pointer;" onclick="openAtsSubmitModal('', '${j.id}')">
                        <span>⚡</span> Submit Candidate
                    </button>
                    <button type="button" class="btn-outline" style="padding:8px 12px; font-size:0.8rem; border-color:rgba(139,92,246,0.5); color:#c084fc; border-radius:6px; display:inline-flex; align-items:center; gap:5px; cursor:pointer;" onclick="openScanForJob('${j.id}')" title="Scan local resumes and find matching candidates for this role">
                        <span>📂</span> Match Local CVs
                    </button>
                    <button type="button" class="btn-outline" style="padding:8px 12px; font-size:0.8rem; border-color:rgba(236,72,153,0.5); color:#f472b6; border-radius:6px; display:inline-flex; align-items:center; gap:5px; cursor:pointer;" onclick="openEmailResumeMatchModal('${j.id}')" title="Scan email archives for past submissions and matching CVs">
                        <span>📧</span> Match Email CVs
                    </button>
                    <button type="button" class="btn-outline" style="padding:8px 12px; font-size:0.8rem; border-color:rgba(56,189,248,0.4); color:#38bdf8; border-radius:6px; display:inline-flex; align-items:center; gap:5px; cursor:pointer;" onclick="openJobSubmissionsModal('${j.id}', '${escHtml(j.title).replace(/'/g, "\\'")}', '${escHtml(j.job_code || '').replace(/'/g, "\\'")}')">
                        <span>📋</span> Submissions (${totalSubs})
                    </button>
                    <button type="button" class="btn-outline" style="padding:8px 10px; font-size:0.8rem; border-color:rgba(255,255,255,0.2); color:#cbd5e1; border-radius:6px; cursor:pointer;" onclick="if(typeof openRoleDetail==='function') openRoleDetail('${j.id}'); else if(typeof openLiveRoles==='function') openLiveRoles();" title="View Boolean Search Strings & JD">
                        🔍 Sourcing
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.filterDetailedJobs = function() {
    const q = (document.getElementById('jobs-search-input')?.value || '').toLowerCase().trim();
    const client = (document.getElementById('jobs-client-filter')?.value || '').toLowerCase().trim();
    const status = (document.getElementById('jobs-status-filter')?.value || '').toLowerCase().trim();

    const filtered = window.allDetailedJobsList.filter(j => {
        const matchesQ = !q || (j.title || '').toLowerCase().includes(q) || (j.job_code || '').toLowerCase().includes(q) || (j.client_name || '').toLowerCase().includes(q) || (j.location || '').toLowerCase().includes(q);
        const matchesClient = !client || (j.client_name || '').toLowerCase() === client;
        const matchesStatus = !status || (j.status || '').toLowerCase() === status;
        return matchesQ && matchesClient && matchesStatus;
    });

    window.renderDetailedJobsCards(filtered);
};

window.resetDetailedJobsFilters = function() {
    if (document.getElementById('jobs-search-input')) document.getElementById('jobs-search-input').value = '';
    if (document.getElementById('jobs-client-filter')) document.getElementById('jobs-client-filter').value = '';
    if (document.getElementById('jobs-status-filter')) document.getElementById('jobs-status-filter').value = '';
    window.renderDetailedJobsCards(window.allDetailedJobsList);
};

// =========================================================================
// 2. DEDICATED CLIENTS VIEW CONTROLLER
// =========================================================================
window.allDetailedClientsList = [];

window.loadDetailedClients = async function() {
    try {
        const container = document.getElementById('clients-detailed-container');
        if (container) container.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.6;">Loading client accounts...</div>';

        const res = await fetch('/api/ats/clients/detailed');
        const clients = await res.json();
        window.allDetailedClientsList = Array.isArray(clients) ? clients : [];

        window.renderDetailedClientsCards(window.allDetailedClientsList);
    } catch (e) {
        console.error('loadDetailedClients error:', e);
        const container = document.getElementById('clients-detailed-container');
        if (container) container.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">Failed to load clients: ${escHtml(e.message)}</div>`;
    }
};

window.renderDetailedClientsCards = function(clients) {
    const container = document.getElementById('clients-detailed-container');
    if (!container) return;

    // Deduplicate clients by normalized company_name
    const seenComp = new Set();
    const uniqueClients = (clients || []).filter(c => {
        const norm = (c.company_name || '').trim().toLowerCase();
        if (!norm || seenComp.has(norm)) return false;
        seenComp.add(norm);
        return true;
    });

    if (!uniqueClients || uniqueClients.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 50px 20px; background: rgba(30,41,59,0.5); border: 1px dashed rgba(255,255,255,0.15); border-radius: 12px;">
                <div style="font-size: 2.2rem; margin-bottom: 10px;">🏢</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #e2e8f0; margin-bottom: 6px;">No Clients Onboarded Yet</div>
                <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 18px;">Add your enterprise clients and their direct Spoke Persons to begin submitting dossiers.</div>
                <button type="button" class="btn-primary" style="padding: 10px 20px; font-weight: 700; border-radius: 8px; cursor:pointer;" onclick="openAddClientModal()">
                    ➕ Onboard First Client
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = uniqueClients.map(c => {
        const spokes = Array.isArray(c.spoke_persons) ? c.spoke_persons : [];
        const spokesHtml = spokes.length > 0
            ? spokes.map(sp => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.06); border-radius:6px; margin-bottom:6px;">
                    <div>
                        <div style="font-weight:700; color:#f1f5f9; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
                            <span>👤</span> ${escHtml(sp.name)} 
                            <span style="font-size:0.72rem; color:#a78bfa; font-weight:normal;">(${escHtml(sp.role_title || 'Hiring Lead')})</span>
                        </div>
                        <div style="font-size:0.78rem; color:#94a3b8; display:flex; gap:12px; margin-top:2px;">
                            ${sp.email ? `<span>📧 <a href="mailto:${escHtml(sp.email)}" style="color:#93c5fd; text-decoration:none;">${escHtml(sp.email)}</a></span>` : ''}
                            ${sp.phone ? `<span>📱 <a href="tel:${escHtml(sp.phone)}" style="color:#cbd5e1; text-decoration:none;">${escHtml(sp.phone)}</a></span>` : ''}
                        </div>
                    </div>
                    <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(16,185,129,0.12); color:#6ee7b7; border:1px solid rgba(16,185,129,0.25);">Active Spoke</span>
                </div>
            `).join('')
            : `<div style="font-size:0.8rem; color:#64748b; padding:10px 0; font-style:italic;">No Spoke Persons registered yet for this client.</div>`;

        return `
            <div class="card" style="padding:24px; border:1px solid rgba(255,255,255,0.08); background:rgba(30,41,59,0.7); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <h3 style="margin:0; font-size:1.35rem; color:#ffffff; font-weight:800;">
                                ${escHtml(c.company_name)}
                            </h3>
                            <span style="padding:3px 10px; border-radius:12px; font-size:0.72rem; font-weight:700; text-transform:uppercase; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);">
                                Enterprise Client
                            </span>
                        </div>
                        <div style="font-size:0.85rem; color:#94a3b8; margin-top:4px; display:flex; flex-wrap:wrap; gap:12px;">
                            ${c.industry ? `<span>🏭 ${escHtml(c.industry)}</span>` : ''}
                            ${c.location ? `<span>📍 ${escHtml(c.location)}</span>` : ''}
                            ${c.website ? `<span>🌐 <a href="${escHtml(c.website)}" target="_blank" style="color:#60a5fa; text-decoration:none;">${escHtml(c.website)}</a></span>` : ''}
                            <span>💼 AM: <strong>${escHtml(c.am_name || 'Account Manager')}</strong></span>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        ${window.isUserAccountManager() ? `
                        <button type="button" class="btn-primary role-am-only" style="padding:8px 14px; font-size:0.8rem; font-weight:700; background:#3b82f6; border-radius:6px; cursor:pointer;" onclick="openAddJobModal('${c.id}')">
                            ➕ New Job Requisition
                        </button>
                        ` : ''}
                        <button type="button" class="btn-outline" style="padding:8px 14px; font-size:0.8rem; border-color:#10b981; color:#34d399; border-radius:6px; cursor:pointer;" onclick="openAddSpokeModal('${c.id}', '${escHtml(c.company_name).replace(/'/g, "\\'")}')">
                            ➕ Add Spoke Person
                        </button>
                    </div>
                </div>

                <!-- Provenance & Metrics Banner -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:rgba(15,23,42,0.5); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:12px 16px; margin-bottom:16px;">
                    <div style="font-size:0.78rem; color:#94a3b8;">
                        <span>👤 Onboarded by: <strong>${escHtml(c.created_by_name || 'Admin')}</strong> (${escHtml(c.created_by_role || 'AccountManager')})</span>
                        ${c.billing_terms ? `<span style="margin-left:12px; color:#cbd5e1;">• Terms: <strong>${escHtml(c.billing_terms)}</strong></span>` : ''}
                    </div>
                    <div style="display:flex; gap:14px;">
                        <span style="font-size:0.8rem; font-weight:700; color:#60a5fa; cursor:pointer;" onclick="switchAtsView('jobs')">
                            💼 ${c.active_roles_count || 0} Open Roles
                        </span>
                        <span style="font-size:0.8rem; font-weight:700; color:#c084fc;">
                            📤 ${c.total_submissions_count || 0} Submissions
                        </span>
                        <span style="font-size:0.8rem; font-weight:700; color:#fbbf24;">
                            🎯 ${c.interview_count || 0} Interviews
                        </span>
                        <span style="font-size:0.8rem; font-weight:700; color:#34d399;">
                            🏆 ${c.placed_count || 0} Placements
                        </span>
                    </div>
                </div>

                <!-- Spoke Persons Directory Accordion -->
                <div>
                    <div style="font-size:0.78rem; font-weight:700; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                        Client Spoke Persons (Hiring Contacts)
                    </div>
                    ${spokesHtml}
                </div>
            </div>
        `;
    }).join('');
};

window.filterDetailedClients = function() {
    const q = (document.getElementById('clients-search-input')?.value || '').toLowerCase().trim();
    const filtered = window.allDetailedClientsList.filter(c => {
        const inName = (c.company_name || '').toLowerCase().includes(q);
        const inIndustry = (c.industry || '').toLowerCase().includes(q);
        const inLocation = (c.location || '').toLowerCase().includes(q);
        const inAm = (c.am_name || '').toLowerCase().includes(q);
        const inSpokes = Array.isArray(c.spoke_persons) && c.spoke_persons.some(s => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
        return inName || inIndustry || inLocation || inAm || inSpokes;
    });
    window.renderDetailedClientsCards(filtered);
};

window.resetDetailedClientsFilters = function() {
    if (document.getElementById('clients-search-input')) document.getElementById('clients-search-input').value = '';
    window.renderDetailedClientsCards(window.allDetailedClientsList);
};

// =========================================================================
// 3. CANDIDATE HISTORY & FULL AUDIT TRAIL MODAL
// =========================================================================
window.openCandidateHistoryModal = async function(candidateId) {
    try {
        const res = await fetch(`/api/ats/candidates/${candidateId}/history`);
        const data = await res.json();
        const candRes = await fetch(`/api/candidates/${candidateId}`);
        const cand = await candRes.json();

        let modal = document.getElementById('candidate-history-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'candidate-history-modal';
            modal.className = 'modal-backdrop';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
            document.body.appendChild(modal);
        }

        const subs = data.submissions || [];
        const pipe = data.pipeline || [];
        const remarks = data.remarks || [];

        const subsTimelineHtml = subs.length > 0
            ? subs.map(s => `
                <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.08); border-left:4px solid #8b5cf6; border-radius:8px; padding:14px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div>
                            <span class="code-badge code-job" style="font-size:0.75rem;">${escHtml(s.job_code || 'JOB')}</span>
                            <strong style="color:#f8fafc; font-size:0.95rem; margin-left:6px;">${escHtml(s.job_title)}</strong>
                            <span style="color:#60a5fa; font-size:0.85rem; margin-left:6px;">@ ${escHtml(s.client_name || s.job_company || 'Client')}</span>
                        </div>
                        <span style="font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:8px; background:rgba(139,92,246,0.15); color:#c084fc; border:1px solid rgba(139,92,246,0.3);">
                            ${escHtml(s.status)}
                        </span>
                    </div>

                    <div style="font-size:0.8rem; color:#94a3b8; display:flex; flex-wrap:wrap; gap:16px; margin-bottom:8px;">
                        <span>📤 Submitted by Recruiter: <strong>${escHtml(s.recruiter_name || 'Recruiter')}</strong> on ${new Date(s.created_at).toLocaleString()}</span>
                        ${s.spoke_name ? `<span>🎯 Spoke: <strong>${escHtml(s.spoke_name)}</strong> (${escHtml(s.spoke_email || '')})</span>` : ''}
                    </div>

                    <!-- TL Review Details -->
                    ${s.tl_reviewed_at ? `
                        <div style="background:rgba(255,255,255,0.03); border-radius:6px; padding:8px 10px; font-size:0.78rem; margin-bottom:6px;">
                            <span style="color:#a78bfa; font-weight:700;">🛡️ Team Lead QC:</span>
                            <span style="color:#e2e8f0;"> ${s.tl_decision === 'reject' ? '❌ Rejected' : '✅ Approved & Sent to AM'}</span>
                            ${s.tl_feedback ? `<div style="color:#fca5a5; margin-top:2px; font-style:italic;">"${escHtml(s.tl_feedback)}"</div>` : ''}
                        </div>
                    ` : '<div style="font-size:0.75rem; color:#94a3b8; font-style:italic;">Pending Team Lead QC review</div>'}

                    <!-- AM Dispatch Details -->
                    ${s.am_submitted_at ? `
                        <div style="background:rgba(255,255,255,0.03); border-radius:6px; padding:8px 10px; font-size:0.78rem; margin-bottom:6px;">
                            <span style="color:#38bdf8; font-weight:700;">🏢 AM Dispatch to Client Spoke:</span>
                            <span style="color:#e2e8f0;"> Dispatched on ${new Date(s.am_submitted_at).toLocaleString()}</span>
                            ${s.am_notes ? `<div style="color:#cbd5e1; margin-top:2px;">"${escHtml(s.am_notes)}"</div>` : ''}
                        </div>
                    ` : ''}

                    <!-- Client Feedback -->
                    ${s.client_responded_at ? `
                        <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:6px; padding:8px 10px; font-size:0.78rem;">
                            <span style="color:#34d399; font-weight:700;">💬 Client Feedback:</span>
                            <span style="color:#f8fafc; font-weight:700;"> ${escHtml(s.client_feedback_type || 'Update')}</span>
                            ${s.client_feedback_notes ? `<div style="color:#e2e8f0; margin-top:2px;">"${escHtml(s.client_feedback_notes)}"</div>` : ''}
                            ${s.client_counter_salary ? `<div style="color:#fbbf24; margin-top:2px;">Counter CTC: ${escHtml(s.client_counter_salary)}</div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `).join('')
            : '<div style="padding:20px; text-align:center; color:#94a3b8; font-style:italic;">No submission records for this candidate yet.</div>';

        modal.innerHTML = `
            <div class="card" style="width:100%; max-width:850px; max-height:90vh; overflow-y:auto; padding:28px; background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:12px; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:16px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span class="code-badge code-cand" style="font-size:0.85rem;">${escHtml(cand.candidate_code || 'CAND')}</span>
                            <h2 style="margin:0; font-size:1.45rem; color:white; font-weight:800;">
                                ${escHtml(cand.name)}
                            </h2>
                        </div>
                        <div style="font-size:0.85rem; color:#94a3b8; margin-top:4px;">
                            ${escHtml(cand.headline || 'Software Engineer')} • Added by <strong>${escHtml(cand.created_by_name || 'System')}</strong> (${escHtml(cand.created_by_role || 'Recruiter')})
                        </div>
                    </div>
                    <button type="button" class="btn-outline" style="width:auto; padding:6px 14px; font-size:0.85rem;" onclick="closeCandidateHistoryModal()">✕ Close</button>
                </div>

                <div style="margin-bottom:24px;">
                    <h4 style="margin:0 0 12px; color:#38bdf8; font-size:1rem; display:flex; align-items:center; gap:6px;">
                        <span>📜</span> End-to-End Submission Chain-of-Custody (${subs.length})
                    </h4>
                    ${subsTimelineHtml}
                </div>

                <div>
                    <h4 style="margin:0 0 12px; color:#a78bfa; font-size:1rem; display:flex; align-items:center; gap:6px;">
                        <span>📋</span> Activity Pipeline Events (${pipe.length})
                    </h4>
                    <div style="max-height:180px; overflow-y:auto; background:rgba(15,23,42,0.6); border-radius:8px; padding:10px;">
                        ${pipe.map(p => `
                            <div style="font-size:0.78rem; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between;">
                                <span style="color:#e2e8f0;">● ${escHtml(p.stage)}</span>
                                <span style="color:#94a3b8; font-size:0.72rem;">${new Date(p.timestamp).toLocaleString()}</span>
                            </div>
                        `).join('') || '<div style="color:#94a3b8; font-size:0.78rem;">No pipeline events logged.</div>'}
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    } catch (e) {
        console.error('Candidate history modal error:', e);
        if (typeof showToast === 'function') showToast('error', 'Failed to load candidate history: ' + e.message);
    }
};

window.closeCandidateHistoryModal = function() {
    const modal = document.getElementById('candidate-history-modal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 4. JOB SUBMISSIONS MODAL (All candidates submitted to this role)
// =========================================================================
window.openJobSubmissionsModal = async function(jobId, jobTitle, jobCode) {
    try {
        const res = await fetch(`/api/ats/jobs/${jobId}/submissions`);
        const subs = await res.json();

        let modal = document.getElementById('job-submissions-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'job-submissions-modal';
            modal.className = 'modal-backdrop';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
            document.body.appendChild(modal);
        }

        const rowsHtml = Array.isArray(subs) && subs.length > 0
            ? subs.map(s => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                    <td style="padding:10px 12px;">
                        <span class="code-badge code-cand" style="font-size:0.75rem;">${escHtml(s.candidate_code || 'CAND')}</span>
                        <div style="font-weight:700; color:#f8fafc; margin-top:2px;">${escHtml(s.candidate_name)}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">${escHtml(s.candidate_email || '')}</div>
                    </td>
                    <td style="padding:10px 12px; font-size:0.82rem; color:#cbd5e1;">
                        👤 ${escHtml(s.recruiter_name || 'Recruiter')}
                    </td>
                    <td style="padding:10px 12px;">
                        <span style="font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(139,92,246,0.15); color:#c084fc; border:1px solid rgba(139,92,246,0.3);">
                            ${escHtml(s.status)}
                        </span>
                        ${s.tl_feedback ? `<div style="font-size:0.72rem; color:#fca5a5; margin-top:3px;">"${escHtml(s.tl_feedback)}"</div>` : ''}
                    </td>
                    <td style="padding:10px 12px; font-size:0.78rem; color:#94a3b8;">
                        ${new Date(s.created_at).toLocaleString()}
                    </td>
                    <td style="padding:10px 12px; text-align:right;">
                        <button type="button" class="btn-outline" style="padding:4px 8px; font-size:0.75rem; cursor:pointer;" onclick="openCandidateHistoryModal('${s.candidate_id}')">
                            📜 History
                        </button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" style="text-align:center; padding:30px; opacity:0.6;">No candidates have been submitted to this requisition yet.</td></tr>';

        modal.innerHTML = `
            <div class="card" style="width:100%; max-width:900px; max-height:90vh; overflow-y:auto; padding:28px; background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:12px; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:14px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="code-badge code-job">${escHtml(jobCode || 'REQ')}</span>
                            <h2 style="margin:0; font-size:1.35rem; color:white; font-weight:800;">
                                Candidates Submitted for: ${escHtml(jobTitle)}
                            </h2>
                        </div>
                        <div style="font-size:0.82rem; color:#94a3b8; margin-top:4px;">
                            Review submissions, quality control decisions, and client feedback for this requisition.
                        </div>
                    </div>
                    <button type="button" class="btn-outline" style="width:auto; padding:6px 14px; font-size:0.85rem;" onclick="closeJobSubmissionsModal()">✕ Close</button>
                </div>

                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; text-align:left;">
                        <thead>
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.1); color:#38bdf8; font-size:0.8rem; text-transform:uppercase;">
                                <th style="padding:10px 12px;">Candidate</th>
                                <th style="padding:10px 12px;">Sourcing Recruiter</th>
                                <th style="padding:10px 12px;">Current Stage / QC</th>
                                <th style="padding:10px 12px;">Submitted At</th>
                                <th style="padding:10px 12px; text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    } catch (e) {
        console.error('Job submissions modal error:', e);
    }
};

window.closeJobSubmissionsModal = function() {
    const modal = document.getElementById('job-submissions-modal');
    if (modal) modal.style.display = 'none';
};

// =========================================================================
// 5. MODALS: ADD REQUISITION, ADD CLIENT, ADD SPOKE
// =========================================================================
window.onNewJobClientChange = function() {
    const clientSelect = document.getElementById('new-job-client');
    const spokeSelect = document.getElementById('new-job-spoke');
    const amSelect = document.getElementById('new-job-am');
    const amEmailInput = document.getElementById('new-job-am-email');
    const inlineDrawer = document.getElementById('inline-add-spoke-drawer');
    const inlineClientName = document.getElementById('inline-spoke-client-name');
    
    if (!clientSelect || !spokeSelect) return;
    const clientId = clientSelect.value;
    
    // Hide inline drawer if it was open
    if (inlineDrawer) inlineDrawer.style.display = 'none';

    if (!clientId) {
        spokeSelect.innerHTML = '<option value="">-- Select Client Account First --</option>';
        spokeSelect.disabled = true;
        if (inlineClientName) inlineClientName.innerText = 'Client';
        return;
    }

    spokeSelect.disabled = false;
    const client = (window.cachedClientsForNewJob || []).find(c => String(c.id) === String(clientId));
    if (inlineClientName && client) inlineClientName.innerText = client.company_name;

    // Auto-select Account Manager and fill email if client has one
    if (client && client.account_manager_id && amSelect) {
        amSelect.value = client.account_manager_id;
    }
    if (client && client.am_email && amEmailInput) {
        amEmailInput.value = client.am_email;
    }

    window.populateNewJobSpokes(clientId);
};

window.populateNewJobSpokes = function(clientId, preSelectedSpokeId = null) {
    const spokeSelect = document.getElementById('new-job-spoke');
    if (!spokeSelect) return;
    
    const client = (window.cachedClientsForNewJob || []).find(c => String(c.id) === String(clientId));
    const spokes = client?.spoke_persons || [];
    
    if (spokes.length === 0) {
        spokeSelect.innerHTML = `
            <option value="">⚠️ No Spokes registered yet (Click '+ Quick Add Spoke' below)</option>
        `;
    } else {
        spokeSelect.innerHTML = `
            <option value="">-- Select Client Spoke (Hiring Lead) --</option>
            ${spokes.map(sp => `
                <option value="${sp.id}" ${preSelectedSpokeId === sp.id ? 'selected' : ''}>
                    ${escHtml(sp.name)} (${escHtml(sp.role_title || 'Hiring Lead')}${sp.email ? ' - ' + escHtml(sp.email) : ''})
                </option>
            `).join('')}
        `;
    }
};

window.toggleInlineAddSpokeDrawer = function(forceState = null) {
    const drawer = document.getElementById('inline-add-spoke-drawer');
    const clientSelect = document.getElementById('new-job-client');
    if (!drawer) return;

    if (!clientSelect || !clientSelect.value) {
        alert('Please select a Client Account first before adding a Spoke Person.');
        clientSelect?.focus();
        return;
    }

    const isVisible = drawer.style.display !== 'none';
    const newState = forceState !== null ? forceState : !isVisible;
    drawer.style.display = newState ? 'block' : 'none';

    if (newState) {
        const client = (window.cachedClientsForNewJob || []).find(c => String(c.id) === String(clientSelect.value));
        const inlineClientName = document.getElementById('inline-spoke-client-name');
        if (inlineClientName && client) inlineClientName.innerText = client.company_name;
        document.getElementById('inline-spoke-name')?.focus();
    }
};

window.submitInlineSpoke = async function(e) {
    if (e) e.preventDefault();
    const clientSelect = document.getElementById('new-job-client');
    const clientId = clientSelect?.value;
    if (!clientId) {
        alert('Please select a Client Account first.');
        return;
    }

    const name = document.getElementById('inline-spoke-name')?.value?.trim();
    const email = document.getElementById('inline-spoke-email')?.value?.trim();
    const role_title = document.getElementById('inline-spoke-role')?.value?.trim();
    const phone = document.getElementById('inline-spoke-phone')?.value?.trim();

    if (!name || !email) {
        alert('Please provide at least Name and Email for the Client Spoke Person.');
        return;
    }

    try {
        const btn = document.getElementById('btn-submit-inline-spoke');
        if (btn) { btn.disabled = true; btn.innerText = 'Saving...'; }

        const res = await fetch(`/api/ats/clients/${clientId}/spokes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, role_title, phone })
        });
        const data = await res.json();

        if (btn) { btn.disabled = false; btn.innerText = '💾 Save & Assign Spoke'; }

        if (data.success && data.spoke) {
            // Update cache
            const client = (window.cachedClientsForNewJob || []).find(c => String(c.id) === String(clientId));
            if (client) {
                if (!client.spoke_persons) client.spoke_persons = [];
                client.spoke_persons.push(data.spoke);
            }

            // Populate and select newly created spoke
            window.populateNewJobSpokes(clientId, data.spoke.id);
            const spokeSelect = document.getElementById('new-job-spoke');
            if (spokeSelect) {
                spokeSelect.value = data.spoke.id;
            }

            // Reset inline form & close drawer
            document.getElementById('inline-spoke-name').value = '';
            document.getElementById('inline-spoke-email').value = '';
            document.getElementById('inline-spoke-role').value = '';
            document.getElementById('inline-spoke-phone').value = '';
            window.toggleInlineAddSpokeDrawer(false);

            if (typeof showToast === 'function') {
                showToast('success', `Spoke "${data.spoke.name}" created and assigned!`);
            }
        } else {
            alert('Failed to save Spoke: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        alert('Network error saving Spoke: ' + err.message);
        const btn = document.getElementById('btn-submit-inline-spoke');
        if (btn) { btn.disabled = false; btn.innerText = '💾 Save & Assign Spoke'; }
    }
};

window.onNewJobAmChange = function() {
    const amSelect = document.getElementById('new-job-am');
    const amEmailInput = document.getElementById('new-job-am-email');
    if (!amSelect || !amEmailInput) return;

    const selectedOption = amSelect.options[amSelect.selectedIndex];
    const email = selectedOption?.getAttribute('data-email') || '';
    if (email) amEmailInput.value = email;
};

window.openAddJobModal = async function(preSelectedClientId = null) {
    if (!window.isUserAccountManager()) {
        if (typeof showToast === 'function') {
            showToast('error', 'Permission Restricted: Only Account Managers can create new Job Requisitions.');
        } else {
            alert('Permission Restricted: Only Account Managers can create new Job Requisitions.');
        }
        return;
    }
    let modal = document.getElementById('add-job-requisition-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-job-requisition-modal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
        document.body.appendChild(modal);
    }

    // Fetch clients and users in parallel
    let clients = [];
    let users = [];
    try {
        const [cRes, uRes] = await Promise.all([
            fetch('/api/ats/clients/detailed'),
            fetch('/api/users')
        ]);
        clients = await cRes.json();
        users = await uRes.json();
    } catch (e) {
        console.error('Error fetching clients or users for job modal:', e);
    }

    window.cachedClientsForNewJob = clients || [];
    window.cachedUsersForNewJob = users || [];

    const clientOptions = (clients || []).map(c => `
        <option value="${c.id}" ${preSelectedClientId === c.id ? 'selected' : ''}>${escHtml(c.company_name)}</option>
    `).join('');

    const amUsers = (users || []).filter(u => ['AccountManager', 'Management', 'Admin'].includes(u.role) || !u.role);
    const amOptions = (amUsers.length > 0 ? amUsers : users || []).map(u => `
        <option value="${u.id}" data-email="${escHtml(u.email || '')}">${escHtml(u.name)} (${escHtml(u.role || 'AM')})</option>
    `).join('');

    const tlUsers = (users || []).filter(u => ['TeamLead', 'Management', 'Admin'].includes(u.role));
    const tlOptions = (tlUsers.length > 0 ? tlUsers : users || []).map(u => `
        <option value="${u.id}">${escHtml(u.name)} (${escHtml(u.role || 'TL')})</option>
    `).join('');

    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:820px; max-height:92vh; overflow-y:auto; padding:28px; background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:12px; box-shadow:0 25px 60px rgba(0,0,0,0.6);">
            <!-- Modal Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:14px;">
                <div>
                    <h2 style="margin:0; font-size:1.35rem; color:white; font-weight:800; display:flex; align-items:center; gap:8px;">
                        <span>💼</span> Create New Job Requisition
                    </h2>
                    <div style="font-size:0.8rem; color:#94a3b8; margin-top:3px;">
                        Capture full attribution: Client Account ➔ Client Spoke Person ➔ Account Manager ➔ Assigned TL
                    </div>
                </div>
                <button type="button" class="btn-outline" style="width:auto; padding:6px 14px;" onclick="document.getElementById('add-job-requisition-modal').style.display='none'">✕ Cancel</button>
            </div>

            <form onsubmit="submitNewJobRequisition(event)" style="display:flex; flex-direction:column; gap:16px;">
                
                <!-- SECTION 1: Client & Spoke Attribution Card -->
                <div style="background:rgba(15,23,42,0.6); border:1px solid rgba(59,130,246,0.25); border-radius:10px; padding:16px;">
                    <div style="font-size:0.82rem; font-weight:800; color:#60a5fa; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
                        <span>🏢 Client & Spoke Person Attribution</span>
                        <span style="font-size:0.75rem; color:#94a3b8; font-weight:normal; text-transform:none;">Who released this job role?</span>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
                        <!-- Client Dropdown -->
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1;">Client Account *</label>
                                <span style="font-size:0.72rem; color:#38bdf8; cursor:pointer;" onclick="openAddClientModal()">+ Onboard Client</span>
                            </div>
                            <select id="new-job-client" required onchange="onNewJobClientChange()" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px; font-size:0.88rem;">
                                <option value="">-- Select Client Account * --</option>
                                ${clientOptions}
                            </select>
                        </div>

                        <!-- Spoke Person Dropdown + Add Spoke Button -->
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1;">Client Spoke Person (Hiring Lead) *</label>
                                <button type="button" class="btn-outline" style="padding:2px 8px; font-size:0.72rem; color:#34d399; border-color:rgba(16,185,129,0.4);" onclick="toggleInlineAddSpokeDrawer()">
                                    ➕ Quick Add Spoke
                                </button>
                            </div>
                            <select id="new-job-spoke" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px; font-size:0.88rem;" ${!preSelectedClientId ? 'disabled' : ''}>
                                <option value="">-- Select Client Account First --</option>
                            </select>
                        </div>
                    </div>

                    <!-- Inline Quick-Add Spoke Drawer (Initially Hidden) -->
                    <div id="inline-add-spoke-drawer" style="display:none; margin-top:14px; background:#0b1329; border:1px solid #10b981; border-radius:8px; padding:16px; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="font-size:0.85rem; font-weight:700; color:#34d399; display:flex; align-items:center; gap:6px;">
                                <span>👤</span> Quick Add Spoke Person for: <strong id="inline-spoke-client-name" style="color:white;">Client</strong>
                            </div>
                            <button type="button" style="background:none; border:none; color:#94a3b8; font-size:1rem; cursor:pointer;" onclick="toggleInlineAddSpokeDrawer(false)">✕</button>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:0.75rem; color:#cbd5e1; display:block; margin-bottom:2px;">Spoke Full Name *</label>
                                <input type="text" id="inline-spoke-name" placeholder="e.g. Sarah Connor" style="width:100%; box-sizing:border-box; padding:8px; font-size:0.85rem;">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#cbd5e1; display:block; margin-bottom:2px;">Spoke Work Email *</label>
                                <input type="email" id="inline-spoke-email" placeholder="sarah@client.com" style="width:100%; box-sizing:border-box; padding:8px; font-size:0.85rem;">
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                            <div>
                                <label style="font-size:0.75rem; color:#cbd5e1; display:block; margin-bottom:2px;">Role / Designation</label>
                                <input type="text" id="inline-spoke-role" placeholder="e.g. Director of Engineering / Tech Lead" style="width:100%; box-sizing:border-box; padding:8px; font-size:0.85rem;">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#cbd5e1; display:block; margin-bottom:2px;">Phone Number (Optional)</label>
                                <input type="text" id="inline-spoke-phone" placeholder="+1 (555) 019-2831" style="width:100%; box-sizing:border-box; padding:8px; font-size:0.85rem;">
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:8px;">
                            <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.8rem;" onclick="toggleInlineAddSpokeDrawer(false)">Cancel</button>
                            <button type="button" id="btn-submit-inline-spoke" class="btn-primary" style="padding:6px 16px; font-size:0.8rem; background:#10b981; font-weight:700;" onclick="submitInlineSpoke(event)">
                                💾 Save & Assign Spoke
                            </button>
                        </div>
                    </div>

                    <!-- AM & Intake Source Row -->
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06);">
                        <div>
                            <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Received by AM</label>
                            <select id="new-job-am" onchange="onNewJobAmChange()" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px; font-size:0.85rem;">
                                <option value="">Select Account Manager...</option>
                                ${amOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Intake Channel / Source</label>
                            <select id="new-job-channel" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px; font-size:0.85rem;">
                                <option value="email">Email from Client Spoke</option>
                                <option value="direct_call">Direct Call / Meeting</option>
                                <option value="vms_portal">Client VMS / ATS Portal</option>
                                <option value="referral">AM Referral / Network</option>
                                <option value="manual">Manual Entry</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">AM Ingestion / Mail Box</label>
                            <input type="text" id="new-job-am-email" placeholder="am@myrecruiter.com" style="width:100%; box-sizing:border-box; padding:10px; font-size:0.85rem;">
                        </div>
                    </div>
                </div>

                <!-- SECTION 2: Role Details -->
                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Role Title *</label>
                    <input type="text" id="new-job-title" placeholder="e.g. Senior Full Stack React & Node Engineer" required style="width:100%; box-sizing:border-box; padding:10px; font-size:0.95rem;">
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Location</label>
                        <input type="text" id="new-job-location" placeholder="e.g. New York, NY (or Remote)" style="width:100%; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Work Mode</label>
                        <select id="new-job-workmode" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px;">
                            <option value="Remote">Remote</option>
                            <option value="Hybrid">Hybrid</option>
                            <option value="Onsite">Onsite</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Job Type</label>
                        <select id="new-job-type" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px;">
                            <option value="Permanent">Permanent</option>
                            <option value="Contract (C2C)">Contract (C2C)</option>
                            <option value="Contract (W2)">Contract (W2)</option>
                        </select>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Salary / Rate Range</label>
                        <input type="text" id="new-job-salary" placeholder="e.g. $140k - $160k" style="width:100%; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Assigned Team Lead (TL QC)</label>
                        <select id="new-job-tl" style="width:100%; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px;">
                            <option value="">-- Unassigned (Open Queue) --</option>
                            ${tlOptions}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Target Submissions</label>
                        <input type="number" id="new-job-target-subs" value="5" min="1" max="50" style="width:100%; box-sizing:border-box;">
                    </div>
                </div>

                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Job Description & Mandatory Skills</label>
                    <textarea id="new-job-desc" rows="4" placeholder="Paste job description, responsibilities, and required tech stack..." style="width:100%; box-sizing:border-box; background:#0f172a; color:white; border:1px solid #334155; border-radius:6px; padding:10px;"></textarea>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px; border-top:1px solid rgba(255,255,255,0.08); padding-top:14px;">
                    <button type="button" class="btn-outline" style="width:auto; padding:10px 18px;" onclick="document.getElementById('add-job-requisition-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn-primary" style="width:auto; padding:10px 24px; font-weight:700; background:#3b82f6;">Create Requisition</button>
                </div>
            </form>
        </div>
    `;
    modal.style.display = 'flex';

    // If preSelectedClientId, trigger change event to populate spokes
    if (preSelectedClientId) {
        window.onNewJobClientChange();
    }
};

window.submitNewJobRequisition = async function(e) {
    e.preventDefault();
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    const clientId = document.getElementById('new-job-client')?.value;
    const spokeId = document.getElementById('new-job-spoke')?.value;
    const tlSelect = document.getElementById('new-job-tl');

    const payload = {
        title: document.getElementById('new-job-title').value.trim(),
        client_id: clientId || null,
        spoke_person_id: spokeId || null,
        location: document.getElementById('new-job-location').value.trim(),
        workMode: document.getElementById('new-job-workmode').value,
        jobType: document.getElementById('new-job-type').value,
        salary_range: document.getElementById('new-job-salary').value.trim(),
        description: document.getElementById('new-job-desc').value.trim(),
        source_type: document.getElementById('new-job-channel')?.value || 'email',
        source_am_email: document.getElementById('new-job-am-email')?.value.trim() || null,
        assigned_tl_id: tlSelect?.value || null,
        target_submissions: parseInt(document.getElementById('new-job-target-subs')?.value) || 5,
        created_by_user_id: user?.id || null,
        created_by_name: user?.name || 'Recruiter/AM',
        created_by_role: user?.role || 'Recruiter'
    };

    try {
        const res = await fetch('/api/ats/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast('success', `Requisition ${data.job?.job_code || ''} created successfully!`);
            document.getElementById('add-job-requisition-modal').style.display = 'none';
            if (typeof window.loadDetailedJobs === 'function') window.loadDetailedJobs();
            if (typeof window.loadDetailedClients === 'function') window.loadDetailedClients();
        } else {
            alert('Failed to create job: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        alert('Network error creating job: ' + err.message);
    }
};

window.openAddClientModal = function() {
    let modal = document.getElementById('add-client-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-client-modal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:600px; padding:28px; background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:12px; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
                <h2 style="margin:0; font-size:1.35rem; color:white; font-weight:800;">
                    🏢 Onboard New Enterprise Client
                </h2>
                <button type="button" class="btn-outline" style="width:auto; padding:6px 14px;" onclick="document.getElementById('add-client-modal').style.display='none'">✕ Cancel</button>
            </div>

            <form onsubmit="submitNewClientAccount(event)" style="display:flex; flex-direction:column; gap:14px;">
                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Company Name *</label>
                    <input type="text" id="new-client-name" placeholder="e.g. Acme Health Technologies" required style="width:100%; box-sizing:border-box;">
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Industry</label>
                        <input type="text" id="new-client-industry" placeholder="e.g. Healthcare FinTech" style="width:100%; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Headquarters Location</label>
                        <input type="text" id="new-client-location" placeholder="e.g. San Francisco, CA" style="width:100%; box-sizing:border-box;">
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Website URL</label>
                        <input type="text" id="new-client-website" placeholder="https://acmehealth.com" style="width:100%; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Billing Terms</label>
                        <input type="text" id="new-client-terms" placeholder="Net 30 / Net 45" value="Net 30" style="width:100%; box-sizing:border-box;">
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                    <button type="button" class="btn-outline" style="width:auto; padding:10px 18px;" onclick="document.getElementById('add-client-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn-primary" style="width:auto; padding:10px 22px; font-weight:700; background:#10b981;">Save Client</button>
                </div>
            </form>
        </div>
    `;
    modal.style.display = 'flex';
};

window.submitNewClientAccount = async function(e) {
    e.preventDefault();
    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    const payload = {
        company_name: document.getElementById('new-client-name').value.trim(),
        industry: document.getElementById('new-client-industry').value.trim(),
        location: document.getElementById('new-client-location').value.trim(),
        website: document.getElementById('new-client-website').value.trim(),
        billing_terms: document.getElementById('new-client-terms').value.trim(),
        account_manager_id: user?.id || null,
        created_by_user_id: user?.id || null,
        created_by_name: user?.name || 'Account Manager',
        created_by_role: user?.role || 'AccountManager'
    };

    try {
        const res = await fetch('/api/ats/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast('success', `Client ${data.client?.company_name} onboarded!`);
            document.getElementById('add-client-modal').style.display = 'none';
            if (typeof window.loadDetailedClients === 'function') window.loadDetailedClients();
        } else {
            alert('Failed: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
};

window.openAddSpokeModal = function(clientId, clientName) {
    let modal = document.getElementById('add-spoke-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'add-spoke-modal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:550px; padding:26px; background:#1e293b; border:1px solid rgba(255,255,255,0.15); border-radius:12px; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
                <div>
                    <h2 style="margin:0; font-size:1.25rem; color:white; font-weight:800;">
                        👤 Add Spoke Person (Hiring Lead)
                    </h2>
                    <div style="font-size:0.8rem; color:#60a5fa; margin-top:2px;">For Client: ${escHtml(clientName)}</div>
                </div>
                <button type="button" class="btn-outline" style="width:auto; padding:6px 12px;" onclick="document.getElementById('add-spoke-modal').style.display='none'">✕</button>
            </div>

            <form onsubmit="submitNewSpokePerson(event, '${clientId}')" style="display:flex; flex-direction:column; gap:12px;">
                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Contact Name *</label>
                    <input type="text" id="new-spoke-name" placeholder="e.g. Sarah Connor" required style="width:100%; box-sizing:border-box;">
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Email Address *</label>
                        <input type="email" id="new-spoke-email" placeholder="sarah@client.com" required style="width:100%; box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Phone Number</label>
                        <input type="text" id="new-spoke-phone" placeholder="+1 (555) 019-2831" style="width:100%; box-sizing:border-box;">
                    </div>
                </div>

                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#cbd5e1; display:block; margin-bottom:4px;">Role / Designation</label>
                    <input type="text" id="new-spoke-role" placeholder="e.g. Director of Engineering / Tech Recruiter" style="width:100%; box-sizing:border-box;">
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                    <button type="button" class="btn-outline" style="width:auto; padding:8px 16px;" onclick="document.getElementById('add-spoke-modal').style.display='none'">Cancel</button>
                    <button type="submit" class="btn-primary" style="width:auto; padding:8px 20px; font-weight:700; background:#10b981;">Save Spoke Contact</button>
                </div>
            </form>
        </div>
    `;
    modal.style.display = 'flex';
};

window.submitNewSpokePerson = async function(e, clientId) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('new-spoke-name').value.trim(),
        email: document.getElementById('new-spoke-email').value.trim(),
        phone: document.getElementById('new-spoke-phone').value.trim(),
        role_title: document.getElementById('new-spoke-role').value.trim()
    };

    try {
        const res = await fetch(`/api/ats/clients/${clientId}/spokes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast('success', `Added Spoke: ${payload.name}!`);
            document.getElementById('add-spoke-modal').style.display = 'none';
            if (typeof window.loadDetailedClients === 'function') window.loadDetailedClients();
        } else {
            alert('Error: ' + (data.error || 'Server error'));
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
};

// =========================================================================
// 6. REAL-TIME MANAGEMENT ANALYTICS & AUDIT STREAM CONTROLLER
// =========================================================================
window.loadManagementAnalytics = async function() {
    try {
        const res = await fetch('/api/analytics/management');
        const data = await res.json();

        if (data && !data.error) {
            const totalClients = data.totalClients ?? 0;
            const totalSpokes = data.totalSpokes ?? 0;
            const totalLiveRoles = data.totalLiveRoles ?? 0;
            const totalSubmissions = data.totalSubmissions ?? 0;
            const interviewsDone = data.interviewsDone ?? 0;
            const selectionsDone = data.selectionsDone ?? 0;
            const offersReleased = data.offersReleased ?? 0;
            const totalJoined = data.totalJoined ?? 0;
            const totalBackouts = data.totalBackouts ?? 0;
            const backoutRatio = data.backoutRatio ?? 0;

            const grid = document.getElementById('mgmt-kpi-grid');
            if (grid) {
                grid.innerHTML = `
                    <div class="stat-card" style="border-left:4px solid #3b82f6;">
                        <div class="stat-val" style="color:#60a5fa;">${totalClients}</div>
                        <div class="stat-label">Total Clients</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Active client accounts</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #a855f7;">
                        <div class="stat-val" style="color:#c084fc;">${totalSpokes}</div>
                        <div class="stat-label">Total Spokes</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Client SPOC contacts</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #10b981;">
                        <div class="stat-val" style="color:#34d399;">${totalLiveRoles}</div>
                        <div class="stat-label">Live Roles</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Active requisitions</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #38bdf8;">
                        <div class="stat-val" style="color:#38bdf8;">${totalSubmissions}</div>
                        <div class="stat-label">Submissions</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Total candidates submitted</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #f59e0b;">
                        <div class="stat-val" style="color:#fbbf24;">${interviewsDone}</div>
                        <div class="stat-label">Interviews Done</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Completed client rounds</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #6366f1;">
                        <div class="stat-val" style="color:#818cf8;">${selectionsDone}</div>
                        <div class="stat-label">Selections Done</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Shortlisted candidates</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #8b5cf6;">
                        <div class="stat-val" style="color:#a78bfa;">${offersReleased}</div>
                        <div class="stat-label">Offers Released</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Pending acceptance</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #10b981;">
                        <div class="stat-val" style="color:#34d399;">${totalJoined}</div>
                        <div class="stat-label">Total Joined</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Successful placements</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #ef4444;">
                        <div class="stat-val" style="color:#f87171;">${totalBackouts}</div>
                        <div class="stat-label">Total Backouts</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Candidate withdrawals</div>
                    </div>
                    <div class="stat-card" style="border-left:4px solid #f43f5e;">
                        <div class="stat-val" style="color:#fb7185;">${backoutRatio}%</div>
                        <div class="stat-label">Backout Ratio</div>
                        <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Of released offers</div>
                    </div>
                `;
            }

            // Team Lead Performance Table
            const tlBody = document.getElementById('mgmt-tl-tbody');
            if (tlBody) {
                if (Array.isArray(data.teamLeadPerformance) && data.teamLeadPerformance.length > 0) {
                    tlBody.innerHTML = data.teamLeadPerformance.map(tl => `
                        <tr>
                            <td style="font-weight:700; color:#f8fafc;">
                                <div>${escHtml(tl.tl_name)}</div>
                                <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">${escHtml(tl.tl_email)}</div>
                            </td>
                            <td>
                                <span title="${escHtml((tl.team_members || []).join(', ') || 'No assigned recruiters')}" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); padding:4px 12px; border-radius:12px; font-size:0.82rem; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                                    👥 ${(tl.team_members_count != null ? tl.team_members_count : (tl.team_members ? tl.team_members.length : 0))} ${(tl.team_members_count === 1 || (tl.team_members && tl.team_members.length === 1)) ? 'Member' : 'Members'}
                                </span>
                            </td>
                            <td style="font-weight:700; color:#38bdf8;">${tl.submissions ?? 0}</td>
                            <td style="color:#fbbf24; font-weight:600;">${tl.interviews ?? 0}</td>
                            <td style="color:#818cf8; font-weight:600;">${tl.selections ?? 0}</td>
                            <td style="color:#a78bfa; font-weight:600;">${tl.offers ?? 0}</td>
                            <td style="color:#34d399; font-weight:800;">${tl.joinings ?? 0}</td>
                            <td style="color:#f87171; font-weight:800;">${tl.backouts ?? 0}</td>
                        </tr>
                    `).join('');
                } else {
                    tlBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; opacity:0.6;">No Team Lead data available.</td></tr>';
                }
            }

            // Account Manager Performance Table
            const amBody = document.getElementById('mgmt-am-tbody');
            if (amBody) {
                if (Array.isArray(data.amPerformance) && data.amPerformance.length > 0) {
                    const seenAmRows = new Set();
                    const uniqueAmPerformance = data.amPerformance.filter(am => {
                        const key = `${(am.client_name || '').trim().toLowerCase()}:::${(am.spoke_name || '').trim().toLowerCase()}`;
                        if (seenAmRows.has(key)) return false;
                        seenAmRows.add(key);
                        return true;
                    });
                    amBody.innerHTML = uniqueAmPerformance.map(am => `
                        <tr>
                            <td style="font-weight:700; color:#f8fafc;">${escHtml(am.am_name)}</td>
                            <td style="font-weight:700; color:#e2e8f0;">${escHtml(am.client_name)}</td>
                            <td style="color:#cbd5e1;">${escHtml(am.spoke_name || 'General Spoke')}</td>
                            <td>
                                <span style="background:rgba(236,72,153,0.15); color:#f472b6; border:1px solid rgba(236,72,153,0.3); padding:3px 10px; border-radius:12px; font-weight:700; font-size:0.8rem;">
                                    ${am.roles_received ?? 0}
                                </span>
                            </td>
                            <td style="font-weight:700; color:#38bdf8;">${am.submissions ?? 0}</td>
                            <td style="color:#fbbf24; font-weight:600;">${am.interviews ?? 0}</td>
                            <td style="color:#818cf8; font-weight:600;">${am.selections ?? 0}</td>
                            <td style="color:#a78bfa; font-weight:600;">${am.offers ?? 0}</td>
                            <td style="color:#34d399; font-weight:800;">${am.joinings ?? 0}</td>
                            <td style="color:#f87171; font-weight:800;">${am.backouts ?? 0}</td>
                        </tr>
                    `).join('');
                } else {
                    amBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; opacity:0.6;">No Account Manager data available.</td></tr>';
                }
            }

            // Recruiter Performance Table (8 columns: Recruiter, Assigned TL, Submissions, Interviews, Selections, Offers, Joinings, Backouts)
            const recBody = document.getElementById('mgmt-recruiter-tbody');
            if (recBody) {
                if (Array.isArray(data.recruiterPerformance) && data.recruiterPerformance.length > 0) {
                    recBody.innerHTML = data.recruiterPerformance.map(r => `
                        <tr>
                            <td style="font-weight:700; color:#f8fafc;">
                                <div>${escHtml(r.recruiter_name)}</div>
                                <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">${escHtml(r.recruiter_email)}</div>
                            </td>
                            <td>
                                <span style="background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3); padding:3px 10px; border-radius:12px; font-size:0.8rem; font-weight:600;">
                                    ${escHtml(r.tl_name || 'Unassigned')}
                                </span>
                            </td>
                            <td style="font-weight:700; color:#38bdf8;">${r.submissions ?? 0}</td>
                            <td style="color:#fbbf24; font-weight:600;">${r.interviews ?? 0}</td>
                            <td style="color:#818cf8; font-weight:600;">${r.selections ?? 0}</td>
                            <td style="color:#a78bfa; font-weight:600;">${r.offers ?? 0}</td>
                            <td style="color:#34d399; font-weight:800;">${r.joinings ?? 0}</td>
                            <td style="color:#f87171; font-weight:800;">${r.backouts ?? 0}</td>
                        </tr>
                    `).join('');
                } else {
                    recBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; opacity:0.6;">No recruiter activity logged yet.</td></tr>';
                }
            }
        } else {
            console.error('loadManagementAnalytics error from server:', data?.error);
        }

        // Client & Spoke Live Pipeline Table (11-stage matrix)
        try {
            const pipeRes = await fetch('/api/management/pipeline');
            const pipeData = await pipeRes.json();
            const pipeBody = document.getElementById('mgmt-pipeline-tbody');

            if (pipeBody && pipeData && Array.isArray(pipeData.data) && pipeData.data.length > 0) {
                pipeBody.innerHTML = pipeData.data.map(p => `
                    <tr>
                        <td style="font-weight:700; color:#f8fafc;">
                            ${escHtml(p.company_name)} 
                            <span style="font-weight:normal; color:#94a3b8; font-size:0.8rem;">(${escHtml(p.spoke_name || 'Default Spoke')})</span>
                        </td>
                        <td style="font-weight:600;">${p.roles_count}</td>
                        <td style="font-weight:700; color:#38bdf8;">${p.submissions_count}</td>
                        <td style="color:#fbbf24;">${p.interviews_count}</td>
                        <td style="color:#f87171;">${p.interviews_rejected_count}</td>
                        <td style="color:#818cf8;">${p.selections_count}</td>
                        <td style="color:#a78bfa;">${p.offers_released_count}</td>
                        <td style="color:#34d399;">${p.offer_accepted_count}</td>
                        <td style="color:#f87171;">${p.offer_rejected_count}</td>
                        <td style="color:#f87171;">${p.backout_count}</td>
                        <td style="color:#94a3b8;">${p.backout_stage_count}</td>
                        <td style="color:#34d399; font-weight:800;">${p.joined_count}</td>
                        <td style="color:#38bdf8;">${p.invoice_raised_count}</td>
                        <td style="color:#e2e8f0;">${p.paid_pending_count}</td>
                    </tr>
                `).join('');
            } else if (pipeBody) {
                pipeBody.innerHTML = '<tr><td colspan="14" style="text-align:center; padding:20px; opacity:0.6;">No pipeline data available.</td></tr>';
            }
        } catch (pipeErr) {
            console.warn('Failed to load management pipeline:', pipeErr);
        }

    } catch (e) {
        console.error('loadManagementAnalytics error:', e);
    }
};

// ====================================================================
// 20. ATS: SCAN LOCAL RESUMES & CANDIDATE MATCH ENGINE
// ====================================================================

window.currentScannedMatches = [];
window.currentScanFilter = 'all';
window.currentPreviewedFilePath = '';

window.loadScanLocalResumesView = async function() {
    try {
        // 1. Fetch current folder info
        const folderRes = await fetch('/api/ats/local-resumes/folder');
        const folderData = await folderRes.json();
        
        const folderInput = document.getElementById('local-scan-folder-input');
        if (folderInput && folderData.folderPath) {
            folderInput.value = folderData.folderPath;
        }

        const statFound = document.getElementById('scan-stat-found');
        if (statFound) {
            statFound.innerText = folderData.fileCount || 0;
        }

        const statusText = document.getElementById('local-scan-status-text');
        if (statusText) {
            if (folderData.exists) {
                statusText.innerHTML = `📁 Ready. Found <b>${folderData.fileCount || 0}</b> CV documents in folder.`;
                statusText.style.color = '#38bdf8';
            } else {
                statusText.innerHTML = `⚠️ Directory not found. Please browse or specify a valid folder path.`;
                statusText.style.color = '#f59e0b';
            }
        }

        // 2. Fetch active detailed jobs to populate Job selection dropdown & quick pick pills
        const jobSelect = document.getElementById('local-scan-job-select');
        const quickRolesContainer = document.getElementById('local-scan-quick-roles');
        const jobsBadge = document.getElementById('scan-active-jobs-badge');

        try {
            let jobs = [];
            const jobsDetailedRes = await fetch('/api/ats/jobs/detailed');
            if (jobsDetailedRes.ok) {
                jobs = await jobsDetailedRes.json();
            }
            if (!Array.isArray(jobs) || jobs.length === 0) {
                const fallbackRes = await fetch('/api/jobs');
                if (fallbackRes.ok) jobs = await fallbackRes.json();
            }

            const activeJobs = (Array.isArray(jobs) ? jobs : []).filter(j => j.status !== 'archived' && j.status !== 'deleted');
            window.allScanActiveJobs = activeJobs;

            if (jobsBadge) {
                jobsBadge.innerText = `${activeJobs.length} Live Open Role${activeJobs.length === 1 ? '' : 's'}`;
            }

            if (jobSelect) {
                let html = '<option value="">-- Choose a Live Job Requisition (or leave blank for custom keyword search) --</option>';
                activeJobs.forEach(j => {
                    const code = j.job_code || ('REQ-' + String(j.id).slice(-4));
                    const company = j.client_name || j.company || 'Direct';
                    const title = j.title || 'Untitled Role';
                    const skills = j.skills || j.mandatory_skills || (j.description ? j.description.substring(0, 150) : '');
                    const location = j.location || 'Remote';
                    const workmode = j.workmode || j.workMode || 'Onsite';
                    const salary = j.salary_range || 'Competitive';

                    html += `<option value="${j.id}" 
                        data-id="${j.id}"
                        data-code="${encodeURIComponent(code)}" 
                        data-title="${encodeURIComponent(title)}" 
                        data-company="${encodeURIComponent(company)}" 
                        data-skills="${encodeURIComponent(skills)}" 
                        data-location="${encodeURIComponent(location)}" 
                        data-workmode="${encodeURIComponent(workmode)}" 
                        data-salary="${encodeURIComponent(salary)}">
                        🎯 ${code}: ${title} — ${company} (${workmode})
                    </option>`;
                });
                jobSelect.innerHTML = html;
            }

            // Populate Quick Pick Role Chips
            if (quickRolesContainer) {
                if (activeJobs.length === 0) {
                    quickRolesContainer.innerHTML = '<span style="font-size:0.8rem; color:#64748b; font-style:italic;">No live requisitions found in ATS.</span>';
                } else {
                    quickRolesContainer.innerHTML = activeJobs.map(j => {
                        const code = j.job_code || ('REQ-' + String(j.id).slice(-4));
                        const company = j.client_name || j.company || 'Direct';
                        const title = j.title || 'Untitled Role';
                        return `
                            <button type="button" class="quick-role-pill" id="quick-role-btn-${j.id}" 
                                style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#e2e8f0; font-size:0.78rem; font-weight:600; padding:5px 12px; border-radius:16px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s ease;"
                                onclick="selectScanJobById('${j.id}')">
                                <span>🏢</span> <strong>${escHtml(company)}</strong>: ${escHtml(title)}
                            </button>
                        `;
                    }).join('');
                }
            }

        } catch (jobErr) {
            console.warn('Failed to load jobs for local scan:', jobErr);
            if (jobsBadge) jobsBadge.innerText = 'Error loading roles';
        }

    } catch (e) {
        console.error('loadScanLocalResumesView error:', e);
    }
};

window.handleLocalScanFolderSelected = function(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let detectedDir = '';
    // In Electron, File objects have a .path property with the full local path
    if (files[0].path) {
        const fullPath = files[0].path;
        // Strip filename to get directory path
        const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
        if (lastSlash > 0) {
            detectedDir = fullPath.substring(0, lastSlash);
        }
    }

    if (detectedDir) {
        const folderInput = document.getElementById('local-scan-folder-input');
        if (folderInput) folderInput.value = detectedDir;
        
        const statFound = document.getElementById('scan-stat-found');
        if (statFound) statFound.innerText = files.length;

        const statusText = document.getElementById('local-scan-status-text');
        if (statusText) {
            statusText.innerHTML = `📁 Selected folder: <b>${detectedDir}</b> (${files.length} files detected).`;
            statusText.style.color = '#10b981';
        }

        if (typeof window.showToast === 'function') {
            window.showToast('success', `Selected folder: ${detectedDir}`);
        }
    } else {
        const statusText = document.getElementById('local-scan-status-text');
        if (statusText) {
            statusText.innerHTML = `📁 Selected ${files.length} files.`;
        }
    }
};

window.saveLocalScanFolder = async function() {
    const folderInput = document.getElementById('local-scan-folder-input');
    const folderPath = folderInput ? folderInput.value.trim() : '';

    if (!folderPath) {
        alert('Please enter or select a folder path first.');
        return;
    }

    try {
        const res = await fetch('/api/ats/local-resumes/save-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof window.showToast === 'function') {
                window.showToast('success', 'Default local resume directory saved!');
            } else {
                alert('Default folder saved successfully!');
            }
        } else {
            alert('Failed to save: ' + (data.error || 'Server error'));
        }
    } catch (e) {
        console.error('saveLocalScanFolder error:', e);
        alert('Failed to save folder path.');
    }
};

window.openCurrentScanFolder = function() {
    const folderInput = document.getElementById('local-scan-folder-input');
    const folderPath = folderInput ? folderInput.value.trim() : '';
    if (!folderPath) {
        alert('No folder path specified.');
        return;
    }
    // Attempt to open via /api/open-file or notify
    fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: folderPath })
    }).catch(e => console.warn('Cannot open folder directly:', e));
};

window.selectScanJobById = function(jobId) {
    const jobSelect = document.getElementById('local-scan-job-select');
    if (jobSelect) {
        jobSelect.value = jobId;
        window.onLocalScanJobChanged();
    }
};

window.onLocalScanJobChanged = function() {
    const jobSelect = document.getElementById('local-scan-job-select');
    const selectedOption = jobSelect ? jobSelect.options[jobSelect.selectedIndex] : null;
    const banner = document.getElementById('local-scan-selected-job-banner');
    const oldInfo = document.getElementById('local-scan-selected-job-info');
    const labelSpan = document.getElementById('local-scan-job-label');

    // Highlight active quick role pill
    document.querySelectorAll('.quick-role-pill').forEach(btn => {
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.borderColor = 'rgba(255,255,255,0.15)';
        btn.style.color = '#e2e8f0';
    });

    if (selectedOption && selectedOption.value) {
        const jobId = selectedOption.value;
        const code = decodeURIComponent(selectedOption.getAttribute('data-code') || 'REQ');
        const title = decodeURIComponent(selectedOption.getAttribute('data-title') || '');
        const company = decodeURIComponent(selectedOption.getAttribute('data-company') || '');
        const skills = decodeURIComponent(selectedOption.getAttribute('data-skills') || '');
        const location = decodeURIComponent(selectedOption.getAttribute('data-location') || 'Remote');
        const workmode = decodeURIComponent(selectedOption.getAttribute('data-workmode') || 'Onsite');
        const salary = decodeURIComponent(selectedOption.getAttribute('data-salary') || 'Competitive');

        // Highlight selected quick role button
        const activeBtn = document.getElementById('quick-role-btn-' + jobId);
        if (activeBtn) {
            activeBtn.style.background = 'rgba(139,92,246,0.3)';
            activeBtn.style.borderColor = '#8b5cf6';
            activeBtn.style.color = '#c084fc';
        }

        // Fill Banner
        const codeEl = document.getElementById('selected-role-code');
        const titleEl = document.getElementById('selected-role-title');
        const companyEl = document.getElementById('selected-role-company');
        const locEl = document.getElementById('selected-role-location');
        const modeEl = document.getElementById('selected-role-workmode');
        const salEl = document.getElementById('selected-role-salary');
        const skillsBox = document.getElementById('selected-role-skills-container');

        if (codeEl) codeEl.innerText = code;
        if (titleEl) titleEl.innerText = title;
        if (companyEl) companyEl.innerText = `(${company})`;
        if (locEl) locEl.innerText = location;
        if (modeEl) modeEl.innerText = workmode;
        if (salEl) salEl.innerText = salary;

        if (skillsBox) {
            if (skills) {
                const skillTags = skills.split(/[,;\n|]+/).map(s => s.trim()).filter(Boolean);
                skillsBox.innerHTML = skillTags.map(s => `
                    <span style="font-size:0.75rem; background:rgba(59,130,246,0.18); color:#60a5fa; border:1px solid rgba(59,130,246,0.35); padding:3px 8px; border-radius:12px; font-weight:600;">
                        ${escHtml(s)}
                    </span>
                `).join('');
            } else {
                skillsBox.innerHTML = '<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">Target skills derived automatically from job description.</span>';
            }
        }

        if (banner) banner.style.display = 'block';
        if (oldInfo) oldInfo.style.display = 'block';
        if (labelSpan) labelSpan.innerText = `${title} (${company})`;

        // Auto-suggest skills in query input placeholder
        const queryInput = document.getElementById('local-scan-query-input');
        if (queryInput && !queryInput.value && skills) {
            queryInput.placeholder = `Target skills: ${skills.split(/[,;]/).slice(0, 4).join(', ')}`;
        }
    } else {
        if (banner) banner.style.display = 'none';
        if (oldInfo) oldInfo.style.display = 'none';
        const queryInput = document.getElementById('local-scan-query-input');
        if (queryInput) queryInput.placeholder = 'e.g. React, Node.js, AWS, Kubernetes';
    }
};

window.autoFillSelectedJobSkills = function() {
    const jobSelect = document.getElementById('local-scan-job-select');
    const selectedOption = jobSelect ? jobSelect.options[jobSelect.selectedIndex] : null;
    if (!selectedOption || !selectedOption.value) {
        alert('Please choose a role first.');
        return;
    }
    const skills = decodeURIComponent(selectedOption.getAttribute('data-skills') || '');
    const queryInput = document.getElementById('local-scan-query-input');
    if (queryInput && skills) {
        queryInput.value = skills.split(/[,;\n|]+/).map(s => s.trim()).filter(Boolean).slice(0, 6).join(', ');
        if (typeof window.showToast === 'function') {
            window.showToast('info', 'Skills auto-filled into keyword filter');
        }
    }
};

window.openScanForJob = function(jobId) {
    if (typeof switchAtsView === 'function') {
        switchAtsView('scan-resumes');
    }
    setTimeout(() => {
        if (typeof selectScanJobById === 'function') selectScanJobById(jobId);
        else if (typeof window.selectScanJobById === 'function') window.selectScanJobById(jobId);
        const scanBtn = document.getElementById('btn-run-local-scan');
        if (scanBtn) scanBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
};

window.runLocalResumeScan = async function() {
    const folderInput = document.getElementById('local-scan-folder-input');
    const folderPath = folderInput ? folderInput.value.trim() : '';

    const jobSelect = document.getElementById('local-scan-job-select');
    const jobId = jobSelect ? jobSelect.value : '';

    const queryInput = document.getElementById('local-scan-query-input');
    const query = queryInput ? queryInput.value.trim() : '';

    const minScoreSelect = document.getElementById('local-scan-min-score');
    const minScore = minScoreSelect ? parseInt(minScoreSelect.value) || 0 : 0;

    const recursiveCb = document.getElementById('local-scan-recursive');
    const recursive = recursiveCb ? recursiveCb.checked : true;

    const btn = document.getElementById('btn-run-local-scan');
    const statusText = document.getElementById('local-scan-status-text');
    const progressContainer = document.getElementById('local-scan-progress-bar-container');
    const progressBar = document.getElementById('local-scan-progress-bar');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Scanning & Parsing Local Resumes...';
    }

    if (statusText) {
        statusText.innerHTML = '<span class="spinner" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> Reading files, extracting CV text & calculating match scores...';
        statusText.style.color = '#38bdf8';
    }

    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) progressBar.style.width = '35%';

    try {
        const res = await fetch('/api/ats/local-resumes/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderPath,
                jobId,
                query,
                minScore,
                recursive
            })
        });

        if (progressBar) progressBar.style.width = '85%';

        const data = await res.json();

        if (progressBar) progressBar.style.width = '100%';
        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
        }, 600);

        if (!res.ok) {
            alert('Scan error: ' + (data.error || 'Failed to scan directory'));
            if (statusText) {
                statusText.innerHTML = `❌ Error: ${data.error || 'Scan failed'}`;
                statusText.style.color = '#ef4444';
            }
            return;
        }

        window.currentScannedMatches = data.matches || [];

        // Update stats
        const statFound = document.getElementById('scan-stat-found');
        if (statFound) statFound.innerText = data.totalFilesFound || 0;

        const statMatches = document.getElementById('scan-stat-matches');
        if (statMatches) statMatches.innerText = window.currentScannedMatches.length;

        const topMatchesCount = window.currentScannedMatches.filter(m => m.matchScore >= 70).length;
        const statTop = document.getElementById('scan-stat-top');
        if (statTop) statTop.innerText = topMatchesCount;

        const inAtsCount = window.currentScannedMatches.filter(m => m.inAts).length;
        const statInAts = document.getElementById('scan-stat-inats');
        if (statInAts) statInAts.innerText = inAtsCount;

        // Update tab count badges
        const countAll = document.getElementById('scan-count-all');
        if (countAll) countAll.innerText = window.currentScannedMatches.length;

        const countHigh = document.getElementById('scan-count-high');
        if (countHigh) countHigh.innerText = topMatchesCount;

        const countNew = document.getElementById('scan-count-new');
        if (countNew) countNew.innerText = window.currentScannedMatches.filter(m => !m.inAts).length;

        const countInAts = document.getElementById('scan-count-inats');
        if (countInAts) countInAts.innerText = inAtsCount;

        if (statusText) {
            statusText.innerHTML = `✅ Scan complete. Parsed <b>${data.scannedCount}</b> CVs. Found <b>${window.currentScannedMatches.length}</b> matches.`;
            statusText.style.color = '#10b981';
        }

        if (typeof window.showToast === 'function') {
            window.showToast('success', `Found ${window.currentScannedMatches.length} matching candidate CVs!`);
        }

        window.filterScannedResults(window.currentScanFilter || 'all');

    } catch (err) {
        console.error('runLocalResumeScan error:', err);
        alert('Network or server error during local scan.');
        if (statusText) {
            statusText.innerHTML = `❌ Network error`;
            statusText.style.color = '#ef4444';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🚀</span> Scan & Match Local Folder';
        }
    }
};

window.filterScannedResults = function(filterType) {
    window.currentScanFilter = filterType;

    // Update active tab styling
    ['all', 'high', 'new', 'inats'].forEach(t => {
        const tab = document.getElementById('scan-tab-' + t);
        if (tab) {
            if (t === filterType) {
                tab.style.borderColor = '#8b5cf6';
                tab.style.background = 'rgba(139,92,246,0.2)';
                tab.style.color = '#a78bfa';
            } else {
                tab.style.borderColor = 'rgba(255,255,255,0.15)';
                tab.style.background = 'transparent';
                tab.style.color = '#94a3b8';
            }
        }
    });

    window.applyLocalScanFilter();
};

window.applyLocalScanFilter = function() {
    const list = window.currentScannedMatches || [];
    const searchInput = document.getElementById('scan-results-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const sortSelect = document.getElementById('scan-results-sort');
    const sortVal = sortSelect ? sortSelect.value : 'score_desc';

    // 1. Filter by category
    let filtered = list.filter(m => {
        if (window.currentScanFilter === 'high') return m.matchScore >= 70;
        if (window.currentScanFilter === 'new') return !m.inAts;
        if (window.currentScanFilter === 'inats') return !!m.inAts;
        return true;
    });

    // 2. Filter by search term
    if (searchTerm) {
        filtered = filtered.filter(m => {
            const name = (m.candidate?.name || '').toLowerCase();
            const skills = (m.candidate?.skills || []).join(' ').toLowerCase();
            const filename = (m.filename || '').toLowerCase();
            const headline = (m.candidate?.headline || '').toLowerCase();
            return name.includes(searchTerm) || skills.includes(searchTerm) || filename.includes(searchTerm) || headline.includes(searchTerm);
        });
    }

    // 3. Sort
    filtered.sort((a, b) => {
        if (sortVal === 'score_desc') return b.matchScore - a.matchScore;
        if (sortVal === 'name_asc') return (a.candidate?.name || '').localeCompare(b.candidate?.name || '');
        if (sortVal === 'skills_desc') return (b.matchedSkills?.length || 0) - (a.matchedSkills?.length || 0);
        return 0;
    });

    window.renderScannedResults(filtered);
};

window.renderScannedResults = function(matches) {
    const container = document.getElementById('local-scan-results-container');
    if (!container) return;

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:45px 20px; background:rgba(15,23,42,0.4); border:1px dashed rgba(255,255,255,0.15); border-radius:12px;">
                <div style="font-size:2.5rem; margin-bottom:10px;">🔍</div>
                <h3 style="margin:0 0 6px 0; color:#e2e8f0; font-size:1.1rem;">No matching candidate CVs found</h3>
                <p style="margin:0 auto; max-width:480px; color:#94a3b8; font-size:0.85rem; line-height:1.5;">
                    No resumes in this directory matched your active filter criteria. Try lowering the minimum match score, clearing keywords, or selecting another folder.
                </p>
            </div>
        `;
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:16px;">';

    matches.forEach((m) => {
        // Find original index in window.currentScannedMatches
        const originalIndex = window.currentScannedMatches.indexOf(m);

        // Score colors
        let scoreBg = 'linear-gradient(135deg, #10b981, #059669)';
        let scoreColor = '#fff';
        if (m.matchScore >= 80) {
            scoreBg = 'linear-gradient(135deg, #10b981, #059669)';
        } else if (m.matchScore >= 65) {
            scoreBg = 'linear-gradient(135deg, #f59e0b, #d97706)';
        } else {
            scoreBg = 'linear-gradient(135deg, #64748b, #475569)';
        }

        const candidateName = m.candidate?.name || m.filename.replace(/\.[^/.]+$/, '');
        const headline = m.candidate?.headline || 'Candidate Profile';
        const email = m.candidate?.email || 'No email detected';
        const phone = m.candidate?.phone || 'No phone detected';
        const exp = m.candidate?.experience_years ? ` • ⏳ ${m.candidate.experience_years}` : '';

        // In ATS badge
        let atsBadge = `<span style="font-size:0.72rem; padding:3px 8px; border-radius:12px; background:rgba(255,255,255,0.08); color:#94a3b8; border:1px solid rgba(255,255,255,0.15);">⚪ Not in ATS</span>`;
        if (m.inAts) {
            atsBadge = `<span style="font-size:0.72rem; padding:3px 8px; border-radius:12px; background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-weight:700;">🟢 In ATS (${m.existingCandidateCode || m.existingStatus || 'Available'})</span>`;
        }

        // Mandatory Skills Chips
        let mandatoryHtml = '';
        if (m.mandatoryMatched && m.mandatoryMatched.length > 0) {
            mandatoryHtml += m.mandatoryMatched.map(s => `
                <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.4); font-weight:700;">⚡ ${s}</span>
            `).join('');
        }
        let mandatoryMissingHtml = '';
        if (m.mandatoryMissing && m.mandatoryMissing.length > 0) {
            mandatoryMissingHtml += m.mandatoryMissing.map(s => `
                <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); font-weight:700;">✗ ${s}</span>
            `).join('');
        }

        // Nice-to-Have Skills Chips
        let niceHtml = '';
        if (m.niceToHaveMatched && m.niceToHaveMatched.length > 0) {
            niceHtml += m.niceToHaveMatched.map(s => `
                <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">🌟 ${s}</span>
            `).join('');
        }

        // Positives / Green Flags
        const positivesList = m.positives || [];
        let positivesHtml = '';
        if (positivesList.length > 0) {
            positivesHtml = `
                <div style="background:rgba(16,185,129,0.06); border-left:3px solid #10b981; border-radius:6px; padding:6px 12px; margin-bottom:8px;">
                    <div style="font-size:0.73rem; font-weight:700; color:#34d399; margin-bottom:2px;">🟢 Positives (Strengths & Value-Add):</div>
                    <ul style="margin:0; padding-left:16px; font-size:0.73rem; color:#cbd5e1; line-height:1.4;">
                        ${positivesList.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Negatives / Red Flags
        const negativesList = m.negatives || [];
        let negativesHtml = '';
        if (negativesList.length > 0) {
            negativesHtml = `
                <div style="background:rgba(239,68,68,0.06); border-left:3px solid #ef4444; border-radius:6px; padding:6px 12px; margin-bottom:8px;">
                    <div style="font-size:0.73rem; font-weight:700; color:#f87171; margin-bottom:2px;">🔴 Negatives (Risks & Knockout Gaps):</div>
                    <ul style="margin:0; padding-left:16px; font-size:0.73rem; color:#fca5a5; line-height:1.4;">
                        ${negativesList.map(n => `<li>${n}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Probing Questions
        const questionsList = m.probingQuestions || [];
        let questionsHtml = '';
        if (questionsList.length > 0) {
            questionsHtml = `
                <div style="margin-top:6px;">
                    <span style="font-size:0.72rem; color:#fbbf24; font-weight:600; cursor:pointer;" onclick="const d = this.nextElementSibling; d.style.display = d.style.display === 'none' ? 'block' : 'none';">
                        🎯 Interview Probing Questions (${questionsList.length}) ▾
                    </span>
                    <div style="display:none; background:rgba(0,0,0,0.35); border-radius:6px; padding:8px 12px; margin-top:4px; font-size:0.72rem; color:#fde68a; line-height:1.45;">
                        ${questionsList.map((q, idx) => `<div style="margin-bottom:3px;"><strong>${idx+1}.</strong> ${q}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        html += `
            <div class="card" style="background:rgba(30,41,59,0.65); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:18px 20px; transition:transform 0.15s ease, border-color 0.15s ease;" onmouseover="this.style.borderColor='rgba(139,92,246,0.4)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:14px; margin-bottom:12px;">
                    <!-- Candidate Info -->
                    <div style="flex:1; min-width:280px;">
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px;">
                            <h3 style="margin:0; font-size:1.15rem; color:#f8fafc; font-weight:700;">
                                ${candidateName}
                            </h3>
                            ${atsBadge}
                        </div>
                        <div style="font-size:0.85rem; color:#cbd5e1; margin-bottom:6px;">
                            ${headline}${exp}
                        </div>
                        <div style="display:flex; gap:14px; font-size:0.8rem; color:#94a3b8; flex-wrap:wrap;">
                            <span title="Detected Email">📧 ${email}</span>
                            <span title="Detected Phone">📞 ${phone}</span>
                            <span title="Document Filename">📄 <span style="font-family:monospace; color:#38bdf8;">${m.filename}</span> (${m.fileSizeFormatted || ''})</span>
                        </div>
                    </div>

                    <!-- Match Score Pill -->
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                        <div style="background:${scoreBg}; color:${scoreColor}; font-weight:800; font-size:1.05rem; padding:6px 14px; border-radius:20px; box-shadow:0 4px 12px rgba(0,0,0,0.3); display:inline-flex; align-items:center; gap:6px;">
                            <span>⚡</span> ${m.matchScore}% Match
                        </div>
                        <div style="font-size:0.75rem; color:#94a3b8; max-width:260px; text-align:right;">
                            ${m.summary || ''}
                        </div>
                    </div>
                </div>

                <!-- Skills Alignment & Recruiter Intelligence Rows -->
                <div style="background:rgba(0,0,0,0.25); border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:0.8rem;">
                    <!-- Mandatory Skills Row -->
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                        <span style="font-weight:700; color:#34d399; font-size:0.73rem; text-transform:uppercase;">⚡ Mandatory (${(m.mandatoryMatched || []).length}/${((m.mandatoryMatched || []).length + (m.mandatoryMissing || []).length)}):</span>
                        ${mandatoryHtml || '<span style="opacity:0.6; font-size:0.72rem;">None verified</span>'}
                    </div>
                    ${mandatoryMissingHtml ? `
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                        <span style="font-weight:700; color:#f87171; font-size:0.73rem; text-transform:uppercase;">✗ Missing Mandatory:</span>
                        ${mandatoryMissingHtml}
                    </div>` : ''}
                    ${niceHtml ? `
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:#60a5fa; font-size:0.73rem; text-transform:uppercase;">🌟 Nice-to-Have:</span>
                        ${niceHtml}
                    </div>` : ''}
                </div>

                <!-- Positives & Negatives Cards -->
                ${positivesHtml}
                ${negativesHtml}
                ${questionsHtml}

                <!-- Action Toolbar -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.78rem; border-color:#38bdf8; color:#38bdf8; border-radius:6px; cursor:pointer;" onclick="openScannedCvFile('${encodeURIComponent(m.fullPath)}')">
                            👁️ Open CV File
                        </button>
                        <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.78rem; border-color:rgba(255,255,255,0.2); color:#cbd5e1; border-radius:6px; cursor:pointer;" onclick="previewScannedCv(${originalIndex})">
                            📄 Text Preview
                        </button>
                        <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.78rem; border-color:#a78bfa; color:#a78bfa; border-radius:6px; cursor:pointer;" onclick="deepAiMatchScannedCandidate(${originalIndex})">
                            🧠 Deep AI Match
                        </button>
                    </div>

                    <div style="display:flex; gap:8px;">
                        <button type="button" id="btn-ingest-${originalIndex}" class="btn-outline" style="padding:6px 14px; font-size:0.78rem; font-weight:700; border-color:#10b981; color:#34d399; border-radius:6px; cursor:pointer; background:rgba(16,185,129,0.1);" onclick="ingestScannedCandidate(${originalIndex})">
                            ${m.inAts ? '✓ In ATS' : '➕ Add to ATS'}
                        </button>
                        <button type="button" class="btn-primary" style="padding:6px 16px; font-size:0.78rem; font-weight:700; background:linear-gradient(135deg, #8b5cf6, #ec4899); border:none; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" onclick="submitScannedCandidateToJob(${originalIndex})">
                            <span>⚡</span> Submit to Job
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
};

window.openScannedCvFile = async function(encodedPath) {
    const filePath = decodeURIComponent(encodedPath);
    try {
        const res = await fetch('/api/open-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof window.showToast === 'function') {
                window.showToast('info', 'Opening CV in default system viewer...');
            }
        } else {
            alert('Cannot open file: ' + (data.error || 'Access error'));
        }
    } catch (e) {
        console.error('openScannedCvFile error:', e);
        alert('Failed to launch file viewer.');
    }
};

window.previewScannedCv = function(index) {
    const item = window.currentScannedMatches[index];
    if (!item) return;

    window.currentPreviewedFilePath = item.fullPath;

    const modal = document.getElementById('scanned-cv-preview-modal');
    const title = document.getElementById('scanned-preview-title');
    const subtitle = document.getElementById('scanned-preview-subtitle');
    const textEl = document.getElementById('scanned-preview-text');

    if (title) title.innerText = `📄 ${item.candidate?.name || item.filename}`;
    if (subtitle) subtitle.innerText = `${item.fullPath} • ${item.fileSizeFormatted || ''}`;
    if (textEl) textEl.innerText = item.text || item.snippet || 'No text extracted';

    if (modal) modal.style.display = 'flex';
};

window.closeScannedCvPreview = function() {
    const modal = document.getElementById('scanned-cv-preview-modal');
    if (modal) modal.style.display = 'none';
};

window.openPreviewedFileExternal = function() {
    if (window.currentPreviewedFilePath) {
        window.openScannedCvFile(encodeURIComponent(window.currentPreviewedFilePath));
    }
};

window.ingestScannedCandidate = async function(index) {
    const item = window.currentScannedMatches[index];
    if (!item) return null;

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    const btn = document.getElementById(`btn-ingest-${index}`);
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Ingesting...';
    }

    try {
        const res = await fetch('/api/ats/local-resumes/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: item.candidate?.name || item.filename.replace(/\.[^/.]+$/, ''),
                email: item.candidate?.email || '',
                phone: item.candidate?.phone || '',
                headline: item.candidate?.headline || '',
                skills: item.candidate?.skills || item.matchedSkills || [],
                resume_path: item.fullPath,
                created_by_user_id: user?.id || null,
                created_by_name: user?.name || null,
                created_by_role: user?.role || null
            })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            item.inAts = true;
            item.existingCandidateId = data.candidateId;
            item.existingCandidateCode = data.candidateCode;

            if (btn) {
                btn.innerText = '✓ Ingested!';
                btn.style.color = '#34d399';
            }

            if (typeof window.showToast === 'function') {
                window.showToast('success', data.message || 'Candidate added to ATS!');
            } else {
                alert(data.message || 'Candidate added to ATS!');
            }

            // Refresh candidate count in ATS talent database if open
            if (typeof window.loadAtsCandidates === 'function') {
                window.loadAtsCandidates();
            }

            return data.candidateId;
        } else {
            alert('Ingestion error: ' + (data.error || 'Server error'));
            if (btn) btn.disabled = false;
            return null;
        }
    } catch (e) {
        console.error('ingestScannedCandidate error:', e);
        alert('Failed to ingest candidate.');
        if (btn) btn.disabled = false;
        return null;
    }
};

window.submitScannedCandidateToJob = async function(index) {
    const item = window.currentScannedMatches[index];
    if (!item) return;

    let candidateId = item.existingCandidateId;

    // If not in ATS yet, ingest first
    if (!candidateId) {
        candidateId = await window.ingestScannedCandidate(index);
        if (!candidateId) return;
    }

    const jobSelect = document.getElementById('local-scan-job-select');
    const selectedJobId = jobSelect ? jobSelect.value : null;

    if (typeof window.openAtsSubmitModal === 'function') {
        window.openAtsSubmitModal(candidateId, selectedJobId);
    } else {
        alert('Candidate ingested. Please go to Candidates view to submit.');
    }
};

window.deepAiMatchScannedCandidate = function(index) {
    const item = window.currentScannedMatches[index];
    if (!item) return;

    const jobSelect = document.getElementById('local-scan-job-select');
    const selectedOption = jobSelect ? jobSelect.options[jobSelect.selectedIndex] : null;

    let jdText = '';
    if (selectedOption && selectedOption.value) {
        const title = decodeURIComponent(selectedOption.getAttribute('data-title') || '');
        const company = decodeURIComponent(selectedOption.getAttribute('data-company') || '');
        const skills = decodeURIComponent(selectedOption.getAttribute('data-skills') || '');
        jdText = `ROLE: ${title}\nCOMPANY: ${company}\nREQUIRED SKILLS: ${skills}`;
    }

    if (typeof window.openMatchCenter === 'function') {
        window.openMatchCenter();
        const mcJd = document.getElementById('mc-jd');
        const mcCv = document.getElementById('mc-cv');
        if (mcJd && jdText) mcJd.value = jdText;
        if (mcCv) mcCv.value = item.text || item.snippet || '';
    } else {
        alert('Matching center is not available.');
    }
};

// =========================================================================
// 21. EMAIL ARCHIVE RESUME SCANNER & MATCH ENGINE (Front-End Controller)
// =========================================================================

window.currentEmailMatches = [];

window.openEmailResumeMatchModal = async function(preselectedJobId = null) {
    const modal = document.getElementById('email-resume-match-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // 1. Populate Target Jobs Dropdown
    const jobSelect = document.getElementById('erm-job-select');
    if (jobSelect) {
        jobSelect.innerHTML = '<option value="">Loading job requisitions...</option>';
        try {
            const res = await fetch('/api/jobs');
            const jobs = await res.json();
            if (Array.isArray(jobs) && jobs.length > 0) {
                jobSelect.innerHTML = '<option value="">— Select Target Job Requisition —</option>' +
                    jobs.map(j => `
                        <option value="${j.id}" 
                                data-title="${encodeURIComponent(j.title || '')}"
                                data-company="${encodeURIComponent(j.company || '')}"
                                data-skills="${encodeURIComponent(j.skills || '')}"
                                ${String(j.id) === String(preselectedJobId) ? 'selected' : ''}>
                            ${escHtml(j.job_code || 'JOB')} - ${escHtml(j.title)} (${escHtml(j.company || 'Client')})
                        </option>
                    `).join('');
            } else {
                jobSelect.innerHTML = '<option value="">No active jobs found</option>';
            }
        } catch (e) {
            jobSelect.innerHTML = '<option value="">Failed to load jobs</option>';
        }
    }

    // 2. Check Email Configuration Status
    const statusText = document.getElementById('erm-status-text');
    try {
        const statusRes = await fetch('/api/ats/email-resumes/status');
        const statusData = await statusRes.json();
        if (statusText) {
            if (statusData.isConfigured) {
                statusText.innerHTML = `
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span>
                    <span style="color:#34d399; font-weight:600;">Connected to IMAP: ${escHtml(statusData.user)} @ ${escHtml(statusData.host)}</span>
                `;
            } else {
                statusText.innerHTML = `
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span>
                    <span style="color:#fbbf24;">IMAP Email settings not configured. Please add your credentials in Email Settings to scan live mailboxes.</span>
                `;
            }
        }
    } catch (e) {
        if (statusText) {
            statusText.innerHTML = '<span style="color:#f87171;">Could not verify email configuration.</span>';
        }
    }
};

window.closeEmailResumeMatchModal = function() {
    const modal = document.getElementById('email-resume-match-modal');
    if (modal) modal.style.display = 'none';
};

window.runEmailResumeScan = async function() {
    const jobSelect = document.getElementById('erm-job-select');
    const folderSelect = document.getElementById('erm-folder-select');
    const daysSelect = document.getElementById('erm-days-select');
    const minScoreSelect = document.getElementById('erm-min-score');
    const scanBtn = document.getElementById('btn-run-email-scan');

    const jobId = jobSelect ? jobSelect.value : null;
    const folder = folderSelect ? folderSelect.value : 'ALL';
    const days = daysSelect ? daysSelect.value : 90;
    const minScore = minScoreSelect ? minScoreSelect.value : 40;

    const placeholder = document.getElementById('erm-placeholder');
    const resultsList = document.getElementById('erm-results-list');
    const footerStats = document.getElementById('erm-footer-stats');

    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block;"></span> Scanning Mailbox...';
    }

    if (placeholder) placeholder.style.display = 'block';
    if (placeholder) placeholder.innerHTML = `
        <div style="font-size:2.5rem; margin-bottom:12px;">⏳</div>
        <h3 style="margin:0 0 8px 0; color:#e2e8f0; font-size:1.15rem;">Connecting to Mailbox & Analyzing Resumes...</h3>
        <p style="margin:0 auto; max-width:500px; font-size:0.85rem; color:#94a3b8; line-height:1.5;">
            Scanning folders for candidate emails, extracting PDF & DOCX attachments, and scoring against the selected job. This may take a few moments.
        </p>
    `;
    if (resultsList) resultsList.innerHTML = '';

    try {
        const res = await fetch('/api/ats/email-resumes/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobId,
                folder,
                days,
                minScore
            })
        });

        const data = await res.json();

        if (!data.success) {
            if (placeholder) {
                placeholder.innerHTML = `
                    <div style="font-size:2.5rem; margin-bottom:12px; color:#f87171;">⚠️</div>
                    <h3 style="margin:0 0 8px 0; color:#f87171; font-size:1.15rem;">Email Scan Notice</h3>
                    <p style="margin:0 auto 16px auto; max-width:540px; font-size:0.85rem; color:#cbd5e1; line-height:1.5;">
                        ${escHtml(data.error || 'Failed to scan mailbox.')}
                    </p>
                    <button class="btn-primary" style="padding:8px 18px; font-size:0.8rem; background:#8b5cf6;" onclick="closeEmailResumeMatchModal(); if(typeof openSettingsModal==='function') openSettingsModal(); else if(typeof switchAtsView==='function') switchAtsView('settings');">
                        ⚙️ Configure Email Settings Now
                    </button>
                `;
            }
            if (footerStats) footerStats.textContent = 'Scan stopped: Configuration required';
            return;
        }

        window.currentEmailMatches = Array.isArray(data.matches) ? data.matches : [];

        if (footerStats) {
            footerStats.textContent = `Scanned ${data.totalEmailsScanned || 0} emails • Found ${data.totalResumesFound || 0} candidate CVs • Matched ${window.currentEmailMatches.length} candidates`;
        }

        if (window.currentEmailMatches.length === 0) {
            if (placeholder) {
                placeholder.innerHTML = `
                    <div style="font-size:2.5rem; margin-bottom:12px; opacity:0.6;">📭</div>
                    <h3 style="margin:0 0 8px 0; color:#e2e8f0; font-size:1.15rem;">No Matching Candidates Found</h3>
                    <p style="margin:0 auto; max-width:500px; font-size:0.85rem; color:#94a3b8; line-height:1.5;">
                        Scanned ${data.totalEmailsScanned || 0} emails and ${data.totalResumesFound || 0} resumes, but none met the minimum match threshold of ${minScore}%. Try lowering the match percentage or expanding the lookback period.
                    </p>
                `;
            }
            return;
        }

        if (placeholder) placeholder.style.display = 'none';
        window.renderEmailScanResults(window.currentEmailMatches, data.job);

    } catch (e) {
        if (placeholder) {
            placeholder.innerHTML = `
                <div style="font-size:2.5rem; margin-bottom:12px; color:#f87171;">❌</div>
                <h3 style="margin:0 0 8px 0; color:#f87171;">Scan Error</h3>
                <p style="margin:0 auto; max-width:500px; font-size:0.85rem; color:#cbd5e1;">${escHtml(e.message)}</p>
            `;
        }
    } finally {
        if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.innerHTML = '<span>🚀</span> Scan & Match';
        }
    }
};

window.renderEmailScanResults = function(matches, job) {
    const list = document.getElementById('erm-results-list');
    if (!list) return;

    list.innerHTML = matches.map((m, index) => {
        const score = m.matchScore || 0;
        let scoreColor = '#ef4444';
        let scoreBg = 'rgba(239,68,68,0.15)';
        if (score >= 70) { scoreColor = '#34d399'; scoreBg = 'rgba(16,185,129,0.2)'; }
        else if (score >= 50) { scoreColor = '#fbbf24'; scoreBg = 'rgba(245,158,11,0.2)'; }

        // Matched vs Missing Skills Badges
        const matchedSkillsHtml = (m.matchedSkills || []).map(s => `
            <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.35); font-weight:600;">✓ ${escHtml(s)}</span>
        `).join('');

        const missingSkillsHtml = (m.missingSkills || []).map(s => `
            <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.25);">✗ ${escHtml(s)}</span>
        `).join('');

        const candName = m.candidate?.name || 'Candidate from Email';
        const candEmail = m.candidate?.email || m.senderEmail || 'No email';
        const candPhone = m.candidate?.phone || '';
        const candHeadline = m.candidate?.headline || 'Extracted Profile';

        // Historical Provenance Card
        const prev = m.previousSubmission || {};
        const provHtml = prev.jobTitle || prev.clientName ? `
            <div style="background:rgba(236,72,153,0.08); border:1px solid rgba(236,72,153,0.25); border-radius:6px; padding:6px 12px; margin-bottom:10px; font-size:0.75rem; color:#f472b6; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span>📤 <strong>Historical Provenance:</strong></span>
                <span>Previously submitted to <strong>${escHtml(prev.clientName || 'Client')}</strong> for <strong>${escHtml(prev.jobTitle || 'Role')}</strong></span>
                ${prev.date ? `<span>on ${new Date(prev.date).toLocaleDateString()}</span>` : ''}
                ${prev.salaryExpected ? `<span>• Expected: ${escHtml(prev.salaryExpected)}</span>` : ''}
            </div>
        ` : `
            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:6px 12px; margin-bottom:10px; font-size:0.75rem; color:#94a3b8; display:flex; align-items:center; gap:8px;">
                <span>📧 Source: Email from <strong>${escHtml(m.sender)}</strong> (${escHtml(m.attachmentFilename || 'CV attachment')})</span>
            </div>
        `;

        return `
            <div class="card" style="background:#0f172a; border:1px solid rgba(255,255,255,0.08); border-left:4px solid ${scoreColor}; border-radius:10px; padding:18px; display:flex; flex-direction:column; gap:12px; box-shadow:0 6px 18px rgba(0,0,0,0.3);">
                <!-- Top Row: Candidate Identity & Match Score -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:14px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <h3 style="margin:0; font-size:1.15rem; color:#f8fafc; font-weight:800;">${escHtml(candName)}</h3>
                            ${m.inAts ? `
                                <span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); font-weight:700;">
                                    ✓ In ATS (${escHtml(m.existingCandidateCode || 'CAND')})
                                </span>
                            ` : `
                                <span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3); font-weight:700;">
                                    ✨ Discovered from Email
                                </span>
                            `}
                        </div>
                        <div style="font-size:0.82rem; color:#94a3b8; margin-bottom:6px;">
                            <strong style="color:#e2e8f0;">${escHtml(candHeadline)}</strong>
                            ${candEmail !== 'No email' ? ` • 📧 ${escHtml(candEmail)}` : ''}
                            ${candPhone ? ` • 📱 ${escHtml(candPhone)}` : ''}
                        </div>
                    </div>

                    <!-- Match Score Pill -->
                    <div style="text-align:right; flex-shrink:0;">
                        <div style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:20px; background:${scoreBg}; border:1px solid ${scoreColor};">
                            <span style="font-size:1.15rem; font-weight:900; color:${scoreColor};">${score}%</span>
                            <span style="font-size:0.72rem; color:${scoreColor}; font-weight:700; text-transform:uppercase;">Fit</span>
                        </div>
                    </div>
                </div>

                <!-- Provenance Info -->
                ${provHtml}

                <!-- Skills Alignment & Recruiter Intelligence Rows -->
                <div style="background:rgba(0,0,0,0.3); border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.04);">
                    <div style="margin-bottom:8px;">
                        <div style="font-size:0.72rem; color:#34d399; font-weight:700; text-transform:uppercase; margin-bottom:5px; letter-spacing:0.5px;">
                            ⚡ Mandatory Skills (${(m.mandatoryMatched || []).length}/${((m.mandatoryMatched || []).length + (m.mandatoryMissing || []).length)})
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:4px;">
                            ${(m.mandatoryMatched && m.mandatoryMatched.length > 0) ? m.mandatoryMatched.map(s => `<span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.4); font-weight:700;">⚡ ${escHtml(s)}</span>`).join('') : '<span style="font-size:0.75rem; color:#64748b; font-style:italic;">None verified</span>'}
                        </div>
                    </div>

                    ${(m.mandatoryMissing || []).length > 0 ? `
                        <div style="margin-bottom:8px;">
                            <div style="font-size:0.72rem; color:#f87171; font-weight:700; text-transform:uppercase; margin-bottom:5px; letter-spacing:0.5px;">
                                ✗ Missing Mandatory (${m.mandatoryMissing.length})
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                ${m.mandatoryMissing.map(s => `<span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); font-weight:700;">✗ ${escHtml(s)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${(m.niceToHaveMatched || []).length > 0 ? `
                        <div>
                            <div style="font-size:0.72rem; color:#60a5fa; font-weight:700; text-transform:uppercase; margin-bottom:5px; letter-spacing:0.5px;">
                                🌟 Nice-to-Have Skills (${m.niceToHaveMatched.length})
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                ${m.niceToHaveMatched.map(s => `<span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3);">🌟 ${escHtml(s)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Positives / Green Flags -->
                ${(m.positives && m.positives.length > 0) ? `
                    <div style="background:rgba(16,185,129,0.06); border-left:3px solid #10b981; border-radius:6px; padding:8px 12px;">
                        <div style="font-size:0.73rem; font-weight:700; color:#34d399; margin-bottom:3px;">🟢 Positives (Strengths & Value-Add):</div>
                        <ul style="margin:0; padding-left:16px; font-size:0.73rem; color:#cbd5e1; line-height:1.4;">
                            ${m.positives.map(p => `<li>${escHtml(p)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <!-- Negatives / Red Flags -->
                ${(m.negatives && m.negatives.length > 0) ? `
                    <div style="background:rgba(239,68,68,0.06); border-left:3px solid #ef4444; border-radius:6px; padding:8px 12px;">
                        <div style="font-size:0.73rem; font-weight:700; color:#f87171; margin-bottom:3px;">🔴 Negatives (Risks & Knockout Gaps):</div>
                        <ul style="margin:0; padding-left:16px; font-size:0.73rem; color:#fca5a5; line-height:1.4;">
                            ${m.negatives.map(n => `<li>${escHtml(n)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <!-- Probing Questions -->
                ${(m.probingQuestions && m.probingQuestions.length > 0) ? `
                    <div>
                        <span style="font-size:0.72rem; color:#fbbf24; font-weight:600; cursor:pointer;" onclick="const d = this.nextElementSibling; d.style.display = d.style.display === 'none' ? 'block' : 'none';">
                            🎯 Interview Probing Questions (${m.probingQuestions.length}) ▾
                        </span>
                        <div style="display:none; background:rgba(0,0,0,0.35); border-radius:6px; padding:8px 12px; margin-top:4px; font-size:0.72rem; color:#fde68a; line-height:1.45;">
                            ${m.probingQuestions.map((q, idx) => `<div style="margin-bottom:3px;"><strong>${idx+1}.</strong> ${escHtml(q)}</div>`).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- CV Snippet -->
                <div style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:6px; line-height:1.5; font-family:monospace; max-height:80px; overflow-y:auto;">
                    ${escHtml(m.cvSnippet || '')}
                </div>

                <!-- Action Buttons -->
                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:0.72rem; color:#64748b;">
                        Email: "${escHtml(m.subject)}" (${escHtml(m.folder)})
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.75rem; border-color:#8b5cf6; color:#a78bfa;" onclick="deepAiMatchEmailCandidate(${index})">
                            ⚖️ Deep Match Center
                        </button>
                        <button type="button" class="btn-primary" style="padding:6px 14px; font-size:0.75rem; font-weight:700; background:#10b981; border:none; border-radius:6px; cursor:pointer;" onclick="ingestEmailCandidate(${index}, true)">
                            ⚡ Submit to Job (TL QC)
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.ingestEmailCandidate = async function(index, submitToJob = false) {
    const item = window.currentEmailMatches[index];
    if (!item) return;

    const jobSelect = document.getElementById('erm-job-select');
    const selectedJobId = jobSelect ? jobSelect.value : null;

    const userStr = localStorage.getItem('currentUser');
    const user = userStr ? JSON.parse(userStr) : null;

    try {
        if (typeof showToast === 'function') showToast('info', `Ingesting ${item.candidate?.name || 'candidate'}...`);

        const res = await fetch('/api/ats/email-resumes/import-and-submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: item.candidate?.name,
                email: item.candidate?.email || item.senderEmail,
                phone: item.candidate?.phone,
                headline: item.candidate?.headline,
                skills: item.candidate?.skills || item.matchedSkills,
                cvText: item.cvText,
                cvFilename: item.attachmentFilename,
                job_id: selectedJobId,
                submit_to_job: submitToJob,
                recruiter_id: user?.id,
                tl_id: user?.manager_id || 'u_teamlead'
            })
        });

        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') {
                showToast('success', data.message || `Candidate ${data.candidateCode} successfully processed!`);
            } else {
                alert(data.message || `Candidate ${data.candidateCode} successfully processed!`);
            }

            // Refresh candidates or submissions if active
            if (typeof window.loadAtsCandidates === 'function') window.loadAtsCandidates();
            if (typeof window.loadDetailedJobs === 'function') window.loadDetailedJobs();
            if (typeof window.loadSubmissions === 'function') window.loadSubmissions();

            // Mark as in ATS
            item.inAts = true;
            item.existingCandidateCode = data.candidateCode;
            window.renderEmailScanResults(window.currentEmailMatches);
        } else {
            if (typeof showToast === 'function') showToast('error', data.error || 'Failed to process candidate');
            else alert(data.error || 'Failed to process candidate');
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('error', 'Network error: ' + e.message);
        else alert('Network error: ' + e.message);
    }
};

window.deepAiMatchEmailCandidate = function(index) {
    const item = window.currentEmailMatches[index];
    if (!item) return;

    const jobSelect = document.getElementById('erm-job-select');
    const selectedOption = jobSelect ? jobSelect.options[jobSelect.selectedIndex] : null;

    let jdText = '';
    if (selectedOption && selectedOption.value) {
        const title = decodeURIComponent(selectedOption.getAttribute('data-title') || '');
        const company = decodeURIComponent(selectedOption.getAttribute('data-company') || '');
        const skills = decodeURIComponent(selectedOption.getAttribute('data-skills') || '');
        jdText = `ROLE: ${title}\nCOMPANY: ${company}\nREQUIRED SKILLS: ${skills}`;
    }

    if (typeof window.openMatchCenter === 'function') {
        window.openMatchCenter();
        const mcJd = document.getElementById('mc-jd');
        const mcCv = document.getElementById('mc-cv');
        if (mcJd && jdText) mcJd.value = jdText;
        if (mcCv) mcCv.value = item.cvText || item.cvSnippet || '';
    } else {
        alert('Matching center is not available.');
    }
};

// Global Fallback & Expose for Job Card Action Modals
['openApproachModal', 'openInmailModal', 'openPostModal', 'openPreScreeningModal', 'openReqModal'].forEach(fn => {
    if (typeof window[fn] === 'function') {
        // Expose to local window context
        window[fn] = window[fn];
    }
});


