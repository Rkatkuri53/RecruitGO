async function debugCalls() {
    const BASE = 'http://localhost:8745';

    console.log('--- DEBUG 1: GET /api/clients ---');
    const r1 = await fetch(`${BASE}/api/clients`);
    console.log('Status:', r1.status, 'Response:', await r1.text());

    console.log('\n--- DEBUG 2: POST /api/clients ---');
    const r2 = await fetch(`${BASE}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: 'DebugCorp', industry: 'Tech' })
    });
    console.log('Status:', r2.status, 'Response:', await r2.text());

    console.log('\n--- DEBUG 3: POST /api/ats/candidates ---');
    const r3 = await fetch(`${BASE}/api/ats/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Debug Candidate', email: 'debug@cand.com' })
    });
    console.log('Status:', r3.status, 'Response:', await r3.text());

    console.log('\n--- DEBUG 4: POST /api/ats/ingest-local ---');
    const r4 = await fetch(`${BASE}/api/ats/ingest-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Debug Ingest', raw_text: 'Resume text here' })
    });
    console.log('Status:', r4.status, 'Response:', await r4.text());

    console.log('\n--- DEBUG 5: GET /api/ats/analytics/management ---');
    const r5 = await fetch(`${BASE}/api/ats/analytics/management`);
    console.log('Status:', r5.status, 'Response sample:', (await r5.text()).substring(0, 300));
}

debugCalls().catch(console.error);
