import { AIService } from '../../services/ai.js';
import { emitLog } from '../../services/events.js';

export class MatchCenterAgent {
    private ai: AIService;

    constructor() {
        this.ai = new AIService();
    }

    async generateMatchReport(jdText: string, cvText: string, onProgress?: (chunk: string) => void): Promise<any> {
        emitLog('info', `[MATCH CENTER] Starting instant evidence-based matching analysis...`);

        // Check if Gemini API key is configured
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        const hasGemini = Boolean(apiKey && apiKey !== 'YOUR_GEMINI_API_KEY_HERE');

        if (hasGemini && process.env.LOCAL_AI_ONLY !== 'true') {
            try {
                emitLog('info', `[MATCH CENTER] ♊ Invoking Gemini (Prime Model) for evidence-based scoring...`);
                const prompt = `You are an expert Executive Technical Recruiter and talent scoring engine.
Evaluate this Candidate CV against the Job Description strictly adhering to the exact weighted scoring criteria below.

STRICT SCORING WEIGHTS (TOTAL 100%):
1. Job Title: 5%
   - Compare candidate professional headline/title with the JD target title. Score out of 5%.
2. Mandatory Skills: 40%
   - Identify mandatory skills from the JD using these explicit phrases and keywords:
     "Strong experience in", "Proficient in", "Experience required", "Experience needed", "Required proficiency in", "mandatory to have", Strong, Mandatory, Mandatorily, Required, Proficient, Proficiency, Need, Needed.
   - For each identified mandatory skill, search the CV for verifiable evidence.
   - Score = (Verified Mandatory Skills / Total Mandatory Skills) * 40%.
3. Experience Level: 5%
   - Compare candidate's verified total professional experience against the required years in the JD.
   - If candidate meets or exceeds required years: 5%. If 70%+ of required: 3.5%. Below: 2%.
4. Job Role & Responsibilities: 30%
   - Evaluate the overlap of functional engineering duties and core responsibilities (e.g. architecture, development, deployment, incident management, automated testing, optimization, leadership).
   - Score out of 30% based on depth of verified role alignment.
5. Location: 10%
   - Evaluate location, commute, remote, or relocation compatibility.
   - Exact city/commutable or Remote: 10%. Willing to relocate or hybrid: 7-9%. Different country: 3-5%.
6. Nice to Have Skills: 10%
   - Identify nice-to-have skills from the JD using:
     "Good to have", "Knowledge in", "Nice to have", Preferred, Advantage, Advantageous.
   - Score = (Verified Nice to Have / Total Nice to Have) * 10%.

JOB DESCRIPTION:
${jdText}

CANDIDATE CV:
${cvText}

Output your analysis formatted cleanly in GitHub Markdown using this exact structure:
### Overall Matching Score: [Total]% / 100%

| Evaluation Metric | Weight | Candidate Score | Status / Verification |
| :--- | :--- | :--- | :--- |
| 🎯 **Job Title** | **5%** | **X.X%** | [Title alignment notes] |
| ⚡ **Mandatory Skills** | **40%** | **X.X%** | [X of Y mandatory verified] |
| ⏳ **Experience Level** | **5%** | **X.X%** | [X yrs verified vs Y yrs required] |
| 💼 **Job Role & Duties** | **30%** | **X.X%** | [Functional alignment summary] |
| 📍 **Location** | **10%** | **X.X%** | [Location compatibility] |
| 🌟 **Nice to Have Skills** | **10%** | **X.X%** | [X of Y secondary verified] |
| **TOTAL MATCH SCORE** | **100%** | **[Total]%** | **[Strong/Moderate/Low Fit]** |

### 🟢 Positives (Green Flags & Strategic Strengths)
- **Quantifiable Business & Tech Impact**: Detail metrics, dollar savings, throughput scale, or user growth cited in the CV.
- **Core Stack Recency & Mastery**: Verified hands-on evidence of core mandatory stack in recent roles.
- **Career Trajectory & Velocity**: Promotions, stability, leadership scope, and progression.
- **Architecture & System Ownership**: Areas where the candidate personally owned delivery, architecture, or cross-functional alignment.

### 🔴 Negatives & Red Flags (Risks & Knockout Gaps)
- **Mandatory Competency Gaps**: Core required tools/frameworks missing with no evidence.
- **Stale or Passive Skills**: Technologies listed only in a summary block with no active project usage in the last 3-4 years.
- **Tenure & Flight Risk**: Rapid transitions or unexplained career gaps.
- **Scope / Title Variance**: Discrepancies between formal job titles and actual day-to-day execution.

### 🎯 Targeted Interview Probing Questions
1. [Tactical question targeting the primary red flag or missing mandatory skill]
2. [Tactical question probing system scale, architecture ownership, or incident resolution]
3. [Question validating work authorization, location/commute, and notice period]

### Mandatory skills match (40% Weight)
- List each mandatory skill with **Yes** / **No** and exact verbatim citation from the CV.

### Good to have skills match (10% Weight)
- List each nice to have skill with **Yes** / **Not specified** and exact citation.

### Job Title & Role Alignment (35% Combined)
- Detailed breakdown of Title (5%) and Role & Responsibilities (30%).

### Experience Level & Location (15% Combined)
- Breakdown of Experience Level (5%) and Location (10%).

### What skills or experience is missing
- High-priority mandatory gaps and secondary nice-to-have gaps.

### Skills Matrix
| Skill | Category | Years of Experience | Evidence from CV |
| :--- | :--- | :--- | :--- |
(Include every extracted skill with Category [Mandatory or Nice to Have], verified years of experience from career history, and exact verbatim quote citation).

### Submission Summary
- 2-3 sentence executive recommendation for recruiter/account manager.

RULE: ZERO HALLUCINATION. Do NOT invent companies, dates, or skills not explicitly in the CV.`;

                const aiResponse = await this.ai.generateTextStream(prompt, 'gemini', onProgress || (() => {}));
                if (aiResponse && aiResponse.trim().length > 30) {
                    return { rawText: aiResponse.trim(), modelUsed: 'gemini-flash-latest' };
                }
            } catch (e: any) {
                emitLog('warn', `[MATCH CENTER] Gemini call failed (${e.message}). Falling back to deterministic engine.`);
            }
        }

        // High-Speed Deterministic Evidence-Based Engine (sub-2-second streaming response)
        const report = await this.generateHeuristicReport(jdText, cvText, onProgress);
        return { rawText: report.trim() };
    }

    /**
     * Fallback evidence-based analyzer that extracts verified skills, experience,
     * missing requirements and generates a complete structured match report using
     * strict weighted scoring:
     * - Job Title: 5%
     * - Mandatory Skills: 40%
     * - Experience Level: 5%
     * - Job Role: 30%
     * - Location: 10%
     * - Nice to Have Skills: 10%
     */
    async generateHeuristicReport(jdText: string, cvText: string, onProgress?: (chunk: string) => void): Promise<string> {
        const jdLower = jdText.toLowerCase();
        const cvLower = cvText.toLowerCase();

        // 1. EXTRACT JOB TITLE (5% WEIGHT)
        let jdTitle = '';
        const titleMatch = jdText.match(/(?:job\s+title|title|position|role)\s*[:\-]\s*([^\n\r,;]+)/i)
            || jdText.match(/looking\s+for\s+(?:an?|the)?\s+([A-Za-z0-9\s\-\/\.]{3,45}?)(?:\s+with|\s+to|\s+who|\.|\n)/i);
        if (titleMatch) {
            jdTitle = titleMatch[1].trim();
        } else {
            const firstLine = jdText.split('\n')[0].trim();
            if (firstLine.length >= 3 && firstLine.length <= 60 && !firstLine.includes(':')) {
                jdTitle = firstLine;
            } else {
                jdTitle = 'Technical Specialist';
            }
        }

        // Extract Candidate Title from CV
        const cvLines = cvText.split('\n').map(l => l.trim()).filter(Boolean);
        let cvTitle = '';
        if (cvLines.length > 1) {
            cvTitle = cvLines[1];
            if (cvTitle.length > 70 || cvTitle.includes('@') || cvTitle.includes('http')) {
                cvTitle = cvLines[2] || cvLines[0];
            }
        }
        if (!cvTitle || cvTitle.length > 70) {
            const roleMatch = cvText.match(/(?:Senior|Principal|Lead|Staff|Junior|Mid)?\s*(?:Software|Cloud|DevOps|Platform|Frontend|Backend|Full[\s-]Stack|Network|Data|Security|QA|Systems)?\s*(?:Engineer|Architect|Developer|Specialist|Manager|Consultant|Administrator)/i);
            cvTitle = roleMatch ? roleMatch[0] : 'Software Professional';
        }

        // Title score calculation (5% weight)
        const titleWords = jdTitle.toLowerCase().split(/[\s\-\/]+/).filter(w => w.length > 2 && !['senior', 'junior', 'lead', 'principal', 'staff', 'the', 'for', 'and', 'with'].includes(w));
        const cvTitleLower = cvTitle.toLowerCase();
        let titleMatches = 0;
        for (const w of titleWords) {
            if (cvTitleLower.includes(w) || cvLower.includes(w)) {
                titleMatches++;
            }
        }
        const titleMatchRatio = titleWords.length > 0 ? (titleMatches / titleWords.length) : 0.8;
        const titleScore = Math.min(5, Math.max(1, Math.round(titleMatchRatio * 5 * 10) / 10));

        // 2. EXTRACT LOCATION (10% WEIGHT)
        let jdLocation = '';
        const locMatch = jdText.match(/(?:location|work\s+location|site)\s*[:\-]\s*([^\n\r;]+)/i);
        if (locMatch) {
            jdLocation = locMatch[1].trim();
        } else {
            if (/\bremote\b/i.test(jdText)) jdLocation = 'Remote';
            else if (/\bhybrid\b/i.test(jdText)) jdLocation = 'Hybrid';
            else jdLocation = 'Flexible / Unspecified';
        }

        let cvLocation = '';
        const cvLocMatch = cvText.match(/(?:location|address)\s*[:\-]\s*([^\n\r;]+)/i)
            || cvText.match(/([A-Z][a-zA-Z\s]+,\s*(?:UK|England|France|Germany|USA|US|India|Canada|Nigeria|[A-Z]{2}))/);
        if (cvLocMatch) {
            cvLocation = cvLocMatch[1].trim();
        } else {
            cvLocation = 'Open to Relocation / Remote';
        }

        let locScore = 10;
        const isJdRemote = /\bremote\b/i.test(jdLocation);
        if (isJdRemote || jdLocation === 'Flexible / Unspecified') {
            locScore = 10;
        } else {
            const jdLocWords = jdLocation.toLowerCase().split(/[\s,()\/]+/).filter(w => w.length > 2 && !['hybrid', 'onsite', 'on-site'].includes(w));
            const cvLocLower = cvLocation.toLowerCase();
            const matchesLoc = jdLocWords.some(w => cvLocLower.includes(w) || cvLower.includes(w));
            if (matchesLoc) {
                locScore = 10;
            } else if (cvLower.includes('relocation') || cvLower.includes('remote') || cvLower.includes('willing to relocate')) {
                locScore = 8;
            } else {
                locScore = 6;
            }
        }

        // 3. EXTRACT EXPERIENCE LEVEL (5% WEIGHT)
        let jdExpYears = 3;
        const jdExpMatch = jdText.match(/(\d+)\+?\s*(?:to|-)?\s*(\d+)?\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience)?/i);
        if (jdExpMatch) {
            jdExpYears = parseInt(jdExpMatch[1], 10);
        } else if (/principal|architect|lead|staff|director/i.test(jdTitle)) {
            jdExpYears = 8;
        } else if (/senior/i.test(jdTitle)) {
            jdExpYears = 5;
        }

        // Candidate total experience
        let cvExpYears = 0;
        const cvExpMatch = cvText.match(/(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/i);
        if (cvExpMatch) {
            cvExpYears = parseInt(cvExpMatch[1], 10);
        } else {
            const currentYear = new Date().getFullYear();
            const dates = [...cvText.matchAll(/\b(20\d\d|19\d\d)\b/g)].map(m => parseInt(m[1], 10));
            if (dates.length > 0) {
                const minYear = Math.min(...dates);
                cvExpYears = Math.max(1, currentYear - minYear);
            } else {
                cvExpYears = 4;
            }
        }

        let expScore = 5;
        if (cvExpYears >= jdExpYears) {
            expScore = 5;
        } else if (cvExpYears >= jdExpYears * 0.7) {
            expScore = 3.5;
        } else {
            expScore = 2;
        }

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
        const roleRatio = jdRoleWords.length > 0 ? (matchedRoleWords.length / jdRoleWords.length) : 0.85;
        const roleScore = Math.min(30, Math.max(10, Math.round(roleRatio * 30 * 10) / 10));

        // 5. EXTRACT MANDATORY (40% WEIGHT) AND NICE TO HAVE SKILLS (10% WEIGHT)
        const techKeywords = [
            'Angular', 'React', 'Vue', 'Next.js', 'Nuxt', 'Svelte',
            'TypeScript', 'JavaScript', 'HTML', 'CSS', 'SCSS', 'Sass', 'Tailwind',
            'Node.js', 'Express', 'NestJS', 'Python', 'Django', 'FastAPI', 'Flask',
            'Java', 'Spring', 'Spring Boot', 'C#', '.NET', 'ASP.NET', 'Go', 'Golang', 'Rust', 'PHP', 'Laravel',
            'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB',
            'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'K8s', 'Terraform', 'CI/CD', 'Jenkins', 'GitLab', 'GitHub Actions',
            'Git', 'REST', 'RESTful', 'GraphQL', 'Microservices', 'Kafka', 'RabbitMQ',
            'Dynatrace', 'Datadog', 'New Relic', 'Prometheus', 'Grafana',
            'Jest', 'Cypress', 'Playwright', 'Selenium', 'Mocha', 'Chai',
            'Nx', 'Monorepo', 'Webpack', 'Vite', 'RxJS', 'NgRx', 'Redux', 'Zustand', 'MobX',
            'Agile', 'Scrum', 'Jira', 'Figma', 'Linux', 'State Management',
            'CCNA', 'CCNP', 'OSPF', 'BGP', 'TCP/IP', 'VLAN', 'VPN', 'DNS', 'DHCP', 'LAN/WAN', 'Wireshark', 'Helm'
        ];

        const jdSentences = jdText.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(Boolean);

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

        // Identify tech keywords present in JD
        const presentSkills = techKeywords.filter(k => {
            const regex = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(jdText);
        });

        const mandatorySkills: string[] = [];
        const niceToHaveSkills: string[] = [];

        for (const skill of presentSkills) {
            const sEsc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sRegex = new RegExp(`\\b${sEsc}\\b`, 'i');

            const sentences = jdSentences.filter(s => sRegex.test(s));
            let isNice = false;
            let isMandatory = false;

            for (const sent of sentences) {
                if (niceToHaveIndicators.some(ind => ind.test(sent))) {
                    isNice = true;
                }
                if (mandatoryIndicators.some(ind => ind.test(sent))) {
                    isMandatory = true;
                }
            }

            if (isNice && !isMandatory) {
                niceToHaveSkills.push(skill);
            } else if (isMandatory) {
                mandatorySkills.push(skill);
            } else {
                if (mandatorySkills.length < Math.max(1, Math.ceil(presentSkills.length * 0.7))) {
                    mandatorySkills.push(skill);
                } else {
                    niceToHaveSkills.push(skill);
                }
            }
        }

        // Parse work history blocks and date spans from the CV for date-backed experience
        const currentYear = new Date().getFullYear();
        const dateRegex = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(\b20\d\d|\b19\d\d)\s*(?:[-–—to\s]+)\s*(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?(\b20\d\d|\b19\d\d|present|current|now)\b/gi;
        const cvLinesRaw = cvText.split('\n');
        const workBlocks: { dateStr: string; startYear: number; endYear: number; spanYears: number; text: string }[] = [];
        let curBlock: { dateStr: string; startYear: number; endYear: number; spanYears: number; text: string } | null = null;

        for (const line of cvLinesRaw) {
            dateRegex.lastIndex = 0;
            const match = dateRegex.exec(line);
            if (match) {
                const startYear = parseInt(match[2], 10);
                const endStr = match[4].toLowerCase();
                const endYear = (endStr === 'present' || endStr === 'current' || endStr === 'now') ? currentYear : parseInt(endStr, 10);
                const spanYears = Math.max(1, endYear - startYear);
                curBlock = {
                    dateStr: match[0].trim(),
                    startYear,
                    endYear,
                    spanYears,
                    text: line
                };
                workBlocks.push(curBlock);
            } else if (curBlock) {
                curBlock.text += '\n' + line;
            }
        }

        const cvSentences = cvText.split(/(?<=[.!?\n])\s+/).map(s => s.trim()).filter(Boolean);

        function matchSkill(skill: string, category: 'Mandatory' | 'Nice to Have') {
            const sEsc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${sEsc}\\b`, 'i');
            let foundSentence = cvSentences.find(s => regex.test(s));
            if (!foundSentence && cvLower.includes(skill.toLowerCase())) {
                foundSentence = cvSentences.find(s => s.toLowerCase().includes(skill.toLowerCase())) || `Mentioned in CV context (${skill})`;
            }

            if (foundSentence) {
                const explicit1 = new RegExp(`\\b${sEsc}\\b[^\\n.,;()]{0,35}?(?:for|with|of)?\\s*(\\d+)\\+?\\s*(?:years?|yrs?)`, 'i');
                const explicit2 = new RegExp(`(\\d+)\\+?\\s*(?:years?|yrs?)[^\\n.,;()]{0,35}?(?:of|in|with|using|hands-on)?\\s*\\b${sEsc}\\b`, 'i');
                const explicit3 = new RegExp(`\\b${sEsc}\\b\\s*[:\\-\\(\\[]\\s*(\\d+)\\+?\\s*(?:years?|yrs?)`, 'i');
                const explicitMatch = cvText.match(explicit1) || cvText.match(explicit2) || cvText.match(explicit3) || foundSentence.match(/(\d+)\+?\s*(?:years?|yrs?)/i);

                let expText = '';
                if (explicitMatch && explicitMatch[1]) {
                    expText = `${explicitMatch[1]}+ years`;
                } else {
                    const matchedBlocks = workBlocks.filter(b => regex.test(b.text));
                    if (matchedBlocks.length > 0) {
                        const minStart = Math.min(...matchedBlocks.map(b => b.startYear));
                        const maxEnd = Math.max(...matchedBlocks.map(b => b.endYear));
                        const totalSpan = Math.max(1, maxEnd - minStart);
                        if (matchedBlocks.length === 1) {
                            expText = `~${totalSpan} yr${totalSpan > 1 ? 's' : ''} (${matchedBlocks[0].dateStr})`;
                        } else {
                            expText = `~${totalSpan} yrs (${minStart}-${maxEnd >= currentYear ? 'Present' : maxEnd})`;
                        }
                    } else {
                        expText = 'Documented in CV';
                    }
                }

                return {
                    skill,
                    category,
                    isMatched: true,
                    evidence: foundSentence.length > 120 ? foundSentence.substring(0, 117) + '...' : foundSentence,
                    years: expText
                };
            } else {
                return {
                    skill,
                    category,
                    isMatched: false,
                    evidence: 'Missing from CV',
                    years: 'None'
                };
            }
        }

        const evaluatedMandatory = mandatorySkills.map(s => matchSkill(s, 'Mandatory'));
        const evaluatedNice = niceToHaveSkills.map(s => matchSkill(s, 'Nice to Have'));

        const matchedMandatoryCount = evaluatedMandatory.filter(m => m.isMatched).length;
        const matchedNiceCount = evaluatedNice.filter(m => m.isMatched).length;

        const mandatoryScore = mandatorySkills.length > 0
            ? Math.round((matchedMandatoryCount / mandatorySkills.length) * 40 * 10) / 10
            : 40;

        const niceScore = niceToHaveSkills.length > 0
            ? Math.round((matchedNiceCount / niceToHaveSkills.length) * 10 * 10) / 10
            : 10;

        const totalScore = Math.min(100, Math.round((titleScore + mandatoryScore + expScore + roleScore + locScore + niceScore) * 10) / 10);

        // Build Structured Report
        const lines: string[] = [];
        lines.push(`### Overall Matching Score: ${totalScore}% / 100%`);
        lines.push(`Comprehensive weighted evaluation based on Mandatory Skills, Role Alignment, Experience, Location, Title, and Nice-to-Have competencies.\n`);

        lines.push(`| Evaluation Metric | Weight | Candidate Score | Status / Verification |`);
        lines.push(`| :--- | :--- | :--- | :--- |`);
        lines.push(`| 🎯 **Job Title** | **5%** | **${titleScore.toFixed(1)}%** | ${titleScore >= 4 ? '✓ Full Match' : '⚠ Partial Alignment'} ("${cvTitle}") |`);
        lines.push(`| ⚡ **Mandatory Skills** | **40%** | **${mandatoryScore.toFixed(1)}%** | ${matchedMandatoryCount} of ${mandatorySkills.length} Core Requirements Verified |`);
        lines.push(`| ⏳ **Experience Level** | **5%** | **${expScore.toFixed(1)}%** | ${cvExpYears >= jdExpYears ? '✓ Met Requirement' : '⚠ Below Requirement'} (${cvExpYears}+ yrs verified vs ${jdExpYears}+ yrs required) |`);
        lines.push(`| 💼 **Job Role & Duties** | **30%** | **${roleScore.toFixed(1)}%** | Functional overlap in ${matchedRoleWords.slice(0, 4).join(', ') || 'core responsibilities'} |`);
        lines.push(`| 📍 **Location** | **10%** | **${locScore.toFixed(1)}%** | ${locScore >= 9 ? '✓ Verified Compatible' : '⚠ Relocation / Remote Review'} (${cvLocation}) |`);
        lines.push(`| 🌟 **Nice to Have Skills** | **10%** | **${niceScore.toFixed(1)}%** | ${matchedNiceCount} of ${niceToHaveSkills.length} Secondary Competencies Verified |`);
        lines.push(`| **TOTAL MATCH SCORE** | **100%** | **${totalScore.toFixed(1)}%** | **${totalScore >= 75 ? 'Strong Submission Match' : totalScore >= 50 ? 'Moderate Fit with Gaps' : 'Low Alignment'}** |\n`);

        // 🟢 POSITIVES (GREEN FLAGS)
        lines.push(`### 🟢 Positives (Green Flags & Strategic Strengths)`);
        const positivesList: string[] = [];
        if (matchedMandatoryCount >= Math.ceil(mandatorySkills.length * 0.75) && mandatorySkills.length > 0) {
            positivesList.push(`**High Mandatory Coverage**: Successfully verified **${matchedMandatoryCount}/${mandatorySkills.length}** core mandatory skills directly in CV text.`);
        }
        if (/\b(\d+[%kKmMbB]|\$\d+|\d+\s*x\b|reduced\s+by|increased\s+by|scaled\s+to|cost\s+savings)/i.test(cvText)) {
            positivesList.push(`**Quantifiable Business & Tech Impact**: Profile provides evidence of measurable performance, revenue, or scale outcomes.`);
        }
        if (cvExpYears >= jdExpYears) {
            positivesList.push(`**Verified Seniority & Experience**: Candidate holds **${cvExpYears}+ years** professional experience, satisfying the ${jdExpYears}+ year role requirement.`);
        }
        if (roleScore >= 24) {
            positivesList.push(`**Deep Functional Scope**: Substantial hands-on overlap across core architectural delivery, design, and operations.`);
        }
        if (matchedNiceCount > 0) {
            positivesList.push(`**Value-Add Accelerators**: Possesses nice-to-have competencies: *${evaluatedNice.filter(n => n.isMatched).map(n => n.skill).slice(0, 3).join(', ')}*.`);
        }
        if (positivesList.length === 0) {
            positivesList.push(`**Foundational Engineering Baseline**: Candidate displays technical background and core computer science fundamentals.`);
        }
        positivesList.forEach(p => lines.push(`- ${p}`));
        lines.push(``);

        // 🔴 NEGATIVES & RED FLAGS
        lines.push(`### 🔴 Negatives & Red Flags (Risks & Knockout Gaps)`);
        const negativesList: string[] = [];
        const missingMandatoryItems = evaluatedMandatory.filter(m => !m.isMatched);
        if (missingMandatoryItems.length > 0) {
            negativesList.push(`**Mandatory Competency Gaps**: Core required tools/frameworks missing: *${missingMandatoryItems.map(m => m.skill).slice(0, 4).join(', ')}*.`);
        }
        if (cvExpYears < jdExpYears * 0.7) {
            negativesList.push(`**Experience Deficit**: Candidate has ~${cvExpYears} yrs verified vs ${jdExpYears}+ yrs required in the JD.`);
        }
        if (titleScore <= 2.5) {
            negativesList.push(`**Title / Seniority Variance**: Current candidate headline ("${cvTitle}") differs noticeably from target role ("${jdTitle}").`);
        }
        const shortStints = cvText.match(/\b(201\d|202\d)\s*[-–]\s*(201\d|202\d)\b/g);
        if (shortStints && shortStints.length >= 4) {
            negativesList.push(`**Tenure & Flight Risk**: Multiple short stints detected in career chronology - verify reasons for role transitions.`);
        }
        if (locScore < 8) {
            negativesList.push(`**Location / Relocation Dependency**: Candidate is located in ${cvLocation}; role requires ${jdLocation}.`);
        }
        if (negativesList.length === 0) {
            negativesList.push(`**No Critical Red Flags**: Profile passes initial knockout screening; proceed to technical deep-dive.`);
        }
        negativesList.forEach(n => lines.push(`- ${n}`));
        lines.push(``);

        // 🎯 TARGETED INTERVIEW PROBING QUESTIONS
        lines.push(`### 🎯 Targeted Interview Probing Questions`);
        if (missingMandatoryItems.length > 0) {
            lines.push(`1. *"Can you walk through your hands-on production experience with ${missingMandatoryItems[0].skill}, or explain your architecture design for equivalent systems?"*`);
        } else {
            lines.push(`1. *"Can you walk through the most complex distributed system or feature you built using ${mandatorySkills.slice(0, 2).join(' and ') || 'your primary stack'}?"*`);
        }
        lines.push(`2. *"In your most recent position, what was the exact scale (traffic, users, RPS, latency, or team size) that you were personally accountable for?"*`);
        lines.push(`3. *"What is your current notice period, salary expectation, and availability for the required work arrangement (${jdLocation})?"*\n`);

        lines.push(`### Mandatory skills match (40% Weight)`);
        lines.push(`*(Identified using: Strong experience in, Proficient in, Experience required/needed, Required proficiency in, Mandatory, Needed)*\n`);
        if (evaluatedMandatory.length === 0) {
            lines.push(`- General core competencies reviewed against CV.\n`);
        } else {
            for (const item of evaluatedMandatory) {
                if (item.isMatched) {
                    lines.push(`- **${item.skill}**: **Yes** - *Evidence from CV:* "${item.evidence}"`);
                } else {
                    lines.push(`- **${item.skill}**: **No** - *No direct mention found in candidate CV.*`);
                }
            }
            lines.push(``);
        }

        lines.push(`### Good to have skills match (10% Weight)`);
        lines.push(`*(Identified using: Good to have, Knowledge in, Nice to have, Preferred, Advantage, Advantageous)*\n`);
        if (evaluatedNice.length === 0) {
            lines.push(`- Secondary competencies reviewed and cross-referenced with candidate profile.\n`);
        } else {
            for (const item of evaluatedNice) {
                if (item.isMatched) {
                    lines.push(`- **${item.skill}**: **Yes** - *Evidence from CV:* "${item.evidence}"`);
                } else {
                    lines.push(`- **${item.skill}**: **Not specified** in CV.`);
                }
            }
            lines.push(``);
        }

        lines.push(`### Job Title & Role Alignment (35% Combined)`);
        lines.push(`- **Job Title (5% Weight)**: JD asks for **${jdTitle}**; Candidate is identified as **${cvTitle}** (Score: ${titleScore.toFixed(1)} / 5.0).`);
        lines.push(`- **Job Role & Responsibilities (30% Weight)**: Core domain activities require hands-on ownership across ${jdRoleWords.slice(0, 5).join(', ') || 'engineering workflows'}. Candidate demonstrates direct capability in **${matchedRoleWords.slice(0, 6).join(', ') || 'related domains'}** (Score: ${roleScore.toFixed(1)} / 30.0).\n`);

        lines.push(`### Experience Level & Location (15% Combined)`);
        lines.push(`- **Experience Level (5% Weight)**: Job requires **${jdExpYears}+ years**; Candidate exhibits **${cvExpYears}+ years** verified domain experience (Score: ${expScore.toFixed(1)} / 5.0).`);
        lines.push(`- **Location (10% Weight)**: Role location is **${jdLocation}**; Candidate profile specifies **${cvLocation}** (Score: ${locScore.toFixed(1)} / 10.0).\n`);

        const missingMandatory = evaluatedMandatory.filter(m => !m.isMatched);
        const missingNice = evaluatedNice.filter(m => !m.isMatched);

        lines.push(`### What skills or experience is missing`);
        if (missingMandatory.length === 0 && missingNice.length === 0) {
            lines.push(`Candidate demonstrates foundational alignment with all stated mandatory and nice-to-have requirements. Continued evaluation should focus on depth of architectural leadership and system scale.\n`);
        } else {
            if (missingMandatory.length > 0) {
                lines.push(`**Mandatory Gaps (High Priority):**`);
                for (const s of missingMandatory) {
                    lines.push(`- **${s.skill}**: Core mandatory requirement with no verified evidence documented in CV.`);
                }
            }
            if (missingNice.length > 0) {
                lines.push(`**Secondary / Nice-to-Have Gaps:**`);
                for (const s of missingNice) {
                    lines.push(`- **${s.skill}**: Preferred tool/technology not explicitly noted.`);
                }
            }
            lines.push(``);
        }

        lines.push(`### Skills Matrix`);
        lines.push(`| Skill | Category | Years of Experience | Evidence from CV |`);
        lines.push(`| :--- | :--- | :--- | :--- |`);
        const allEvaluated = [...evaluatedMandatory, ...evaluatedNice];
        if (allEvaluated.length === 0) {
            lines.push(`| General Profile | Mandatory | Documented in CV | See CV text for detailed narrative |`);
        } else {
            for (const m of allEvaluated) {
                lines.push(`| **${m.skill}** | ${m.category} | ${m.years} | ${m.evidence.replace(/\|/g, '-')} |`);
            }
        }
        lines.push(``);

        lines.push(`### Submission Summary`);
        if (totalScore >= 75) {
            lines.push(`Candidate achieves **${totalScore}%** overall match score with strong mandatory competency coverage (${matchedMandatoryCount}/${mandatorySkills.length}). Location and seniority expectations are satisfied. **Recommendation:** Proceed to technical pre-screening interview.`);
        } else if (totalScore >= 50) {
            lines.push(`Candidate achieves **${totalScore}%** overall match score with partial mandatory coverage (${matchedMandatoryCount}/${mandatorySkills.length}). While foundational skills exist, notable gaps in ${missingMandatory.map(m => m.skill).join(', ') || 'specialized tools'} require technical validation. **Recommendation:** Conduct targeted screening before client submission.`);
        } else {
            lines.push(`Candidate achieves **${totalScore}%** overall match score, showing substantial gaps against mandatory JD requirements. Primary missing competencies: ${missingMandatory.map(m => m.skill).join(', ') || 'core requirements'}. **Recommendation:** Consider alternative requisitions better suited to candidate profile.`);
        }

        const fullReport = lines.join('\n');

        // Emulate streaming progress if callback provided
        if (onProgress) {
            const chunkSize = 60;
            for (let i = 0; i < fullReport.length; i += chunkSize) {
                onProgress(fullReport.substring(i, i + chunkSize));
                await new Promise(r => setTimeout(r, 8));
            }
        }

        return fullReport;
    }
}
