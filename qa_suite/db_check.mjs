import { initDb } from '../dist/services/database.js';

async function main() {
    try {
        const db = await initDb();
        const tables = await db.all("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
        console.log("Database Tables Count:", tables.length);
        console.log("Tables:", tables.map(t => t.table_name));
        
        // Count key tables
        for (const t of ['users', 'jobs', 'candidates', 'submissions', 'clients', 'spoke_persons', 'interviews', 'candidate_pipeline']) {
            try {
                const count = await db.get(`SELECT COUNT(*) as c FROM ${t}`);
                console.log(`Count [${t}]:`, count?.c || count?.count || 0);
            } catch (err) {
                console.log(`Table [${t}] error:`, err.message);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error("DB Check Error:", e);
        process.exit(1);
    }
}

main();
