import { initDb } from '../dist/services/database.js';

async function verifyAndConnectLinks() {
    const db = await initDb();

    // 1. Ensure TechCorp Inc. and CloudSync Solutions exist in clients table
    let tc = await db.get("SELECT id FROM clients WHERE company_name = 'TechCorp Inc.'");
    if (!tc) {
        await db.run(`INSERT INTO clients (id, company_name, account_manager_id, industry, location, status) 
                      VALUES ('c_techcorp', 'TechCorp Inc.', 'u_am', 'Information Technology', 'San Francisco, CA', 'active')`);
        tc = { id: 'c_techcorp' };
    }
    let cs = await db.get("SELECT id FROM clients WHERE company_name = 'CloudSync Solutions'");
    if (!cs) {
        await db.run(`INSERT INTO clients (id, company_name, account_manager_id, industry, location, status) 
                      VALUES ('c_cloudsync', 'CloudSync Solutions', 'dummy_am_1', 'Cloud Infrastructure', 'Austin, TX', 'active')`);
        cs = { id: 'c_cloudsync' };
    }

    // Ensure spokes exist for them
    let spTc = await db.get("SELECT id FROM spoke_persons WHERE client_id = 'c_techcorp'");
    if (!spTc) {
        await db.run(`INSERT INTO spoke_persons (id, client_id, name, email, role_title) 
                      VALUES ('sp_techcorp_1', 'c_techcorp', 'Sarah Miller', 'sarah.miller@techcorp.com', 'Director of Engineering')`);
        spTc = { id: 'sp_techcorp_1' };
    }
    let spCs = await db.get("SELECT id FROM spoke_persons WHERE client_id = 'c_cloudsync'");
    if (!spCs) {
        await db.run(`INSERT INTO spoke_persons (id, client_id, name, email, role_title) 
                      VALUES ('sp_cloudsync_1', 'c_cloudsync', 'Kevin Vance', 'kevin.vance@cloudsync.com', 'VP of Talent')`);
        spCs = { id: 'sp_cloudsync_1' };
    }

    // Link existing clients to AMs if null
    await db.run("UPDATE clients SET account_manager_id = 'u_am' WHERE company_name = 'TCS' AND (account_manager_id IS NULL OR account_manager_id = '')");
    await db.run("UPDATE clients SET account_manager_id = 'dummy_am_1' WHERE company_name = 'HCL' AND (account_manager_id IS NULL OR account_manager_id = '')");

    // Link existing jobs to clients and spokes and TLs
    await db.run("UPDATE jobs SET client_id = 'c_techcorp', spoke_person_id = 'sp_techcorp_1', assigned_tl_id = 'u_teamlead', created_by_user_id = 'u_am' WHERE company = 'TechCorp Inc.'");
    await db.run("UPDATE jobs SET client_id = 'c_cloudsync', spoke_person_id = 'sp_cloudsync_1', assigned_tl_id = 'dummy_tl_1', created_by_user_id = 'dummy_am_1' WHERE company = 'CloudSync Solutions'");
    await db.run("UPDATE jobs SET assigned_tl_id = 'u_teamlead', created_by_user_id = 'u_am' WHERE company = 'TCS'");

    // Link existing submissions to spokes and AMs
    await db.run("UPDATE submissions SET spoke_person_id = 'sp_techcorp_1', am_id = 'u_am' WHERE job_id = 'job_mock_1788453004044'");

    // Assign some unassigned candidates to recruiters under dummy_tl_1 and dummy_tl_2 so all TLs and AMs have realistic activity
    const cands = await db.all("SELECT id, status FROM candidates WHERE recruiter_id IS NULL LIMIT 12");
    if (cands.length > 0) {
        for (let i = 0; i < cands.length; i++) {
            const cand = cands[i];
            const targetRec = (i % 3 === 0) ? 'dummy_rec_1' : (i % 3 === 1 ? 'dummy_rec_2' : 'dummy_rec_3');
            await db.run("UPDATE candidates SET recruiter_id = ? WHERE id = ?", [targetRec, cand.id]);
        }
    }

    console.log('Links successfully connected and verified!');
}

verifyAndConnectLinks().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
