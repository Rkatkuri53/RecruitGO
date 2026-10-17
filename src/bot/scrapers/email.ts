import * as imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { AIService } from '../../services/ai.js';
import { emitLog } from '../../services/events.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import mammoth from 'mammoth';
import dotenv from 'dotenv';
dotenv.config();

export interface EmailParsedData {
    type: 'INTERVIEW_SCHEDULE' | 'NEW_JOB_REQUIREMENT';
    data: any;
    senderEmail?: string;
}

export class EmailScraper {
    private ai: AIService;

    constructor(ai: AIService) {
        this.ai = ai;
    }

    async getDailyRecruitmentData(): Promise<EmailParsedData[]> {
        const user = process.env.EMAIL_USER;
        const password = process.env.EMAIL_PASS;
        const host = process.env.EMAIL_HOST;
        const port = parseInt(process.env.EMAIL_PORT || '993');

        if (!user || !password || !host) {
            return [];
        }

        const config = {
            imap: {
                user,
                password,
                host,
                port,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 10000
            }
        };

        const results: EmailParsedData[] = [];
        let connection: imaps.ImapSimple | null = null;

        try {
            emitLog('info', `[EMAIL] Connecting to IMAP server: ${host}...`);
            connection = await imaps.connect(config);
            await connection.openBox('INBOX');

            // Search since start of today
            const now = new Date();
            const startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0); 
            
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const imapDate = `${startDate.getDate()}-${months[startDate.getMonth()]}-${startDate.getFullYear()}`;

            const searchCriteria = ['UNSEEN', ['SINCE', imapDate]];
            const fetchOptions = { bodies: [''], struct: true, markSeen: true }; 

            emitLog('info', `[EMAIL] Searching for recruitment emails since ${imapDate}...`);
            const messages = await connection.search(searchCriteria, fetchOptions);

            const keywords = ['interview', 'schedule', 'technical round', 'hr round', 'selected', 'offer', 'joining', 'feedback', 'new role', 'job description', 'hiring', 'requirement', 'vacancy'];

            for (const item of messages) {
                const all = item.parts.find(part => part.which === '');
                const id = item.attributes.uid;
                const idHeader = "Imap-Id: "+id+"\r\n";
                if (!all) continue;

                const mail = await simpleParser(idHeader + all.body);
                let text = (mail.text || mail.html || '').substring(0, 3000); 

                // Process Attachments (PDF/DOCX)
                if (mail.attachments && mail.attachments.length > 0) {
                    emitLog('info', `[EMAIL] Found ${mail.attachments.length} attachments in "${mail.subject}". Parsing...`);
                    for (const att of mail.attachments) {
                        try {
                            if (att.contentType === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf')) {
                                const pdfData = await pdf(att.content);
                                text += `\n--- ATTACHMENT: ${att.filename} ---\n${pdfData.text.substring(0, 8000)}`;
                            } else if (att.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || att.filename?.toLowerCase().endsWith('.docx')) {
                                const result = await mammoth.extractRawText({ buffer: att.content });
                                text += `\n--- ATTACHMENT: ${att.filename} ---\n${result.value.substring(0, 8000)}`;
                            }
                        } catch (attErr: any) {
                            emitLog('warn', `[EMAIL] Failed to parse attachment ${att.filename}: ${attErr.message}`);
                        }
                    }
                }

                const lowerText = text.toLowerCase();
                const hasKeyword = keywords.some(kw => lowerText.includes(kw));

                if (hasKeyword) {
                    emitLog('info', `[EMAIL] Analyzing recruitment email: "${mail.subject}" with AI...`);
                    try {
                        const parsed = await this.ai.classifyAndExtractEmailData(text);
                        if (parsed && parsed.type !== 'OTHER') {
                            const senderEmail = mail.from?.value[0]?.address || '';
                            parsed.senderEmail = senderEmail;
                            results.push(parsed as EmailParsedData);
                            emitLog('success', `[EMAIL] Successfully extracted ${parsed.type} from email sent by ${senderEmail}.`);
                        }
                    } catch (err) {
                        emitLog('warn', `[EMAIL] AI parsing failed for email: ${mail.subject}`);
                    }
                }
            }

            return results;
        } catch (e: any) {
            emitLog('error', `[EMAIL] IMAP Error: ${e.message}`);
            return [];
        } finally {
            if (connection) {
                connection.end();
            }
        }
    }
}
