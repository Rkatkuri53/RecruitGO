import { AIService } from '../../services/ai.js';
import { initDb } from '../../services/database.js';
import { ResumeParser } from '../../services/resumeParser.js';
import { emitLog } from '../../services/events.js';
import fs from 'fs';
import path from 'path';
import * as lancedb from '@lancedb/lancedb';

export class LocalAgent {
    constructor(private ai: AIService) {}

    async scanLocalFolder(folderPath: string) {
        emitLog('info', `[LOCAL AGENT] Starting Enterprise Scan of local folder: ${folderPath}`);

        if (!fs.existsSync(folderPath)) {
            emitLog('error', `[LOCAL AGENT] Folder not found: ${folderPath}`);
            return;
        }

        const sqliteDb = await initDb();

        // 1. Get active jobs
        const jobs = await sqliteDb.all("SELECT * FROM jobs WHERE status IN ('pending', 'sourcing', 'nurturing')");
        if (jobs.length === 0) {
            emitLog('warn', '[LOCAL AGENT] No active jobs found. Skipping scan.');
            return;
        }

        // 2. Parse all resumes in the folder
        emitLog('info', `[LOCAL AGENT] Parsing resumes...`);
        const resumes = await ResumeParser.parseDirectory(folderPath);
        if (resumes.length === 0) {
            emitLog('warn', '[LOCAL AGENT] No readable resumes found in the folder.');
            return;
        }

        // 3. Connect to LanceDB
        const baseDir = process.env.NODE_ENV === 'production' ? process.cwd() : path.join(process.cwd(), 'dist', '..');
        const lancePath = path.join(baseDir, 'data', 'lancedb');
        if (!fs.existsSync(lancePath)) fs.mkdirSync(lancePath, { recursive: true });
        
        emitLog('info', `[LOCAL AGENT] Connecting to LanceDB engine at ${lancePath}...`);
        const lance = await lancedb.connect(lancePath);
        const tableNames = await lance.tableNames();
        let table: any;

        // Create table or open existing
        if (tableNames.includes('resumes')) {
            table = await lance.openTable('resumes');
        }

        // We will keep a map of filenames already in LanceDB to avoid duplicates
        // Note: In LanceDB, if we want to check existing, we can query it, or for speed, we can assume
        // for this implementation we just load the filenames from SQLite to keep track of what's embedded.
        // Even better, LanceDB might be empty initially.

        emitLog('info', `[LOCAL AGENT] Synchronizing Vector Database...`);
        let newRecords: any[] = [];
        
        for (const resume of resumes) {
            // Use SQLite to quickly track if we've embedded this file before (avoids full LanceDB scan)
            const existing = await sqliteDb.get("SELECT filename FROM resume_vectors WHERE filename = ?", [resume.filename]);
            if (!existing) {
                emitLog('info', `[LOCAL AGENT] Embedding new CV: ${resume.filename}...`);
                let vector = await this.ai.generateEmbedding(resume.text, 'nomic-embed-text');
                if (vector.length === 0) {
                    emitLog('warn', `[LOCAL AGENT] nomic-embed-text failed. Trying all-minilm...`);
                    vector = await this.ai.generateEmbedding(resume.text, 'all-minilm');
                }
                if (vector.length > 0) {
                    newRecords.push({
                        filename: resume.filename,
                        content: resume.text,
                        vector: vector
                    });
                    // Mark as embedded in SQLite metadata table
                    await sqliteDb.run("INSERT INTO resume_vectors (filename, content, vector) VALUES (?, ?, ?)", 
                        [resume.filename, "", "lancedb"]); // don't store text/vector in SQLite anymore to save memory
                }
            }
        }

        if (newRecords.length > 0) {
            if (table) {
                await table.add(newRecords);
            } else {
                table = await lance.createTable('resumes', newRecords);
            }
            emitLog('success', `[LOCAL AGENT] Added ${newRecords.length} new resumes to the LanceDB Vector Engine.`);
        }

        if (!table) {
            emitLog('warn', '[LOCAL AGENT] No embedded resumes found in LanceDB. Skipping matching.');
            return;
        }

        let matchedCount = 0;

        // 4. Score resumes using LanceDB RAG
        for (const job of jobs) {
            emitLog('info', `[LOCAL AGENT] Generating embedding for job: ${job.title}...`);
            const jobText = `${job.title} ${job.description} ${job.jobType} ${job.workMode}`;
            let jobVector = await this.ai.generateEmbedding(jobText, 'nomic-embed-text');
            if (jobVector.length === 0) {
                 jobVector = await this.ai.generateEmbedding(jobText, 'all-minilm');
            }

            if (jobVector.length === 0) {
                emitLog('error', `[LOCAL AGENT] Failed to generate embedding for job ${job.title}`);
                continue;
            }

            // Perform LanceDB Vector Search
            emitLog('info', `[LOCAL AGENT] Performing Enterprise Vector Search for ${job.title}...`);
            const results = await table.vectorSearch(jobVector).limit(10).toArray();

            emitLog('info', `[LOCAL AGENT] Found top ${results.length} mathematical matches. Sending to AI for final scoring...`);

            for (const resume of results) {
                try {
                    const result = await this.ai.scoreResume(job, resume.content);
                    
                    if (result.score >= 70) {
                        emitLog('success', `[LOCAL AGENT] 📁 High Match! ${result.extractedName} matches ${job.title} (${result.score}%)`);
                        
                        // Cross-reference with LinkedIn inbox sync
                        const history = await sqliteDb.get(
                            "SELECT * FROM conversations WHERE candidate_name LIKE ?",
                            [`%${result.extractedName.split(' ')[0]}%`]
                        );

                        let notes = `Score: ${result.score}% - ${result.status}`;
                        if (history) {
                            emitLog('info', `[LOCAL AGENT] 🧠 Cross-Reference: You previously spoke to ${result.extractedName} on LinkedIn!`);
                            notes += `\n\n[PREVIOUS CHAT HISTORY FOUND]\nSummary: ${history.ai_summary}\nStatus: ${history.conclusion_status}`;
                        }

                        // Insert into candidates table
                        const pseudoId = `local_${job.id}_${resume.filename.replace(/\s+/g, '_')}`;

                        await sqliteDb.run(`
                            INSERT INTO candidates (id, name, headline, location, job_id, profile_url, status, notes, match_score, source)
                            VALUES (?, ?, ?, ?, ?, ?, 'sourced', ?, ?, 'local_folder')
                            ON CONFLICT(id) DO UPDATE SET
                            notes = excluded.notes,
                            match_score = excluded.match_score,
                            last_updated = CURRENT_TIMESTAMP
                        `, [
                            pseudoId,
                            result.extractedName || resume.filename,
                            `Matched Resume (${resume.filename})`,
                            'Local Database',
                            job.id,
                            `file://${path.join(folderPath, resume.filename)}`,
                            notes,
                            result.score
                        ]);

                        matchedCount++;
                    } else {
                        emitLog('info', `[LOCAL AGENT] ${resume.filename} scored ${result.score}% for ${job.title}. Skipping.`);
                    }
                } catch (e: any) {
                    emitLog('warn', `[LOCAL AGENT] Error scoring ${resume.filename}: ${e.message}`);
                }
            }
        }

        emitLog('success', `[LOCAL AGENT] Enterprise Scan complete. Found ${matchedCount} high-quality local matches.`);
    }
}
