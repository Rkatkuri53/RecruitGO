import sqlite3 from 'sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

async function cleanSqlite() {
    console.log('--- Cleaning SQLite database (data/database.sqlite) ---');
    const db = new sqlite3.Database('data/database.sqlite');
    
    const tablesToClear = [
        'candidates',
        'jobs',
        'clients',
        'spoke_persons',
        'submissions',
        'interviews',
        'candidate_pipeline',
        'candidate_remarks',
        'job_assignments',
        'client_assignments',
        'job_notes',
        'job_deletion_requests',
        'conversations',
        'resume_vectors'
    ];

    for (const t of tablesToClear) {
        await new Promise((resolve) => {
            db.run(`DELETE FROM ${t}`, (err) => {
                if (err) {
                    // table might not exist in sqlite, ignore
                } else {
                    console.log(`[SQLite] Cleared table: ${t}`);
                }
                resolve();
            });
        });
    }

    // Clean users table: remove dummy users, keep core 4
    await new Promise((resolve) => {
        db.run("DELETE FROM users WHERE id LIKE 'dummy_%' OR id LIKE 'u_r_%'", (err) => {
            if (err) console.error('[SQLite] Error deleting dummy users:', err.message);
            else console.log('[SQLite] Removed dummy users from users table');
            resolve();
        });
    });

    // Ensure core 4 users exist and are properly mapped
    await new Promise((resolve) => {
        db.run(`
            INSERT OR IGNORE INTO users (id, role, name, email, password) VALUES 
            ('u_admin', 'Management', 'Admin', 'admin@myrecruiter.com', 'admin123'),
            ('u_teamlead', 'TeamLead', 'Team Lead', 'teamlead@myrecruiter.com', 'teamlead123'),
            ('u_am', 'AccountManager', 'Account Manager', 'am@myrecruiter.com', 'am123'),
            ('u_recruiter', 'Recruiter', 'Recruiter', 'recruiter@myrecruiter.com', 'recruiter123')
        `, (err) => {
            if (err) console.error('[SQLite] Error ensuring core users:', err.message);
            resolve();
        });
    });

    // Set recruiter manager_id to u_teamlead
    await new Promise((resolve) => {
        db.run("UPDATE users SET manager_id = 'u_teamlead' WHERE id = 'u_recruiter'", (err) => {
            if (err) console.error('[SQLite] Error updating recruiter manager_id:', err.message);
            else console.log('[SQLite] Linked Recruiter to Team Lead');
            resolve();
        });
    });

    // Check final counts in SQLite
    console.log('\n[SQLite Summary after cleanup]:');
    for (const t of ['candidates', 'jobs', 'clients', 'spoke_persons', 'submissions', 'interviews', 'users']) {
        await new Promise((resolve) => {
            db.get(`SELECT COUNT(*) as c FROM ${t}`, (err, row) => {
                console.log(`  ${t}: ${row?.c ?? 0}`);
                resolve();
            });
        });
    }

    db.close();
}

async function cleanPostgres() {
    if (!process.env.DATABASE_URL) {
        console.log('\nNo DATABASE_URL found, skipping Postgres cleanup.');
        return;
    }

    console.log('\n--- Cleaning Postgres database via DATABASE_URL ---');
    const isSupabase = process.env.DATABASE_URL.includes('supabase') || process.env.DATABASE_URL.includes('pooler');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isSupabase ? { rejectUnauthorized: false } : undefined
    });

    const pgTables = [
        'candidate_pipeline',
        'submissions',
        'interviews',
        'candidate_remarks',
        'job_assignments',
        'client_assignments',
        'job_notes',
        'job_deletion_requests',
        'candidates',
        'jobs',
        'spoke_persons',
        'clients',
        'conversations'
    ];

    for (const t of pgTables) {
        try {
            await pool.query(`DELETE FROM ${t}`);
            console.log(`[Postgres] Cleared table: ${t}`);
        } catch (e) {
            // Table might not exist or foreign key order, ignore
        }
    }

    // Remove dummy users from Postgres
    try {
        await pool.query("DELETE FROM users WHERE id LIKE 'dummy_%' OR id LIKE 'u_r_%'");
        console.log('[Postgres] Removed dummy users from users table');
    } catch (e) {
        console.error('[Postgres] Error cleaning dummy users:', e.message);
    }

    // Ensure core 4 users exist
    try {
        const coreUsers = [
            ['u_admin', 'Management', 'Admin', 'admin@myrecruiter.com', 'admin123'],
            ['u_teamlead', 'TeamLead', 'Team Lead', 'teamlead@myrecruiter.com', 'teamlead123'],
            ['u_am', 'AccountManager', 'Account Manager', 'am@myrecruiter.com', 'am123'],
            ['u_recruiter', 'Recruiter', 'Recruiter', 'recruiter@myrecruiter.com', 'recruiter123']
        ];
        for (const [id, role, name, email, pwd] of coreUsers) {
            const exists = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
            if (exists.rows.length === 0) {
                await pool.query('INSERT INTO users (id, role, name, email, password) VALUES ($1, $2, $3, $4, $5)', [id, role, name, email, pwd]);
            }
        }
        await pool.query("UPDATE users SET manager_id = 'u_teamlead' WHERE id = 'u_recruiter'");
        console.log('[Postgres] Ensured core 4 users and linked Recruiter to Team Lead');
    } catch (e) {
        console.error('[Postgres] Error configuring core users:', e.message);
    }

    console.log('\n[Postgres Summary after cleanup]:');
    for (const t of ['candidates', 'jobs', 'clients', 'spoke_persons', 'submissions', 'interviews', 'users']) {
        try {
            const res = await pool.query(`SELECT COUNT(*) as c FROM ${t}`);
            console.log(`  ${t}: ${res.rows[0].c}`);
        } catch (e) {
            console.log(`  ${t}: error (${e.message})`);
        }
    }

    await pool.end();
}

async function main() {
    await cleanSqlite();
    await cleanPostgres();
    console.log('\n✅ All mock/test data has been successfully removed!');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal cleanup error:', err);
    process.exit(1);
});
