console.log('STARTING SERVER FILE');
import { checkAndSendInterviewAlerts, reloadEmailTransporter, testSmtpConnection } from '../services/emailAlerts.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
import schedule from 'node-schedule';
import { initDb } from '../services/database.js';
import { AIService } from '../services/ai.js';
import { agentEvents, emitLog } from '../services/events.js';
import { LocalAgent } from '../bot/scrapers/local_agent.js';
import { ReporterService } from '../services/reporter.js';
import { BooleanAgent } from '../bot/scrapers/boolean_agent.js';
import { EmailScraper } from '../bot/scrapers/email.js';
import { SearchService } from '../services/search.js';
import { generateSystemId, verifyLicense } from '../services/licensing.js';
import { MatchCenterAgent } from '../bot/scrapers/match_center.js';
import { ResumeParser } from '../services/resumeParser.js';
import { EmailResumeScanner } from '../services/emailResumeScanner.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 8745;
const ai = new AIService();
const booleanAgent = new BooleanAgent(ai);

app.use(cors());
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../../public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// ====================================================================
// AUTHENTICATION API
// ====================================================================


app.get('/api/team', async (req, res) => {
    try {
        const agencyId = req.query.agency_id;
        const db = await initDb();
        let users;
        if (agencyId) {
            users = await db.all('SELECT id, name, role, email, phone, personal_email, agency_id, manager_id FROM users WHERE agency_id = ? OR agency_id IS NULL OR agency_id = \'hq\' ORDER BY role ASC, name ASC', [agencyId]);
        } else {
            users = await db.all('SELECT id, name, role, email, phone, personal_email, agency_id, manager_id FROM users ORDER BY role ASC, name ASC');
        }
        res.json(users || []);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// CHAT GROUPS API
app.post('/api/chat/groups', async (req, res) => {
    try {
        const { id, name, agency_id, created_by, members } = req.body;
        if (!id || !name || !agency_id || !created_by || !members || !Array.isArray(members)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const db = await initDb();
        // Insert group
        await db.run('INSERT INTO chat_groups (id, name, agency_id, created_by) VALUES (?, ?, ?, ?)', [id, name, agency_id, created_by]);
        
        // Insert members (including creator)
        for (const userId of members) {
            await db.run('INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)', [id, userId]);
        }
        
        res.json({ success: true, id });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/chat/groups', async (req, res) => {
    try {
        const { agency_id, user_id } = req.query;
        if (!agency_id || !user_id) return res.status(400).json({ error: 'Missing parameters' });
        
        const db = await initDb();
        const query = `
            SELECT g.* 
            FROM chat_groups g
            JOIN chat_group_members m ON g.id = m.group_id
            WHERE g.agency_id = ? AND m.user_id = ?
            ORDER BY g.name ASC
        `;
        
        const groups = await db.all(query, [agency_id, user_id]);
        res.json(groups || []);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});


app.get('/api/config', (req, res) => { res.json({ SUPABASE_URL: null, SUPABASE_ANON_KEY: null }); });



  app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = await initDb();
        const user = await db.get('SELECT id, role, name, email, agency_id FROM users WHERE email = ? AND password = ?', [email, password]);
        
        if (user) {
            res.json({ success: true, user });
        } else {
            res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.body;
        const db = await initDb();
        
        const user = await db.get('SELECT id FROM users WHERE email = ? AND password = ?', [email, oldPassword]);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid old password' });
        }
        
        await db.run('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ====================================================================
// SSE: Real-time event stream for dashboard logs (Fixes A1, C3, M3)
// ====================================================================
const sseClients: express.Response[] = [];



app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.push(res);
    req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1) sseClients.splice(idx, 1);
    });
});

// Forward all agent logs to SSE clients
agentEvents.on('log', (entry) => {
    const data = JSON.stringify(entry);
    for (const client of sseClients) {
        client.write(`data: ${data}\n\n`);
    }
});

agentEvents.on('db_update', (info) => {
    const data = JSON.stringify({ type: 'db_update', ...info });
    for (const client of sseClients) {
        client.write(`data: ${data}\n\n`);
    }
});

agentEvents.on('login_required', (required) => {
    const data = JSON.stringify({ type: 'login_required', required });
    for (const client of sseClients) {
        client.write(`data: ${data}\n\n`);
    }
});

// ====================================================================
// AI ENGINE AUTOMATION
// ====================================================================
app.get('/api/system/check-models', (req, res) => {
    exec('ollama list', (error, stdout, stderr) => {
        if (error) {
            return res.json({ installed: false, missingOllama: true });
        }
        const hasLlama3 = stdout.includes('llama3');
        const hasNomic = stdout.includes('nomic-embed-text');
        res.json({
            installed: true,
            missingOllama: false,
            hasLlama3,
            hasNomic,
            ready: hasLlama3 && hasNomic
        });
    });
});

app.post('/api/system/pull-models', (req, res) => {
    res.json({ started: true });
    
    emitLog('info', 'Starting AI Model download. Please wait, this may take a few minutes...');
    
    const pullModel = (modelName: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            emitLog('info', `Downloading ${modelName}...`);
            const child = spawn('ollama', ['pull', modelName]);
            
            child.stdout.on('data', (data) => {
                const str = data.toString().trim();
                if (str) emitLog('info', `[${modelName}]: ${str}`);
            });
            
            child.stderr.on('data', (data) => {
                const str = data.toString().trim();
                if (str) emitLog('info', `[${modelName} progress]: ${str}`);
            });
            
            child.on('close', (code) => {
                if (code === 0) {
                    emitLog('success', `Successfully downloaded ${modelName}!`);
                    resolve();
                } else {
                    emitLog('error', `Failed to download ${modelName}. Code: ${code}`);
                    reject(new Error(`Exit code ${code}`));
                }
            });
            
            child.on('error', (err) => {
                emitLog('error', `Error spawning ollama: ${err.message}`);
                reject(err);
            });
        });
    };

    (async () => {
        try {
            await pullModel('llama3');
            await pullModel('nomic-embed-text');
            emitLog('success', '✅ All AI Models downloaded and ready! You can now use the app.');
        } catch (e: any) {
            emitLog('error', '❌ Model download failed. Make sure Ollama is installed from ollama.com');
        }
    })();
});

// ====================================================================
// STATS ENDPOINT (Fix H2: Correct label mapping)
// ====================================================================
app.get('/api/stats', async (req, res) => {
    try {
        const db = await initDb();
        const candidates = await db.get('SELECT COUNT(*) as count FROM candidates');
        const connected = await db.get(`SELECT COUNT(*) as count FROM candidates WHERE status = 'connected'`);
        const conversations = await db.get('SELECT COUNT(*) as count FROM conversations');
        const connectionsSent = await db.get('SELECT COUNT(*) as count FROM connections');
        const jobsActive = await db.get(`SELECT COUNT(*) as count FROM jobs WHERE status IN ('pending', 'sourcing')`);
        res.json({
            totalSourced: candidates?.count || 0,
            totalConnected: connected?.count || 0,
            activeChats: conversations?.count || 0,
            outreachSent: connectionsSent?.count || 0,
            activeJobs: jobsActive?.count || 0
        });
    } catch (e: any) {
        res.json({ totalSourced: 0, totalConnected: 0, activeChats: 0, outreachSent: 0, activeJobs: 0 });
    }
});

// ====================================================================
// BROWSER STATUS ENDPOINT
// ====================================================================
app.get('/api/browser/status', (req, res) => {
    try {
        res.json({ busy: false, currentTask: '', queueLength: 0 });
    } catch (e: any) {
        res.json({ status: 'unknown', error: 'Failed to get browser status' });
    }
});

// ====================================================================
// SETTINGS API
// ====================================================================
// 1. Get Current Email Settings
app.get('/api/settings/email', (req, res) => {
    try {
        const smtpHost = process.env.SMTP_HOST || '';
        const smtpPort = process.env.SMTP_PORT || '587';
        const smtpSecure = process.env.SMTP_SECURE === 'true';
        const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || '';
        const smtpFrom = process.env.SMTP_FROM || '';
        const imapHost = process.env.EMAIL_HOST || '';
        const imapPort = process.env.EMAIL_PORT || '993';
        const hasPass = Boolean(process.env.SMTP_PASS || process.env.EMAIL_PASS);

        res.json({
            smtpHost,
            smtpPort,
            smtpSecure,
            smtpUser,
            smtpFrom,
            imapHost,
            imapPort,
            hasPass,
            isConfigured: Boolean(smtpHost && smtpUser && (process.env.SMTP_PASS || process.env.EMAIL_PASS))
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Save Email Settings
app.post('/api/settings/email', (req, res) => {
    try {
        const {
            smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom,
            imapHost, imapPort
        } = req.body;

        if (!smtpHost || !smtpUser) {
            return res.status(400).json({ error: 'SMTP Host and User/Email are required.' });
        }

        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const envPath = path.join(baseDir, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

        // If password is placeholder or unchanged, retain existing password
        const finalPass = (smtpPass && smtpPass !== '••••••••' && smtpPass !== '********')
            ? smtpPass
            : (process.env.SMTP_PASS || process.env.EMAIL_PASS || '');

        const finalSmtpPort = String(smtpPort || 587);
        const finalSmtpSecure = String(Boolean(smtpSecure));
        const finalFrom = smtpFrom || smtpUser;
        const finalImapHost = imapHost || smtpHost.replace('smtp.', 'imap.');
        const finalImapPort = String(imapPort || 993);

        // Update process.env immediately
        process.env.SMTP_HOST = smtpHost;
        process.env.SMTP_PORT = finalSmtpPort;
        process.env.SMTP_SECURE = finalSmtpSecure;
        process.env.SMTP_USER = smtpUser;
        process.env.SMTP_PASS = finalPass;
        process.env.SMTP_FROM = finalFrom;

        process.env.EMAIL_HOST = finalImapHost;
        process.env.EMAIL_PORT = finalImapPort;
        process.env.EMAIL_USER = smtpUser;
        process.env.EMAIL_PASS = finalPass;

        // Clean existing keys from .env
        envContent = envContent.split('\n').filter(line => {
            const trimmed = line.trim();
            return !trimmed.startsWith('SMTP_') && !trimmed.startsWith('EMAIL_');
        }).join('\n');

        // Append new configuration keys
        const newKeys = [
            `SMTP_HOST=${smtpHost}`,
            `SMTP_PORT=${finalSmtpPort}`,
            `SMTP_SECURE=${finalSmtpSecure}`,
            `SMTP_USER=${smtpUser}`,
            `SMTP_PASS=${finalPass}`,
            `SMTP_FROM=${finalFrom}`,
            `EMAIL_HOST=${finalImapHost}`,
            `EMAIL_PORT=${finalImapPort}`,
            `EMAIL_USER=${smtpUser}`,
            `EMAIL_PASS=${finalPass}`
        ].join('\n');

        envContent = envContent.trim() + '\n' + newKeys + '\n';
        fs.writeFileSync(envPath, envContent);

        // Reload email transporter
        reloadEmailTransporter();

        emitLog('success', `[SETTINGS] Email credentials configured and saved for ${smtpUser}`);
        res.json({
            success: true,
            message: 'Email settings saved successfully!',
            isConfigured: true
        });
    } catch (e: any) {
        emitLog('error', `[SETTINGS] Failed to save email settings: ${e.message}`);
        res.status(500).json({ error: e.message || 'Failed to save settings' });
    }
});

// 3. Test Email Connection
app.post('/api/settings/email/test', async (req, res) => {
    try {
        const {
            smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, testRecipient
        } = req.body;

        const effectivePass = (smtpPass && smtpPass !== '••••••••' && smtpPass !== '********')
            ? smtpPass
            : (process.env.SMTP_PASS || process.env.EMAIL_PASS || '');

        const result = await testSmtpConnection({
            host: smtpHost || process.env.SMTP_HOST,
            port: smtpPort ? parseInt(smtpPort, 10) : undefined,
            secure: smtpSecure !== undefined ? Boolean(smtpSecure) : undefined,
            user: smtpUser || process.env.SMTP_USER,
            pass: effectivePass,
            from: smtpFrom || process.env.SMTP_FROM,
            testRecipient: testRecipient || smtpUser || process.env.SMTP_USER
        });

        if (result.success) {
            emitLog('success', `[SETTINGS] Email test succeeded: ${result.message}`);
            res.json({ success: true, message: result.message });
        } else {
            emitLog('warn', `[SETTINGS] Email test failed: ${result.message}`);
            res.status(400).json({ success: false, error: result.message });
        }
    } catch (e: any) {
        emitLog('error', `[SETTINGS] Email test error: ${e.message}`);
        res.status(500).json({ success: false, error: e.message });
    }
});
app.post('/api/sync/emails', async (req, res) => {
    try {
        emitLog('info', '[SYNC] Manual email sync triggered by user.');
        const reporter = new ReporterService();
        await reporter.generateDailyReport();
        emitLog('success', '[SYNC] Manual email sync completed successfully.');
        res.json({ status: 'success' });
    } catch (e: any) {
        emitLog('error', `[SYNC] Manual email sync failed: ${e.message}`);
        res.status(500).json({ error: 'Sync failed' });
    }
});

app.post('/api/settings/local', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: 'Missing folder path' });

        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const envPath = path.join(baseDir, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        
        envContent = envContent.split('\n').filter(line => !line.startsWith('LOCAL_RESUME_PATH=')).join('\n');
        envContent += `\nLOCAL_RESUME_PATH=${folderPath}\n`;
        
        process.env.LOCAL_RESUME_PATH = folderPath;
        fs.writeFileSync(envPath, envContent.trim() + '\n');
        emitLog('success', `[SETTINGS] Local resume path saved: ${folderPath}`);
        res.json({ status: 'success' });
    } catch (e: any) {
        emitLog('error', `[SETTINGS] Failed to save local path: ${e.message}`);
        res.status(500).json({ error: 'Save failed' });
    }
});

// ====================================================================
// LICENSE API (DEACTIVATED - PERMANENTLY UNLOCKED)
// ====================================================================
app.get('/api/license/status', (req, res) => {
    try {
        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const defaultLocalPath = path.join(baseDir, 'data', 'resumes');
        const localPath = process.env.LOCAL_RESUME_PATH || defaultLocalPath;

        // Product Activation is permanently deactivated - Always valid & unlocked
        res.json({ 
            valid: true, 
            systemId: 'RECRUITGO-ENTERPRISE', 
            error: null,
            daysRemaining: 9999,
            expiryDate: '2099-12-31',
            tier: 'ENTERPRISE',
            localPath: localPath
        });
    } catch (e: any) {
        res.json({ valid: true, error: null, systemId: 'RECRUITGO-ENTERPRISE', tier: 'ENTERPRISE' });
    }
});

app.post('/api/license/verify', (req, res) => {
    res.json({ success: true, tier: 'ENTERPRISE', message: 'Product is permanently active.' });
});

// ====================================================================
// GROUPS API
// ====================================================================
app.get('/api/groups', async (req, res) => {
    try {
        const db = await initDb();
        const groups = await db.all('SELECT * FROM groups ORDER BY name ASC');
        res.json(groups);
    } catch (e: any) {
        res.json([]);
    }
});

// ====================================================================
// AM DASHBOARD
// ====================================================================
app.get('/api/am/dashboard', async (req, res) => {
    try {
        const db = await initDb();
        const clients = await db.all('SELECT * FROM clients ORDER BY company_name ASC');
        const spokes = await db.all('SELECT * FROM spoke_persons');
        const jobs = await db.all('SELECT * FROM jobs');
        const assignments = await db.all('SELECT * FROM job_assignments');
        const clientAssigns = await db.all('SELECT * FROM client_assignments');
        const users = await db.all('SELECT id, name, email FROM users');
        
        // Deduplicate clients by normalized company_name
        const seenCompanies = new Set<string>();
        const uniqueClients = (clients || []).filter((cl: any) => {
            const norm = (cl.company_name || '').trim().toLowerCase();
            if (!norm || seenCompanies.has(norm)) return false;
            seenCompanies.add(norm);
            return true;
        });

        const dashboardData = uniqueClients.map((client: any) => {
            // Find all client IDs matching this company name
            const matchingClientIds = new Set((clients || []).filter((c: any) => (c.company_name || '').trim().toLowerCase() === (client.company_name || '').trim().toLowerCase()).map((c: any) => c.id));
            const clientSpokes = Array.from(new Set(spokes.filter((s: any) => matchingClientIds.has(s.client_id)).map((s: any) => s.name)));
            const clientJobs = jobs.filter((j: any) => (j.company && (j.company || '').trim().toLowerCase() === (client.company_name || '').trim().toLowerCase()) || (j.client_id && matchingClientIds.has(j.client_id)));
            const liveRoleNames = Array.from(new Set(clientJobs.map((j: any) => j.title)));
            
            let recruiters = new Set<string>();
            // Recruiters from job assignments
            clientJobs.forEach((j: any) => {
                assignments.filter((a: any) => a.job_id === j.id).forEach((a: any) => {
                    const u = users.find((usr: any) => usr.id === a.recruiter_id);
                    if (u) recruiters.add(u.name);
                });
            });
            // Recruiters from client assignments
            clientAssigns.filter((a: any) => matchingClientIds.has(a.client_id)).forEach((a: any) => {
                const u = users.find((usr: any) => usr.id === a.recruiter_id);
                if (u) recruiters.add(u.name);
            });
            
            return {
                id: client.id,
                company_name: client.company_name,
                spoke_persons: clientSpokes.join(', ') || 'None',
                live_roles: liveRoleNames.join(', ') || 'None',
                recruiters: Array.from(recruiters.values()).join(', ') || 'None'
            };
        });
        
        res.json({ success: true, data: dashboardData });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/am/clients-spokes', async (req, res) => {
    try {
        const db = await initDb();
        const clients = await db.all('SELECT * FROM clients ORDER BY company_name ASC');
        const spokes = await db.all('SELECT * FROM spoke_persons ORDER BY name ASC');

        const seenClientNames = new Set<string>();
        const uniqueClients = (clients || []).filter((cl: any) => {
            const norm = (cl.company_name || '').trim().toLowerCase();
            if (!norm || seenClientNames.has(norm)) return false;
            seenClientNames.add(norm);
            return true;
        });

        const seenSpokes = new Set<string>();
        const uniqueSpokes = (spokes || []).filter((sp: any) => {
            const key = `${sp.client_id}:::${(sp.name || '').trim().toLowerCase()}`;
            if (seenSpokes.has(key)) return false;
            seenSpokes.add(key);
            return true;
        });

        res.json({ success: true, clients: uniqueClients, spokes: uniqueSpokes });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients', async (req, res) => {
    try {
        const db = await initDb();
        const clients = await db.all('SELECT * FROM clients ORDER BY company_name ASC');
        const seenNames = new Set<string>();
        const uniqueClients = (clients || []).filter((cl: any) => {
            const norm = (cl.company_name || '').trim().toLowerCase();
            if (!norm || seenNames.has(norm)) return false;
            seenNames.add(norm);
            return true;
        });
        res.json({ success: true, clients: uniqueClients });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/recruiters', async (req, res) => {
    try {
        const db = await initDb();
        const recruiters = await db.all(`SELECT id, name, email FROM users WHERE role = 'Recruiter'`);
        res.json(recruiters);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/recruiters', async (req, res) => {
    try {
        const { name, email, password, client_id } = req.body;
        if (!name || !email || !password || !client_id) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        const db = await initDb();
        
        // Check if email already exists
        const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        const id = 'u_r_' + Date.now();
        await db.run('INSERT INTO users (id, role, name, email, password) VALUES (?, ?, ?, ?, ?)', [id, 'Recruiter', name, email, password]);
        
        // Map to client
        await db.run('INSERT INTO client_assignments (client_id, recruiter_id) VALUES (?, ?)', [client_id, id]);
        
        agentEvents.emit('db_update', { action: 'refresh_am_dashboard' });
        res.json({ success: true, recruiter: { id, name, email } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// POST /api/clients/:id/recruiters
app.post('/api/clients/:id/recruiters', async (req, res) => {
    try {
        const clientId = req.params.id;
        const { recruiter_ids } = req.body;
        const db = await initDb();
        
        // Delete existing client assignments to fully replace
        await db.run('DELETE FROM client_assignments WHERE client_id = ?', [clientId]);
        
        // Insert new ones
        for (const rid of recruiter_ids) {
            await db.run('INSERT INTO client_assignments (client_id, recruiter_id) VALUES (?, ?)', [clientId, rid]);
        }
        
        agentEvents.emit('db_update', { action: 'refresh_am_dashboard' });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// GET /api/clients/:id/recruiters
app.get('/api/clients/:id/recruiters', async (req, res) => {
    try {
        const db = await initDb();
        const assignments = await db.all('SELECT recruiter_id FROM client_assignments WHERE client_id = ?', [req.params.id]);
        res.json({ success: true, recruiter_ids: assignments.map(a => a.recruiter_id) });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// Status-only update route (used by status dropdowns in Live Roles)
app.put('/api/jobs/:id/status', async (req, res) => {
    try {
        const db = await initDb();
        const { status } = req.body;
        await db.run('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Live Roles: Assign Recruiter
app.put('/api/jobs/:id/assign', async (req, res) => {
    try {
        const db = await initDb();
        const { assigned_recruiter } = req.body;
        await db.run('UPDATE jobs SET assigned_recruiter = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [assigned_recruiter, req.params.id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Live Roles: Get Notes
app.get('/api/jobs/:id/notes', async (req, res) => {
    try {
        const db = await initDb();
        const notes = await db.all('SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC', [req.params.id]);
        res.json(notes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Live Roles: Add Note
app.post('/api/jobs/:id/notes', async (req, res) => {
    try {
        const db = await initDb();
        const { note, author_id, author_name } = req.body;
        if (!note || !note.trim()) {
            return res.status(400).json({ error: 'Note content is required.' });
        }
        await db.run('INSERT INTO job_notes (job_id, note) VALUES (?, ?)', [req.params.id, note.trim()]);
        res.json({ success: true, message: 'Note added successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ====================================================================
// JOBS CRUD — Unified & SQLite/Postgres-backed
// ====================================================================
app.get('/api/jobs', async (req, res) => {
    try {
        const db = await initDb();
        const userId = req.query.user_id;
        
        if (userId) {
            const user = await db.get('SELECT role FROM users WHERE id = ?', [userId]);
            if (user && user.role === 'Recruiter') {
                const jobs = await db.all(`
                    SELECT j.* FROM jobs j
                    JOIN job_assignments ja ON j.id = ja.job_id
                    WHERE ja.recruiter_id = ? AND j.status = 'active'
                    ORDER BY j.created_at DESC
                `, [userId]);
                return res.json(jobs);
            }
        }
        
        // For AMs and Management, show all active/non-pending jobs
        const jobs = await db.all("SELECT * FROM jobs WHERE status != 'pending_am' ORDER BY created_at DESC");
        res.json(jobs);
    } catch (e: any) {
        res.json([]);
    }
});

app.get('/api/am/pending-jobs', async (req, res) => {
    try {
        const db = await initDb();
        const jobs = await db.all("SELECT * FROM jobs WHERE status = 'pending_am' ORDER BY created_at DESC");
        res.json(jobs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/am/jobs/:id/approve', async (req, res) => {
    try {
        const db = await initDb();
        const jobId = req.params.id;
        const { title, location, description, recruiters, company, jobType, workMode } = req.body;
        
        await db.run(
            `UPDATE jobs SET title = ?, location = ?, description = ?, company = ?, jobType = ?, workMode = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, location, description, company, jobType, workMode, jobId]
        );
        
        // Update assignments
        await db.run('DELETE FROM job_assignments WHERE job_id = ?', [jobId]);
        if (Array.isArray(recruiters)) {
            for (const rId of recruiters) {
                await db.run('INSERT INTO job_assignments (job_id, recruiter_id) VALUES (?, ?)', [jobId, rId]);
            }
        }
        
        agentEvents.emit('db_update', { action: 'job_approved', jobId });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/jobs', async (req, res) => {
    // C2 FIX: Server-side validation
    const { title, description, location, company, jobType, workMode, client_id, spoke_person_id } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Job title is required.' });
    }
    if (!description || !description.trim()) {
        return res.status(400).json({ error: 'Job description is required.' });
    }

    try {
        const db = await initDb();
        const id = Date.now().toString();
        await db.run(
            `INSERT INTO jobs (id, title, location, company, description, jobType, workMode, status, client_id, spoke_person_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [id, title.trim(), (location || '').trim(), (company || '').trim(), description.trim(), jobType || 'Permanent', workMode || 'Onsite', client_id || null, spoke_person_id || null]
        );
        const newJob = await db.get('SELECT * FROM jobs WHERE id = ?', [id]);
        emitLog('success', `[JOBS] New job created: "${title.trim()}"`);
        res.json(newJob);

        // Asynchronously trigger the Boolean Generator Agent
        const booleanAgent = new BooleanAgent(ai);
        booleanAgent.generateForJob(id, newJob).catch(err => {
            console.error('[BOOLEAN AGENT] Background generation failed:', err);
        });

    } catch (e: any) {
        res.status(500).json({ error: 'Failed to create job: ' + e.message });
    }
});

// GET /api/jobs/:id/post-content
app.get('/api/jobs/:id/post-content', async (req, res) => {
    try {
        const db = await initDb();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (job.post_content) {
            return res.json({ content: job.post_content });
        }
        
        // Generate on the fly and cache
        emitLog('info', `[AI] Generating LinkedIn Post for job ${req.params.id}...`);
        const content = await ai.generatePost(job, 'Feed');
        await db.run('UPDATE jobs SET post_content = ? WHERE id = ?', [content, req.params.id]);
        res.json({ content });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/jobs/:id/req-analysis
app.get('/api/jobs/:id/req-analysis', async (req, res) => {
    try {
        const db = await initDb();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        // Ensure boolean search strings are generated for this job
        if (!job.linkedin_level_1 && !job.linkedin_boolean) {
            emitLog('info', `[BOOLEAN AGENT] Generating search booleans for job ${req.params.id}...`);
            await booleanAgent.generateForJob(job.id, job);
        }

        if (job.req_analysis) {
            return res.json({ content: job.req_analysis });
        }
        
        // Generate on the fly and cache
        emitLog('info', `[AI] Generating Requirement Analysis for job ${req.params.id}...`);
        const content = await ai.generateReqAnalysis(job);
        await db.run('UPDATE jobs SET req_analysis = ? WHERE id = ?', [content, req.params.id]);
        res.json({ content });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/jobs/:id/approach-note
app.get('/api/jobs/:id/approach-note', async (req, res) => {
    try {
        const db = await initDb();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (job.approach_note) {
            return res.json({ content: job.approach_note });
        }
        
        emitLog('info', `[AI] Generating Approach Note for job ${req.params.id}...`);
        const content = await ai.generateApproachNote(job);
        await db.run('UPDATE jobs SET approach_note = ? WHERE id = ?', [content, req.params.id]);
        res.json({ content });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/jobs/:id/inmail-message
app.get('/api/jobs/:id/inmail-message', async (req, res) => {
    try {
        const db = await initDb();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (job.inmail_message) {
            return res.json({ content: job.inmail_message });
        }
        
        emitLog('info', `[AI] Generating InMail Message for job ${req.params.id}...`);
        const content = await ai.generateInmailMessage(job);
        await db.run('UPDATE jobs SET inmail_message = ? WHERE id = ?', [content, req.params.id]);
        res.json({ content });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/jobs/:id/pre-screening
app.get('/api/jobs/:id/pre-screening', async (req, res) => {
    try {
        const db = await initDb();
        const job = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (job.pre_screening) {
            return res.json({ content: job.pre_screening });
        }
        
        // Generate on the fly and cache
        emitLog('info', `[AI] Generating Pre-Screening Questions for job ${req.params.id}...`);
        const content = await ai.generatePreScreeningQuestions(job);
        await db.run('UPDATE jobs SET pre_screening = ? WHERE id = ?', [content, req.params.id]);
        res.json({ content });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/match-center', async (req, res) => {
    const { jdText, cvText } = req.body;
    if (!jdText || !cvText) {
        return res.status(400).json({ error: 'Both JD and CV text are required.' });
    }
    
    // Immediately write and flush headers so client fetch never times out or errors with 'Failed to fetch'
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
    }
    req.socket?.setTimeout(0);
    res.socket?.setTimeout(0);

    // Send immediate initial handshake
    res.write(`data: ${JSON.stringify({ type: 'init', message: 'Analyzing job requirements against candidate CV...' })}\n\n`);

    // Keepalive ping interval every 3s to prevent socket timeouts
    const pingTimer = setInterval(() => {
        if (!res.writableEnded) {
            res.write(`: keepalive\n\n`);
        }
    }, 3000);

    res.on('close', () => {
        clearInterval(pingTimer);
    });

    try {
        const agent = new MatchCenterAgent();
        const report = await agent.generateMatchReport(jdText, cvText, (chunk: string) => {
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'progress', chunk })}\n\n`);
            }
        });
        clearInterval(pingTimer);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'complete', report })}\n\n`);
            res.end();
        }
    } catch (e: any) {
        clearInterval(pingTimer);
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: e.message || 'Failed to generate report' })}\n\n`);
            res.end();
        }
    }
});

app.delete('/api/jobs/:id', async (req, res) => {
    try {
        const db = await initDb();
        // Full cascading delete — clean up ALL related data
        await db.run('DELETE FROM conversations WHERE job_id = ?', [req.params.id]);
        await db.run('DELETE FROM connections WHERE job_id = ?', [req.params.id]);
        await db.run('DELETE FROM candidates WHERE job_id = ?', [req.params.id]);
        await db.run('DELETE FROM job_notes WHERE job_id = ?', [req.params.id]);
        await db.run('DELETE FROM posts WHERE job_id = ?', [req.params.id]);
        const result = await db.run('DELETE FROM jobs WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }
        emitLog('info', `[JOBS] Deleted job ${req.params.id}`);
        res.json({ status: 'deleted' });
    } catch (e: any) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

app.put('/api/jobs/:id', async (req, res) => {
    try {
        const db = await initDb();
        const { title, description, location, company, jobType, workMode } = req.body;
        await db.run(
            `UPDATE jobs SET title = ?, location = ?, company = ?, description = ?, jobType = ?, workMode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title, location || '', company || '', description || '', jobType || 'Permanent', workMode || 'Onsite', req.params.id]
        );
        const updated = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
        if (!updated) return res.status(404).json({ error: 'Job not found' });
        emitLog('info', `[JOBS] Updated job: "${title}"`);
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// ====================================================================
// OPEN LOCAL FILE (Secured: Clickable Resumes)
// ====================================================================
app.post('/api/open-file', async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: 'File path required' });

        // Security: Only allow safe file extensions
        const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];
        const ext = path.extname(filePath).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return res.status(403).json({ error: `File type "${ext}" is not allowed. Only PDF, DOCX, DOC, TXT, RTF files can be opened.` });
        }

        const resolvedPath = path.resolve(filePath);
        const allowedBase = path.resolve(__dirname, '../../');
        if (!resolvedPath.startsWith(allowedBase) && !resolvedPath.startsWith(process.cwd())) {
            return res.status(403).json({ error: 'Access denied: Invalid file path.' });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ error: 'File not found on disk.' });
        }

        if (process.platform === 'win32') {
            const { execFile } = await import('child_process');
            execFile('cmd', ['/c', 'start', '""', resolvedPath], (err) => {
                if (err) {
                    emitLog('error', `[SYSTEM] Failed to open file: ${err.message}`);
                    return res.status(500).json({ error: 'Failed to open file' });
                }
                res.json({ success: true });
            });
        } else {
            res.json({ success: true, message: 'File verified on server' });
        }
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to open file: ' + e.message });
    }
});


// ====================================================================
// CANDIDATES ENDPOINT (Fix H1: Sourcing Pulse data)
// ====================================================================

// ====================================================================
// ATS CANDIDATE MANAGEMENT ENDPOINTS
// ====================================================================


// --- CV PARSING (AUTO-FILL) ---
app.post('/api/parse-cv-base64', async (req, res) => {
    try {
        const { filename, base64 } = req.body;
        if (!filename || !base64) return res.status(400).json({ error: 'Missing filename or base64' });

        const safeFilename = path.basename(filename);
        const buffer = Buffer.from(base64, 'base64');

        // 1. Save uploaded resume file to data/resumes so it can be previewed/downloaded
        const resumesDir = path.join(process.cwd(), 'data', 'resumes');
        if (!fs.existsSync(resumesDir)) {
            try { fs.mkdirSync(resumesDir, { recursive: true }); } catch (e) {}
        }
        const savePath = path.join(resumesDir, safeFilename);
        try {
            fs.writeFileSync(savePath, buffer);
        } catch (saveErr) {
            console.error('Could not save uploaded resume file to disk:', saveErr);
        }

        // 2. Extract text using ResumeParser (handles PDF, DOCX, DOC, TXT, RTF safely without require crashes)
        const extractedText = await ResumeParser.parseBuffer(buffer, safeFilename);
        if (!extractedText || extractedText.trim() === '') {
            return res.status(400).json({ error: 'Could not extract readable text from the uploaded CV.' });
        }

        // 3. Deterministic Heuristic Extraction (immediate, 100% reliable fallback)
        const heuristic = ResumeParser.extractCandidateProfile(extractedText, safeFilename);

        let finalName = heuristic.name || '';
        let finalEmail = heuristic.email || '';
        let finalPhone = heuristic.phone || '';
        let finalHeadline = heuristic.headline || '';
        let finalSkills = heuristic.skills || [];
        let finalExp = heuristic.experience_years || '';
        let finalCompany = '';
        let finalLocation = '';

        // 4. AI Structured Extraction Enhancement (using module-level ai instance)
        try {
            const prompt = `Extract the candidate's professional profile from this resume text.
Return ONLY a valid JSON object (no markdown, no backticks, no codeblocks) with these exact keys:
"name": string (full name of the candidate),
"email": string,
"phone": string,
"headline": string (current professional job title or 3-6 word summary),
"current_company": string (most recent or current employer),
"location": string (city, state, or country),
"experience_years": string (e.g. "5 Years"),
"skills": array of strings (top 8-15 technical/functional skills)

Resume Text:
${extractedText.substring(0, 4500)}`;

            const aiResponse = await ai.generateText(prompt);
            if (aiResponse) {
                const clean = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(clean);
                if (parsed.name && parsed.name.trim().length > 1) finalName = parsed.name.trim();
                if (parsed.email && parsed.email.includes('@')) finalEmail = parsed.email.trim();
                if (parsed.phone && parsed.phone.trim().length >= 7) finalPhone = parsed.phone.trim();
                if (parsed.headline && parsed.headline.trim().length > 2) finalHeadline = parsed.headline.trim();
                if (parsed.current_company && parsed.current_company.trim().length > 1) finalCompany = parsed.current_company.trim();
                if (parsed.location && parsed.location.trim().length > 1) finalLocation = parsed.location.trim();
                if (parsed.experience_years && parsed.experience_years.trim().length > 0) finalExp = parsed.experience_years.trim();
                if (Array.isArray(parsed.skills) && parsed.skills.length > 0) {
                    const combinedSkills = Array.from(new Set([...finalSkills, ...parsed.skills]));
                    finalSkills = combinedSkills;
                }
            }
        } catch (aiErr: any) {
            console.log('[CV Parse] AI enhancement note:', aiErr.message || aiErr);
            // Non-fatal: heuristic values are already extracted
        }

        res.json({
            success: true,
            data: {
                name: finalName,
                email: finalEmail,
                phone: finalPhone,
                headline: finalHeadline,
                current_company: finalCompany,
                location: finalLocation,
                experience_years: finalExp,
                skills: finalSkills,
                cv_path: 'resumes/' + safeFilename
            }
        });
    } catch (e: any) {
        console.error('[CV Parse Error]', e);
        res.status(500).json({ error: (e as Error).message });
    }
});

// --- FAST CV TEXT EXTRACTION (FOR MATCHING CENTER & EVIDENCE ENGINE) ---
app.post('/api/extract-cv-text', async (req, res) => {
    try {
        const { filename, base64 } = req.body;
        if (!filename || !base64) {
            return res.status(400).json({ error: 'Missing filename or base64 data' });
        }
        const buffer = Buffer.from(base64, 'base64');
        const text = await ResumeParser.parseBuffer(buffer, filename);
        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'Could not extract readable text from the uploaded CV file.' });
        }
        res.json({
            success: true,
            filename,
            text: text.trim(),
            characterCount: text.trim().length
        });
    } catch (e: any) {
        console.error('[API /api/extract-cv-text error]:', e);
        res.status(500).json({ error: (e as Error).message || 'Failed to parse resume document' });
    }
});


app.put('/api/candidates/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const db = await initDb();
        await db.run('UPDATE candidates SET status = ? WHERE id = ?', [status, id]);
        
        // Add timeline event
        await db.run('INSERT INTO candidate_timeline (id, candidate_id, type, content, timestamp) VALUES (?, ?, ?, ?, ?)',
            [require('crypto').randomUUID(), id, 'stage', `Stage changed to ${status}`, new Date().toISOString()]
        );
        
        res.json({ success: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/candidates', async (req, res) => {
    try {
        const { name, email, phone, current_company, location, headline, job_id, resume_path, recruiter_id } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        
        const db = await initDb();
        const id = 'cand_' + Date.now();
        await db.run(`
            INSERT INTO candidates (id, name, email, phone, current_company, location, headline, job_id, resume_path, status, recruiter_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sourced', ?)
        `, [id, name, email || '', phone || '', current_company || '', location || '', headline || '', job_id, resume_path || '', recruiter_id || null]);
        
        // Log in pipeline
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), id, 'Sourced']);
            
        emitLog('info', `[ATS] New candidate added: ${name}`);
        agentEvents.emit('db_update', { table: 'candidates', action: 'insert' });
        res.json({ success: true, id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/candidates/:id', async (req, res) => {
    try {
        const db = await initDb();
        const candidate = await db.get('SELECT * FROM candidates WHERE id = ?', [req.params.id]);
        if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

        const subs = await db.all(`
            SELECT s.id, s.candidate_id, s.job_id, s.status, s.created_at,
                   j.title as job_title, j.job_code,
                   cl.company_name as client_name,
                   u.name as recruiter_name
            FROM submissions s
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE s.candidate_id = ?
            ORDER BY s.created_at DESC
        `, [req.params.id]);
        candidate.submissions = subs || [];
        candidate.submissions_count = candidate.submissions.length;

        res.json(candidate);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/candidates/:id', async (req, res) => {
    try {
        const candidateId = req.params.id;
        const {
            name,
            email,
            phone,
            title,
            headline,
            company,
            current_company,
            location,
            skills,
            status,
            salary,
            expected_salary,
            current_salary,
            notice_period,
            visa_status,
            experience_years,
            relocation_preferred,
            experience_summary,
            experience_details
        } = req.body;

        if (!name) return res.status(400).json({ error: 'Candidate name is required' });

        const db = await initDb();
        await db.run(`
            UPDATE candidates SET
                name = ?,
                email = ?,
                phone = ?,
                title = ?,
                headline = ?,
                company = ?,
                current_company = ?,
                location = ?,
                skills = ?,
                status = COALESCE(?, status),
                salary = ?,
                expected_salary = ?,
                current_salary = ?,
                notice_period = ?,
                visa_status = ?,
                experience_years = ?,
                relocation_preferred = ?,
                experience_summary = ?,
                experience_details = ?
            WHERE id = ?
        `, [
            name,
            email || '',
            phone || '',
            title || headline || '',
            headline || title || '',
            company || current_company || '',
            current_company || company || '',
            location || '',
            skills || '',
            status || null,
            salary || '',
            expected_salary || '',
            current_salary || '',
            notice_period || '',
            visa_status || '',
            experience_years !== undefined && experience_years !== '' ? Number(experience_years) : null,
            relocation_preferred || null,
            experience_summary || '',
            experience_details !== undefined ? (typeof experience_details === 'string' ? experience_details : JSON.stringify(experience_details)) : null,
            candidateId
        ]);

        emitLog('info', `[ATS] Candidate ${candidateId} (${name}) details updated.`);
        agentEvents.emit('db_update', { table: 'candidates', action: 'update', id: candidateId });
        res.json({ success: true });
    } catch (e: any) {
        console.error('[ATS Edit Error]', e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/candidates/:id/stage', async (req, res) => {
    try {
        const { stage, joining_date } = req.body;
        const candidateId = req.params.id;
        if (!stage) return res.status(400).json({ error: 'Stage required' });
        
        const db = await initDb();
        if (joining_date) {
            await db.run('UPDATE candidates SET status = ?, joining_date = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [stage, joining_date, candidateId]);
        } else {
            await db.run('UPDATE candidates SET status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [stage, candidateId]);
        }
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), candidateId, stage]);
            
        emitLog('info', `[ATS] Candidate ${candidateId} moved to stage: ${stage}`);
        agentEvents.emit('db_update', { table: 'candidates', action: 'update', id: candidateId });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/candidates/:id/submit-am', async (req, res) => {
    try {
        const candidateId = req.params.id;
        const db = await initDb();
        
        const stage = 'Submitted to AM';
        await db.run('UPDATE candidates SET status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [stage, candidateId]);
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), candidateId, stage]);
            
        emitLog('success', `[ATS] Candidate submitted to Account Manager for review.`);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/candidates/:id/submit-client', async (req, res) => {
    try {
        const candidateId = req.params.id;
        const db = await initDb();
        
        const stage = 'Submitted to Client';
        await db.run('UPDATE candidates SET status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [stage, candidateId]);
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), candidateId, stage]);
            
        emitLog('success', `[ATS] Candidate submitted to Client successfully.`);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ====================================================================
// INTERNAL ATS SEARCH (Phase 2)
// ====================================================================
app.get('/api/candidates/search', async (req, res) => {
    try {
        const q = req.query.q;
        if (!q) return res.json([]);
        
        const db = await initDb();
        
        // Postgres Full-Text Search on search_vector
        const query = `
            SELECT id, name, title, skills, company, location, linkedin_url, status 
            FROM candidates 
            WHERE search_vector @@ websearch_to_tsquery('english', $1)
            ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1)) DESC
            LIMIT 50
        `;
        
        const results = await db.all(query, [q]);
        res.json(results);
    } catch (e: any) {
        console.error('ATS Search Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/candidates', async (req, res) => {
    try {
        const db = await initDb();
        const jobId = req.query.jobId;
        let candidates;
        if (jobId) {
            candidates = await db.all('SELECT * FROM candidates WHERE job_id = ? ORDER BY match_score DESC', [jobId]);
        } else {
            candidates = await db.all('SELECT * FROM candidates ORDER BY timestamp DESC LIMIT 50');
        }
        res.json(candidates);
    } catch (e: any) {
        res.json([]);
    }
});

app.delete('/api/candidates', async (req, res) => {
    try {
        const db = await initDb();
        await db.run('DELETE FROM candidates');
        emitLog('success', '[SYSTEM] Candidate sourcing history has been cleared.');
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/conversations', async (req, res) => {
    try {
        const db = await initDb();
        const conversations = await db.all('SELECT * FROM conversations ORDER BY last_updated DESC LIMIT 30');
        res.json(conversations);
    } catch (e: any) {
        res.json([]);
    }
});

// ====================================================================
// BOT ACTIONS
// ====================================================================
app.post('/api/run/:mode', async (req, res) => {
    const mode = req.params.mode;
    emitLog('info', `[SERVER] Triggering mode: ${mode}`);

    try {
        if (mode === 'report') {
            const reporter = new ReporterService();
            reporter.generateDailyReport()
                .then(() => emitLog('success', '[REPORTER] Report generation complete.'))
                .catch(err => emitLog('error', `[REPORTER] Failed: ${err.message}`));
            return res.json({ status: 'started' });
        }

        if (mode === 'local') {
            const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
            const folderPath = process.env.LOCAL_RESUME_PATH || path.join(baseDir, 'data', 'resumes');
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            const localAgent = new LocalAgent(ai);
            localAgent.scanLocalFolder(folderPath)
                .then(() => emitLog('success', '[LOCAL AGENT] Scan complete.'))
                .catch(err => emitLog('error', `[LOCAL AGENT] Failed: ${err.message}`));
            return res.json({ status: 'started' });
        }

        res.status(400).json({ error: 'Unknown or removed mode' });
    } catch (e: any) {
        emitLog('error', `[SERVER] Error in mode ${mode}: ${e.message}`);
        res.status(500).json({ error: 'Failed to trigger action' });
    }
});

// Initialize DB on startup
initDb().then(() => {
    emitLog('success', '[DATABASE] SQLite initialized successfully.');
}).catch(err => {
    console.error('[DATABASE] Failed to initialize:', err);
});

// ====================================================================
// AUTOMATED SCHEDULING (11:00 PM IST DAILY REPORT)
// ====================================================================
// IST is UTC+5:30. 
// 11:00 PM IST = 23:00 IST = 17:30 UTC
// To be safe, we will use the tz property of node-schedule
schedule.scheduleJob({ hour: 23, minute: 0, tz: 'Asia/Kolkata' }, async () => {
    emitLog('info', '[CRON] Triggering automated daily Excel tracker append (11:00 PM IST)...');
    try {
        const reporter = new ReporterService();
        await reporter.generateDailyReport();
        emitLog('success', '[CRON] Daily Excel tracker updated successfully.');
    } catch (err: any) {
        emitLog('error', `[CRON] Daily report failed: ${err.message}`);
    }
});

// ====================================================================
// AUTOMATED 5-MINUTE JOB INGESTION
// ====================================================================
schedule.scheduleJob('*/5 * * * *', async () => {
    emitLog('info', '[CRON] Checking for new Job Descriptions via Email...');
    try {
        const emailScraper = new EmailScraper(ai);
        const recruitmentData = await emailScraper.getDailyRecruitmentData();
        const db = await initDb();
        
        for (const entry of recruitmentData) {

            if (entry.type === 'INTERVIEW_SCHEDULE') {
                const updateData = entry.data;
                const candName = updateData.candidateName;
                if (!candName) continue;
                
                // Try to find candidate by name (loose match)
                const candidates = await db.all('SELECT * FROM candidates WHERE name LIKE ?', [`%${candName}%`]);
                if (candidates.length > 0) {
                    const cand = candidates[0]; // Take the first match
                    const newStage = updateData.stage || 'Update Received';
                    const remarks = updateData.remarks || 'Status updated via email parsing.';
                    
                    // Update status
                    await db.run('UPDATE candidates SET status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?', [newStage, cand.id]);
                    
                    // Add to pipeline
                    await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)', 
                        ['pipe_' + Date.now() + Math.floor(Math.random()*1000), cand.id, newStage]);
                        
                    // Add remarks
                    await db.run('INSERT INTO candidate_remarks (candidate_id, author_id, author_name, remark_text) VALUES (?, ?, ?, ?)', 
                        [cand.id, 'system', 'Email Agent', remarks]);
                        
                    emitLog('success', `[PIPELINE] Auto-updated ${cand.name} to stage: ${newStage}`);
                    agentEvents.emit('db_update', { action: 'pipeline_update', candidateId: cand.id });
                } else {
                    emitLog('warn', `[PIPELINE] Received email update for ${candName} but could not find them in DB.`);
                }
            } else if (entry.type === 'NEW_JOB_REQUIREMENT') {
                const jobData = entry.data;
                const title = jobData['Job Title'];
                if (!title) continue;
                
                let description = `Roles & Responsibilities:\n${jobData['Roles & Responsibilities']}\n\n`;
                description += `Mandatory Skills:\n${(jobData['Mandatory Skills'] || []).join(', ')}\n\n`;
                description += `Nice to Have Skills:\n${(jobData['Nice to have skills'] || []).join(', ')}\n\n`;
                description += `Interview Stages:\n${jobData['Interview Stages']}`;
                
                const id = Date.now().toString() + Math.floor(Math.random()*1000);
                
                let clientId = '';
                let spokePersonId = '';
                
                if (entry.senderEmail) {
                    const spoke = await db.get('SELECT id, client_id FROM spoke_persons WHERE email = ?', [entry.senderEmail]);
                    if (spoke) {
                        spokePersonId = spoke.id;
                        clientId = spoke.client_id;
                    }
                }
                
                await db.run(
                    `INSERT INTO jobs (id, title, location, company, description, jobType, workMode, status, client_id, spoke_person_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_am', ?, ?)`,
                    [id, title, jobData['Job Location'] || '', jobData['Company Hiring'] || '', description, jobData['Job Type'] || 'Permanent', jobData['Work Mode'] || 'Onsite', clientId, spokePersonId]
                );
                
                const newJob = await db.get('SELECT * FROM jobs WHERE id = ?', [id]);
                emitLog('success', `[JOBS] Auto-ingested new job: "${title}"`);
                
                // Trigger boolean agent
                const booleanAgent = new BooleanAgent(ai);
                booleanAgent.generateForJob(id, newJob).catch(err => {
                    console.error('[BOOLEAN AGENT] Background generation failed:', err);
                });
            }
        }
    } catch (err: any) {
        emitLog('error', `[CRON] Email Auto-Ingestion failed: ${err.message}`);
    }
});

app.get('/api/candidates/:id/remarks', async (req, res) => {
    try {
        const db = await initDb();
        const remarks = await db.all('SELECT * FROM candidate_remarks WHERE candidate_id = ? ORDER BY timestamp ASC', [req.params.id]);
        res.json(remarks);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/candidates/:id/remarks', async (req, res) => {
    try {
        const db = await initDb();
        const { author_id, author_name, remark_text } = req.body;
        await db.run('INSERT INTO candidate_remarks (candidate_id, author_id, author_name, remark_text) VALUES (?, ?, ?, ?)', [req.params.id, author_id, author_name, remark_text]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ====================================================================
// NATIVE SOURCING HUB API
// ====================================================================

app.get('/api/jobs/:id/booleans', async (req, res) => {
    try {
        const db = await initDb();
        let job = await db.get('SELECT linkedin_boolean, linkedin_level_1, linkedin_level_2, linkedin_level_3, google_boolean, github_boolean, stackoverflow_boolean, dribbble_boolean FROM jobs WHERE id = ?', [req.params.id]);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        if (!job.linkedin_level_1 && !job.linkedin_boolean) {
            const fullJob = await db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
            if (fullJob) {
                await booleanAgent.generateForJob(fullJob.id, fullJob);
                job = await db.get('SELECT linkedin_boolean, linkedin_level_1, linkedin_level_2, linkedin_level_3, google_boolean, github_boolean, stackoverflow_boolean, dribbble_boolean FROM jobs WHERE id = ?', [req.params.id]);
            }
        }

        res.json(job);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

function deriveLevel2TitleFreeQuery(query: string): string | null {
    // 1. site:xxx.com (title_bunch) AND (rest)
    const siteWithParens = query.match(/^(site:[^\s]+)\s+(\([^)]+\))\s+AND\s+(.*)$/i);
    if (siteWithParens) {
        return `${siteWithParens[1]} ${siteWithParens[3]}`.trim();
    }
    // 2. (title_bunch) AND (rest)
    const frontParens = query.match(/^(\([^)]+\))\s+AND\s+(.*)$/i);
    if (frontParens) {
        return frontParens[2].trim();
    }
    // 3. site:xxx.com "Title" AND (rest)
    const siteWithQuote = query.match(/^(site:[^\s]+)\s+("[^"]+")\s+AND\s+(.*)$/i);
    if (siteWithQuote) {
        return `${siteWithQuote[1]} ${siteWithQuote[3]}`.trim();
    }
    // 4. "Title" AND (rest)
    const frontQuote = query.match(/^("[^"]+")\s+AND\s+(.*)$/i);
    if (frontQuote) {
        return frontQuote[2].trim();
    }
    return null;
}

app.post('/api/search/execute', async (req, res) => {
    try {
        const { query, platform, page = 1, excludeUrls = [] } = req.body;
        if (!query) return res.status(400).json({ error: 'Search query required' });
        
        // Ensure query includes the platform constraint if missing
        let fullQuery = query;
        const platformSites: Record<string, string> = {
            linkedin: 'site:linkedin.com/in/',
            github: 'site:github.com',
            stackoverflow: 'site:stackoverflow.com/users',
            dribbble: 'site:dribbble.com',
            xing: 'site:xing.com/profile/',
            aboutme: 'site:about.me',
            gitlab: 'site:gitlab.com',
            kaggle: 'site:kaggle.com',
            devto: 'site:dev.to',
            behance: 'site:behance.net',
            figma: 'site:figma.com/@',
            researchgate: 'site:researchgate.net/profile/'
        };
        if (platform && !fullQuery.includes('site:') && platformSites[platform]) {
            fullQuery = `${platformSites[platform]} ${fullQuery}`;
        }

        const searchService = new SearchService();
        let rawResults = await searchService.executeSearch(fullQuery, 10, Number(page), excludeUrls);
        let usedQuery = fullQuery;
        let isFallbackLevel2 = false;

        // Auto-fallback: If Level 1 returned 0 results, try Level 2 (Title-Free)
        if (rawResults.length === 0) {
            const level2Query = deriveLevel2TitleFreeQuery(fullQuery);
            if (level2Query && level2Query !== fullQuery) {
                emitLog('warn', `[SEARCH FALLBACK] Level 1 returned 0 results. Auto-executing Level 2 Title-Free query: ${level2Query}`);
                rawResults = await searchService.executeSearch(level2Query, 10, Number(page), excludeUrls);
                usedQuery = level2Query;
                isFallbackLevel2 = true;
            }
        }
        
        if (rawResults.length === 0) {
            return res.json({ profiles: [], raw: [], page: Number(page), usedQuery, isFallbackLevel2 });
        }
        
        // Pass snippets to AI for structuring
        let profiles = await ai.extractSearchProfiles(rawResults);
        
        // Filter out any duplicates against excludeUrls or within profiles
        const seen = new Set<string>((excludeUrls || []).map((u: string) => (u || '').toLowerCase().trim()));
        let uniqueProfiles: any[] = [];
        for (const p of profiles) {
            const urlKey = (p.url || '').toLowerCase().trim();
            const nameKey = (p.name || '').toLowerCase().trim();
            if (urlKey && !seen.has(urlKey) && (!nameKey || !seen.has(nameKey))) {
                seen.add(urlKey);
                if (nameKey) seen.add(nameKey);
                uniqueProfiles.push(p);
            }
        }

        // Secondary auto-fallback: If Level 1 raw results yielded 0 valid profiles, try Level 2 (Title-Free)
        if (uniqueProfiles.length === 0 && !isFallbackLevel2) {
            const level2Query = deriveLevel2TitleFreeQuery(fullQuery);
            if (level2Query && level2Query !== fullQuery) {
                emitLog('warn', `[SEARCH FALLBACK] Level 1 yielded 0 matching profiles. Auto-executing Level 2 Title-Free query: ${level2Query}`);
                const fallbackRaw = await searchService.executeSearch(level2Query, 10, Number(page), excludeUrls);
                if (fallbackRaw.length > 0) {
                    const fallbackProfiles = await ai.extractSearchProfiles(fallbackRaw);
                    for (const p of fallbackProfiles) {
                        const urlKey = (p.url || '').toLowerCase().trim();
                        const nameKey = (p.name || '').toLowerCase().trim();
                        if (urlKey && !seen.has(urlKey) && (!nameKey || !seen.has(nameKey))) {
                            seen.add(urlKey);
                            if (nameKey) seen.add(nameKey);
                            uniqueProfiles.push(p);
                        }
                    }
                    rawResults = fallbackRaw;
                    usedQuery = level2Query;
                    isFallbackLevel2 = true;
                }
            }
        }

        let isFallbackLevel3 = false;
        // Tertiary auto-fallback: If Level 2 also yielded 0 valid profiles, try Level 3 (Active Jobseeker & Contact Info)
        if (uniqueProfiles.length === 0) {
            const baseLevel2 = isFallbackLevel2 ? usedQuery : (deriveLevel2TitleFreeQuery(fullQuery) || fullQuery);
            const activeCluster = '("open to work" OR "open to opportunities" OR "looking for new job" OR "seeking new job" OR "available for new contract" OR "available immediately")';
            const recentExpCluster = '("2024 to Present" OR "2023 to Present" OR "to Present" OR "Present ·" OR "2024 - Present")';
            const contactCluster = '("@gmail.com" OR "@outlook.com" OR "@yahoo.com" OR "@proton.me" OR "email:" OR "phone:" OR "reach me at" OR "contact me:")';
            const level3Query = `${baseLevel2} AND (${activeCluster} OR ${recentExpCluster} OR ${contactCluster})`;
            
            emitLog('warn', `[SEARCH FALLBACK] Level 2 yielded 0 matching profiles. Auto-executing Level 3 Active Jobseeker & Contact query: ${level3Query}`);
            const fallback3Raw = await searchService.executeSearch(level3Query, 10, Number(page), excludeUrls);
            if (fallback3Raw.length > 0) {
                const fallback3Profiles = await ai.extractSearchProfiles(fallback3Raw);
                for (const p of fallback3Profiles) {
                    const urlKey = (p.url || '').toLowerCase().trim();
                    const nameKey = (p.name || '').toLowerCase().trim();
                    if (urlKey && !seen.has(urlKey) && (!nameKey || !seen.has(nameKey))) {
                        seen.add(urlKey);
                        if (nameKey) seen.add(nameKey);
                        uniqueProfiles.push(p);
                    }
                }
                rawResults = fallback3Raw;
                usedQuery = level3Query;
                isFallbackLevel3 = true;
            }
        }
        
        res.json({ profiles: uniqueProfiles, raw: rawResults, page: Number(page), usedQuery, isFallbackLevel2, isFallbackLevel3 });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// ================= AI BUSINESS INSIGHTS API =================
app.get('/api/analytics/ai-insights', async (req, res) => {
    try {
        const db = await initDb();
        
        // Gather the same metrics as management analytics
        const metrics = {
            totalClients: (await db.get('SELECT COUNT(*) as c FROM clients')).c,
            totalSpokes: (await db.get('SELECT COUNT(*) as c FROM spoke_persons')).c,
            totalLiveRoles: (await db.get(`SELECT COUNT(*) as c FROM jobs WHERE status != 'deleted'`)).c,
            totalCandidates: (await db.get('SELECT COUNT(*) as c FROM candidates')).c,
            interviewsDone: (await db.get(`SELECT COUNT(*) as c FROM candidate_pipeline WHERE stage LIKE '%Interview%'`)).c,
            offersReleased: (await db.get(`SELECT COUNT(*) as c FROM candidate_pipeline WHERE stage = 'Offer Received'`)).c,
            offersAccepted: (await db.get(`SELECT COUNT(*) as c FROM candidate_pipeline WHERE stage = 'Offer Accepted'`)).c,
            offersRejected: (await db.get(`SELECT COUNT(*) as c FROM candidate_pipeline WHERE stage = 'Offer Rejected'`)).c,
            totalJoined: (await db.get(`SELECT COUNT(*) as c FROM candidates WHERE status = 'Joined'`)).c,
            backoutRatio: 0,
            recruiterPerformance: await db.all(`
                SELECT u.name, 
                    COUNT(c.id) as submissions,
                    SUM(CASE WHEN c.status LIKE '%Interview%' THEN 1 ELSE 0 END) as interviews,
                    SUM(CASE WHEN c.status LIKE '%Offer%' THEN 1 ELSE 0 END) as offers,
                    SUM(CASE WHEN c.status = 'Joined' THEN 1 ELSE 0 END) as joinings
                FROM users u
                LEFT JOIN candidates c ON u.id = c.recruiter_id
                WHERE u.role = 'Recruiter'
                GROUP BY u.id
            `)
        };

        const totalOffers = metrics.offersReleased;
        const totalBackouts = metrics.offersRejected + (await db.get("SELECT COUNT(*) as c FROM candidate_pipeline WHERE stage = 'Backout'")).c;
        if (totalOffers > 0) metrics.backoutRatio = Math.round((totalBackouts / totalOffers) * 100);

        // Generate insights via AI service
        const insights = await ai.generateBusinessInsights(metrics);
        
        res.json({ success: true, insights });
    } catch (e: any) {
        console.error('AI Insights Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get(['/api/analytics/management', '/api/ats/analytics/management'], async (req, res) => {
    try {
        const db = await initDb();

        // 1. Load relational datasets and KPI counts in parallel
        const [
            clientsCount,
            spokesCount,
            liveRolesCount,
            candidatesCount,
            submissionsCount,
            allUsers,
            allClients,
            allSpokes,
            allJobs,
            allSubs,
            allCands
        ] = await Promise.all([
            db.get('SELECT COUNT(*) as c FROM clients'),
            db.get('SELECT COUNT(*) as c FROM spoke_persons'),
            db.get("SELECT COUNT(*) as c FROM jobs WHERE status != 'deleted'"),
            db.get('SELECT COUNT(*) as c FROM candidates'),
            db.get('SELECT COUNT(*) as c FROM submissions'),
            db.all('SELECT id, name, email, role, manager_id FROM users'),
            db.all('SELECT id, company_name, account_manager_id FROM clients ORDER BY company_name ASC'),
            db.all('SELECT id, client_id, name, email FROM spoke_persons ORDER BY name ASC'),
            db.all('SELECT id, title, company, client_id, spoke_person_id, assigned_tl_id, created_by_user_id, created_at FROM jobs'),
            db.all(`
                SELECT s.*, 
                       c.status as cand_status,
                       j.company, j.title as job_title, j.client_id as job_client_id, j.spoke_person_id as job_spoke_id, j.assigned_tl_id, j.created_by_user_id,
                       cl.company_name as client_name,
                       sp.name as spoke_name
                FROM submissions s
                LEFT JOIN candidates c ON s.candidate_id = c.id
                LEFT JOIN jobs j ON s.job_id = j.id
                LEFT JOIN clients cl ON (j.client_id = cl.id OR j.company = cl.company_name)
                LEFT JOIN spoke_persons sp ON COALESCE(s.spoke_person_id, j.spoke_person_id) = sp.id
            `),
            db.all('SELECT id, recruiter_id, job_id, status, timestamp FROM candidates')
        ]);

        // Timeframe filtering support: daily, weekly, monthly, all
        const timeframe = (req.query.timeframe as string || 'all').toLowerCase();
        const now = Date.now();
        let cutoffTime: number | null = null;
        let timeframeLabel = 'All Time Executive Report';
        let rangeDisplay = 'All Historical Records';

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        if (timeframe === 'daily' || timeframe === 'today') {
            cutoffTime = todayStart.getTime();
            timeframeLabel = 'Daily Report (Today)';
            rangeDisplay = todayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else if (timeframe === 'weekly') {
            cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
            timeframeLabel = 'Weekly Report (Last 7 Days)';
            const weekAgo = new Date(cutoffTime);
            rangeDisplay = `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        } else if (timeframe === 'monthly') {
            cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
            timeframeLabel = 'Monthly Report (Last 30 Days)';
            const monthAgo = new Date(cutoffTime);
            rangeDisplay = `${monthAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }

        const isWithinTimeframe = (dateVal: any) => {
            if (!cutoffTime) return true;
            if (!dateVal) return false;
            const t = new Date(dateVal).getTime();
            return !isNaN(t) && t >= cutoffTime;
        };

        const activeSubs = cutoffTime ? allSubs.filter(s => isWithinTimeframe(s.created_at)) : allSubs;
        const activeCands = cutoffTime ? allCands.filter(c => isWithinTimeframe(c.timestamp)) : allCands;
        const activeJobs = cutoffTime ? allJobs.filter(j => isWithinTimeframe(j.created_at)) : allJobs;

        const totalClients = clientsCount?.c || 0;
        const totalSpokes = spokesCount?.c || 0;
        const totalLiveRoles = cutoffTime ? activeJobs.length : (liveRolesCount?.c || 0);
        const totalCandidates = cutoffTime ? activeCands.length : (candidatesCount?.c || 0);
        const totalSubmissions = cutoffTime ? activeSubs.length : (submissionsCount?.c || 0);

        // Stage classification helpers
        const isInterview = (st: string) => Boolean(st && (st.includes('Interview') || st.includes('Screened')));
        const isSelection = (st: string) => Boolean(st && (st.includes('Select') || st.includes('Shortlist')));
        const isOffer = (st: string) => Boolean(st && st.includes('Offer'));
        const isJoining = (st: string) => Boolean(st && (st === 'Joined' || st === 'Placed' || st.includes('Joining')));
        const isBackout = (st: string) => Boolean(st && (st.includes('Backout') || st === 'Offer Rejected' || st === 'Interviews Rejected'));

        // Global Stage KPIs
        let interviewsDone = 0;
        let selectionsDone = 0;
        let offersReleased = 0;
        let totalJoined = 0;
        let totalBackouts = 0;

        activeCands.forEach(c => {
            const st = c.status || '';
            if (isInterview(st)) interviewsDone++;
            else if (isSelection(st)) selectionsDone++;
            else if (isOffer(st)) offersReleased++;
            else if (isJoining(st)) totalJoined++;
            else if (isBackout(st)) totalBackouts++;
        });

        const backoutRatio = (offersReleased + totalJoined + totalBackouts) > 0 
            ? Math.round((totalBackouts / (offersReleased + totalJoined + totalBackouts)) * 100) 
            : 0;

        // 2. TEAM LEAD PERFORMANCE
        const tls = allUsers.filter(u => u.role === 'TeamLead');
        const recruiters = allUsers.filter(u => u.role === 'Recruiter');

        const teamLeadPerformance = tls.map(tl => {
            const teamRecruiters = recruiters.filter(r => r.manager_id === tl.id);
            const teamRecruiterIds = new Set(teamRecruiters.map(r => r.id));

            const relevantSubs = activeSubs.filter(s => 
                s.tl_id === tl.id || 
                teamRecruiterIds.has(s.recruiter_id) || 
                s.assigned_tl_id === tl.id
            );
            const relevantCands = activeCands.filter(c => teamRecruiterIds.has(c.recruiter_id));

            const candMap = new Map<string, string>();
            relevantSubs.forEach(s => {
                candMap.set(s.candidate_id, s.status || s.cand_status || 'Submitted');
            });
            relevantCands.forEach(c => {
                if (!candMap.has(c.id)) candMap.set(c.id, c.status || 'Active');
            });

            let subCount = candMap.size;
            let intCount = 0, selCount = 0, offCount = 0, joiCount = 0, bakCount = 0;

            candMap.forEach((st) => {
                if (isInterview(st)) intCount++;
                else if (isSelection(st)) selCount++;
                else if (isOffer(st)) offCount++;
                else if (isJoining(st)) joiCount++;
                else if (isBackout(st)) bakCount++;
            });

            const memberCount = teamRecruiters.length;
            return {
                tl_id: tl.id,
                tl_name: tl.name,
                tl_email: tl.email,
                team_members_count: memberCount,
                team_members: teamRecruiters.map(r => r.name),
                team_members_str: `${memberCount} ${memberCount === 1 ? 'Member' : 'Members'}`,
                submissions: subCount,
                interviews: intCount,
                selections: selCount,
                offers: offCount,
                joinings: joiCount,
                backouts: bakCount
            };
        });

        // 3. ACCOUNT MANAGER PERFORMANCE
        const ams = allUsers.filter(u => u.role === 'AccountManager');
        const defaultAm = ams[0] || { id: 'u_am', name: 'Account Manager', email: 'am@myrecruiter.com' };

        const amPerformance: any[] = [];
        const seenAmSpokeKeys = new Set<string>();

        // Deduplicate clients by normalized company_name
        const uniqueClientsMap = new Map<string, {
            primaryClient: any,
            allClientIds: Set<string>,
            allCompanyNames: Set<string>
        }>();

        allClients.forEach(cl => {
            const normName = (cl.company_name || '').trim().toLowerCase();
            if (!normName) return;
            if (!uniqueClientsMap.has(normName)) {
                uniqueClientsMap.set(normName, {
                    primaryClient: cl,
                    allClientIds: new Set([cl.id]),
                    allCompanyNames: new Set([cl.company_name])
                });
            } else {
                const entry = uniqueClientsMap.get(normName)!;
                entry.allClientIds.add(cl.id);
                entry.allCompanyNames.add(cl.company_name);
            }
        });

        uniqueClientsMap.forEach(({ primaryClient: cl, allClientIds, allCompanyNames }) => {
            const clientAm = ams.find(a => a.id === cl.account_manager_id) || defaultAm;

            const rawSpokes = allSpokes.filter(s => allClientIds.has(s.client_id));
            const uniqueSpokesMap = new Map<string, any>();
            rawSpokes.forEach(sp => {
                const normSpokeName = (sp.name || '').trim().toLowerCase();
                if (normSpokeName && !uniqueSpokesMap.has(normSpokeName)) {
                    uniqueSpokesMap.set(normSpokeName, sp);
                }
            });
            const clientSpokes = Array.from(uniqueSpokesMap.values());

            const clientJobs = activeJobs.filter(j => 
                (j.client_id && allClientIds.has(j.client_id)) || 
                (j.company && allCompanyNames.has(j.company))
            );

            if (clientSpokes.length === 0) {
                const subsForClient = activeSubs.filter(s => 
                    (s.job_client_id && allClientIds.has(s.job_client_id)) || 
                    (s.company && allCompanyNames.has(s.company))
                );
                const candsForClient = activeCands.filter(c => clientJobs.some(j => j.id === c.job_id));

                const candMap = new Map<string, string>();
                subsForClient.forEach(s => candMap.set(s.candidate_id, s.status || s.cand_status || 'Submitted'));
                candsForClient.forEach(c => { if (!candMap.has(c.id)) candMap.set(c.id, c.status || 'Active'); });

                let intCount = 0, selCount = 0, offCount = 0, joiCount = 0, bakCount = 0;
                candMap.forEach(st => {
                    if (isInterview(st)) intCount++;
                    else if (isSelection(st)) selCount++;
                    else if (isOffer(st)) offCount++;
                    else if (isJoining(st)) joiCount++;
                    else if (isBackout(st)) bakCount++;
                });

                const rowKey = `${(cl.company_name || '').trim().toLowerCase()}:::general_spoke`;
                if (!seenAmSpokeKeys.has(rowKey)) {
                    seenAmSpokeKeys.add(rowKey);
                    amPerformance.push({
                        am_id: clientAm.id,
                        am_name: clientAm.name,
                        am_email: clientAm.email,
                        client_id: cl.id,
                        client_name: cl.company_name,
                        spoke_id: null,
                        spoke_name: 'General Spoke',
                        roles_received: clientJobs.length,
                        submissions: candMap.size,
                        interviews: intCount,
                        selections: selCount,
                        offers: offCount,
                        joinings: joiCount,
                        backouts: bakCount
                    });
                }
            } else {
                clientSpokes.forEach(sp => {
                    const jobsForSpoke = clientJobs.filter(j => j.spoke_person_id === sp.id || !j.spoke_person_id);
                    const subsForSpoke = activeSubs.filter(s => 
                        (s.spoke_person_id === sp.id || s.job_spoke_id === sp.id) ||
                        (((s.job_client_id && allClientIds.has(s.job_client_id)) || (s.company && allCompanyNames.has(s.company))) && !s.spoke_person_id)
                    );
                    const candsForSpoke = activeCands.filter(c => jobsForSpoke.some(j => j.id === c.job_id));

                    const candMap = new Map<string, string>();
                    subsForSpoke.forEach(s => candMap.set(s.candidate_id, s.status || s.cand_status || 'Submitted'));
                    candsForSpoke.forEach(c => { if (!candMap.has(c.id)) candMap.set(c.id, c.status || 'Active'); });

                    let intCount = 0, selCount = 0, offCount = 0, joiCount = 0, bakCount = 0;
                    candMap.forEach(st => {
                        if (isInterview(st)) intCount++;
                        else if (isSelection(st)) selCount++;
                        else if (isOffer(st)) offCount++;
                        else if (isJoining(st)) joiCount++;
                        else if (isBackout(st)) bakCount++;
                    });

                    const spokeDisplayName = sp.name + (sp.email ? ` (${sp.email})` : '');
                    const rowKey = `${(cl.company_name || '').trim().toLowerCase()}:::${(sp.name || '').trim().toLowerCase()}`;
                    if (!seenAmSpokeKeys.has(rowKey)) {
                        seenAmSpokeKeys.add(rowKey);
                        amPerformance.push({
                            am_id: clientAm.id,
                            am_name: clientAm.name,
                            am_email: clientAm.email,
                            client_id: cl.id,
                            client_name: cl.company_name,
                            spoke_id: sp.id,
                            spoke_name: spokeDisplayName,
                            roles_received: jobsForSpoke.length,
                            submissions: candMap.size,
                            interviews: intCount,
                            selections: selCount,
                            offers: offCount,
                            joinings: joiCount,
                            backouts: bakCount
                        });
                    }
                });
            }
        });

        // 4. RECRUITER PERFORMANCE
        const recruiterPerformance = recruiters.map(rec => {
            const tl = tls.find(t => t.id === rec.manager_id);
            const subsForRec = activeSubs.filter(s => s.recruiter_id === rec.id);
            const candsForRec = activeCands.filter(c => c.recruiter_id === rec.id);

            const candMap = new Map<string, string>();
            subsForRec.forEach(s => candMap.set(s.candidate_id, s.status || s.cand_status || 'Submitted'));
            candsForRec.forEach(c => { if (!candMap.has(c.id)) candMap.set(c.id, c.status || 'Active'); });

            let intCount = 0, selCount = 0, offCount = 0, joiCount = 0, bakCount = 0;
            candMap.forEach(st => {
                if (isInterview(st)) intCount++;
                else if (isSelection(st)) selCount++;
                else if (isOffer(st)) offCount++;
                else if (isJoining(st)) joiCount++;
                else if (isBackout(st)) bakCount++;
            });

            return {
                recruiter_id: rec.id,
                recruiter_name: rec.name,
                recruiter_email: rec.email,
                tl_name: tl ? tl.name : 'Unassigned',
                submissions: candMap.size,
                interviews: intCount,
                selections: selCount,
                offers: offCount,
                joinings: joiCount,
                backouts: bakCount
            };
        });

        res.json({
            success: true,
            timeframe,
            timeframeLabel,
            rangeDisplay,
            totalClients,
            totalSpokes,
            totalLiveRoles,
            totalCandidates,
            totalSubmissions,
            interviewsDone,
            selectionsDone,
            offersReleased,
            totalJoined,
            totalBackouts,
            backoutRatio,
            teamLeadPerformance,
            amPerformance,
            accountManagerPerformance: amPerformance,
            recruiterPerformance,
            clients: allClients,
            spokes: allSpokes
        });
    } catch (e: any) {
        console.error('Management Analytics error:', e);
        res.status(500).json({ error: e.message });
    }
});


// ================= INTERVIEWS API =================
app.get('/api/interviews', async (req, res) => {
    try {
        const agency_id = req.query.agency_id || 'hq';
        const db = await initDb();
        const rows = await db.all(`
            SELECT i.*, 
                   c.name as candidate_name, c.email as candidate_email,
                   u.name as interviewer_name, u.role as interviewer_role
            FROM interviews i
            LEFT JOIN candidates c ON i.candidate_id = c.id
            LEFT JOIN users u ON i.interviewer_id = u.id
            WHERE i.agency_id = ? OR i.agency_id IS NULL OR i.agency_id = 'hq'
            ORDER BY i.scheduled_time ASC
        `, [agency_id]);
        res.json(rows || []);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/interviews', async (req, res) => {
    try {
        const {
            title,
            description,
            call_type = 'video',
            timezone = 'UTC',
            candidate_id,
            job_id,
            agency_id = 'hq',
            created_by,
            interviewer_id,
            scheduled_time,
            duration = 30,
            meeting_link
        } = req.body;
        
        if (!scheduled_time) return res.status(400).json({ error: 'Missing scheduled_time' });
        
        const db = await initDb();
        const id = 'int_' + Date.now() + Math.random().toString(36).substr(2, 5);
        
        await db.run(`
            INSERT INTO interviews (id, candidate_id, job_id, agency_id, created_by, scheduled_time, duration, meeting_link, status, title, description, call_type, timezone, interviewer_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
        `, [
            id,
            candidate_id || null,
            job_id || null,
            agency_id || 'hq',
            created_by || null,
            scheduled_time,
            duration || 30,
            meeting_link || null,
            title || 'Interview Discussion',
            description || '',
            call_type || 'video',
            timezone || 'UTC',
            interviewer_id || null
        ]);
        
        res.json({ success: true, id, meeting_link });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/interviews/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const db = await initDb();
        await db.run('UPDATE interviews SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/interviews/:id', async (req, res) => {
    try {
        const db = await initDb();
        await db.run('DELETE FROM interviews WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
// ==================================================



// ====================================================================
// NEW WORKFLOW APIS
// ====================================================================

// Spokespersons API
app.get('/api/spokespersons', async (req, res) => {
    try {
        const db = await initDb();
        const data = await db.all('SELECT * FROM spokespersons ORDER BY created_at DESC');
        res.json(data);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});


// Team Leads Add Recruiter API
app.post('/api/users/add', async (req, res) => {
    try {
        const { id, role, name, email, password } = req.body;
        const db = await initDb();
        await db.run('INSERT INTO users (id, role, name, email, password) VALUES (?, ?, ?, ?, ?)', [id, role, name, email, password]);
        res.json({success: true});
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

// Submit CV for TL Review
app.put('/api/candidates/:id/submit-for-review', async (req, res) => {
    try {
        const { salary, notice_period, visa_status } = req.body;
        const db = await initDb();
        await db.run(`
            UPDATE candidates 
            SET status = 'Pending TL Review', salary = ?, notice_period = ?, visa_status = ? 
            WHERE id = ?`, 
            [salary, notice_period, visa_status, req.params.id]
        );
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), req.params.id, 'Pending TL Review']);
        res.json({success: true});
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

// TL Approve/Reject CV
app.put('/api/candidates/:id/tl-review', async (req, res) => {
    try {
        const { status } = req.body; // 'Pending AM Review' (Approved) or 'TL Rejected'
        const db = await initDb();
        await db.run('UPDATE candidates SET status = ? WHERE id = ?', [status, req.params.id]);
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), req.params.id, status]);
        res.json({success: true});
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

// AM Approve/Reject/Submit CV
app.put('/api/candidates/:id/am-review', async (req, res) => {
    try {
        const { status } = req.body; // 'Client Submitted' or 'AM Rejected'
        const db = await initDb();
        await db.run('UPDATE candidates SET status = ? WHERE id = ?', [status, req.params.id]);
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), req.params.id, status]);
        res.json({success: true});
    } catch(e: any) { res.status(500).json({error: e.message}); }
});


// ====================================================================
// FUNNEL METRICS API (Recruiter Dashboard)
// ====================================================================
app.get('/api/funnel', async (req, res) => {
    try {
        const db = await initDb();
        const userId = req.query.user_id;
        
        let whereClause = '';
        let params: any[] = [];
        
        if (userId) {
            whereClause = 'WHERE recruiter_id = ?';
            params.push(userId);
        }

        const data = await db.all(`SELECT status, COUNT(*) as count FROM candidates ${whereClause} GROUP BY status`, params);
        
        const funnel = {
            Submissions: 0,
            InterviewsScheduled: 0,
            InterviewsCompleted: 0,
            Selections: 0,
            Offers: 0,
            Joinings: 0,
            Backouts: 0
        };

        data.forEach((row: any) => {
            const status = row.status || '';
            if (status === 'Client Submitted') funnel.Submissions += row.count;
            if (status === 'Interview Scheduled') funnel.InterviewsScheduled += row.count;
            if (status === 'Interview Completed') funnel.InterviewsCompleted += row.count;
            if (status === 'Selected') funnel.Selections += row.count;
            if (status === 'Offered') funnel.Offers += row.count;
            if (status === 'Placed (Joining)') funnel.Joinings += row.count;
            if (status === 'Backout') funnel.Backouts += row.count;
        });

        res.json(funnel);
    } catch(e: any) { res.status(500).json({error: e.message}); }
});

// --- TEAM HIERARCHY APIs ---

app.get('/api/users', async (req, res) => {
    try {
        const db = await initDb();
        const users = await db.all("SELECT id, name, role, email, manager_id FROM users");
        res.json(users);
    } catch(e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id/promote', async (req, res) => {
    try {
        const db = await initDb();
        const { id } = req.params;
        const { role } = req.body;
        
        if (!['Management', 'AccountManager', 'TeamLead', 'Recruiter'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        
        await db.run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id/manager', async (req, res) => {
    try {
        const db = await initDb();
        const { id } = req.params;
        const { manager_id } = req.body;
        
        // Let's enforce hierarchy slightly here (but mostly UI will limit dropdown)
        await db.run("UPDATE users SET manager_id = ? WHERE id = ?", [manager_id || null, id]);
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});



// --- SECURE CLIENTS & SPOKE PERSONS API ---
app.post('/api/clients', async (req, res) => {
    try {
        const { company_name, requester_role } = req.body;
        if (requester_role !== 'AccountManager') {
            return res.status(403).json({ error: 'Permission denied. Only Account Managers can add clients.' });
        }
        if (!company_name) return res.status(400).json({ error: 'Company name is required' });

        const db = await initDb();
        const existing = await db.get('SELECT id FROM clients WHERE LOWER(company_name) = LOWER(?)', [company_name.trim()]);
        if (existing) {
            return res.status(400).json({ error: 'Duplicate Error: This client already exists.' });
        }

        const id = 'c_' + Date.now();
        await db.run('INSERT INTO clients (id, company_name) VALUES (?, ?)', [id, company_name.trim()]);
        agentEvents.emit('db_update', { action: 'refresh_am_dashboard' });
        res.json({ success: true, client: { id, company_name } });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post(['/api/spoke_persons', '/api/spokes'], async (req, res) => {
    try {
        const { client_id, name, email, contact_info, requester_role } = req.body;
        if (requester_role && requester_role !== 'AccountManager' && requester_role !== 'Management' && requester_role !== 'Admin') {
            return res.status(403).json({ error: 'Permission denied. Only Account Managers can add spoke persons.' });
        }
        if (!client_id || !name) return res.status(400).json({ error: 'Client ID and Name are required' });

        const db = await initDb();
        const existing = await db.get(
            'SELECT id FROM spoke_persons WHERE client_id = ? AND (LOWER(name) = LOWER(?) OR (email != \'\' AND LOWER(email) = LOWER(?)))',
            [client_id, name.trim(), (email || '').trim()]
        );
        if (existing) {
            return res.status(400).json({ error: 'A contact person with this name or email already exists for this client.' });
        }

        const id = 's_' + Date.now();
        await db.run(
            'INSERT INTO spoke_persons (id, client_id, name, email, contact_info) VALUES (?, ?, ?, ?, ?)',
            [id, client_id, name.trim(), email || '', contact_info || '']
        );
        agentEvents.emit('db_update', { action: 'refresh_am_dashboard' });
        res.json({ success: true, id, spokePerson: { id, client_id, name, email, contact_info } });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});



// --- ADD TEAM MEMBER API ---
app.post('/api/team', async (req, res) => {
    try {
        const { name, role, email, password, personal_email, phone, manager_id } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const db = await initDb();
        const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        const id = 'u_' + Date.now();
        const agency_id = req.body.agency_id || 'hq';
        await db.run(
            'INSERT INTO users (id, role, name, email, password, personal_email, phone, manager_id, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, role, name, email, password, personal_email || null, phone || null, manager_id || null, agency_id]
        );
        
        res.json({ success: true, id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/team/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, email, phone, personal_email, manager_id } = req.body;
        if (!name || !email || !role) {
            return res.status(400).json({ error: 'Name, email, and role are required' });
        }
        const db = await initDb();
        await db.run(
            'UPDATE users SET name = ?, role = ?, email = ?, phone = ?, personal_email = ?, manager_id = ? WHERE id = ?',
            [name, role, email, phone || null, personal_email || null, manager_id || null, id]
        );
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/team/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await initDb();
        // Unlink anyone reporting to this user
        await db.run('UPDATE users SET manager_id = NULL WHERE manager_id = ?', [id]);
        await db.run('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/team/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        const db = await initDb();
        const user = await db.get('SELECT id, name, role, email, phone, personal_email, manager_id FROM users WHERE id = ?', [id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const directReports = await db.all('SELECT id, name, role, email FROM users WHERE manager_id = ?', [id]);
        const candidates = await db.all('SELECT id, name, status, created_at FROM candidates WHERE recruiter_id = ?', [id]);
        
        res.json({
            user,
            directReports: directReports || [],
            totalCandidates: candidates ? candidates.length : 0,
            candidates: (candidates || []).slice(0, 10)
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});



// --- MANAGEMENT PIPELINE DASHBOARD API ---
app.get('/api/management/pipeline', async (req, res) => {
    try {
        const db = await initDb();
        
        // We need to group by Client and Spoke Person
        // A client can have multiple spoke persons.
        // If a client has NO spoke persons, we still show them (Default Spoke).
        // For each client/spoke combo, we count:
        // Roles: Count of jobs
        // Submissions: candidates in 'Client Submitted' or 'Submitted'
        // Interviews: 'Interview Scheduled/Rescheduled', 'Interview', 'Interview Scheduled', 'Interview Completed'
        // Interviews Rejected: 'Interviews Rejected'
        // Selections: 'Selections', 'Selected'
        // Offers Released: 'Offers Released', 'Offered'
        // Offer Accepted: 'Offer Accepted'
        // Offer Rejected: 'Offer Rejected'
        // Backout: 'Backout'
        // Backout Stage: 'Backout Stage'
        // Joined: 'Joined', 'Placed', 'Placed (Joining)'
        // Invoice Raised: 'Invoice Raised'
        // Paid/Pending: 'Paid/Pending'

        // Raw query using LEFT JOINs to aggregate all data
        const query = `
            SELECT 
                c.id as client_id,
                c.company_name,
                sp.id as spoke_id,
                sp.name as spoke_name,
                COUNT(DISTINCT j.id) as roles_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) IN ('Client Submitted', 'Submitted') THEN COALESCE(sub.id, cand.id) END) as submissions_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) IN ('Interview Scheduled/Rescheduled', 'Interview', 'Interview Scheduled', 'Interview Completed') THEN COALESCE(sub.id, cand.id) END) as interviews_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Interviews Rejected' THEN COALESCE(sub.id, cand.id) END) as interviews_rejected_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) IN ('Selections', 'Selected') THEN COALESCE(sub.id, cand.id) END) as selections_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) IN ('Offers Released', 'Offered') THEN COALESCE(sub.id, cand.id) END) as offers_released_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Offer Accepted' THEN COALESCE(sub.id, cand.id) END) as offer_accepted_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Offer Rejected' THEN COALESCE(sub.id, cand.id) END) as offer_rejected_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Backout' THEN COALESCE(sub.id, cand.id) END) as backout_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Backout Stage' THEN COALESCE(sub.id, cand.id) END) as backout_stage_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) IN ('Joined', 'Placed', 'Placed (Joining)') THEN COALESCE(sub.id, cand.id) END) as joined_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Invoice Raised' THEN COALESCE(sub.id, cand.id) END) as invoice_raised_count,
                COUNT(DISTINCT CASE WHEN COALESCE(sub.status, cand.status) = 'Paid/Pending' THEN COALESCE(sub.id, cand.id) END) as paid_pending_count
            FROM clients c
            LEFT JOIN spoke_persons sp ON c.id = sp.client_id
            LEFT JOIN jobs j ON c.id = j.client_id AND (j.spoke_person_id = sp.id OR (sp.id IS NULL AND j.spoke_person_id IS NULL) OR (j.spoke_person_id = '' AND sp.id IS NULL))
            LEFT JOIN submissions sub ON sub.job_id = j.id
            LEFT JOIN candidates cand ON cand.job_id = j.id
            GROUP BY c.id, c.company_name, sp.id, sp.name
            ORDER BY c.company_name, sp.name
        `;
        
        const rows = await db.all(query);
        res.json({ success: true, data: rows });
    } catch (e: any) {
        console.error('Pipeline API Error:', e);
        res.status(500).json({ error: e.message });
    }
});





// --- PHASE 4: CANDIDATE PROFILE & ACTIVITY TIMELINE ---

app.get('/api/candidates/:id/profile', async (req, res) => {
    try {
        const db = await initDb();
        const candidateId = req.params.id;
        
        // Fetch candidate details
        const candidate = await db.get('SELECT * FROM candidates WHERE id = ?', [candidateId]);
        if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
        
        // Fetch all submissions for this candidate
        const subs = await db.all(`
            SELECT s.id, s.candidate_id, s.job_id, s.status, s.created_at,
                   j.title as job_title, j.job_code,
                   cl.company_name as client_name,
                   u.name as recruiter_name
            FROM submissions s
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE s.candidate_id = ?
            ORDER BY s.created_at DESC
        `, [candidateId]);
        candidate.submissions = subs || [];
        candidate.submissions_count = candidate.submissions.length;

        // Fetch pipeline history
        const pipelineHistory = await db.all('SELECT stage as content, timestamp FROM candidate_pipeline WHERE candidate_id = ? ORDER BY timestamp DESC', [candidateId]);
        
        // Fetch remarks/notes
        const remarks = await db.all('SELECT remark_text as content, timestamp FROM candidate_remarks WHERE candidate_id = ? ORDER BY timestamp DESC', [candidateId]);
        
        // Fetch interviews
        const interviews = await db.all('SELECT scheduled_time as content, created_at as timestamp FROM interviews WHERE candidate_id = ? ORDER BY created_at DESC', [candidateId]);
        
        // Combine and sort into a unified timeline
        const timeline: any[] = [];
        
        (subs || []).forEach(s => {
            timeline.push({ 
                type: 'submission', 
                content: `Submitted to ${s.job_title} (${s.job_code || 'JOB'}) @ ${s.client_name || 'Client'} - Status: ${s.status}`, 
                timestamp: s.created_at 
            });
        });

        pipelineHistory.forEach(h => {
            timeline.push({ type: 'stage', content: 'Moved to ' + h.content, timestamp: h.timestamp });
        });
        
        remarks.forEach(r => {
            timeline.push({ type: 'note', content: r.content, timestamp: r.timestamp });
        });
        
        interviews.forEach(i => {
            timeline.push({ type: 'interview', content: 'Interview scheduled for ' + i.content, timestamp: i.timestamp });
        });
        
        // Sort descending
        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        res.json({ candidate, timeline });
    } catch (e: any) {
        console.error('Error fetching profile:', e);
        res.status(500).json({ error: e.message });
    }
});





// ====================================================================
// ATS MEDIATOR SYSTEM (Recruiter - Team Lead - Account Manager)
// ====================================================================

// 1. Candidate De-duplication Check
app.post('/api/ats/candidates/check-duplicate', async (req, res) => {
    try {
        const { email, phone } = req.body;
        const db = await initDb();
        
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPhone = (phone || '').replace(/[^0-9+]/g, '').trim();
        
        let match: any = null;
        if (cleanEmail) {
            match = await db.get('SELECT * FROM candidates WHERE LOWER(email) = ?', [cleanEmail]);
        }
        if (!match && cleanPhone && cleanPhone.length >= 7) {
            const phoneDigits = cleanPhone.slice(-8);
            match = await db.get("SELECT * FROM candidates WHERE phone LIKE ? OR phone = ?", [`%${phoneDigits}%`, cleanPhone]);
        }
        
        if (match) {
            const subs = await db.all(`
                SELECT s.*, j.title as job_title, j.job_code, c.company_name as client_name
                FROM submissions s
                LEFT JOIN jobs j ON s.job_id = j.id
                LEFT JOIN clients c ON j.client_id = c.id
                WHERE s.candidate_id = ?
                ORDER BY s.created_at DESC
            `, [match.id]);
            return res.json({ isDuplicate: true, existingCandidate: match, submissions: subs || [] });
        }
        
        res.json({ isDuplicate: false });
    } catch (e: any) {
        console.error('Check duplicate error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Add Candidate to ATS Talent Pool (with strict deduplication)
app.post('/api/ats/candidates', async (req, res) => {
    try {
        const {
            name, email, phone, headline, skills, experience_years, current_company,
            current_location, relocation_preferred, current_salary, expected_salary,
            notice_period, visa_status, source, resume_path, rtr_path, rtr_confirmed, created_by,
            experience_details
        } = req.body;
        
        if (!name) return res.status(400).json({ error: 'Candidate name is required' });
        
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPhone = (phone || '').replace(/[^0-9+]/g, '').trim();
        
        const db = await initDb();
        
        // Strict de-duplication check
        let existing: any = null;
        if (cleanEmail) {
            existing = await db.get('SELECT * FROM candidates WHERE LOWER(email) = ?', [cleanEmail]);
        }
        if (!existing && cleanPhone && cleanPhone.length >= 7) {
            const phoneDigits = cleanPhone.slice(-8);
            existing = await db.get("SELECT * FROM candidates WHERE phone LIKE ? OR phone = ?", [`%${phoneDigits}%`, cleanPhone]);
        }
        
        if (existing) {
            return res.status(409).json({
                error: `Candidate already exists with this ${cleanEmail === (existing.email || '').toLowerCase() ? 'email' : 'phone'} (${existing.candidate_code || existing.name})`,
                existingCandidate: existing
            });
        }
        
        const id = 'cand_' + Date.now() + Math.random().toString(36).substring(2, 6);
        
        // Generate next CAND-XXXX code
        const countRow: any = await db.get("SELECT COUNT(*) as c FROM candidates");
        const nextCode = `CAND-${1000 + parseInt(countRow.c || 0) + 1}`;
        
        const created_by_user_id = req.body.created_by_user_id || req.body.created_by || req.body.recruiter_id || null;
        const created_by_name = req.body.created_by_name || null;
        const created_by_role = req.body.created_by_role || null;
        const candLocation = current_location || req.body.location || '';

        await db.run(`
            INSERT INTO candidates (
                id, candidate_code, name, email, phone, headline, skills, experience_years,
                current_company, location, relocation_preferred, current_salary, expected_salary,
                notice_period, visa_status, source, resume_path, rtr_path, rtr_confirmed,
                recruiter_id, status, experience_details,
                created_by_user_id, created_by_name, created_by_role
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?, ?)
        `, [
            id, nextCode, name, cleanEmail, phone || '', headline || (skills || ''), skills || '',
            experience_years || '', current_company || '', candLocation, relocation_preferred || 'Yes',
            current_salary || '', expected_salary || '', notice_period || '', visa_status || '',
            source || 'LinkedIn', resume_path || '', rtr_path || '', rtr_confirmed ? true : false,
            created_by_user_id,
            experience_details !== undefined ? (typeof experience_details === 'string' ? experience_details : JSON.stringify(experience_details)) : null,
            created_by_user_id, created_by_name, created_by_role
        ]);
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), id, 'Added to ATS Talent Pool']);
            
        emitLog('success', `[ATS] Candidate ${name} (${nextCode}) added to Talent Pool.`);
        agentEvents.emit('db_update', { table: 'candidates', action: 'insert' });
        res.json({ 
            success: true, 
            candidate_code: nextCode, 
            candidate: { id, candidate_code: nextCode, name, email: cleanEmail, phone } 
        });
    } catch (e: any) {
        console.error('Add candidate error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 3. Search Internal ATS Database
app.get('/api/ats/candidates', async (req, res) => {
    try {
        const q = req.query.q || req.query.search;
        const { source, location } = req.query;
        const db = await initDb();
        
        let query = `
            SELECT c.*,
                   s.id as latest_submission_id, s.status as submission_status, s.created_at as submitted_at,
                   j.title as submitted_job_title, j.job_code as submitted_job_code,
                   cl.company_name as client_name, sp.name as spoke_name,
                   u.name as recruiter_name
            FROM candidates c
            LEFT JOIN submissions s ON s.id = (
                SELECT id FROM submissions sub WHERE sub.candidate_id = c.id ORDER BY sub.created_at DESC LIMIT 1
            )
            LEFT JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];
        
        if (q) {
            query += ` AND (
                LOWER(c.name) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.skills) LIKE ? 
                OR LOWER(c.candidate_code) LIKE ? OR LOWER(c.current_company) LIKE ? OR LOWER(c.location) LIKE ?
            )`;
            const term = `%${String(q).toLowerCase()}%`;
            params.push(term, term, term, term, term, term);
        }
        
        if (source) {
            query += ` AND c.source = ?`;
            params.push(source);
        }
        
        if (location) {
            query += ` AND LOWER(c.location) LIKE ?`;
            params.push(`%${String(location).toLowerCase()}%`);
        }
        
        query += ` ORDER BY c.timestamp DESC LIMIT 100`;
        
        const rows = await db.all(query, params);

        if (rows && rows.length > 0) {
            const candidateIds = rows.map((r: any) => r.id);
            const placeholders = candidateIds.map(() => '?').join(',');
            const subs = await db.all(`
                SELECT s.id, s.candidate_id, s.job_id, s.status, s.created_at,
                       j.title as job_title, j.job_code,
                       cl.company_name as client_name,
                       u.name as recruiter_name
                FROM submissions s
                JOIN jobs j ON s.job_id = j.id
                LEFT JOIN clients cl ON j.client_id = cl.id
                LEFT JOIN users u ON s.recruiter_id = u.id
                WHERE s.candidate_id IN (${placeholders})
                ORDER BY s.created_at DESC
            `, candidateIds);

            const subsMap: Record<string, any[]> = {};
            for (const sub of subs) {
                if (!subsMap[sub.candidate_id]) subsMap[sub.candidate_id] = [];
                subsMap[sub.candidate_id].push(sub);
            }

            for (const r of rows) {
                r.submissions = subsMap[r.id] || [];
                r.submissions_count = r.submissions.length;
            }
        }

        res.json(rows || []);
    } catch (e: any) {
        console.error('ATS candidates error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 4. Get Recruiter Assigned Roles
app.get('/api/ats/my-roles', async (req, res) => {
    try {
        const userId = (req.query.user_id || req.query.recruiter_id) as string;
        const role = (req.query.role || (userId ? 'Recruiter' : '')) as string;
        const db = await initDb();
        
        let query = `
            SELECT j.*, 
                   c.company_name as client_name,
                   sp.name as spoke_name, sp.email as spoke_email,
                   COUNT(DISTINCT s.id) as total_submissions,
                   COUNT(DISTINCT CASE WHEN s.status = 'Client Submitted' THEN s.id END) as client_submissions_count,
                   COUNT(DISTINCT CASE WHEN s.status LIKE '%Interview%' THEN s.id END) as interviews_count
            FROM jobs j
            LEFT JOIN clients c ON j.client_id = c.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN submissions s ON s.job_id = j.id
            WHERE j.status != 'deleted'
        `;
        const params: any[] = [];
        
        if (userId) {
            query += ` AND (
                j.assigned_recruiter = ? 
                OR j.id IN (SELECT job_id FROM job_assignments WHERE recruiter_id = ?)
                OR (j.assigned_recruiters IS NOT NULL AND CAST(j.assigned_recruiters AS TEXT) LIKE ?)
                OR j.assigned_recruiter IS NULL OR j.assigned_recruiter = ''
            )`;
            params.push(userId, userId, `%"${userId}"%`);
        }
        
        query += ` GROUP BY j.id, c.company_name, sp.name, sp.email ORDER BY j.created_at DESC`;
        
        const jobs = await db.all(query, params);
        res.json(jobs || []);
    } catch (e: any) {
        console.error('ATS my roles error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 5. Generate Submission Email Template
app.get('/api/ats/submission-template', async (req, res) => {
    try {
        const { jobId, candidateId } = req.query;
        if (!jobId || !candidateId) return res.status(400).json({ error: 'jobId and candidateId required' });
        
        const db = await initDb();
        const cand = await db.get('SELECT * FROM candidates WHERE id = ?', [candidateId]);
        const job = await db.get(`
            SELECT j.*, c.company_name as client_name, sp.name as spoke_name, sp.email as spoke_email
            FROM jobs j
            LEFT JOIN clients c ON j.client_id = c.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            WHERE j.id = ?
        `, [jobId]);
        
        if (!cand || !job) return res.status(404).json({ error: 'Candidate or Job not found' });
        
        const subject = `Candidate Submission: ${cand.name} (${cand.candidate_code || 'ID'}) for ${job.title} (${job.job_code || 'ID'}) - ${job.client_name || 'Client'}`;
        
        const body = `Hi Team Lead,

Please review the candidate profile for the following position:

Position: ${job.title} (${job.job_code || ''})
Client: ${job.client_name || 'Client'} (Spoke: ${job.spoke_name || 'Default'})

--------------------------------------------------
CANDIDATE SUMMARY
--------------------------------------------------
• Candidate Name:         ${cand.name} (${cand.candidate_code || ''})
• Current Title:          ${cand.headline || 'Software Engineer'}
• Current Company:        ${cand.current_company || 'N/A'}
• Location:               ${cand.location || 'N/A'} (${cand.relocation_preferred ? 'Open to Relocation' : 'Local Only'})
• Total / Relevant Exp:   ${cand.experience_years || 'N/A'}
• Current Compensation:   ${cand.current_salary || 'N/A'}
• Expected Compensation:  ${cand.expected_salary || 'N/A'}
• Notice Period:          ${cand.notice_period || 'Immediate'}
• Work Authorization:     ${cand.visa_status || 'US Citizen / Authorized'}
• Sourced From:           ${cand.source || 'Direct Outreach'}

CORE SKILLS:
${cand.skills || 'N/A'}

SCREENING HIGHLIGHTS:
Candidate has proven hands-on experience directly aligned with the job description. Verified communication, technical stack, and availability. RTR confirmed.

Attached: Candidate CV & RTR Proof.`;

        res.json({
            subject,
            body,
            candidate: cand,
            job
        });
    } catch (e: any) {
        console.error('Template generator error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 6. Create Submission (Recruiter → Team Lead QC)
app.post('/api/ats/submissions', async (req, res) => {
    try {
        const {
            candidate_id, job_id, recruiter_id, tl_id,
            email_subject, email_body, cv_path, rtr_path,
            current_salary, expected_salary, notice_period, visa_status,
            current_location, relocation_preferred
        } = req.body;
        
        if (!candidate_id || !job_id || !recruiter_id) {
            return res.status(400).json({ error: 'Missing candidate_id, job_id, or recruiter_id' });
        }
        
        const db = await initDb();
        
        // Prevent duplicate active submission of same candidate to same job
        const existingSub = await db.get(
            "SELECT id, status FROM submissions WHERE candidate_id = ? AND job_id = ? AND status NOT IN ('Rejected by TL', 'Interviews Rejected', 'Backout')",
            [candidate_id, job_id]
        );
        if (existingSub) {
            return res.status(400).json({ error: `Candidate is already active for this job (Status: ${existingSub.status})` });
        }
        
        const countRow = await db.get("SELECT COUNT(*) as c FROM submissions");
        const subId = `SUB-${3000 + parseInt(countRow.c || 0) + 1}`;
        
        let targetSpokeId = req.body.spoke_person_id || null;
        let targetTlId = req.body.tl_id || null;
        let targetAmId = req.body.am_id || null;

        const jobRow = await db.get('SELECT client_id, spoke_person_id, assigned_tl_id, created_by_user_id FROM jobs WHERE id = ?', [job_id]);
        if (jobRow) {
            if (!targetSpokeId && jobRow.spoke_person_id) targetSpokeId = jobRow.spoke_person_id;
            if (!targetTlId && jobRow.assigned_tl_id) targetTlId = jobRow.assigned_tl_id;
            if (!targetAmId && jobRow.created_by_user_id) targetAmId = jobRow.created_by_user_id;
            if (!targetAmId && jobRow.client_id) {
                const clientRow = await db.get('SELECT account_manager_id FROM clients WHERE id = ?', [jobRow.client_id]);
                if (clientRow && clientRow.account_manager_id) targetAmId = clientRow.account_manager_id;
            }
        }
        if (!targetTlId) {
            const recRow = await db.get('SELECT manager_id FROM users WHERE id = ?', [recruiter_id]);
            if (recRow && recRow.manager_id) targetTlId = recRow.manager_id;
        }
        if (!targetTlId) {
            const defTl = await db.get("SELECT id FROM users WHERE role = 'TeamLead' LIMIT 1");
            if (defTl) targetTlId = defTl.id;
        }
        if (!targetAmId) {
            const defAm = await db.get("SELECT id FROM users WHERE role = 'AccountManager' LIMIT 1");
            if (defAm) targetAmId = defAm.id;
        }

        await db.run(`
            INSERT INTO submissions (
                id, candidate_id, job_id, recruiter_id, tl_id, am_id, status,
                email_subject, email_body, cv_path, rtr_path,
                current_salary, expected_salary, notice_period, visa_status,
                current_location, relocation_preferred, spoke_person_id
            ) VALUES (?, ?, ?, ?, ?, ?, 'Submitted to TL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            subId, candidate_id, job_id, recruiter_id, targetTlId, targetAmId,
            email_subject || '', email_body || '', cv_path || '', rtr_path || '',
            current_salary || '', expected_salary || '', notice_period || '', visa_status || '',
            current_location || '', relocation_preferred || 'Yes', targetSpokeId
        ]);
        
        // Update candidate status and link to job
        await db.run("UPDATE candidates SET status = 'Submitted to TL', job_id = ?, recruiter_id = ? WHERE id = ?",
            [job_id, recruiter_id, candidate_id]);
            
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), candidate_id, 'Submitted to Team Lead (QC)']);
            
        emitLog('info', `[ATS] New submission ${subId} dispatched to Team Lead.`);
        res.json({ success: true, submission_id: subId });
    } catch (e: any) {
        console.error('Create submission error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 6b. Get Submissions (Scoped to logged-in Recruiter if recruiter_id provided, or all for TL/AM/Admin)
app.get('/api/ats/submissions', async (req, res) => {
    try {
        const { recruiter_id, job_id, status } = req.query;
        const db = await initDb();
        
        let query = `
            SELECT s.*, 
                   c.name as candidate_name, c.candidate_code, c.email as candidate_email, c.phone as candidate_phone, c.skills as candidate_skills,
                   j.title as job_title, j.job_code, j.description as job_description,
                   cl.company_name as client_name, sp.name as spoke_name, sp.email as spoke_email,
                   u.name as recruiter_name, u.email as recruiter_email
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];
        
        if (recruiter_id) {
            query += ` AND s.recruiter_id = ?`;
            params.push(recruiter_id);
        }
        if (job_id) {
            query += ` AND s.job_id = ?`;
            params.push(job_id);
        }
        if (status) {
            query += ` AND s.status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY s.created_at DESC`;
        
        const rows = await db.all(query, params);
        res.json(rows || []);
    } catch (e: any) {
        console.error('Get submissions error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 7. Team Lead QC Review Inbox & Decisions
app.get('/api/ats/tl/dashboard', async (req, res) => {
    try {
        const db = await initDb();
        
        // 1. Pending QC Submissions
        const pendingSubmissions = await db.all(`
            SELECT s.*, 
                   c.name as candidate_name, c.candidate_code, c.email as candidate_email, c.phone as candidate_phone, c.skills as candidate_skills,
                   c.current_salary, c.expected_salary, c.notice_period, c.visa_status, c.resume_path,
                   j.title as job_title, j.job_code,
                   cl.company_name as client_name, sp.name as spoke_name,
                   u.name as recruiter_name, u.email as recruiter_email
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE s.status = 'Submitted to TL'
            ORDER BY s.created_at DESC
        `);

        // 2. All Submissions stats
        const allSubs = await db.all(`
            SELECT s.id, s.status, s.recruiter_id, s.tl_feedback, s.updated_at, s.created_at,
                   c.name as candidate_name, c.candidate_code,
                   j.title as job_title, j.job_code,
                   cl.company_name as client_name,
                   u.name as recruiter_name
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            ORDER BY s.updated_at DESC
        `);

        const pendingCount = pendingSubmissions.length;
        const approvedCount = allSubs.filter(s => s.status !== 'Submitted to TL' && s.status !== 'Rejected by TL').length;
        const rejectedCount = allSubs.filter(s => s.status === 'Rejected by TL').length;
        const totalReviewed = approvedCount + rejectedCount;
        const passRate = totalReviewed > 0 ? Math.round((approvedCount / totalReviewed) * 100) : 100;

        // 3. Recruiter Performance breakdown
        const recruiterMap: Record<string, any> = {};
        allSubs.forEach(s => {
            const rId = s.recruiter_id || 'unknown';
            const rName = s.recruiter_name || 'Recruiter';
            if (!recruiterMap[rId]) {
                recruiterMap[rId] = {
                    id: rId,
                    name: rName,
                    total: 0,
                    approved: 0,
                    rejected: 0,
                    pending: 0,
                    interviews: 0
                };
            }
            recruiterMap[rId].total++;
            if (s.status === 'Submitted to TL') recruiterMap[rId].pending++;
            else if (s.status === 'Rejected by TL') recruiterMap[rId].rejected++;
            else {
                recruiterMap[rId].approved++;
                if (s.status && s.status.includes('Interview')) recruiterMap[rId].interviews++;
            }
        });

        // 4. Recent Decisions (Approved or Rejected)
        const recentDecisions = allSubs
            .filter(s => s.status === 'Rejected by TL' || s.status === 'Submitted to AM' || s.status === 'Client Submitted')
            .slice(0, 10);

        // 5. Active Jobs
        const activeJobs = await db.all(`
            SELECT j.*, cl.company_name as client_name,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id) as total_submissions
            FROM jobs j
            LEFT JOIN clients cl ON j.client_id = cl.id
            WHERE j.status = 'open' OR j.status IS NULL
            ORDER BY j.created_at DESC
            LIMIT 10
        `);

        res.json({
            pendingCount,
            approvedCount,
            rejectedCount,
            passRate,
            pendingSubmissions,
            recruiters: Object.values(recruiterMap),
            recentDecisions,
            activeJobs
        });
    } catch (e: any) {
        console.error('TL Dashboard error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ats/tl/inbox', async (req, res) => {
    try {
        const db = await initDb();
        const rows = await db.all(`
            SELECT s.*, 
                   c.name as candidate_name, c.candidate_code, c.email as candidate_email, c.phone as candidate_phone, c.skills as candidate_skills,
                   j.title as job_title, j.job_code, j.description as job_description,
                   cl.company_name as client_name, sp.name as spoke_name, sp.email as spoke_email,
                   u.name as recruiter_name, u.email as recruiter_email
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE s.status = 'Submitted to TL'
            ORDER BY s.created_at DESC
        `);
        res.json(rows || []);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ats/tl/review', async (req, res) => {
    try {
        const { submission_id, decision, tl_id } = req.body;
        const feedbackText = (req.body.tl_feedback || req.body.rejection_reason || req.body.notes || '').trim();
        const rejectionCategory = (req.body.rejection_reason || req.body.tl_rejection_category || '').trim();
        
        if (!submission_id || !decision) return res.status(400).json({ error: 'submission_id and decision required' });
        
        const db = await initDb();
        const sub = await db.get('SELECT * FROM submissions WHERE id = ?', [submission_id]);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        
        let newStatus = '';
        if (decision === 'approve') {
            newStatus = 'Submitted to AM';
        } else if (decision === 'reject') {
            newStatus = 'Rejected by TL';
            if (!feedbackText && !rejectionCategory) return res.status(400).json({ error: 'Rejection feedback is required' });
        } else {
            return res.status(400).json({ error: 'Invalid decision' });
        }
        
        const fullFeedback = rejectionCategory ? (feedbackText && feedbackText !== rejectionCategory ? `${rejectionCategory}: ${feedbackText}` : rejectionCategory) : feedbackText;

        await db.run(`
            UPDATE submissions 
            SET status = ?, tl_feedback = ?, tl_id = ?, tl_decision = ?, tl_reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [newStatus, fullFeedback, tl_id || null, decision, submission_id]);
        
        await db.run("UPDATE candidates SET status = ? WHERE id = ?", [newStatus, sub.candidate_id]);
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), sub.candidate_id, newStatus + (fullFeedback ? ': ' + fullFeedback : '')]);
            
        if (fullFeedback) {
            await db.run('INSERT INTO candidate_remarks (candidate_id, author_id, author_name, remark_text, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                [sub.candidate_id, tl_id || 'tl', 'Team Lead (QC)', fullFeedback]);
        }
        
        emitLog(decision === 'approve' ? 'success' : 'warn', `[ATS] Submission ${submission_id} ${decision === 'approve' ? 'Approved by TL -> Sent to AM' : 'Rejected by TL'}`);
        res.json({ success: true, status: newStatus });
    } catch (e: any) {
        console.error('TL review error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 8. Account Manager Client Submissions Queue & Submit to Spoke
app.get('/api/ats/am/inbox', async (req, res) => {
    try {
        const db = await initDb();
        const rows = await db.all(`
            SELECT s.*, 
                   c.name as candidate_name, c.candidate_code, c.email as candidate_email, c.phone as candidate_phone, c.skills as candidate_skills,
                   j.title as job_title, j.job_code, j.description as job_description,
                   cl.company_name as client_name, sp.name as spoke_name, sp.email as spoke_email,
                   u.name as recruiter_name, u.email as recruiter_email
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            WHERE s.status IN ('Submitted to AM', 'Client Submitted', 'Interview Scheduled', 'Interviews Rejected', 'Selected', 'Offered', 'Joined', 'Backout')
            ORDER BY s.updated_at DESC
        `);
        res.json(rows || []);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ats/am/submit-client', async (req, res) => {
    try {
        const { submission_id, am_id, custom_notes } = req.body;
        if (!submission_id) return res.status(400).json({ error: 'submission_id required' });
        
        const db = await initDb();
        const sub = await db.get('SELECT * FROM submissions WHERE id = ?', [submission_id]);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        
        const crypto = await import('crypto');
        const token = crypto.randomBytes(20).toString('hex');
        
        const newStatus = 'Client Submitted';
        const spokePersonId = req.body.spoke_person_id || sub.spoke_person_id || null;
        await db.run(`
            UPDATE submissions 
            SET status = ?, am_id = ?, am_notes = ?, review_token = ?, am_submitted_at = CURRENT_TIMESTAMP, spoke_person_id = COALESCE(?, spoke_person_id), updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [newStatus, am_id || null, custom_notes || '', token, spokePersonId, submission_id]);
        
        await db.run("UPDATE candidates SET status = ? WHERE id = ?", [newStatus, sub.candidate_id]);
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), sub.candidate_id, 'Submitted to Client Spoke']);
            
        emitLog('success', `[ATS] Submission ${submission_id} submitted to Client Spoke. Pipeline updated!`);
        res.json({ success: true, status: newStatus, review_token: token });
    } catch (e: any) {
        console.error('AM submit client error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ats/am/reject', async (req, res) => {
    try {
        const { submission_id, am_id, am_feedback } = req.body;
        if (!submission_id) return res.status(400).json({ error: 'submission_id required' });
        if (!am_feedback || !am_feedback.trim()) return res.status(400).json({ error: 'Rejection feedback is required' });
        
        const db = await initDb();
        const sub = await db.get('SELECT * FROM submissions WHERE id = ?', [submission_id]);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        
        const newStatus = 'Rejected by AM';
        await db.run(`
            UPDATE submissions 
            SET status = ?, am_id = ?, am_notes = ?, am_feedback = ?, am_decision = 'reject', am_reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [newStatus, am_id || null, am_feedback, am_feedback, submission_id]);
        
        await db.run("UPDATE candidates SET status = ? WHERE id = ?", [newStatus, sub.candidate_id]);
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), sub.candidate_id, newStatus + ': ' + am_feedback]);
            
        await db.run('INSERT INTO candidate_remarks (candidate_id, author_id, author_name, remark_text, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [sub.candidate_id, am_id || 'am', 'Account Manager', am_feedback]);
            
        emitLog('warn', `[ATS] Submission ${submission_id} Rejected by Account Manager. Feedback: ${am_feedback}`);
        res.json({ success: true, status: newStatus });
    } catch (e: any) {
        console.error('AM reject error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 9. Zero-Login Client Spoke Review & Feedback Portal Endpoints
app.get(['/portal/review', '/portal/review.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/portal/review.html'));
});

app.get('/api/portal/submission/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const db = await initDb();
        const sub = await db.get(`
            SELECT s.*, 
                   c.name as candidate_name, c.candidate_code, c.headline as candidate_headline, c.skills as candidate_skills, c.location as candidate_location,
                   j.title as job_title, j.job_code, j.description as job_description,
                   cl.company_name as client_name, sp.name as spoke_name
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            WHERE s.review_token = ?
        `, [token]);
        
        if (!sub) return res.status(404).json({ error: 'Submission link not found or expired' });
        res.json(sub);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/portal/feedback/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { decision, scheduled_time, duration, notes, counter_salary, rejection_reason } = req.body;
        
        const db = await initDb();
        const sub = await db.get('SELECT * FROM submissions WHERE review_token = ?', [token]);
        if (!sub) return res.status(404).json({ error: 'Invalid or expired review link' });
        
        let newStatus = sub.status;
        let logMsg = '';
        
        if (decision === 'shortlist') {
            newStatus = 'Interview Scheduled';
            logMsg = `Client Spoke shortlisted candidate for Interview: ${scheduled_time || 'TBD'}`;
            
            if (scheduled_time) {
                const intId = 'int_' + Date.now();
                await db.run(`
                    INSERT INTO interviews (id, candidate_id, job_id, scheduled_time, duration, status, title, description, call_type, timezone)
                    VALUES (?, ?, ?, ?, ?, 'scheduled', 'Client Interview', ?, 'video', 'UTC')
                `, [intId, sub.candidate_id, sub.job_id, scheduled_time, parseInt(duration) || 45, notes || 'Client interview']);
            }
        } else if (decision === 'reject') {
            newStatus = 'Interviews Rejected';
            logMsg = `Client Spoke rejected profile. Reason: ${rejection_reason || notes || 'Not specified'}`;
        } else if (decision === 'negotiate') {
            newStatus = 'Client Submitted';
            logMsg = `Client Spoke requested salary negotiation. Counter: ${counter_salary}`;
        }
        
        await db.run(`
            UPDATE submissions
            SET status = ?, client_feedback_type = ?, client_counter_salary = ?, 
                client_feedback_notes = ?, client_responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newStatus, decision, counter_salary || null, notes || rejection_reason || '', sub.id]);
        
        await db.run("UPDATE candidates SET status = ? WHERE id = ?", [newStatus, sub.candidate_id]);
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), sub.candidate_id, logMsg]);
            
        emitLog('success', `[CLIENT FEEDBACK] ${logMsg}`);
        res.json({ success: true, status: newStatus });
    } catch (e: any) {
        console.error('Portal feedback error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 10. Update Submission Lifecycle Stage (Hiring Funnel Progression by AM / TL)
app.post('/api/ats/submissions/:id/stage', async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, joining_date, backout_stage, backout_reason, invoice_amount, notes } = req.body;
        
        if (!stage) return res.status(400).json({ error: 'Stage required' });
        
        const db = await initDb();
        const sub = await db.get('SELECT * FROM submissions WHERE id = ?', [id]);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        
        let cleanInvoiceAmount: number | null = null;
        if (invoice_amount !== undefined && invoice_amount !== null && invoice_amount !== '') {
            const parsed = parseFloat(String(invoice_amount).replace(/[^0-9.-]/g, ''));
            if (!isNaN(parsed)) cleanInvoiceAmount = parsed;
        }

        await db.run(`
            UPDATE submissions 
            SET status = ?, 
                joining_date = COALESCE(?, joining_date),
                backout_stage = COALESCE(?, backout_stage),
                backout_reason = COALESCE(?, backout_reason),
                invoice_amount = COALESCE(?, invoice_amount),
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [stage, joining_date || null, backout_stage || null, backout_reason || null, cleanInvoiceAmount, id]);
        
        await db.run("UPDATE candidates SET status = ? WHERE id = ?", [stage, sub.candidate_id]);
        
        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now(), sub.candidate_id, `Moved to ${stage}${notes ? ' - ' + notes : ''}`]);
            
        emitLog('info', `[HIRING FUNNEL] Candidate moved to ${stage}`);
        res.json({ success: true, status: stage });
    } catch (e: any) {
        console.error('Update stage error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 11. Detailed Live Job Roles (Full provenance, assigned recruiters, client & spoke info, live submission counts)
app.get('/api/ats/jobs/detailed', async (req, res) => {
    try {
        const db = await initDb();
        const { q, client_id, status, recruiter_id, tl_id } = req.query;
        
        let query = `
            SELECT j.*,
                   cl.company_name as client_name, cl.website as client_website, cl.industry as client_industry,
                   sp.name as spoke_name, sp.email as spoke_email, sp.phone as spoke_phone, sp.role_title as spoke_role,
                   u_tl.name as tl_name,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id) as total_submissions,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id AND status = 'Submitted to TL') as pending_tl_count,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id AND status = 'Submitted to AM') as pending_am_count,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id AND status = 'Client Submitted') as client_submitted_count,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id AND status LIKE '%Interview%') as interview_count,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id AND status = 'Joined') as joined_count,
                   (SELECT COUNT(*) FROM submissions WHERE job_id = j.id AND status = 'Rejected by TL') as rejected_tl_count
            FROM jobs j
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON j.spoke_person_id = sp.id
            LEFT JOIN users u_tl ON j.assigned_tl_id = u_tl.id
            WHERE (j.status != 'deleted' OR j.status IS NULL)
        `;
        const params: any[] = [];
        
        if (q) {
            query += ` AND (LOWER(j.title) LIKE ? OR LOWER(COALESCE(j.job_code, '')) LIKE ? OR LOWER(COALESCE(cl.company_name, '')) LIKE ? OR LOWER(COALESCE(j.location, '')) LIKE ?)`;
            const term = `%${String(q).toLowerCase()}%`;
            params.push(term, term, term, term);
        }
        if (client_id) {
            query += ` AND j.client_id = ?`;
            params.push(client_id);
        }
        if (status) {
            query += ` AND j.status = ?`;
            params.push(status);
        }
        if (recruiter_id) {
            query += ` AND (j.assigned_recruiter = ? OR CAST(j.assigned_recruiters AS TEXT) LIKE ?)`;
            params.push(recruiter_id, `%"${recruiter_id}"%`);
        }
        if (tl_id) {
            query += ` AND j.assigned_tl_id = ?`;
            params.push(tl_id);
        }
        
        query += ` ORDER BY j.created_at DESC`;
        
        const jobs = await db.all(query, params);
        res.json(jobs || []);
    } catch (e: any) {
        console.error('Get detailed jobs error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 12. Create Job Role with Full Provenance (manual or ingested)
app.post('/api/ats/jobs', async (req, res) => {
    try {
        const {
            title, company, location, description, jobType, workMode,
            client_id, spoke_person_id, created_by_user_id, created_by_name, created_by_role,
            source_type, source_am_email, assigned_tl_id, assigned_recruiters, target_submissions, salary_range
        } = req.body;
        
        if (!title) return res.status(400).json({ error: 'Job title is required' });
        const db = await initDb();
        
        const id = 'job_' + Date.now() + Math.random().toString(36).substring(2, 6);
        const countRow: any = await db.get("SELECT COUNT(*) as c FROM jobs");
        const jobCode = `REQ-${2000 + parseInt(countRow.c || 0) + 1}`;
        
        let compName = company || '';
        if (!compName && client_id) {
            const clientRow = await db.get('SELECT company_name FROM clients WHERE id = ?', [client_id]);
            if (clientRow) compName = clientRow.company_name;
        }
        
        await db.run(`
            INSERT INTO jobs (
                id, job_code, title, company, location, description, jobtype, workmode,
                client_id, spoke_person_id, created_by_user_id, created_by_name, created_by_role,
                source_type, source_am_email, assigned_tl_id, assigned_recruiters, target_submissions,
                salary_range, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `, [
            id, jobCode, title.trim(), compName.trim(), (location || '').trim(), (description || '').trim(),
            jobType || 'Permanent', workMode || 'Onsite', client_id || null, spoke_person_id || null,
            created_by_user_id || null, created_by_name || null, created_by_role || null,
            source_type || 'manual', source_am_email || null, assigned_tl_id || null,
            Array.isArray(assigned_recruiters) ? JSON.stringify(assigned_recruiters) : (assigned_recruiters || null),
            parseInt(target_submissions) || 5, salary_range || ''
        ]);
        
        const newJob = await db.get('SELECT * FROM jobs WHERE id = ?', [id]);
        emitLog('success', `[JOBS] New requisition created: "${title.trim()}" (${jobCode})`);
        
        res.json({ success: true, job: newJob });
    } catch (e: any) {
        console.error('Create job error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 13. Get Candidate Submissions for a Specific Job
app.get('/api/ats/jobs/:id/submissions', async (req, res) => {
    try {
        const db = await initDb();
        const rows = await db.all(`
            SELECT s.*, 
                   c.name as candidate_name, c.candidate_code, c.email as candidate_email, c.phone as candidate_phone, c.skills as candidate_skills,
                   c.current_salary, c.expected_salary, c.notice_period, c.visa_status, c.resume_path,
                   u.name as recruiter_name, u.email as recruiter_email,
                   u_tl.name as tl_name,
                   u_am.name as am_name
            FROM submissions s
            JOIN candidates c ON s.candidate_id = c.id
            LEFT JOIN users u ON s.recruiter_id = u.id
            LEFT JOIN users u_tl ON s.tl_id = u_tl.id
            LEFT JOIN users u_am ON s.am_id = u_am.id
            WHERE s.job_id = ?
            ORDER BY s.created_at DESC
        `, [req.params.id]);
        res.json(rows || []);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 14. Detailed Clients View (With AM, Spoke persons, and Requisition counts)
app.get('/api/ats/clients/detailed', async (req, res) => {
    try {
        const db = await initDb();
        const clients = await db.all(`
            SELECT c.*,
                   u_am.name as am_name, u_am.email as am_email,
                   (SELECT COUNT(*) FROM jobs WHERE client_id = c.id AND (status != 'deleted' OR status IS NULL)) as active_roles_count,
                   (SELECT COUNT(s.id) FROM submissions s JOIN jobs j ON s.job_id = j.id WHERE j.client_id = c.id) as total_submissions_count,
                   (SELECT COUNT(s.id) FROM submissions s JOIN jobs j ON s.job_id = j.id WHERE j.client_id = c.id AND s.status LIKE '%Interview%') as interview_count,
                   (SELECT COUNT(s.id) FROM submissions s JOIN jobs j ON s.job_id = j.id WHERE j.client_id = c.id AND s.status = 'Joined') as placed_count
            FROM clients c
            LEFT JOIN users u_am ON c.account_manager_id = u_am.id
            ORDER BY c.created_at DESC
        `);
        
        const allSpokes = await db.all(`SELECT * FROM spoke_persons ORDER BY created_at ASC`);
        const spokeMap: Record<string, any[]> = {};
        allSpokes.forEach((sp: any) => {
            if (!spokeMap[sp.client_id]) spokeMap[sp.client_id] = [];
            spokeMap[sp.client_id].push(sp);
        });
        
        // Deduplicate clients by normalized company_name
        const deduplicatedMap = new Map<string, any>();
        for (const c of (clients || [])) {
            const normName = (c.company_name || '').trim().toLowerCase();
            if (!normName) continue;
            const spokes = spokeMap[c.id] || [];
            if (!deduplicatedMap.has(normName)) {
                deduplicatedMap.set(normName, {
                    ...c,
                    spoke_persons: [...spokes]
                });
            } else {
                const existing = deduplicatedMap.get(normName);
                existing.active_roles_count = (existing.active_roles_count || 0) + (c.active_roles_count || 0);
                existing.total_submissions_count = (existing.total_submissions_count || 0) + (c.total_submissions_count || 0);
                existing.interview_count = (existing.interview_count || 0) + (c.interview_count || 0);
                existing.placed_count = (existing.placed_count || 0) + (c.placed_count || 0);
                
                // Merge spokes avoiding duplicate names
                const existingSpokeNames = new Set((existing.spoke_persons || []).map((s: any) => (s.name || '').trim().toLowerCase()));
                spokes.forEach((sp: any) => {
                    const spNorm = (sp.name || '').trim().toLowerCase();
                    if (!existingSpokeNames.has(spNorm)) {
                        existingSpokeNames.add(spNorm);
                        existing.spoke_persons.push(sp);
                    }
                });
            }
        }
        
        res.json(Array.from(deduplicatedMap.values()));
    } catch (e: any) {
        console.error('Get detailed clients error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 15. Create Client with Full Provenance
app.post('/api/ats/clients', async (req, res) => {
    try {
        const {
            company_name, account_manager_id, industry, location,
            website, billing_terms, created_by_user_id, created_by_name, created_by_role
        } = req.body;
        
        if (!company_name) return res.status(400).json({ error: 'Company name is required' });
        
        const db = await initDb();
        const existing = await db.get('SELECT id FROM clients WHERE LOWER(company_name) = LOWER(?)', [company_name.trim()]);
        if (existing) {
            return res.status(400).json({ error: 'A client with this company name already exists.' });
        }
        
        const id = 'client_' + Date.now();
        await db.run(`
            INSERT INTO clients (
                id, company_name, account_manager_id, industry, location, website, billing_terms,
                created_by_user_id, created_by_name, created_by_role, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
            id, company_name.trim(), account_manager_id || null, industry || '', location || '',
            website || '', billing_terms || 'Net 30', created_by_user_id || null, created_by_name || null,
            created_by_role || null
        ]);
        
        emitLog('success', `[ATS] New client onboarded: ${company_name.trim()}`);
        agentEvents.emit('db_update', { action: 'refresh_clients' });
        res.json({ success: true, id, client: { id, company_name: company_name.trim() } });
    } catch (e: any) {
        console.error('Create client error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 16. Add Spoke Person to Client
app.post('/api/ats/clients/:id/spokes', async (req, res) => {
    try {
        const { id: client_id } = req.params;
        const { name, email, phone, role_title, contact_info } = req.body;
        
        if (!name || !email) return res.status(400).json({ error: 'Name and email are required for Spoke person' });
        
        const db = await initDb();
        const existingSpoke = await db.get(
            'SELECT id FROM spoke_persons WHERE client_id = ? AND (LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?))',
            [client_id, name.trim(), email.trim()]
        );
        if (existingSpoke) {
            return res.status(400).json({ error: 'A contact person with this name or email already exists for this client.' });
        }

        const id = 'spoke_' + Date.now();
        await db.run(`
            INSERT INTO spoke_persons (id, client_id, name, email, phone, role_title, contact_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, client_id, name.trim(), email.trim().toLowerCase(), phone || '', role_title || 'Hiring Lead', contact_info || '']);
        
        emitLog('success', `[ATS] Added Client Spoke: ${name} (${role_title || 'Spoke'})`);
        res.json({ success: true, spoke: { id, client_id, name, email, phone, role_title } });
    } catch (e: any) {
        console.error('Add spoke error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 17. Candidate Submission History & Audit Trail
app.get('/api/ats/candidates/:id/history', async (req, res) => {
    try {
        const db = await initDb();
        const submissions = await db.all(`
            SELECT s.*,
                   j.title as job_title, j.job_code, j.company as job_company,
                   cl.company_name as client_name,
                   sp.name as spoke_name, sp.email as spoke_email,
                   u_rec.name as recruiter_name, u_rec.role as recruiter_role,
                   u_tl.name as tl_name,
                   u_am.name as am_name
            FROM submissions s
            JOIN jobs j ON s.job_id = j.id
            LEFT JOIN clients cl ON j.client_id = cl.id
            LEFT JOIN spoke_persons sp ON s.spoke_person_id = sp.id OR j.spoke_person_id = sp.id
            LEFT JOIN users u_rec ON s.recruiter_id = u_rec.id
            LEFT JOIN users u_tl ON s.tl_id = u_tl.id
            LEFT JOIN users u_am ON s.am_id = u_am.id
            WHERE s.candidate_id = ?
            ORDER BY s.created_at DESC
        `, [req.params.id]);
        
        const pipeline = await db.all(`
            SELECT * FROM candidate_pipeline WHERE candidate_id = ? ORDER BY timestamp DESC
        `, [req.params.id]);
        
        const remarks = await db.all(`
            SELECT * FROM candidate_remarks WHERE candidate_id = ? ORDER BY timestamp DESC
        `, [req.params.id]);
        
        res.json({ submissions: submissions || [], pipeline: pipeline || [], remarks: remarks || [] });
    } catch (e: any) {
        console.error('Candidate history error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ====================================================================
// 19. ATS: LOCAL RESUME SCAN & MATCH ENGINE
// ====================================================================

// 19.1. Get Folder Info / Status
app.get('/api/ats/local-resumes/folder', async (req, res) => {
    try {
        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const defaultPath = path.join(baseDir, 'data', 'resumes');
        const currentPath = process.env.LOCAL_RESUME_PATH || defaultPath;
        const exists = fs.existsSync(currentPath);

        let fileCount = 0;
        if (exists) {
            try {
                const files = fs.readdirSync(currentPath);
                fileCount = files.filter(f => ['.pdf', '.docx', '.doc', '.txt', '.rtf'].includes(path.extname(f).toLowerCase())).length;
            } catch (err) {}
        }

        res.json({
            folderPath: currentPath,
            exists,
            fileCount,
            defaultPath
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 19.2. Save Preferred Folder Path
app.post('/api/ats/local-resumes/save-folder', async (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });

        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const envPath = path.join(baseDir, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        envContent = envContent.split('\n').filter(l => !l.startsWith('LOCAL_RESUME_PATH=')).join('\n');
        envContent += `\nLOCAL_RESUME_PATH=${folderPath}\n`;
        process.env.LOCAL_RESUME_PATH = folderPath;
        fs.writeFileSync(envPath, envContent.trim() + '\n');

        emitLog('success', `[SETTINGS] Updated local resume directory: ${folderPath}`);
        res.json({ success: true, folderPath });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 19.3. Scan & Match Local Folder
app.post('/api/ats/local-resumes/scan', async (req, res) => {
    try {
        const { folderPath, jobId, query, minScore, recursive } = req.body;
        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const targetDir = folderPath ? path.resolve(folderPath) : path.resolve(process.env.LOCAL_RESUME_PATH || path.join(baseDir, 'data', 'resumes'));

        if (!fs.existsSync(targetDir)) {
            return res.status(404).json({ error: `Directory does not exist: ${targetDir}` });
        }

        emitLog('info', `[SCAN LOCAL] Scanning folder: ${targetDir}...`);
        const parsedItems = await ResumeParser.parseDirectory(targetDir, recursive !== false);

        if (parsedItems.length === 0) {
            return res.json({
                success: true,
                folderPath: targetDir,
                totalFilesFound: 0,
                scannedCount: 0,
                matchedCount: 0,
                matches: []
            });
        }

        const db = await initDb();

        // If jobId provided, load Job info
        let job: any = null;
        if (jobId) {
            job = await db.get('SELECT * FROM jobs WHERE id = ?', [jobId]);
        }

        // Cache existing candidates for instant ATS de-duplication cross-referencing
        const existingCandidates = await db.all('SELECT id, candidate_code, name, email, phone, status FROM candidates');
        const emailMap = new Map<string, any>();
        const phoneMap = new Map<string, any>();

        for (const ec of existingCandidates) {
            if (ec.email) emailMap.set(ec.email.trim().toLowerCase(), ec);
            if (ec.phone) {
                const clean = ec.phone.replace(/[^0-9+]/g, '');
                if (clean.length >= 7) phoneMap.set(clean, ec);
            }
        }

        const minScoreVal = typeof minScore === 'number' ? minScore : (parseInt(minScore) || 0);
        const matches: any[] = [];

        for (const item of parsedItems) {
            const profile = ResumeParser.extractCandidateProfile(item.text, item.filename);
            const scoreResult = ResumeParser.scoreResume(item.text, profile, job, query);

            if (scoreResult.matchScore < minScoreVal) {
                continue;
            }

            // Check if already in ATS
            let inAts = false;
            let existingCandidateId = null;
            let existingCandidateCode = null;
            let existingStatus = null;

            if (profile.email && emailMap.has(profile.email.toLowerCase())) {
                const cand = emailMap.get(profile.email.toLowerCase());
                inAts = true;
                existingCandidateId = cand.id;
                existingCandidateCode = cand.candidate_code;
                existingStatus = cand.status;
            } else if (profile.phone) {
                const cleanPhone = profile.phone.replace(/[^0-9+]/g, '');
                if (cleanPhone.length >= 7 && phoneMap.has(cleanPhone)) {
                    const cand = phoneMap.get(cleanPhone);
                    inAts = true;
                    existingCandidateId = cand.id;
                    existingCandidateCode = cand.candidate_code;
                    existingStatus = cand.status;
                }
            }

            matches.push({
                filename: item.filename,
                fullPath: item.fullPath,
                fileSizeFormatted: item.fileSizeFormatted,
                extension: item.extension,
                modifiedAt: item.modifiedAt,
                candidate: profile,
                matchScore: scoreResult.matchScore,
                matchedSkills: scoreResult.matchedSkills,
                missingSkills: scoreResult.missingSkills,
                mandatoryMatched: scoreResult.mandatoryMatched,
                mandatoryMissing: scoreResult.mandatoryMissing,
                niceToHaveMatched: scoreResult.niceToHaveMatched,
                niceToHaveMissing: scoreResult.niceToHaveMissing,
                positives: scoreResult.positives,
                negatives: scoreResult.negatives,
                probingQuestions: scoreResult.probingQuestions,
                breakdown: scoreResult.breakdown,
                summary: scoreResult.summary,
                inAts,
                existingCandidateId,
                existingCandidateCode,
                existingStatus,
                snippet: item.text.substring(0, 400).replace(/\s+/g, ' ')
            });
        }

        // Sort descending by match score
        matches.sort((a, b) => b.matchScore - a.matchScore);

        emitLog('success', `[SCAN LOCAL] Scanned ${parsedItems.length} CVs in ${targetDir}. Found ${matches.length} matches.`);

        res.json({
            success: true,
            folderPath: targetDir,
            totalFilesFound: parsedItems.length,
            scannedCount: parsedItems.length,
            matchedCount: matches.length,
            job: job ? { id: job.id, title: job.title, job_code: job.job_code, company: job.company } : null,
            matches
        });
    } catch (e: any) {
        emitLog('error', `[SCAN LOCAL] Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// 19.4. One-Click Ingest Candidate from Scanned Resume into ATS
app.post(['/api/ats/local-resumes/ingest', '/api/ats/ingest-local'], async (req, res) => {
    try {
        const {
            name, email, phone, headline, skills, resume_path, job_id, created_by_user_id, created_by_name, created_by_role
        } = req.body;

        if (!name) return res.status(400).json({ error: 'Candidate name is required' });

        const db = await initDb();
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPhone = (phone || '').replace(/[^0-9+]/g, '').trim();

        // Check if candidate already exists
        let existing: any = null;
        if (cleanEmail) {
            existing = await db.get('SELECT * FROM candidates WHERE LOWER(email) = ?', [cleanEmail]);
        }
        if (!existing && cleanPhone && cleanPhone.length >= 7) {
            const phoneDigits = cleanPhone.slice(-8);
            existing = await db.get("SELECT * FROM candidates WHERE phone LIKE ? OR phone = ?", [`%${phoneDigits}%`, cleanPhone]);
        }

        if (existing) {
            if (resume_path && !existing.resume_path) {
                await db.run('UPDATE candidates SET resume_path = ? WHERE id = ?', [resume_path, existing.id]);
            }
            return res.json({
                success: true,
                candidateId: existing.id,
                candidateCode: existing.candidate_code,
                name: existing.name,
                isExisting: true,
                message: `Candidate already exists in ATS (${existing.candidate_code || existing.name})`
            });
        }

        const id = 'cand_' + Date.now() + Math.random().toString(36).substring(2, 6);
        const countRow: any = await db.get('SELECT COUNT(*) as c FROM candidates');
        const nextCode = `CAND-${1000 + parseInt(countRow?.c || 0) + 1}`;

        const skillsStr = Array.isArray(skills) ? skills.join(', ') : (skills || '');

        await db.run(`
            INSERT INTO candidates (
                id, candidate_code, name, email, phone, headline, skills,
                source, resume_path, status, created_by_user_id, created_by_name, created_by_role
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Local Folder Scan', ?, 'Available', ?, ?, ?)
        `, [
            id, nextCode, name.trim(), cleanEmail, phone || '', headline || skillsStr, skillsStr,
            resume_path || '', created_by_user_id || null, created_by_name || null, created_by_role || null
        ]);

        await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
            ['pipe_' + Date.now() + Math.random().toString(36).substring(2, 5), id, 'Sourced']
        );

        emitLog('success', `[ATS INGEST] Added local candidate to talent database: ${name} (${nextCode})`);

        res.json({
            success: true,
            candidateId: id,
            candidateCode: nextCode,
            name: name.trim(),
            isExisting: false,
            message: `Candidate ${name} successfully added to ATS!`
        });
    } catch (e: any) {
        emitLog('error', `[ATS INGEST] Failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ====================================================================
// 20. ATS: EMAIL RESUME ARCHIVE SCANNER & MATCH ENGINE
// ====================================================================

// 20.1. Email Scanner Configuration Status
app.get('/api/ats/email-resumes/status', (req, res) => {
    try {
        const isConfigured = EmailResumeScanner.isConfigured();
        const host = process.env.EMAIL_HOST || '';
        const user = process.env.EMAIL_USER || process.env.SMTP_USER || '';
        res.json({
            isConfigured,
            host,
            user: user ? user.replace(/(?<=.{3}).(?=.*@)/g, '*') : ''
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 20.2. Scan Email Archive for Matching Resumes
app.post('/api/ats/email-resumes/scan', async (req, res) => {
    try {
        const { jobId, folder, days, query, minScore, limit } = req.body;
        emitLog('info', `[EMAIL RESUME SCAN] Starting scan for job ID: ${jobId || 'All'}...`);
        
        const result = await EmailResumeScanner.scanEmailArchive({
            jobId,
            folder: folder || 'ALL',
            days: days ? parseInt(days) : 90,
            query,
            minScore: minScore !== undefined ? parseInt(minScore) : 30,
            limit: limit ? parseInt(limit) : 50
        });

        // Also fetch job details if jobId provided
        if (jobId) {
            const db = await initDb();
            const job = await db.get('SELECT id, title, job_code, company FROM jobs WHERE id = ?', [jobId]);
            (result as any).job = job || null;
        }

        res.json(result);
    } catch (e: any) {
        emitLog('error', `[EMAIL RESUME SCAN] Failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// 20.3. Ingest Email Candidate and optionally Submit to Job
app.post('/api/ats/email-resumes/import-and-submit', async (req, res) => {
    try {
        const {
            name, email, phone, headline, skills, cvText, cvFilename,
            job_id, submit_to_job, recruiter_id, tl_id
        } = req.body;

        if (!name) return res.status(400).json({ error: 'Candidate name is required' });

        const db = await initDb();
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPhone = (phone || '').replace(/[^0-9+]/g, '').trim();

        // 1. Check if candidate already exists in ATS
        let candidate: any = null;
        if (cleanEmail) {
            candidate = await db.get('SELECT * FROM candidates WHERE LOWER(email) = ?', [cleanEmail]);
        }
        if (!candidate && cleanPhone && cleanPhone.length >= 7) {
            candidate = await db.get('SELECT * FROM candidates WHERE phone = ?', [phone]);
        }

        let candidateId = candidate ? candidate.id : null;
        let candidateCode = candidate ? candidate.candidate_code : null;
        let isNew = false;

        // Save CV text to file if new or missing
        const baseDir = process.env.AGENT_DATA_PATH || path.join(__dirname, '..', '..');
        const resumeDir = path.join(baseDir, 'data', 'resumes');
        if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });

        let resumePath = candidate?.resume_path || '';
        if (!resumePath && cvText) {
            const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
            const destPath = path.join(resumeDir, `Email_${safeName}_${Date.now()}.txt`);
            fs.writeFileSync(destPath, cvText, 'utf8');
            resumePath = destPath;
        }

        if (!candidate) {
            isNew = true;
            candidateId = 'cand_' + Date.now() + Math.random().toString(36).substring(2, 6);
            const countRow: any = await db.get('SELECT COUNT(*) as c FROM candidates');
            candidateCode = `CAND-${1000 + parseInt(countRow?.c || 0) + 1}`;
            const skillsStr = Array.isArray(skills) ? skills.join(', ') : (skills || '');

            await db.run(`
                INSERT INTO candidates (
                    id, candidate_code, name, email, phone, headline, skills,
                    source, resume_path, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Email Archive', ?, 'Available')
            `, [
                candidateId, candidateCode, name.trim(), cleanEmail, phone || '',
                headline || skillsStr, skillsStr, resumePath
            ]);

            await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
                ['pipe_' + Date.now(), candidateId, 'Imported from Email Archive']
            );
        } else if (resumePath && !candidate.resume_path) {
            await db.run('UPDATE candidates SET resume_path = ? WHERE id = ?', [resumePath, candidateId]);
        }

        // 2. Submit to Job if requested
        let submissionId: string | null = null;
        if (submit_to_job && job_id) {
            // Check if already active submission for this candidate and job
            const existingSub = await db.get(`
                SELECT id FROM submissions 
                WHERE candidate_id = ? AND job_id = ? AND status NOT IN ('Client Rejected', 'TL Rejected', 'Rejected by TL')
            `, [candidateId, job_id]);

            if (existingSub) {
                submissionId = existingSub.id;
            } else {
                submissionId = 'SUB-' + (3000 + Math.floor(Math.random() * 9000));
                await db.run(`
                    INSERT INTO submissions (
                        id, candidate_id, job_id, recruiter_id, tl_id, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'Submitted to TL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    submissionId, candidateId, job_id,
                    recruiter_id || 'u_recruiter', tl_id || 'u_teamlead'
                ]);

                await db.run('UPDATE candidates SET status = ? WHERE id = ?', ['Submitted to TL', candidateId]);
                await db.run('INSERT INTO candidate_pipeline (id, candidate_id, stage) VALUES (?, ?, ?)',
                    ['pipe_' + Date.now(), candidateId, `Submitted from Email Archive to Job ${job_id}`]
                );
            }
        }

        emitLog('success', `[EMAIL RESUME] Ingested ${name} (${candidateCode})${submissionId ? ` and submitted to job (${submissionId})` : ''}`);

        res.json({
            success: true,
            candidateId,
            candidateCode,
            isNew,
            submissionId,
            message: `Candidate ${name} (${candidateCode}) ready!${submissionId ? ' Submittal sent to Team Lead QC.' : ''}`
        });
    } catch (e: any) {
        emitLog('error', `[EMAIL RESUME INGEST] Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// 18. Management analytics handled at line 2001 via ['/api/analytics/management', '/api/ats/analytics/management']

console.log('APP.LISTEN HAS BEEN CALLED');

    emitLog('success', `Recruitment Command Center active at http://localhost:${port}`);
    emitLog('info', `Automated daily reporting scheduled for 11:00 PM IST.`);
    emitLog('info', `Auto-Ingestion scheduled every 5 minutes.`);app.listen(port, () => { console.log('Server running on port ' + port); });
