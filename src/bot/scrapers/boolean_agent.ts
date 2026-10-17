import { AIService } from '../../services/ai.js';
import { emitLog } from '../../services/events.js';
import { initDb } from '../../services/database.js';
import { getAiKnowledgeBase } from '../../services/knowledge_base.js';

export class BooleanAgent {
    private ai: AIService;

    constructor(aiService: AIService) {
        this.ai = aiService;
    }

    private buildSkillBunch(skills: string[], maxSkills = 4): string {
        if (!skills || !Array.isArray(skills)) return '';
        const top = skills.slice(0, maxSkills).filter(s => s && s.trim().length > 0);
        if (top.length === 0) return '';
        if (top.length === 1) return `"${top[0]}"`;
        return "(" + top.map(s => `"${s}"`).join(" OR ") + ")";
    }

    private extractRuleBasedSchema(job: any): any {
        const rawTitle = (job.title || '').trim();
        const text = `${job.title || ''} ${job.description || ''}`;

        // Normalise title
        let normalizedTitle = rawTitle;
        const titleVariations: string[] = [];

        if (/full\s*stack/i.test(rawTitle)) {
            normalizedTitle = 'Full Stack Developer';
            titleVariations.push('Full Stack Engineer', 'Fullstack Developer', 'Software Engineer', 'Web Developer');
        } else if (/frontend|front\s*end|ui/i.test(rawTitle)) {
            normalizedTitle = 'Frontend Developer';
            titleVariations.push('Frontend Engineer', 'UI Developer', 'Software Engineer', 'React Developer');
        } else if (/backend|back\s*end/i.test(rawTitle)) {
            normalizedTitle = 'Backend Developer';
            titleVariations.push('Backend Engineer', 'Software Engineer', 'Java Developer', 'API Developer');
        } else if (/devops|sre|infrastructure/i.test(rawTitle)) {
            normalizedTitle = 'DevOps Engineer';
            titleVariations.push('Site Reliability Engineer', 'Cloud Engineer', 'Platform Engineer', 'Infrastructure Engineer');
        } else if (/data\s*engineer/i.test(rawTitle)) {
            normalizedTitle = 'Data Engineer';
            titleVariations.push('Big Data Engineer', 'Data Platform Engineer', 'ETL Developer', 'Analytics Engineer');
        } else if (/data\s*scien/i.test(rawTitle) || /machine\s*learn|ml|ai/i.test(rawTitle)) {
            normalizedTitle = 'Machine Learning Engineer';
            titleVariations.push('Data Scientist', 'AI Engineer', 'MLOps Engineer', 'Research Scientist');
        } else if (/qa|test|quality/i.test(rawTitle)) {
            normalizedTitle = 'QA Automation Engineer';
            titleVariations.push('SDET', 'Software Test Engineer', 'Automation Tester', 'Quality Engineer');
        } else if (/product\s*manag/i.test(rawTitle)) {
            normalizedTitle = 'Product Manager';
            titleVariations.push('Technical Product Manager', 'Product Owner', 'Lead Product Manager', 'PM');
        } else {
            normalizedTitle = rawTitle || 'Software Engineer';
            titleVariations.push(`${normalizedTitle} Specialist`, `Senior ${normalizedTitle}`, `${normalizedTitle} Consultant`, normalizedTitle);
        }

        // Detect languages
        const knownLangs = ['Java', 'Python', 'JavaScript', 'TypeScript', 'C#', 'C++', 'Go', 'Golang', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Rust', 'Scala'];
        const matchedLangs: string[] = [];
        for (const l of knownLangs) {
            const regex = new RegExp(`\\b${l.replace('+', '\\+')}\\b`, 'i');
            if (regex.test(text)) matchedLangs.push(l);
        }

        // Detect frameworks
        const knownFrameworks = ['React', 'Angular', 'Vue', 'Node.js', 'Node', 'Express', 'Spring Boot', 'Spring', 'Django', 'FastAPI', 'Flask', 'Next.js', '.NET', 'ASP.NET', 'Ruby on Rails'];
        const matchedFrameworks: string[] = [];
        for (const f of knownFrameworks) {
            const regex = new RegExp(`\\b${f.replace('.', '\\.').replace('+', '\\+')}\\b`, 'i');
            if (regex.test(text)) matchedFrameworks.push(f);
        }

        // Detect cloud
        const knownCloud = ['AWS', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Jenkins'];
        const matchedCloud: string[] = [];
        for (const c of knownCloud) {
            const regex = new RegExp(`\\b${c}\\b`, 'i');
            if (regex.test(text)) matchedCloud.push(c);
        }

        // Detect databases
        const knownDb = ['SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Oracle', 'DynamoDB', 'Cassandra'];
        const matchedDb: string[] = [];
        for (const d of knownDb) {
            const regex = new RegExp(`\\b${d}\\b`, 'i');
            if (regex.test(text)) matchedDb.push(d);
        }

        // Mandatory indicators
        const mandatoryKeywords = ['Strong', 'Mandatory', 'Required', 'Proficient', 'Proficiency', 'Need', 'Needed', 'Must have'];
        const matchedMandatory: string[] = [];
        const lines = text.split(/[\r\n,;.]+/);
        for (const line of lines) {
            if (mandatoryKeywords.some(mk => new RegExp(`\\b${mk}\\b`, 'i').test(line))) {
                for (const t of [...matchedLangs, ...matchedFrameworks, ...matchedCloud, ...matchedDb]) {
                    if (new RegExp(`\\b${t}\\b`, 'i').test(line) && !matchedMandatory.includes(t)) {
                        matchedMandatory.push(t);
                    }
                }
            }
        }

        return {
            job_title: normalizedTitle,
            title_variations: titleVariations.slice(0, 4),
            main_languages: matchedLangs.slice(0, 3),
            frameworks: matchedFrameworks.slice(0, 3),
            cloud_platforms: matchedCloud.slice(0, 2),
            databases: matchedDb.slice(0, 2),
            mandatory_skills: matchedMandatory.length > 0 ? matchedMandatory.slice(0, 4) : [...matchedLangs, ...matchedFrameworks].slice(0, 3)
        };
    }

    async generateForJob(jobId: string, jobDetails: any) {
        try {
            const kbText = getAiKnowledgeBase();
            const kbSection = kbText ? `\nREFERENCE KNOWLEDGE BASE:\n${kbText}\n` : '';
            
            emitLog('info', `[BOOLEAN AGENT] Extracting structural skills for: ${jobDetails.title}...`);
            
            const extractPrompt = `You are an Expert Technical Sourcer.
I have a new job requirement:
Title: ${jobDetails.title}
Location: ${jobDetails.location}
Company: ${jobDetails.company}
Description: ${jobDetails.description}

Analyze the job and extract skills into the following JSON schema. 
Return ONLY raw JSON, no markdown formatting, no explanations.
{
  "job_title": "String (the core normalized job title)",
  "title_variations": ["String", "String", "String", "String"] (Provide exactly 4 alternative titles),
  "main_languages": ["String", "String"],
  "frameworks": ["String"],
  "cloud_platforms": ["String"],
  "databases": ["String"],
  "mandatory_skills": ["String"]
}
${kbSection}`;

            let draftResponse = '';
            try {
                emitLog('info', `[BOOLEAN AGENT] Extracting skills with Gemini AI for: ${jobDetails.title}...`);
                draftResponse = await this.ai.generateText(extractPrompt, 'gemini');
            } catch (e) {
                emitLog('warn', '[BOOLEAN AGENT] Gemini failed or offline. Trying local fallback...');
                try {
                    draftResponse = await this.ai.generateText(extractPrompt, 'llama3');
                } catch (err) {
                    draftResponse = '';
                }
            }
            
            let schema: any = null;
            if (draftResponse) {
                let cleanedResponse = draftResponse;
                const jsonMatch = draftResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanedResponse = jsonMatch[0];
                } else {
                    cleanedResponse = draftResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                }

                try {
                    schema = JSON.parse(cleanedResponse);
                } catch (e) {
                    emitLog('warn', `[BOOLEAN AGENT] Failed to parse AI JSON schema response: ${e}`);
                }
            }

            if (!schema || typeof schema !== 'object' || !schema.job_title) {
                emitLog('info', '[BOOLEAN AGENT] Applying deterministic fallback Boolean schema...');
                schema = this.extractRuleBasedSchema(jobDetails);
            }

            // Fallback safety
            const title = schema.job_title || jobDetails.title || 'Engineer';
            const variations = Array.isArray(schema.title_variations) && schema.title_variations.length > 0 
                ? schema.title_variations 
                : [title];

            // Recruiter Smart Title Enhancement: If searching for specific titles, also include general 'Developer OR Engineer'
            const titleTokens = [title, ...variations];
            const hasDevOrEng = titleTokens.some(t => /developer|engineer/i.test(t));
            const smartTitleBunch = hasDevOrEng
                ? `(${titleTokens.map(t => `"${t}"`).join(" OR ")} OR Developer OR Engineer)`
                : this.buildSkillBunch(titleTokens);

            // Expand compound variations (e.g. Spring Boot -> SpringBoot, Microservices -> Micro services)
            const expandSynonyms = (items: string[]) => {
                const expanded = new Set<string>();
                for (const it of items) {
                    expanded.add(it);
                    if (/spring\s*boot/i.test(it)) {
                        expanded.add("Spring Boot");
                        expanded.add("Spring");
                        expanded.add("SpringBoot");
                    }
                    if (/microservice/i.test(it)) {
                        expanded.add("Microservices");
                        expanded.add("Microservice");
                        expanded.add("Micro services");
                        expanded.add("Micro service");
                    }
                    if (/rest/i.test(it)) {
                        expanded.add("REST API");
                        expanded.add("RESTful");
                        expanded.add("REST APIs");
                    }
                }
                return Array.from(expanded);
            };

            const langs = this.buildSkillBunch(schema.main_languages || []);
            const frameworks = this.buildSkillBunch(expandSynonyms(schema.frameworks || []));
            const cloud = this.buildSkillBunch(schema.cloud_platforms || []);
            const databases = this.buildSkillBunch(schema.databases || []);
            const mandatory = this.buildSkillBunch(expandSynonyms(schema.mandatory_skills || []));

            const coreSkills = [langs, frameworks].filter(Boolean).join(" AND ");
            const cloudDbBunch = [cloud, databases].filter(Boolean).join(" AND ");

            // Location Cluster Expansion (e.g. New York -> NYC, Greater New York City Area, Brooklyn, Jersey City)
            let locationBunch = '';
            const loc = (jobDetails.location || '').trim();
            if (loc && !/remote|anywhere|worldwide/i.test(loc)) {
                const locLower = loc.toLowerCase();
                if (locLower.includes('new york') || locLower.includes('nyc') || locLower.includes('ny')) {
                    locationBunch = '("New York" OR "NYC" OR "New York City" OR "Greater New York City Area" OR "New York City Metropolitan Area" OR "Brooklyn" OR "Manhattan" OR "Jersey City" OR "Hoboken")';
                } else if (locLower.includes('san francisco') || locLower.includes('bay area') || locLower.includes('sf')) {
                    locationBunch = '("San Francisco" OR "Bay Area" OR "SF" OR "San Francisco Bay Area" OR "Silicon Valley" OR "Oakland" OR "San Jose")';
                } else if (locLower.includes('london')) {
                    locationBunch = '("London" OR "Greater London" OR "London Area" OR "London, UK")';
                } else if (locLower.includes('seattle')) {
                    locationBunch = '("Seattle" OR "Greater Seattle Area" OR "Bellevue" OR "Redmond")';
                } else if (locLower.includes('austin')) {
                    locationBunch = '("Austin" OR "Austin, TX" OR "Greater Austin Area")';
                } else if (locLower.includes('boston')) {
                    locationBunch = '("Boston" OR "Greater Boston" OR "Cambridge, MA")';
                } else if (locLower.includes('bangalore') || locLower.includes('bengaluru')) {
                    locationBunch = '("Bangalore" OR "Bengaluru" OR "Bangalore Urban")';
                } else {
                    const cleanLoc = loc.split(',')[0].trim();
                    locationBunch = `("${loc}" OR "${cleanLoc}")`;
                }
            }

            // Level 1: Strict Match (With Job Title) - CLEAN CORE SEARCH (No active jobseeker/contact restrictions)
            let l1Parts = [smartTitleBunch, coreSkills, mandatory, cloudDbBunch, locationBunch].filter(Boolean);
            const level1 = l1Parts.join(" AND ");

            // Level 2: Fallback (Without Job Title section - Skills & Location only)
            let l2Parts = [coreSkills, mandatory, cloudDbBunch, locationBunch].filter(Boolean);
            const level2 = l2Parts.join(" AND ");

            // Level 3: Active Jobseeker & Direct Contact Fallback (Title-Free + Active Jobseeker + Recent Experience + Direct Contact Details)
            const activeCluster = '("open to work" OR "open to opportunities" OR "looking for new job" OR "seeking new job" OR "available for new contract" OR "available immediately")';
            const recentExpCluster = '("2024 to Present" OR "2023 to Present" OR "to Present" OR "Present ·" OR "2024 - Present")';
            const contactCluster = '("@gmail.com" OR "@outlook.com" OR "@yahoo.com" OR "@proton.me" OR "email:" OR "phone:" OR "reach me at" OR "contact me:")';
            const activeCombinedBunch = `(${activeCluster} OR ${recentExpCluster} OR ${contactCluster})`;
            let l3Parts = [coreSkills, mandatory, cloudDbBunch, locationBunch, activeCombinedBunch].filter(Boolean);
            const level3 = l3Parts.join(" AND ");

            // Primary search string is Level 1 (With Title)
            const primaryBoolean = level1;

            // X-Ray string generators based on Level 1 Exact
            const googleXray = `site:linkedin.com/in/ ${primaryBoolean}`;
            const researchgateXray = `site:researchgate.net/profile/ ${primaryBoolean}`;
            const stackoverflowXray = `site:stackoverflow.com/users/ ${primaryBoolean}`;
            const githubXray = `site:github.com ${primaryBoolean}`;
            const mediumXray = `site:medium.com ${primaryBoolean}`;
            const dribbbleXray = `site:dribbble.com ${primaryBoolean}`;
            const xingXray = `site:xing.com/profile/ ${primaryBoolean}`;
            const twitterXray = `site:twitter.com ${primaryBoolean}`;
            const wellfoundXray = `site:wellfound.com/u/ ${primaryBoolean}`;

            const db = await initDb();
            try {
                await db.run(
                    `UPDATE jobs SET 
                        linkedin_boolean = ?, 
                        linkedin_level_1 = ?,
                        linkedin_level_2 = ?,
                        linkedin_level_3 = ?,
                        google_boolean = ?,
                        researchgate_boolean = ?,
                        stackoverflow_boolean = ?,
                        github_boolean = ?,
                        medium_boolean = ?,
                        dribbble_boolean = ?,
                        xing_boolean = ?,
                        twitter_boolean = ?,
                        wellfound_boolean = ?
                     WHERE id = ?`,
                    [
                        primaryBoolean,
                        level1,
                        level2,
                        level3,
                        googleXray,
                        researchgateXray,
                        stackoverflowXray,
                        githubXray,
                        mediumXray,
                        dribbbleXray,
                        xingXray,
                        twitterXray,
                        wellfoundXray,
                        jobId
                    ]
                );
            } catch (updateErr: any) {
                emitLog('warn', `[BOOLEAN AGENT] Full update warning (${updateErr.message}), falling back to core columns...`);
                await db.run(
                    `UPDATE jobs SET 
                        linkedin_boolean = ?, 
                        linkedin_level_1 = ?,
                        linkedin_level_2 = ?,
                        linkedin_level_3 = ?,
                        google_boolean = ?,
                        github_boolean = ?,
                        stackoverflow_boolean = ?
                     WHERE id = ?`,
                    [primaryBoolean, level1, level2, level3, googleXray, githubXray, stackoverflowXray, jobId]
                );
            }

            emitLog('success', `[BOOLEAN AGENT] Successfully built deterministic 3-level boolean strings for: ${jobDetails.title}`);

        } catch (error: any) {
            emitLog('error', `[BOOLEAN AGENT] Error generating booleans: ${error.message}`);
        }
    }
}
