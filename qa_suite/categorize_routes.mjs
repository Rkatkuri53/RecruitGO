import fs from 'fs';

const routes = JSON.parse(fs.readFileSync('qa_suite/discovered_routes.json', 'utf8'));

const categories = {
    auth_users: [],
    jobs: [],
    candidates_sourcing: [],
    ats_submissions_funnel: [],
    portal_spoke: [],
    analytics_management: [],
    clients_spokes: [],
    messaging_chat: [],
    system_settings_logs: [],
    automation_agents: [],
    other: []
};

routes.forEach(r => {
    const p = r.path.toLowerCase();
    if (p.includes('/api/auth') || p.includes('/api/users') || p.includes('/login') || p.includes('/register')) {
        categories.auth_users.push(r);
    } else if (p.includes('/api/jobs') || p.includes('/api/ats/jobs')) {
        categories.jobs.push(r);
    } else if (p.includes('/candidates') || p.includes('/sourcing') || p.includes('/search') || p.includes('/local-resumes')) {
        categories.candidates_sourcing.push(r);
    } else if (p.includes('/api/ats/tl') || p.includes('/api/ats/am') || p.includes('/submissions') || p.includes('/pipeline')) {
        categories.ats_submissions_funnel.push(r);
    } else if (p.includes('portal')) {
        categories.portal_spoke.push(r);
    } else if (p.includes('analytics') || p.includes('performance') || p.includes('metrics')) {
        categories.analytics_management.push(r);
    } else if (p.includes('client') || p.includes('spoke')) {
        categories.clients_spokes.push(r);
    } else if (p.includes('chat') || p.includes('message') || p.includes('conversation')) {
        categories.messaging_chat.push(r);
    } else if (p.includes('settings') || p.includes('logs') || p.includes('config') || p.includes('status')) {
        categories.system_settings_logs.push(r);
    } else if (p.includes('agent') || p.includes('scrape') || p.includes('bot') || p.includes('sync')) {
        categories.automation_agents.push(r);
    } else {
        categories.other.push(r);
    }
});

for (const [k, v] of Object.entries(categories)) {
    console.log(`${k}: ${v.length} endpoints`);
}

fs.writeFileSync('qa_suite/categorized_routes.json', JSON.stringify(categories, null, 2));
