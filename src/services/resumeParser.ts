import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { emitLog } from './events.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface ParsedResumeItem {
    filename: string;
    fullPath: string;
    text: string;
    fileSize: number;
    fileSizeFormatted: string;
    extension: string;
    modifiedAt?: string;
}

export interface CandidateExtractedProfile {
    name: string;
    email: string;
    phone: string;
    headline: string;
    skills: string[];
    experience_years?: string;
}

export interface ScoredResumeMatch extends ParsedResumeItem {
    candidate: CandidateExtractedProfile;
    matchScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    summary: string;
    inAts?: boolean;
    existingCandidateId?: string;
    existingCandidateCode?: string;
    existingStatus?: string;
}

const COMMON_SKILLS_LIST = [
    'React', 'React Native', 'Angular', 'Vue', 'Next.js', 'Nuxt', 'Node.js', 'Express',
    'TypeScript', 'JavaScript', 'Python', 'Java', 'C#', '.NET', 'ASP.NET', 'C++', 'Go', 'Golang',
    'PHP', 'Ruby', 'Rails', 'Swift', 'Kotlin', 'Dart', 'Flutter', 'Spring Boot', 'Django',
    'Flask', 'FastAPI', 'Microservices', 'REST', 'RESTful API', 'GraphQL', 'gRPC',
    'AWS', 'Amazon Web Services', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'K8s',
    'Terraform', 'Ansible', 'CI/CD', 'Jenkins', 'Git', 'GitHub', 'GitLab', 'Linux',
    'SQL', 'PostgreSQL', 'Postgres', 'MySQL', 'Oracle', 'MongoDB', 'Redis', 'Cassandra',
    'DynamoDB', 'Snowflake', 'BigQuery', 'Kafka', 'RabbitMQ', 'Elasticsearch',
    'Machine Learning', 'Deep Learning', 'NLP', 'LLM', 'Generative AI', 'PyTorch', 'TensorFlow',
    'Pandas', 'NumPy', 'Data Engineering', 'ETL', 'Power BI', 'Tableau',
    'Agile', 'Scrum', 'Jira', 'QA', 'Automation Testing', 'Selenium', 'Cypress', 'Playwright',
    'Salesforce', 'SAP', 'Workday', 'Cybersecurity', 'DevOps', 'Site Reliability Engineering', 'SRE'
];

export class ResumeParser {
    
    static formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    static async parseFile(filePath: string): Promise<string> {
        if (!fs.existsSync(filePath)) return '';
        const ext = path.extname(filePath).toLowerCase();
        try {
            if (ext === '.pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                return pdfData.text || '';
            } else if (ext === '.docx' || ext === '.doc') {
                const result = await mammoth.extractRawText({ path: filePath });
                return result.value || '';
            } else if (ext === '.txt' || ext === '.rtf') {
                return fs.readFileSync(filePath, 'utf8') || '';
            }
        } catch (err: any) {
            emitLog('warn', `[RESUME PARSER] Failed to parse ${filePath}: ${err.message}`);
        }
        return '';
    }

    static async parseBuffer(buffer: Buffer, filename: string): Promise<string> {
        const ext = path.extname(filename).toLowerCase();
        try {
            if (ext === '.pdf') {
                const pdfData = await pdfParse(buffer);
                return pdfData.text || '';
            } else if (ext === '.docx' || ext === '.doc') {
                const result = await mammoth.extractRawText({ buffer: buffer });
                return result.value || '';
            } else if (ext === '.txt' || ext === '.rtf') {
                return buffer.toString('utf8') || '';
            }
        } catch (err: any) {
            emitLog('warn', `[RESUME PARSER] Failed to parse buffer for ${filename}: ${err.message}`);
        }
        return '';
    }

    static async parseDirectory(directoryPath: string, recursive: boolean = true): Promise<ParsedResumeItem[]> {
        if (!fs.existsSync(directoryPath)) {
            emitLog('warn', `[RESUME PARSER] Directory does not exist: ${directoryPath}`);
            return [];
        }

        const results: ParsedResumeItem[] = [];
        const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];

        const scanDir = async (dir: string, currentDepth: number = 0) => {
            if (currentDepth > 3) return; // prevent endless recursion
            let entries: fs.Dirent[] = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch (e: any) {
                emitLog('warn', `[RESUME PARSER] Cannot read folder ${dir}: ${e.message}`);
                return;
            }

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        await scanDir(fullPath, currentDepth + 1);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (!allowedExtensions.includes(ext)) continue;

                    try {
                        let text = '';
                        const stats = fs.statSync(fullPath);

                        if (ext === '.pdf') {
                            const dataBuffer = fs.readFileSync(fullPath);
                            const pdfData = await pdfParse(dataBuffer);
                            text = pdfData.text || '';
                        } else if (ext === '.docx' || ext === '.doc') {
                            const result = await mammoth.extractRawText({ path: fullPath });
                            text = result.value || '';
                        } else if (ext === '.txt' || ext === '.rtf') {
                            text = fs.readFileSync(fullPath, 'utf8') || '';
                        }

                        if (text.trim().length > 0) {
                            results.push({
                                filename: entry.name,
                                fullPath: fullPath,
                                text: text,
                                fileSize: stats.size,
                                fileSizeFormatted: ResumeParser.formatBytes(stats.size),
                                extension: ext,
                                modifiedAt: stats.mtime.toISOString()
                            });
                            emitLog('info', `[RESUME PARSER] Parsed ${entry.name}`);
                        }
                    } catch (err: any) {
                        emitLog('warn', `[RESUME PARSER] Error parsing ${entry.name}: ${err.message}`);
                    }
                }
            }
        };

        await scanDir(directoryPath, 0);
        return results;
    }

    static extractCandidateProfile(text: string, filename: string): CandidateExtractedProfile {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // 1. Email Extraction
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0].toLowerCase() : '';

        // 2. Phone Extraction (handles various international/local formats)
        let phone = '';
        const phoneMatches = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g);
        if (phoneMatches) {
            for (const p of phoneMatches) {
                const digitsOnly = p.replace(/\D/g, '');
                if (digitsOnly.length >= 10 && digitsOnly.length <= 14) {
                    phone = p.trim();
                    break;
                }
            }
        }

        // 3. Name Extraction
        let name = '';
        // Heuristic A: Look at first 6 lines of resume for a 2-4 word capitalized string
        const blacklist = [
            'resume', 'curriculum', 'vitae', 'cv', 'summary', 'profile', 'contact', 'email', 'phone',
            'objective', 'experience', 'education', 'skills', 'page', 'address', 'linkedin', 'github'
        ];
        
        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const line = lines[i];
            const cleanLine = line.replace(/[^a-zA-Z\s]/g, '').trim();
            const words = cleanLine.split(/\s+/);
            if (words.length >= 2 && words.length <= 4 && cleanLine.length <= 40) {
                const containsBlacklist = words.some(w => blacklist.includes(w.toLowerCase()));
                if (!containsBlacklist && !line.includes('@') && !line.includes('http')) {
                    name = cleanLine;
                    break;
                }
            }
        }

        // Heuristic B: If not detected from text, derive from filename
        if (!name) {
            let base = path.basename(filename, path.extname(filename));
            base = base.replace(/[\-_.]+/g, ' ');
            base = base.replace(/\b(resume|cv|profile|updated|final|latest|senior|lead|engineer|developer|developer|draft|\d+)\b/gi, ' ');
            base = base.replace(/\s+/g, ' ').trim();
            if (base.length >= 3 && base.length <= 35) {
                name = base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            } else {
                name = path.basename(filename, path.extname(filename));
            }
        }

        // 4. Skills Extraction
        const textLower = text.toLowerCase();
        const foundSkills: string[] = [];
        for (const skill of COMMON_SKILLS_LIST) {
            const skillRegex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (skillRegex.test(textLower)) {
                foundSkills.push(skill);
            }
        }

        // 5. Experience Years Heuristic
        let expYears = '';
        const expMatch = text.match(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i) ||
                         text.match(/experience\s*:\s*(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)/i);
        if (expMatch) {
            expYears = expMatch[1] + '+ Yrs';
        }

        // 6. Headline / Primary Role
        let headline = '';
        for (let i = 0; i < Math.min(lines.length, 12); i++) {
            const line = lines[i];
            if (/(developer|engineer|architect|manager|lead|analyst|designer|consultant|specialist|recruiter)/i.test(line) && line.length < 80) {
                headline = line.replace(/[^a-zA-Z0-9\s,\/&-]/g, '').trim();
                break;
            }
        }
        if (!headline && foundSkills.length > 0) {
            headline = foundSkills.slice(0, 4).join(', ') + ' Professional';
        } else if (!headline) {
            headline = 'Candidate CV';
        }

        return {
            name,
            email,
            phone,
            headline,
            skills: foundSkills,
            experience_years: expYears
        };
    }

    static scoreResume(
        cvText: string,
        extractedProfile: CandidateExtractedProfile,
        job?: { title: string; description?: string; skills?: string; location?: string; experience?: string },
        customQuery?: string
    ): {
        matchScore: number;
        matchedSkills: string[];
        missingSkills: string[];
        mandatoryMatched: string[];
        mandatoryMissing: string[];
        niceToHaveMatched: string[];
        niceToHaveMissing: string[];
        positives: string[];
        negatives: string[];
        probingQuestions: string[];
        breakdown: {
            titleScore: number;
            mandatoryScore: number;
            expScore: number;
            roleScore: number;
            locScore: number;
            niceScore: number;
        };
        summary: string;
    } {
        const textLower = cvText.toLowerCase();

        // 1. EXTRACT JOB TITLE (5% WEIGHT)
        let targetTitle = (job?.title || '').toLowerCase();
        let titleScore = 4; // baseline for query
        if (targetTitle) {
            const titleWords = targetTitle.split(/[\s\-\/]+/).filter(w => w.length > 2 && !['senior', 'junior', 'lead', 'principal', 'staff', 'the', 'for', 'and', 'with'].includes(w));
            let titleMatches = 0;
            const candHeadline = (extractedProfile.headline || '').toLowerCase();
            for (const word of titleWords) {
                if (candHeadline.includes(word) || textLower.includes(word)) titleMatches++;
            }
            const ratio = titleWords.length > 0 ? (titleMatches / titleWords.length) : 0.8;
            titleScore = Math.min(5, Math.max(1, Math.round(ratio * 5 * 10) / 10));
        }

        // 2. EXTRACT MANDATORY (40% WEIGHT) AND NICE-TO-HAVE (10% WEIGHT) SKILLS
        // Mandatory indicators specified by user:
        // "Strong experience in", "Proficient in", "Experience required", "Experience needed", "Required proficiency in", "mandatory to have"
        // Words: Strong, Mandatory, Mandatorily, Required, Proficient, Proficiency, Need, Needed
        const mandatoryIndicators = [
            /strong\s+experience\s+in/i,
            /proficient\s+in/i,
            /experience\s+(?:is\s+)?required/i,
            /experience\s+(?:is\s+)?needed/i,
            /required\s+proficiency\s+in/i,
            /mandatory\s+to\s+have/i,
            /\b(?:strong|mandatory|mandatorily|required|proficient|proficiency|need|needed)\b/i
        ];

        // Nice to have indicators specified by user:
        // "Good to have", "Knowledge in", "Nice to have", Preferred, Advantage, Advantageous
        const niceToHaveIndicators = [
            /good\s+to\s+have/i,
            /knowledge\s+in/i,
            /knowledge\s+of/i,
            /nice\s+to\s+have/i,
            /\b(?:preferred|advantage|advantageous)\b/i
        ];

        const jdText = ((job?.skills || '') + '\n' + (job?.description || '')).trim();
        const jdSentences = jdText.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(Boolean);

        const allCandidateSkillsInJd = new Set<string>();
        if (job?.skills) {
            job.skills.split(/[,;\n|]+/).forEach(s => {
                const c = s.trim();
                if (c.length > 1) allCandidateSkillsInJd.add(c);
            });
        }
        for (const skill of COMMON_SKILLS_LIST) {
            const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(jdText)) allCandidateSkillsInJd.add(skill);
        }
        if (customQuery) {
            customQuery.split(/[,;\s|]+/).forEach(q => {
                const clean = q.replace(/[^a-zA-Z0-9+#.-]/g, '').trim();
                if (clean.length > 1 && !['and', 'or', 'not', 'in', 'with', 'for'].includes(clean.toLowerCase())) {
                    allCandidateSkillsInJd.add(clean);
                }
            });
        }

        const mandatorySkills: string[] = [];
        const niceToHaveSkills: string[] = [];

        Array.from(allCandidateSkillsInJd).forEach(skill => {
            const sEsc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sRegex = new RegExp(`\\b${sEsc}\\b`, 'i');
            const matchingSentences = jdSentences.filter(s => sRegex.test(s));

            let isNice = false;
            let isMandatory = false;

            for (const sent of matchingSentences) {
                if (niceToHaveIndicators.some(ind => ind.test(sent))) isNice = true;
                if (mandatoryIndicators.some(ind => ind.test(sent))) isMandatory = true;
            }

            if (isNice && !isMandatory) {
                niceToHaveSkills.push(skill);
            } else if (isMandatory) {
                mandatorySkills.push(skill);
            } else {
                // If in explicit job.skills or not marked nice, prioritize as mandatory
                if (mandatorySkills.length < Math.max(1, Math.ceil(allCandidateSkillsInJd.size * 0.7))) {
                    mandatorySkills.push(skill);
                } else {
                    niceToHaveSkills.push(skill);
                }
            }
        });

        // If no skills found, fallback to general extracted profile skills
        if (mandatorySkills.length === 0 && allCandidateSkillsInJd.size === 0) {
            mandatorySkills.push(...extractedProfile.skills.slice(0, 4));
        }

        const mandatoryMatched: string[] = [];
        const mandatoryMissing: string[] = [];
        for (const s of mandatorySkills) {
            const regex = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(textLower)) mandatoryMatched.push(s);
            else mandatoryMissing.push(s);
        }

        const niceToHaveMatched: string[] = [];
        const niceToHaveMissing: string[] = [];
        for (const s of niceToHaveSkills) {
            const regex = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(textLower)) niceToHaveMatched.push(s);
            else niceToHaveMissing.push(s);
        }

        const matchedSkills = [...mandatoryMatched, ...niceToHaveMatched];
        const missingSkills = [...mandatoryMissing, ...niceToHaveMissing];

        // Mandatory score (40% weight)
        let mandatoryScore = 0;
        if (mandatorySkills.length > 0) {
            mandatoryScore = Math.round((mandatoryMatched.length / mandatorySkills.length) * 40 * 10) / 10;
        } else {
            mandatoryScore = 30;
        }

        // Nice to have score (10% weight)
        let niceScore = 0;
        if (niceToHaveSkills.length > 0) {
            niceScore = Math.round((niceToHaveMatched.length / niceToHaveSkills.length) * 10 * 10) / 10;
        } else {
            niceScore = 8;
        }

        // 3. EXTRACT EXPERIENCE LEVEL (5% WEIGHT)
        let jdExpYears = 3;
        const jdExpMatch = jdText.match(/(\d+)\+?\s*(?:to|-)?\s*(\d+)?\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience)?/i);
        if (jdExpMatch) {
            jdExpYears = parseInt(jdExpMatch[1], 10);
        } else if (/principal|architect|lead|staff|director/i.test(targetTitle)) {
            jdExpYears = 8;
        } else if (/senior/i.test(targetTitle)) {
            jdExpYears = 5;
        }

        let cvExpYears = 0;
        if (extractedProfile.experience_years) {
            const m = extractedProfile.experience_years.match(/(\d+)/);
            if (m) cvExpYears = parseInt(m[1], 10);
        }
        if (cvExpYears === 0) {
            const currentYear = new Date().getFullYear();
            const dates = [...cvText.matchAll(/\b(20\d\d|19\d\d)\b/g)].map(m => parseInt(m[1], 10));
            if (dates.length > 0) {
                const minYear = Math.min(...dates);
                cvExpYears = Math.max(1, currentYear - minYear);
            } else {
                cvExpYears = 3;
            }
        }

        let expScore = 5;
        if (cvExpYears >= jdExpYears) expScore = 5;
        else if (cvExpYears >= jdExpYears * 0.7) expScore = 3.5;
        else expScore = 2;

        // 4. EXTRACT JOB ROLE & DUTIES (30% WEIGHT)
        const roleActionKeywords = [
            'architect', 'architecture', 'design', 'deliver', 'migrate', 'migration', 'deploy', 'deployment',
            'automated', 'automation', 'implement', 'implementation', 'lead', 'leadership', 'manage', 'management',
            'troubleshoot', 'troubleshooting', 'incident', 'support', 'reliability', 'optimize', 'optimization',
            'performance', 'cross-functional', 'agile', 'scrum', 'build', 'develop', 'development', 'engineer',
            'engineering', 'infrastructure', 'cloud', 'platform', 'scale', 'scalable', 'security', 'monitoring',
            'observability', 'ci/cd', 'pipeline', 'pipelines', 'operations'
        ];
        const jdRoleWords = roleActionKeywords.filter(k => new RegExp(`\\b${k}\\b`, 'i').test(jdText));
        const matchedRoleWords = jdRoleWords.filter(k => new RegExp(`\\b${k}\\b`, 'i').test(cvText));
        const roleRatio = jdRoleWords.length > 0 ? (matchedRoleWords.length / jdRoleWords.length) : 0.82;
        const roleScore = Math.min(30, Math.max(10, Math.round(roleRatio * 30 * 10) / 10));

        // 5. EXTRACT LOCATION (10% WEIGHT)
        let jdLocation = (job?.location || '').toLowerCase();
        let locScore = 10;
        if (jdLocation && !jdLocation.includes('remote') && !jdLocation.includes('flexible')) {
            const jdLocTokens = jdLocation.split(/[\s,()\/]+/).filter(w => w.length > 2);
            const matchesLoc = jdLocTokens.some(tok => textLower.includes(tok));
            if (matchesLoc) locScore = 10;
            else if (textLower.includes('remote') || textLower.includes('relocation')) locScore = 8;
            else locScore = 6;
        }

        // TOTAL MATCH SCORE (0 - 100)
        let totalScore = Math.round(titleScore + mandatoryScore + expScore + roleScore + locScore + niceScore);
        if (totalScore > 100) totalScore = 100;
        if (totalScore < 0) totalScore = 0;

        // 6. DETECT POSITIVES (GREEN FLAGS) & NEGATIVES (RED FLAGS)
        const positives: string[] = [];
        const negatives: string[] = [];

        // Green Flags
        if (mandatoryMatched.length >= Math.ceil(mandatorySkills.length * 0.75) && mandatorySkills.length > 0) {
            positives.push(`High Mandatory Alignment: Verified ${mandatoryMatched.length}/${mandatorySkills.length} core required skills.`);
        }
        if (/\b(\d+[%kKmMbB]|\$\d+|\d+\s*x\b|reduced\s+by|increased\s+by|scaled\s+to|cost\s+savings)/i.test(cvText)) {
            positives.push('Quantifiable Business Impact: Contains verifiable performance, scale, or commercial metrics.');
        }
        if (cvExpYears >= jdExpYears) {
            positives.push(`Experience Match: ${cvExpYears} years verified (meets/exceeds requirement of ${jdExpYears} years).`);
        }
        if (roleScore >= 24) {
            positives.push('Strong Functional Scope: Deep overlap in architecture, delivery, and system engineering duties.');
        }
        if (niceToHaveMatched.length > 0) {
            positives.push(`Bonus Accelerators: Possesses ${niceToHaveMatched.slice(0, 3).join(', ')}.`);
        }
        if (positives.length === 0) {
            positives.push('Demonstrates relevant technical background and core engineering foundation.');
        }

        // Red Flags / Risks to probe
        if (mandatoryMissing.length > 0) {
            negatives.push(`Missing Mandatory Skills: ${mandatoryMissing.slice(0, 4).join(', ')} not verified in CV.`);
        }
        if (cvExpYears < jdExpYears * 0.7) {
            negatives.push(`Experience Deficit: Candidate has ~${cvExpYears} yrs vs required ${jdExpYears} yrs.`);
        }
        if (titleScore <= 2.5) {
            negatives.push('Title / Seniority Variance: Candidate past titles differ significantly from target requisition.');
        }
        const shortStintMatches = cvText.match(/\b(201\d|202\d)\s*[-–]\s*(201\d|202\d)\b/g);
        if (shortStintMatches && shortStintMatches.length >= 4) {
            negatives.push('Tenure / Flight Risk: Multiple rapid job transitions observed over recent years.');
        }
        if (negatives.length === 0) {
            negatives.push('No critical knockout flags detected; proceed to standard technical vetting.');
        }

        // 7. TARGETED INTERVIEW PROBING QUESTIONS
        const probingQuestions: string[] = [];
        if (mandatoryMissing.length > 0) {
            probingQuestions.push(`Can you walk us through your hands-on production experience with ${mandatoryMissing[0]}, or an equivalent architecture?`);
        } else {
            probingQuestions.push(`Can you walk us through the most complex system architecture you designed using ${mandatoryMatched.slice(0, 2).join(' and ')}?`);
        }
        probingQuestions.push('In your most recent role, what was the scale (traffic, users, RPS, or team size) that you personally owned?');
        probingQuestions.push('What is your current notice period, location preference (onsite/hybrid), and compensation expectations?');

        const summary = `${mandatoryMatched.length}/${mandatorySkills.length} mandatory skills verified (${totalScore}% overall match).`;

        return {
            matchScore: totalScore,
            matchedSkills,
            missingSkills,
            mandatoryMatched,
            mandatoryMissing,
            niceToHaveMatched,
            niceToHaveMissing,
            positives,
            negatives,
            probingQuestions,
            breakdown: {
                titleScore,
                mandatoryScore,
                expScore,
                roleScore,
                locScore,
                niceScore
            },
            summary
        };
    }
}
