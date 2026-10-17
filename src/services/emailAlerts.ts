import nodemailer from 'nodemailer';
import { initDb } from './database.js';
import { emitLog } from './events.js';

export function createTransporter(customConfig?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
}) {
    const host = customConfig?.host || process.env.SMTP_HOST || 'smtp.ethereal.email';
    const port = customConfig?.port || parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = customConfig?.secure !== undefined ? customConfig.secure : (process.env.SMTP_SECURE === 'true');
    const user = customConfig?.user !== undefined ? customConfig.user : (process.env.SMTP_USER || '');
    const pass = customConfig?.pass !== undefined ? customConfig.pass : (process.env.SMTP_PASS || '');

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
    });
}

// Transporter configured via environment variables
let transporter = createTransporter();

export function reloadEmailTransporter() {
    transporter = createTransporter();
    emitLog('info', `[EMAIL] SMTP Transporter reloaded for host: ${process.env.SMTP_HOST || 'default'}`);
    return transporter;
}

export async function testSmtpConnection(options?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
    testRecipient?: string;
}): Promise<{ success: boolean; message: string }> {
    try {
        const testTransport = createTransporter(options);
        
        // 1. Verify connection & authentication
        await testTransport.verify();

        const user = options?.user || process.env.SMTP_USER || '';
        const recipient = options?.testRecipient || user;

        // 2. Optionally send verification email if recipient is provided
        if (recipient && user) {
            const fromAddr = options?.from || process.env.SMTP_FROM || user;
            await testTransport.sendMail({
                from: fromAddr.includes('<') ? fromAddr : `"RecruitGO System" <${fromAddr}>`,
                to: recipient,
                subject: '✅ RecruitGO Email Configuration Test',
                text: `Hello!\n\nThis is a verification email confirming that your RecruitGO SMTP email settings are working properly.\n\nTimestamp: ${new Date().toLocaleString()}\nHost: ${options?.host || process.env.SMTP_HOST}\nPort: ${options?.port || process.env.SMTP_PORT}\nSender: ${fromAddr}\n\nYou are all set to receive interview reminders and send candidate submissions.\n\nBest regards,\nRecruitGO Talent Operations`
            });
            return {
                success: true,
                message: `SMTP connection verified and test email sent successfully to ${recipient}!`
            };
        }

        return {
            success: true,
            message: 'SMTP credentials verified successfully!'
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message || 'SMTP connection verification failed.'
        };
    }
}

// A local in-memory set to track which alerts have been sent so we don't spam.
// Format: `${interviewId}-${alertType}`
const sentAlerts = new Set<string>();

export async function checkAndSendInterviewAlerts() {
    try {
        const db = await initDb();

        // Find all interviews that are scheduled in the future
        // We only care about interviews in the next 20 minutes
        const interviews = await db.all(`
            SELECT 
                i.id, i.scheduled_time, i.meeting_link,
                c.name as candidate_name, c.email as candidate_email,
                u.name as recruiter_name, u.email as recruiter_email
            FROM interviews i
            LEFT JOIN candidates c ON i.candidate_id = c.id
            LEFT JOIN users u ON i.created_by = u.id
            WHERE i.scheduled_time > NOW() 
              AND i.scheduled_time <= NOW() + INTERVAL '20 minutes'
        `);

        for (const interview of interviews) {
            const scheduled = new Date(interview.scheduled_time);
            const now = new Date();
            const diffMs = scheduled.getTime() - now.getTime();
            const diffMins = Math.round(diffMs / 60000);

            // We want to send alerts at 15, 10, and 5 minutes
            const alertMarks = [15, 10, 5];
            
            for (const mark of alertMarks) {
                // If the interview is exactly `mark` minutes away (give or take a minute for cron jitter)
                if (diffMins === mark) {
                    const alertKey = `${interview.id}-${mark}`;
                    
                    if (!sentAlerts.has(alertKey)) {
                        sentAlerts.add(alertKey);
                        await sendAlert(interview, mark);
                    }
                }
            }
        }
    } catch (e: any) {
        emitLog('error', `[CRON] Interview Alert Check Failed: ${e.message}`);
    }
}

async function sendAlert(interview: any, minutesLeft: number) {
    if (!process.env.SMTP_USER) {
        emitLog('info', `[CRON] (Mock) Would send ${minutesLeft}m alert to ${interview.candidate_email} and ${interview.recruiter_email}`);
        return;
    }

    const subject = `Reminder: Interview starting in ${minutesLeft} minutes`;
    const text = `
Hello,

This is a reminder that the interview for candidate ${interview.candidate_name} is starting in ${minutesLeft} minutes.

Meeting Link: ${interview.meeting_link || 'Link provided by recruiter'}

Thank you,
MyRecruiter System
    `.trim();

    const recipients = [interview.candidate_email, interview.recruiter_email].filter(Boolean).join(', ');

    if (!recipients) return;

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER || 'alerts@myrecruiter.com',
            to: recipients,
            subject,
            text,
        });
        emitLog('success', `[CRON] Sent ${minutesLeft}m interview alert for Interview #${interview.id}`);
    } catch (e: any) {
        emitLog('error', `[CRON] Failed to send alert: ${e.message}`);
    }
}
