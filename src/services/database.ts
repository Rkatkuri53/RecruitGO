import dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let dbInstance: any = null;
let initPromise: Promise<any> | null = null;

// Convert SQLite ? to Postgres $1, $2, etc. (used only if Postgres is explicitly configured)
function convertSql(sql: string): string {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
}

class PgWrapper {
    constructor(private pool: Pool) {}
    
    async get(sql: string, params: any[] = []) {
        try {
            const res = await this.pool.query(convertSql(sql), params);
            return res.rows[0];
        } catch (e: any) {
            console.error('[DB GET Error]', e.message, sql);
            throw e;
        }
    }
    
    async all(sql: string, params: any[] = []) {
        try {
            const res = await this.pool.query(convertSql(sql), params);
            return res.rows;
        } catch (e: any) {
            console.error('[DB ALL Error]', e.message, sql);
            throw e;
        }
    }
    
    async run(sql: string, params: any[] = []) {
        try {
            const res = await this.pool.query(convertSql(sql), params);
            return { changes: res.rowCount };
        } catch (e: any) {
            console.error('[DB RUN Error]', e.message, sql);
            throw e;
        }
    }
    
    async exec(sql: string) {
        return this.pool.query(sql);
    }
}

export async function initDb() {
    if (dbInstance) return dbInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        // If an explicit postgres connection URL is provided, use Postgres
        if (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))) {
            console.log('[DB Init] Connecting to Postgres via DATABASE_URL...');
            const isSupabase = process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_URL?.includes('pooler');
            const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: isSupabase ? { rejectUnauthorized: false } : undefined
            });

            try {
                const countRes = await pool.query('SELECT COUNT(*) as count FROM users');
                if (parseInt(countRes.rows[0].count) === 0) {
                    await pool.query(`INSERT INTO users (id, role, name, email, password) VALUES 
                        ('u_admin', 'Management', 'Admin', 'admin@myrecruiter.com', 'admin123'),
                        ('u_am', 'AccountManager', 'Account Manager', 'am@myrecruiter.com', 'am123'),
                        ('u_recruiter', 'Recruiter', 'Recruiter', 'recruiter@myrecruiter.com', 'recruiter123')
                    `);
                }
                const tlRes = await pool.query("SELECT * FROM users WHERE id = 'u_teamlead'");
                if (tlRes.rows.length === 0) {
                    await pool.query(`INSERT INTO users (id, role, name, email, password) VALUES ('u_teamlead', 'TeamLead', 'Team Lead', 'teamlead@myrecruiter.com', 'teamlead123')`);
                }
                try {
                    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
                    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS skills TEXT');
                    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS title TEXT');
                    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS company TEXT');
                } catch (colErr) {
                    // Ignored if column already exists
                }
            } catch (e) {
                console.error('[DB] Postgres seeding notice:', e);
            }

            dbInstance = new PgWrapper(pool);
            return dbInstance;
        }

        // Default & Pure Google Cloud Run mode: Embedded SQLite
        const dataDir = getDataDir();
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const dbPath = path.join(dataDir, 'database.sqlite');
        console.log(`[DB Init] Using embedded SQLite database at: ${dbPath}`);

        const sqliteDb = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Ensure submissions table exists
        await sqliteDb.exec(`
            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY,
                candidate_id TEXT,
                job_id TEXT,
                recruiter_id TEXT,
                tl_id TEXT,
                am_id TEXT,
                status TEXT DEFAULT 'Submitted to TL',
                email_subject TEXT,
                email_body TEXT,
                cv_path TEXT,
                rtr_path TEXT,
                current_salary TEXT,
                expected_salary TEXT,
                notice_period TEXT,
                visa_status TEXT,
                current_location TEXT,
                relocation_preferred TEXT DEFAULT 'Yes',
                spoke_person_id TEXT,
                tl_decision TEXT,
                tl_reviewed_at DATETIME,
                am_submitted_at DATETIME,
                am_feedback TEXT,
                am_decision TEXT,
                am_reviewed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Safe column migration helper for SQLite
        async function addCol(table: string, col: string, def: string) {
            try {
                await sqliteDb.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
            } catch (e) {
                // already exists
            }
        }

        const candidateCols = [
            ['skills', 'TEXT'],
            ['title', 'TEXT'],
            ['company', 'TEXT'],
            ['search_vector', 'TEXT'],
            ['experience_details', 'TEXT'],
            ['created_by_user_id', 'TEXT'],
            ['created_by_name', 'TEXT'],
            ['created_by_role', 'TEXT'],
            ['salary', 'TEXT'],
            ['notice_period', 'TEXT'],
            ['visa_status', 'TEXT'],
            ['candidate_code', 'TEXT'],
            ['rtr_confirmed', 'INTEGER DEFAULT 0'],
            ['rtr_path', 'TEXT'],
            ['expected_salary', 'TEXT'],
            ['current_salary', 'TEXT'],
            ['experience_years', 'TEXT'],
            ['relocation_preferred', 'TEXT']
        ];
        for (const [col, def] of candidateCols) {
            await addCol('candidates', col, def);
        }

        const jobCols = [
            ['created_by_user_id', 'TEXT'],
            ['created_by_name', 'TEXT'],
            ['created_by_role', 'TEXT'],
            ['source_type', "TEXT DEFAULT 'manual'"],
            ['source_am_email', 'TEXT'],
            ['assigned_tl_id', 'TEXT'],
            ['target_submissions', 'INTEGER DEFAULT 5'],
            ['salary_range', 'TEXT'],
            ['job_code', 'TEXT'],
            ['assigned_recruiters', 'TEXT']
        ];
        for (const [col, def] of jobCols) {
            await addCol('jobs', col, def);
        }

        const clientCols = [
            ['account_manager_id', 'TEXT'],
            ['created_by_user_id', 'TEXT'],
            ['created_by_name', 'TEXT'],
            ['created_by_role', 'TEXT'],
            ['industry', 'TEXT'],
            ['location', 'TEXT'],
            ['website', 'TEXT'],
            ['billing_terms', 'TEXT'],
            ['status', "TEXT DEFAULT 'active'"]
        ];
        for (const [col, def] of clientCols) {
            await addCol('clients', col, def);
        }

        await addCol('spoke_persons', 'role_title', 'TEXT');
        await addCol('spoke_persons', 'phone', 'TEXT');

        const userCols = [
            ['manager_id', 'TEXT'],
            ['phone', 'TEXT'],
            ['personal_email', 'TEXT']
        ];
        for (const [col, def] of userCols) {
            await addCol('users', col, def);
        }

        // Seed default users if empty
        try {
            const countRes = await sqliteDb.get('SELECT COUNT(*) as count FROM users');
            if (!countRes || parseInt(countRes.count) === 0) {
                await sqliteDb.run(`INSERT INTO users (id, role, name, email, password) VALUES 
                    ('u_admin', 'Management', 'Admin', 'admin@myrecruiter.com', 'admin123'),
                    ('u_am', 'AccountManager', 'Account Manager', 'am@myrecruiter.com', 'am123'),
                    ('u_recruiter', 'Recruiter', 'Recruiter', 'recruiter@myrecruiter.com', 'recruiter123')
                `);
            }
            const tlRes = await sqliteDb.get("SELECT * FROM users WHERE id = 'u_teamlead'");
            if (!tlRes) {
                await sqliteDb.run(`INSERT INTO users (id, role, name, email, password) VALUES ('u_teamlead', 'TeamLead', 'Team Lead', 'teamlead@myrecruiter.com', 'teamlead123')`);
            }
        } catch (e) {
            console.error('[DB] SQLite user seeding notice:', e);
        }

        dbInstance = sqliteDb;
        return dbInstance;
    })();
    
    return initPromise;
}

export function getDataDir(): string {
    const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '../../');
    return path.join(baseDir, 'data');
}

/**
 * Helper to check if a specific action has hit its daily limit.
 */
export async function checkDailyLimit(action_type: 'feed_post' | 'group_post' | 'chat_message' | 'connection_request', max_limit: number): Promise<boolean> {
    const database = await initDb();
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const localDate = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    const row = await database.get(
        'SELECT count FROM daily_limits WHERE action_type = ? AND date = ?',
        [action_type, localDate]
    );

    if (!row) return true;
    return row.count < max_limit;
}

/**
 * Helper to increment the daily limit for a specific action.
 */
export async function incrementDailyLimit(action_type: 'feed_post' | 'group_post' | 'chat_message' | 'connection_request'): Promise<void> {
    const database = await initDb();
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const localDate = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    await database.run(`
        INSERT INTO daily_limits (action_type, date, count)
        VALUES (?, ?, 1)
        ON CONFLICT(action_type, date) 
        DO UPDATE SET count = count + 1
    `, [action_type, localDate]);
}
