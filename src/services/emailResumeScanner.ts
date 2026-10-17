import fs from 'fs';
import path from 'path';
import * as imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import mammoth from 'mammoth';
import { createRequire } from 'module';
import { emitLog } from './events.js';
import { ResumeParser, CandidateExtractedProfile } from './resumeParser.js';
import { initDb } from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

export interface EmailCandidateMatch {
    emailUid: string | number;
    subject: string;
    sender: string;
    senderEmail: string;
    recipient: string;
    date: string;
    folder: string;
    attachmentFilename?: string;
    candidate: CandidateExtractedProfile;
    matchScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    mandatoryMatched?: string[];
    mandatoryMissing?: string[];
    niceToHaveMatched?: string[];
    niceToHaveMissing?: string[];
    positives?: string[];
    negatives?: string[];
    probingQuestions?: string[];
    breakdown?: {
        titleScore: number;
        mandatoryScore: number;
        expScore: number;
        roleScore: number;
        locScore: number;
        niceScore: number;
    };
    summary: string;
    previousSubmission?: {
        clientName?: string;
        jobTitle?: string;
        jobCode?: string;
        date?: string;
        recruiterName?: string;
        feedbackNotes?: string;
        salaryExpected?: string;
    };
    cvSnippet: string;
    cvText: string;
    inAts: boolean;
    existingCandidateId?: string;
    existingCandidateCode?: string;
    existingStatus?: string;
}

export interface ScanOptions {
    jobId?: string;
    folder?: string;
    days?: number;
    query?: string;
    minScore?: number;
    limit?: number;
}

export class EmailResumeScanner {

    static getImapConfig() {
        const user = process.env.EMAIL_USER || process.env.SMTP_USER;
        const password = process.env.EMAIL_PASS || process.env.SMTP_PASS;
        const host = process.env.EMAIL_HOST;
        const port = parseInt(process.env.EMAIL_PORT || '993', 10);

        if (!user || !password || !host) {
            return null;
        }

        return {
            imap: {
                user,
                password,
                host,
                port,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 15000
            }
        };
    }

    static isConfigured(): boolean {
        const config = this.getImapConfig();
        return config !== null;
    }

    /**
     * Extracts submission context from subject or body if it was a recruiter submission email
     */
    static extractSubmissionMeta(subject: string, bodyText: string, date: string, sender: string) {
        let clientName = '';
        let jobTitle = '';
        let jobCode = '';
        let salaryExpected = '';

        // Match subject pattern: "Candidate Submission: Name (CAND-X) for Title (JOB-X) - Client"
        const subjMatch = subject.match(/for\s+(.*?)\s*\((REQ-\d+|JOB-\d+)\)\s*(?:-\s*(.*))?$/i);
        if (subjMatch) {
            jobTitle = subjMatch[1]?.trim() || '';
            jobCode = subjMatch[2]?.trim() || '';
            clientName = subjMatch[3]?.trim() || '';
        }

        // Search body for metadata
        const clientBodyMatch = bodyText.match(/Client:\s*([^\n\r]+)/i);
        if (clientBodyMatch && !clientName) {
            clientName = clientBodyMatch[1].replace(/\(Spoke:.*?\)/i, '').trim();
        }

        const expSalMatch = bodyText.match(/Expected Compensation:\s*([^\n\r]+)/i);
        if (expSalMatch) {
            salaryExpected = expSalMatch[1].trim();
        }

        return {
            clientName: clientName || undefined,
            jobTitle: jobTitle || undefined,
            jobCode: jobCode || undefined,
            date: date || new Date().toISOString(),
            recruiterName: sender || 'Recruiter',
            salaryExpected: salaryExpected || undefined
        };
    }

    /**
     * Scan the mailbox for emails with resumes or past submissions
     */
    static async scanEmailArchive(options: ScanOptions = {}): Promise<{
        success: boolean;
        isConfigured: boolean;
        totalEmailsScanned: number;
        totalResumesFound: number;
        matches: EmailCandidateMatch[];
        error?: string;
    }> {
        const config = this.getImapConfig();
        if (!config) {
            emitLog('warn', '[EMAIL SCANNER] IMAP credentials not configured in Email Settings.');
            return {
                success: false,
                isConfigured: false,
                totalEmailsScanned: 0,
                totalResumesFound: 0,
                matches: [],
                error: 'Email settings (IMAP host, user, password) are not configured. Please configure them in Settings -> Email Settings.'
            };
        }

        const db = await initDb();

        // 1. Load target Job if jobId is provided
        let targetJob: any = null;
        if (options.jobId) {
            targetJob = await db.get('SELECT * FROM jobs WHERE id = ?', [options.jobId]);
        }

        // 2. Cache ATS candidates for instant cross-referencing
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

        let connection: imaps.ImapSimple | null = null;
        const matches: EmailCandidateMatch[] = [];
        let totalEmailsScanned = 0;
        let totalResumesFound = 0;

        try {
            emitLog('info', `[EMAIL SCANNER] Connecting to IMAP server ${config.imap.host}...`);
            connection = await imaps.connect(config);

            // Determine folders to scan
            let foldersToScan = ['INBOX'];
            if (options.folder && options.folder !== 'ALL') {
                foldersToScan = [options.folder];
            } else {
                // If scanning all or default, try to include Sent folder if accessible
                try {
                    const boxes = await connection.getBoxes();
                    const boxKeys = Object.keys(boxes);
                    for (const b of boxKeys) {
                        const lower = b.toLowerCase();
                        if (lower.includes('sent') && !foldersToScan.includes(b)) {
                            foldersToScan.push(b);
                        }
                    }
                    if (boxes['[Gmail]'] && boxes['[Gmail]'].children) {
                        const gmailKids = Object.keys(boxes['[Gmail]'].children);
                        for (const gk of gmailKids) {
                            if (gk.toLowerCase().includes('sent')) {
                                foldersToScan.push(`[Gmail]/${gk}`);
                            }
                        }
                    }
                } catch (bErr) {
                    // Ignore folder discovery error, fallback to INBOX
                }
            }

            const days = options.days || 90;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const imapDate = `${cutoffDate.getDate()}-${months[cutoffDate.getMonth()]}-${cutoffDate.getFullYear()}`;

            const searchCriteria: any[] = [['SINCE', imapDate]];

            for (const boxName of foldersToScan) {
                try {
                    emitLog('info', `[EMAIL SCANNER] Opening mailbox folder: "${boxName}"...`);
                    await connection.openBox(boxName);

                    const fetchOptions = { bodies: [''], struct: true, markSeen: false };
                    const messages = await connection.search(searchCriteria, fetchOptions);

                    totalEmailsScanned += messages.length;
                    emitLog('info', `[EMAIL SCANNER] Found ${messages.length} messages in "${boxName}" since ${imapDate}. Inspecting...`);

                    // Process most recent messages first
                    const reversedMessages = messages.reverse().slice(0, options.limit || 80);

                    for (const item of reversedMessages) {
                        const all = item.parts.find(p => p.which === '');
                        const uid = item.attributes.uid;
                        if (!all) continue;

                        try {
                            const mail = await simpleParser(all.body);
                            const subject = mail.subject || 'No Subject';
                            const dateStr = mail.date ? mail.date.toISOString() : new Date().toISOString();
                            const senderName = mail.from?.value[0]?.name || mail.from?.value[0]?.address || 'Unknown';
                            const senderEmail = mail.from?.value[0]?.address || '';
                            const recipient = mail.to && !Array.isArray(mail.to) ? (mail.to.value[0]?.address || '') : '';
                            const bodyText = mail.text || mail.html || '';

                            let cvText = '';
                            let attachmentName = '';

                            // 1. Check for attachments (PDF, DOCX, DOC, TXT)
                            if (mail.attachments && mail.attachments.length > 0) {
                                for (const att of mail.attachments) {
                                    const fname = (att.filename || '').toLowerCase();
                                    if (fname.endsWith('.pdf') || att.contentType === 'application/pdf') {
                                        try {
                                            const pdfData = await pdf(att.content);
                                            if (pdfData.text && pdfData.text.trim().length > 100) {
                                                cvText = pdfData.text;
                                                attachmentName = att.filename || 'resume.pdf';
                                                break;
                                            }
                                        } catch (pErr) {}
                                    } else if (fname.endsWith('.docx') || fname.endsWith('.doc')) {
                                        try {
                                            const resDoc = await mammoth.extractRawText({ buffer: att.content });
                                            if (resDoc.value && resDoc.value.trim().length > 100) {
                                                cvText = resDoc.value;
                                                attachmentName = att.filename || 'resume.docx';
                                                break;
                                            }
                                        } catch (mErr) {}
                                    }
                                }
                            }

                            // 2. If no attachment but body looks like candidate submission dossier
                            if (!cvText && (subject.toLowerCase().includes('submission') || subject.toLowerCase().includes('candidate') || bodyText.toLowerCase().includes('candidate summary'))) {
                                if (bodyText.length > 200) {
                                    cvText = bodyText;
                                    attachmentName = 'Email_Dossier.txt';
                                }
                            }

                            if (!cvText) continue;

                            totalResumesFound++;

                            // Extract Candidate Profile
                            const profile = ResumeParser.extractCandidateProfile(cvText, attachmentName || subject);

                            // Extract previous submission metadata if available
                            const previousSubmission = this.extractSubmissionMeta(subject, bodyText, dateStr, senderName);

                            // Score against target job
                            const scoreResult = ResumeParser.scoreResume(cvText, profile, targetJob, options.query);

                            const minScore = typeof options.minScore === 'number' ? options.minScore : 30;
                            if (scoreResult.matchScore < minScore) {
                                continue;
                            }

                            // Cross-reference with ATS
                            let inAts = false;
                            let existingCandidateId = undefined;
                            let existingCandidateCode = undefined;
                            let existingStatus = undefined;

                            if (profile.email && emailMap.has(profile.email.toLowerCase())) {
                                const ec = emailMap.get(profile.email.toLowerCase());
                                inAts = true;
                                existingCandidateId = ec.id;
                                existingCandidateCode = ec.candidate_code;
                                existingStatus = ec.status;
                            } else if (profile.phone) {
                                const clean = profile.phone.replace(/[^0-9+]/g, '');
                                if (clean.length >= 7 && phoneMap.has(clean)) {
                                    const ec = phoneMap.get(clean);
                                    inAts = true;
                                    existingCandidateId = ec.id;
                                    existingCandidateCode = ec.candidate_code;
                                    existingStatus = ec.status;
                                }
                            }

                            matches.push({
                                emailUid: uid,
                                subject,
                                sender: senderName,
                                senderEmail,
                                recipient,
                                date: dateStr,
                                folder: boxName,
                                attachmentFilename: attachmentName,
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
                                previousSubmission,
                                cvSnippet: cvText.substring(0, 450).replace(/\s+/g, ' ').trim() + '...',
                                cvText,
                                inAts,
                                existingCandidateId,
                                existingCandidateCode,
                                existingStatus
                            });

                        } catch (msgErr: any) {
                            // Skip problematic individual email
                        }
                    }
                } catch (boxErr: any) {
                    emitLog('warn', `[EMAIL SCANNER] Failed to open folder ${boxName}: ${boxErr.message}`);
                }
            }

            // Sort matches by highest score first
            matches.sort((a, b) => b.matchScore - a.matchScore);

            emitLog('success', `[EMAIL SCANNER] Scan complete. Evaluated ${totalEmailsScanned} emails, found ${totalResumesFound} CVs, matched ${matches.length} candidates.`);

            return {
                success: true,
                isConfigured: true,
                totalEmailsScanned,
                totalResumesFound,
                matches
            };

        } catch (e: any) {
            emitLog('error', `[EMAIL SCANNER] Connection failed: ${e.message}`);
            return {
                success: false,
                isConfigured: true,
                totalEmailsScanned,
                totalResumesFound,
                matches: [],
                error: e.message
            };
        } finally {
            if (connection) {
                try {
                    connection.end();
                } catch (endErr) {}
            }
        }
    }
}
