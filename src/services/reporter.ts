import { initDb, getDataDir } from './database.js';
import { emitLog } from './events.js';
import { EmailScraper } from '../bot/scrapers/email.js';
import { AIService } from './ai.js';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

export class ReporterService {
    async generateDailyReport() {
        const db = await initDb();
        const now = new Date();
        const dataDir = getDataDir();
        
        // Target persistent Excel file
        const filePath = path.join(dataDir, 'Recruitment_Tracker.xlsx');

        // Calculate Time Window: 12:30 PM IST to 11:00 PM IST (Current Day)
        // IST is UTC+5:30
        // 12:30 PM IST = 07:00:00 UTC
        // 11:00 PM IST = 17:30:00 UTC
        const startDate = new Date(now);
        startDate.setUTCHours(7, 0, 0, 0); // 12:30 PM IST

        const endDate = new Date(now);
        endDate.setUTCHours(17, 30, 0, 0); // 11:00 PM IST

        const startStr = startDate.toISOString().replace('T', ' ').substring(0, 19);
        const endStr = endDate.toISOString().replace('T', ' ').substring(0, 19);

        emitLog('info', `[REPORTER] Generating daily report for window: ${startStr} UTC to ${endStr} UTC...`);

        // Initialize Workbook
        const workbook = new ExcelJS.Workbook();
        let isNewFile = true;

        if (fs.existsSync(filePath)) {
            emitLog('info', `[REPORTER] Found existing Recruitment_Tracker.xlsx. Appending to it...`);
            await workbook.xlsx.readFile(filePath);
            isNewFile = false;
        }

        // --- Sheet 1: Submissions ---
        let submissionsSheet = workbook.getWorksheet('Submissions');
        if (!submissionsSheet) {
            submissionsSheet = workbook.addWorksheet('Submissions');
            submissionsSheet.columns = [
                { header: 'Sr No', key: 'sr_no', width: 10 },
                { header: 'Candidate name', key: 'name', width: 25 },
                { header: 'Job Title', key: 'job_title', width: 25 },
                { header: 'Job Location', key: 'job_location', width: 20 },
                { header: 'Email address', key: 'email', width: 25 },
                { header: 'Phone Number', key: 'phone', width: 15 },
                { header: 'Account Manager', key: 'am', width: 20 },
                { header: 'Client', key: 'client', width: 20 },
                { header: 'Remarks', key: 'remarks', width: 30 }
            ];
            submissionsSheet.getRow(1).font = { bold: true };
        }

        // Fetch Submissions (New candidates discovered in window)
        const newCandidates = await db.all(`
            SELECT c.name, j.title as job_title, j.location as job_location
            FROM candidates c
            JOIN jobs j ON c.job_id = j.id
            WHERE c.timestamp >= ? AND c.timestamp <= ?
            ORDER BY c.timestamp ASC
        `, [startStr, endStr]);

        let subSrNo = submissionsSheet.rowCount; // Next Sr No is rowCount (since row 1 is header)
        for (const cand of newCandidates) {
            submissionsSheet.addRow({
                sr_no: subSrNo++,
                name: cand.name,
                job_title: cand.job_title,
                job_location: cand.job_location,
                email: '', // Manual entry
                phone: '', // Manual entry
                am: '', // Manual entry
                client: '', // Manual entry
                remarks: 'Auto-added by Agent'
            });
        }


        // --- Sheet 2: Interviews ---
        let interviewsSheet = workbook.getWorksheet('Interviews');
        if (!interviewsSheet) {
            interviewsSheet = workbook.addWorksheet('Interviews');
            interviewsSheet.columns = [
                { header: 'Sr No', key: 'sr_no', width: 10 },
                { header: 'Candidate name', key: 'name', width: 25 },
                { header: 'Job Title', key: 'job_title', width: 25 },
                { header: 'Job Location', key: 'job_location', width: 20 },
                { header: 'Coding Test', key: 'coding', width: 15 },
                { header: '1st round', key: 'r1', width: 15 },
                { header: '2nd round', key: 'r2', width: 15 },
                { header: '3rd Round', key: 'r3', width: 15 },
                { header: 'HR Discussion', key: 'hr', width: 15 },
                { header: 'Selection', key: 'selection', width: 15 },
                { header: 'Joining', key: 'joining', width: 15 },
                { header: 'Remarks', key: 'remarks', width: 30 }
            ];
            interviewsSheet.getRow(1).font = { bold: true };
        }
        // Email parsing for Interviews and New Job Requirements
        emitLog('info', '[REPORTER] Fetching daily recruitment data from emails...');
        const ai = new AIService();
        const emailScraper = new EmailScraper(ai);
        const recruitmentData = await emailScraper.getDailyRecruitmentData();

        let intSrNo = interviewsSheet.rowCount;

        for (const item of recruitmentData) {
            if (item.type === 'NEW_JOB_REQUIREMENT') {
                const job = item.data;
                const reqId = `REQ-${Math.floor(Math.random() * 100000)}`;
                const addedDate = new Date().toISOString().split('T')[0];
                
                await db.run(
                    `INSERT INTO jobs (id, title, location, jobType, workMode, status, description) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        reqId, 
                        job.title || 'New Job Requirement', 
                        job.location || '', 
                        job.jobType || 'Permanent', 
                        job.workMode || 'Onsite', 
                        'Active', 
                        job.description || (job.remarks || '')
                    ]
                );
                emitLog('success', `[REPORTER] Inserted New Job Requirement to Live Roles: ${job.title || 'Unknown Title'}`);
            } else if (item.type === 'INTERVIEW_SCHEDULE') {
                const interview = item.data;
                const stageStr = (interview.stage || '').toLowerCase();
                let rowObj: any = {
                    sr_no: intSrNo++,
                    name: interview.candidateName,
                    job_title: interview.jobTitle || '',
                    job_location: interview.jobLocation || '',
                    coding: '', r1: '', r2: '', r3: '', hr: '', selection: '', joining: '',
                    remarks: interview.remarks || `Parsed Stage: ${interview.stage}`
                };

                if (stageStr.includes('code') || stageStr.includes('coding')) rowObj.coding = 'Yes';
                else if (stageStr.includes('1st') || stageStr.includes('first')) rowObj.r1 = 'Yes';
                else if (stageStr.includes('2nd') || stageStr.includes('second')) rowObj.r2 = 'Yes';
                else if (stageStr.includes('3rd') || stageStr.includes('third')) rowObj.r3 = 'Yes';
                else if (stageStr.includes('hr')) rowObj.hr = 'Yes';
                else if (stageStr.includes('select') || stageStr.includes('offer')) rowObj.selection = 'Yes';
                else if (stageStr.includes('join')) rowObj.joining = 'Yes';

                interviewsSheet.addRow(rowObj);
                emitLog('success', `[REPORTER] Added Interview Schedule to Tracker: ${interview.candidateName}`);
            }
        }


        // --- Sheet 3: LinkedIn Work ---
        let linkedinSheet = workbook.getWorksheet('Linkedin work');
        if (!linkedinSheet) {
            linkedinSheet = workbook.addWorksheet('Linkedin work');
            linkedinSheet.columns = [
                { header: 'Sr No', key: 'sr_no', width: 10 },
                { header: 'Candidate Name', key: 'name', width: 25 },
                { header: 'Job Role', key: 'job_title', width: 25 },
                { header: 'Job Location', key: 'job_location', width: 20 },
                { header: 'Connection sent', key: 'conn_sent', width: 18 },
                { header: 'Connection Accepted', key: 'conn_accepted', width: 20 },
                { header: 'Candidate Replied', key: 'cand_replied', width: 20 },
                { header: 'Candidate Not Responding', key: 'cand_no_reply', width: 25 },
                { header: 'Remarks', key: 'remarks', width: 30 }
            ];
            linkedinSheet.getRow(1).font = { bold: true };
        }

        // Fetch LinkedIn Work (Connections & Conversations active in window)
        // Group by candidate to consolidate their status
        const linkedinWork = await db.all(`
            SELECT 
                COALESCE(c.name, conn.name, conv.candidate_name) as name,
                j.title as job_title,
                j.location as job_location,
                MAX(conn.status) as conn_status,
                MAX(conv.conclusion_status) as conv_status,
                MAX(conv.last_message) as conv_msg
            FROM jobs j
            LEFT JOIN candidates c ON j.id = c.job_id
            LEFT JOIN connections conn ON c.id = conn.id
            LEFT JOIN conversations conv ON c.id = conv.candidate_id
            WHERE (conn.timestamp >= ? AND conn.timestamp <= ?)
               OR (conv.last_updated >= ? AND conv.last_updated <= ?)
            GROUP BY c.id, c.name, conn.name, conv.candidate_name, j.title, j.location
        `, [startStr, endStr, startStr, endStr]);

        let liSrNo = linkedinSheet.rowCount;
        for (const work of linkedinWork) {
            if (!work.name) continue;

            const connSent = work.conn_status === 'pending' || work.conn_status === 'connected' ? 'Yes' : 'No';
            const connAccepted = work.conn_status === 'connected' ? 'Yes' : 'No';
            
            let replied = 'No';
            let noReply = 'No';
            if (work.conv_msg || work.conv_status === 'replied') {
                replied = 'Yes';
            } else if (work.conn_status === 'connected' && !work.conv_msg) {
                noReply = 'Yes'; // Connected but hasn't replied to initial follow-up
            }

            linkedinSheet.addRow({
                sr_no: liSrNo++,
                name: work.name,
                job_title: work.job_title || '',
                job_location: work.job_location || '',
                conn_sent: connSent,
                conn_accepted: connAccepted,
                cand_replied: replied,
                cand_no_reply: noReply,
                remarks: work.conv_status ? `Status: ${work.conv_status}` : 'Auto-added by Agent'
            });
        }

        // Write to file
        await workbook.xlsx.writeFile(filePath);
        emitLog('success', `[REPORTER] Daily tracker successfully ${isNewFile ? 'created at' : 'appended to'}: ${filePath}`);

        return filePath;
    }
}
