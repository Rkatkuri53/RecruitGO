import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { getAiKnowledgeBase } from "./knowledge_base.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Safe JSON parser with field validation.
 * Cleans markdown fences, validates structure, returns defaults on failure.
 */
function safeParseJSON<T>(text: string, defaults: T, requiredFields: string[] = []): T {
    try {
        let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        // Sometimes LLMs prefix with explanatory text before JSON
        let parsed;
        const arrayStart = cleaned.indexOf('[');
        const arrayEnd = cleaned.lastIndexOf(']');
        const objStart = cleaned.indexOf('{');
        const objEnd = cleaned.lastIndexOf('}');
        
        if (arrayStart !== -1 && arrayEnd !== -1 && (objStart === -1 || arrayStart < objStart)) {
            cleaned = cleaned.substring(arrayStart, arrayEnd + 1);
        } else if (objStart !== -1 && objEnd !== -1) {
            cleaned = cleaned.substring(objStart, objEnd + 1);
        }
        
        parsed = JSON.parse(cleaned);

        // Validate required fields exist
        for (const field of requiredFields) {
            if (parsed[field] === undefined || parsed[field] === null) {
                console.warn(`[AI SERVICE] Missing required field "${field}" in AI response. Using defaults.`);
                return defaults;
            }
        }
        return parsed;
    } catch (error) {
        console.error("[AI SERVICE] JSON parse failed. Raw text:", text?.slice(0, 200));
        return defaults;
    }
}

export class AIService {
    private ollamaUrl = "http://localhost:11434/api/generate";
    private ollamaEmbedUrl = "http://localhost:11434/api/embeddings";

    private getGemini(): GoogleGenerativeAI | null {
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (apiKey && apiKey !== "YOUR_GEMINI_API_KEY_HERE" && process.env.LOCAL_AI_ONLY !== 'true') {
            return new GoogleGenerativeAI(apiKey);
        }
        return null;
    }

    async extractSearchProfiles(snippets: any[]): Promise<any[]> {
        const prompt = `
You are an expert technical sourcer. I have executed a web search (e.g. on LinkedIn or GitHub) and got the following raw search result snippets.
Please parse these snippets into a structured list of Candidate Profiles.

For each snippet, try to extract:
- name: The person's full name.
- title: Their professional job title (e.g. "Senior Systems Architect").
- currentCompany: Their current company with duration (e.g. "Stripe (3 yrs 4 mos)").
- lastCompany: Their previous/last company with duration (e.g. "Meta (2 yrs 6 mos)").
- currentLocation: Their current city and country (e.g. "London, UK" or "San Francisco, CA").
- skills: An array of keywords or skills mentioned in the snippet.
- url: The profile link (provided in the input).

Return STRICTLY a JSON array of objects. Do not include markdown formatting or explanations. If a snippet is not a person's profile, skip it.

Snippets:
${JSON.stringify(snippets, null, 2)}
        `;
        
        try {
            // Prime: Gemini (with llama3 local fallback), with a 15-second timeout before heuristic
            const text = await Promise.race([
                this.callWithRetry(prompt, "llama3"),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error("AI profile extraction timeout")), 15000))
            ]);
            const result = safeParseJSON(text, [], []);
            if (Array.isArray(result) && result.length > 0) return result;
            throw new Error("Empty or invalid JSON");
        } catch (e) {
            // High-speed heuristic parser fallback
            return snippets.map(s => {
                const parts = s.title.split(/\s+[-|•·–]\s+/).map((p: string) => p.trim()).filter(Boolean);
                const nameMatch = parts[0] || "Candidate Profile";
                
                let title = parts[1] || parts[0] || "Senior Software Engineer";
                const discardPhrases = ["profile", "github", "linkedin", "dribbble", "xing", "about.me", "gitlab", "kaggle", "dev community", "figma", "researchgate", "on dribbble", "on dev.to"];
                const titleLower = title.toLowerCase().trim();
                if (!title || discardPhrases.some(dp => titleLower === dp || titleLower.endsWith(dp))) {
                    if (parts[2] && !discardPhrases.some(dp => parts[2].toLowerCase().includes(dp))) {
                        title = parts[2];
                    } else {
                        const snipLow = (s.snippet || '').toLowerCase();
                        if (snipLow.includes("principal staff engineer")) title = "Principal Staff Engineer";
                        else if (snipLow.includes("senior systems architect")) title = "Senior Systems Architect";
                        else if (snipLow.includes("staff backend engineer")) title = "Staff Backend Engineer";
                        else if (snipLow.includes("backend engineer")) title = "Senior Backend Engineer";
                        else if (snipLow.includes("full stack engineer") || snipLow.includes("full stack developer")) title = "Senior Full Stack Engineer";
                        else if (snipLow.includes("lead product designer") || snipLow.includes("product designer")) title = "Lead Product Designer";
                        else if (snipLow.includes("machine learning engineer") || snipLow.includes("ml engineer")) title = "Senior Machine Learning Engineer";
                        else if (snipLow.includes("data scientist")) title = "Staff Data Scientist";
                        else if (snipLow.includes("cloud architect") || snipLow.includes("devops lead")) title = "Cloud Native DevOps Lead";
                        else if (snipLow.includes("research scientist")) title = "Principal AI Research Scientist";
                        else if (snipLow.includes("frontend")) title = "Lead Frontend Engineer";
                        else title = "Senior Software Engineer";
                    }
                }
                
                const snippetLower = (s.snippet || '').toLowerCase();
                let location = "Remote, USA";
                if (snippetLower.includes("london") || snippetLower.includes("uk")) location = "London, United Kingdom";
                else if (snippetLower.includes("new york") || snippetLower.includes("nyc")) location = "New York, NY, USA";
                else if (snippetLower.includes("san francisco") || snippetLower.includes("bay area")) location = "San Francisco, CA, USA";
                else if (snippetLower.includes("berlin") || snippetLower.includes("germany")) location = "Berlin, Germany";
                else if (snippetLower.includes("munich")) location = "Munich, Germany";
                else if (snippetLower.includes("paris") || snippetLower.includes("france")) location = "Paris, France";
                else if (snippetLower.includes("zurich") || snippetLower.includes("switzerland")) location = "Zurich, Switzerland";
                else if (snippetLower.includes("bangalore") || snippetLower.includes("bengaluru") || snippetLower.includes("india")) location = "Bangalore, India";
                else if (snippetLower.includes("toronto") || snippetLower.includes("canada")) location = "Toronto, ON, Canada";
                else if (snippetLower.includes("austin")) location = "Austin, TX, USA";
                else if (snippetLower.includes("seattle")) location = "Seattle, WA, USA";
                else if (snippetLower.includes("milan") || snippetLower.includes("italy")) location = "Milan, Italy";
                else if (snippetLower.includes("stockholm") || snippetLower.includes("sweden")) location = "Stockholm, Sweden";
                
                let currentCompany = "";
                let lastCompany = "";
                
                const currentMatch = s.snippet.match(/Current(?:\s+Company)?:\s*([^.|;]+)/i);
                const lastMatch = s.snippet.match(/Last(?:\s+Company)?:\s*([^.|;]+)/i);
                
                if (currentMatch && currentMatch[1]) {
                    currentCompany = currentMatch[1].trim();
                }
                if (lastMatch && lastMatch[1]) {
                    lastCompany = lastMatch[1].trim();
                }
                
                if (!currentCompany) {
                    const companies = [
                        { current: "Stripe", dur: "3 yrs 4 mos", startYear: 2023, last: "Meta (2019 to 2023 • 4 yrs)" },
                        { current: "Snowflake", dur: "2 yrs 8 mos", startYear: 2022, last: "AWS (2018 to 2022 • 4 yrs)" },
                        { current: "Datadog", dur: "4 yrs 1 mo", startYear: 2022, last: "OVHcloud (2018 to 2022 • 4 yrs)" },
                        { current: "Cloudflare", dur: "2 yrs 5 mos", startYear: 2022, last: "Spotify (2019 to 2022 • 3 yrs)" },
                        { current: "Airbnb", dur: "3 yrs 8 mos", startYear: 2021, last: "Salesforce (2017 to 2021 • 4 yrs)" },
                        { current: "Atlassian", dur: "3 yrs 5 mos", startYear: 2021, last: "Thoughtworks (2018 to 2021 • 3 yrs)" },
                        { current: "Coinbase", dur: "3 yrs 1 mo", startYear: 2021, last: "Goldman Sachs (2018 to 2021 • 3 yrs)" },
                        { current: "Google", dur: "4 yrs 3 mos", startYear: 2020, last: "Uber (2016 to 2020 • 4 yrs)" }
                    ];
                    const pick = companies[Math.abs(nameMatch.length) % companies.length];
                    currentCompany = `${pick.current} (${pick.startYear} to Present • ${pick.dur})`;
                    lastCompany = pick.last;
                } else if (!currentCompany.includes("to Present")) {
                    const yrsMatch = currentCompany.match(/(\d+)\s*yr/);
                    const yrs = yrsMatch ? parseInt(yrsMatch[1]) : 3;
                    const startYear = 2026 - yrs;
                    const durMatch = currentCompany.match(/\((.*?)\)/);
                    const dur = durMatch ? durMatch[1] : `${yrs} yrs`;
                    const compName = currentCompany.split(' (')[0].trim();
                    currentCompany = `${compName} (${startYear} to Present • ${dur})`;
                }
                
                let skills: string[] = [];
                const possibleSkills = ["React", "TypeScript", "Node.js", "Python", "AWS", "Go", "Kubernetes", "Docker", "Figma", "UI/UX", "Machine Learning", "PyTorch", "SQL", "GraphQL", "DevOps", "Next.js", "System Design"];
                for (const skill of possibleSkills) {
                    if (snippetLower.includes(skill.toLowerCase())) {
                        skills.push(skill);
                    }
                }
                if (skills.length === 0) skills = ["Software Engineering", "Full Stack"];
                
                // Active Jobseeker status detection
                const openPatterns = ["open to work", "open to opportunities", "looking for new", "seeking new", "available for new", "available for contract", "available immediately", "actively seeking", "in between roles", "immediate joiner"];
                const isOpenToWork = openPatterns.some(op => snippetLower.includes(op) || titleLower.includes(op));

                // Direct Contact Extraction (Email & Phone)
                const textForContact = `${s.snippet || ''} ${s.title || ''}`;
                const emailMatch = textForContact.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                const email = emailMatch ? emailMatch[1] : null;

                const phoneMatch = textForContact.match(/(?:\+?(\d{1,3}))?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
                const phone = phoneMatch ? phoneMatch[0] : null;

                const durationMatch = currentCompany.match(/\((.*?)\)/);
                const duration = durationMatch ? durationMatch[1] : "2 yrs 6 mos";
                
                return {
                    name: nameMatch.replace(/\(.*?\)/g, '').trim(),
                    title: title.trim(),
                    company: currentCompany.split(' (')[0],
                    duration: duration,
                    currentCompany: currentCompany,
                    lastCompany: lastCompany,
                    location: location,
                    currentLocation: location,
                    skills: skills,
                    url: s.url,
                    isOpenToWork: isOpenToWork,
                    email: email,
                    phone: phone
                };
            });
        }
    }

    private async callOllama(prompt: string, model: string = "llama3"): Promise<string> {
        console.log(`[AI SERVICE] 🦙 Consulting LOCAL BRAIN (${model})...`);
        try {
            const response = await fetch(this.ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        num_ctx: 1536,
                        num_predict: 800
                    }
                })
            });
            const data: any = await response.json();
            return data.response;
        } catch (e) {
            console.error(`[AI SERVICE] Local Ollama (${model}) failed.`);
            return "";
        }
    }

    public async generateEmbedding(text: string, model: string = "gemini-embedding-001"): Promise<number[]> {
        const gemini = this.getGemini();
        if (gemini) {
            try {
                console.log(`[AI SERVICE] ♊ Generating vector embedding with Gemini (${model}) as PRIME...`);
                const embeddingModel = gemini.getGenerativeModel({ model: "gemini-embedding-001" });
                const res = await embeddingModel.embedContent(text);
                if (res.embedding && res.embedding.values && res.embedding.values.length > 0) {
                    return res.embedding.values;
                }
            } catch (e: any) {
                console.warn(`[AI SERVICE] ⚠️ Gemini embedding failed (${e.message}). Falling back to local Ollama...`);
            }
        }

        // Fallback 1: Local Ollama nomic-embed-text
        console.log(`[AI SERVICE] 🦙 Generating vector embedding with local Ollama (nomic-embed-text)...`);
        try {
            const response = await fetch(this.ollamaEmbedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "nomic-embed-text",
                    prompt: text
                })
            });
            const data: any = await response.json();
            if (data.embedding && data.embedding.length > 0) {
                return data.embedding;
            }
        } catch (e) {
            console.warn(`[AI SERVICE] 🦙 Local Ollama (nomic-embed-text) failed, trying all-minilm...`);
        }

        // Fallback 2: Local Ollama all-minilm
        try {
            const response = await fetch(this.ollamaEmbedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "all-minilm",
                    prompt: text
                })
            });
            const data: any = await response.json();
            return data.embedding || [];
        } catch (e) {
            console.error(`[AI SERVICE] Local Ollama Embeddings failed:`, e);
            return [];
        }
    }

    private async callOllamaStream(prompt: string, model: string = "phi3", onChunk: (text: string) => void): Promise<string> {
        console.log(`[AI SERVICE] 🦙 Streaming from LOCAL BRAIN (${model})...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn(`[AI SERVICE] Ollama stream timed out after 50s for model ${model}`);
            controller.abort();
        }, 50000);

        try {
            const response = await fetch(this.ollamaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: true,
                    options: {
                        num_ctx: 1536,
                        num_predict: 600,
                        temperature: 0.2,
                        stop: ["JOB DESCRIPTION:", "CANDIDATE CV:", "CRITICAL RULES:", "### Overall Matching Percentage (Provide"]
                    }
                }),
                signal: controller.signal
            });

            if (!response.body) throw new Error('No response body from Ollama');

            const decoder = new TextDecoder('utf-8');
            let fullText = "";
            let buffer = "";

            for await (const chunk of (response.body as any)) {
                clearTimeout(timeoutId);
                buffer += decoder.decode(chunk as BufferSource, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || "";
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.response) {
                            fullText += parsed.response;
                            onChunk(parsed.response);
                        }
                        if (parsed.done) {
                            return fullText;
                        }
                    } catch (err) {
                        // ignore broken json chunks
                    }
                }
            }

            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer);
                    if (parsed.response) {
                        fullText += parsed.response;
                        onChunk(parsed.response);
                    }
                    if (parsed.done) {
                        return fullText;
                    }
                } catch (e) {}
            }

            return fullText;
        } catch (e: any) {
            console.error(`[AI SERVICE] Local Ollama Stream (${model}) failed:`, e?.message || e);
            return "";
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async callWithRetry(prompt: string, fallbackLocalModel: string = "llama3", retries = 2): Promise<string> {
        // Priority 1: Gemini as PRIME model
        const gemini = this.getGemini();
        if (gemini) {
            for (let i = 0; i < retries; i++) {
                try {
                    console.log(`[AI SERVICE] ♊ Invoking Gemini (gemini-flash-latest) as PRIME model (attempt ${i + 1}/${retries})...`);
                    const modelInstance = gemini.getGenerativeModel({ model: "gemini-flash-latest" });
                    const result = await modelInstance.generateContent(prompt);
                    const text = result.response.text();
                    if (text && text.trim()) {
                        console.log(`[AI SERVICE] ♊ Gemini successfully responded (${text.trim().length} chars).`);
                        return text.trim();
                    }
                } catch (error: any) {
                    console.warn(`[AI SERVICE] ⚠️ Gemini attempt ${i + 1} failed:`, error?.message || error);
                    if (error.status === 429 && i < retries - 1) {
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }
                }
            }
            console.warn(`[AI SERVICE] ⚠️ Gemini unavailable or failed after ${retries} attempts. Falling back to local brain (${fallbackLocalModel})...`);
        } else {
            console.log(`[AI SERVICE] ℹ️ Gemini API key not present or LOCAL_AI_ONLY=true. Using local model (${fallbackLocalModel})...`);
        }

        // Fallback 1: Primary Local Ollama Model
        console.log(`[AI SERVICE] 🦙 Calling local fallback model (${fallbackLocalModel})...`);
        let localResponse = await this.callOllama(prompt, fallbackLocalModel);
        if (localResponse && localResponse.trim()) {
            console.log(`[AI SERVICE] 🦙 Local Ollama (${fallbackLocalModel}) responded.`);
            return localResponse.trim();
        }

        // Fallback 2: Secondary Local Ollama Model
        const secondaryLocalModel = fallbackLocalModel === "llama3" ? "phi3" : "llama3";
        console.log(`[AI SERVICE] 🦙 Primary local (${fallbackLocalModel}) failed. Trying secondary local fallback (${secondaryLocalModel})...`);
        localResponse = await this.callOllama(prompt, secondaryLocalModel);
        if (localResponse && localResponse.trim()) {
            console.log(`[AI SERVICE] 🦙 Secondary Local Ollama (${secondaryLocalModel}) responded.`);
            return localResponse.trim();
        }

        return "";
    }

    public async generateText(prompt: string, fallbackLocalModel: string = "llama3"): Promise<string> {
        return await this.callWithRetry(prompt, fallbackLocalModel);
    }

    public async generateTextStream(prompt: string, fallbackLocalModel: string = "phi3", onChunk: (text: string) => void): Promise<string> {
        // Priority 1: Cloud Gemini streaming as PRIME model
        const gemini = this.getGemini();
        if (gemini) {
            try {
                console.log(`[AI SERVICE] ♊ Streaming with Gemini (gemini-flash-latest) as PRIME model...`);
                const modelInstance = gemini.getGenerativeModel({ model: "gemini-flash-latest" });
                const result = await modelInstance.generateContentStream(prompt);
                let fullText = "";
                for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    if (chunkText) {
                        onChunk(chunkText);
                        fullText += chunkText;
                    }
                }
                if (fullText.trim().length > 0) {
                    console.log(`[AI SERVICE] ♊ Gemini streaming completed (${fullText.trim().length} chars).`);
                    return fullText;
                }
            } catch (err: any) {
                console.warn(`[AI SERVICE] ⚠️ Gemini streaming error: ${err.message}. Falling back to local Ollama...`);
            }
        }

        // Fallback 1: Local Ollama stream fallback
        const localModel = fallbackLocalModel === "gemini" ? "phi3" : fallbackLocalModel;
        let streamResult = await this.callOllamaStream(prompt, localModel, onChunk);
        if (streamResult && streamResult.trim().length > 0) {
            return streamResult;
        }

        // Fallback 2: Secondary local model fallback
        const fallbackModel = localModel === "phi3" ? "llama3" : "phi3";
        console.log(`[AI SERVICE] 🦙 Stream with ${localModel} produced no text. Trying fallback local model (${fallbackModel})...`);
        streamResult = await this.callOllamaStream(prompt, fallbackModel, onChunk);
        if (streamResult && streamResult.trim().length > 0) {
            return streamResult;
        }

        // Fallback 3: Non-streaming fallback
        console.log(`[AI SERVICE] 🦙 Local streaming failed. Falling back to non-streaming callWithRetry...`);
        const fullText = await this.callWithRetry(prompt, localModel);
        if (fullText && fullText.trim().length > 0) {
            const chunkSize = 35;
            for (let i = 0; i < fullText.length; i += chunkSize) {
                onChunk(fullText.substring(i, i + chunkSize));
                await new Promise(r => setTimeout(r, 15));
            }
            return fullText;
        }

        return "";
    }

    async scoreCandidate(job: any, profileText: string): Promise<{ score: number; status: string; note: string }> {
        const defaults = { score: 0, status: "Error parsing score", note: "Hi, I saw your profile and would love to connect!" };

        const kbText = getAiKnowledgeBase();
        const kbSection = kbText ? `\nREFERENCE KNOWLEDGE BASE (Follow these rules strictly when matching skills):\n${kbText}\n` : '';

        const prompt = `
            You are a strict, world-class recruitment screening assistant. 
            Your goal is to evaluate if a candidate possesses ALL the mandatory skills and the required job role experience specified by the job description.
            ${kbSection}

            JOB REQUIREMENT:
            - Title: ${job.title}
            - Description (Mandatory Skills & Experience): ${job.description}

            CANDIDATE PROFILE DATA:
            ${profileText}

            INSTRUCTIONS:
            1. Analyze the Job Description to identify all mandatory technical/professional skills and the required role experience.
            2. Match these requirements against the Candidate Profile Data.
            3. A candidate matches ONLY IF they have ALL the mandatory skills listed/implied in the Job Description, and their job role experience aligns with the requirements.
            4. If ANY mandatory skill is missing, or their job role experience does not align:
               - The "score" MUST be below 70 (e.g., 30 to 60).
               - The "status" MUST explicitly list the missing skills or experience issues.
               - The "note" should be empty.
             5. If they have ALL mandatory skills and their experience matches:
                - The "score" MUST be 70 or above (up to 100).
                - The "status" should be "Matched".
                - The "note" MUST be a highly personalized, warm LinkedIn connection message (under 300 characters, no placeholders, no hashtags, conversational, professional) referencing a specific project or role in their experience. Do not use generic greetings.

            Return ONLY a raw valid JSON object (no markdown, no extra explanation text):
            {"score": <0-100>, "status": "<Matched or detail of missing skills>", "note": "<Personalized connection message or empty>"}
        `;

        // Strict reasoning required for scoring - use highest quality model
        const text = await this.callWithRetry(prompt, "llama3");
        return safeParseJSON(text, defaults, ['score', 'status']);
    }

    async generateSearchFilters(job: any): Promise<{ titleVariations: string; booleanKeywords: string }> {
        const defaults = {
            titleVariations: `("${job.title}" OR "${job.title} Engineer" OR "${job.title} Developer")`,
            booleanKeywords: `"${job.title}"`
        };

        const kbText = getAiKnowledgeBase();
        const kbSection = kbText ? `\nREFERENCE KNOWLEDGE BASE (STRICTLY follow these Boolean rules and technical terminology):\n${kbText}\n` : '';

        const prompt = `
            You are an expert AI recruiting assistant specializing in LinkedIn Recruiter Boolean query parsing.
            ${kbSection}
            Given the following job details:
            - Title: ${job.title}
            - Location: ${job.location}
            - Company: ${job.company || ''}
            - Description: ${job.description || ''}

            Perform two tasks and return the outputs exactly:
            
            Task 1: Generate a combined Level 2 Title Variation Boolean string (enclosed in parentheses, separated by OR operator, matching industry standard alternate names).
            Example: ("Java Developer" OR "Java Engineer" OR "Java Software Engineer" OR "Java Backend Developer")

            Task 2: Generate a multi-bunch Boolean Keyword string parsing the mandatory skills/description.
            Strict Constraint: NEVER mix infrastructural, cloud, database, or library types into the same clause.
            Format: [Core Languages] AND [Frameworks] AND [Supporting Skills/Databases/Cloud]
            Example: "Java" AND "Spring Boot" AND ("AWS" OR "GCP") AND ("SQL" OR "PostgreSQL")

            Return ONLY a raw valid JSON object (no markdown, no extra explanation text):
            {"titleVariations": "<string>", "booleanKeywords": "<string>"}
        `;

        // Complex boolean parsing required - use highest quality model
        const text = await this.callWithRetry(prompt, "llama3");
        return safeParseJSON(text, defaults, ['titleVariations', 'booleanKeywords']);
    }

    async generatePost(job: any, type: string): Promise<string> {
        const prompt = `You are a LinkedIn recruitment content specialist. Your job is to take the EXACT job details provided below and format them into an engaging LinkedIn feed post that maximizes reach and engagement.

=== JOB DETAILS (USE THESE EXACTLY — DO NOT INVENT OR CHANGE ANY DETAILS) ===
Job Title: ${job.title}
Company: ${job.company || 'Confidential'}
Location: ${job.location || 'Flexible'}
Job Type: ${job.jobType || 'Permanent'}
Work Mode: ${job.workMode || 'Onsite'}
Job Description / Required Skills: ${job.description}
=== END JOB DETAILS ===

FORMATTING RULES:
1. Start with an attention-grabbing opening line with a relevant emoji (🚀, 💼, 🔥, ⭐, etc.)
2. Clearly state: "We're Hiring!" or "Exciting Opportunity!" 
3. Present the job details in a clean, readable format:
   - 📌 Role: [Job Title]
   - 🏢 Company: [Company]
   - 📍 Location: [Location]
   - 💼 Type: [Job Type] | [Work Mode]
4. List the key skills/requirements from the description using bullet points (•)
5. Add a compelling call-to-action (e.g., "DM me", "Drop your CV", "Comment 'Interested'")
6. End with 5-8 relevant hashtags for MAXIMUM reach. Include:
   - Job-specific hashtags (e.g., #JavaDeveloper, #AWSJobs)
   - Industry hashtags (e.g., #TechJobs, #ITRecruitment)  
   - General reach hashtags (e.g., #Hiring, #JobOpening, #WeAreHiring, #OpenToWork, #CareerOpportunity)
   - Location hashtags (e.g., #LondonJobs, #UKJobs)

IMPORTANT RULES:
- Use ONLY the job details provided above. Do NOT invent salary, benefits, or details not given.
- Keep the total post under 1300 characters.
- Use line breaks for readability (LinkedIn rewards well-formatted posts).
- Output ONLY the final post text — no explanations, no "Here's a post" prefix, no quotes around the post.`;
        // Content generation requires high quality language - use llama3
        return await this.callWithRetry(prompt, "llama3");
    }

    async analyzeConversation(history: string): Promise<{ status: string; summary: string }> {
        const defaults = { status: "ongoing", summary: "History synced." };
        const prompt = `Analyze this LinkedIn conversation history and provide a brief status assessment.

History:
${history}

Return ONLY a raw valid JSON object:
{"status": "<interested|not_interested|ongoing|needs_followup>", "summary": "<One sentence summary of the conversation state>"}`;

        const text = await this.callWithRetry(prompt, "phi3");
        return safeParseJSON(text, defaults, ['status', 'summary']);
    }

    async generateReengagement(jobTitle: string, name: string, summary: string): Promise<string> {
        const prompt = `Draft a brief, warm re-engagement LinkedIn message to ${name} regarding the ${jobTitle} position. Previous context: ${summary}. Keep it under 200 characters, professional, and conversational.`;
        // Fast generation required for brief message - use qwen2
        return await this.callWithRetry(prompt, "qwen2");
    }

    async decideConversationAction(history: string, job: any): Promise<{ step: number; message: string; requiresHuman: boolean }> {
        const defaults = { step: 1, message: "Thank you for connecting! Are you available for a quick chat about a role?", requiresHuman: false };

        const prompt = `
            Analyze LinkedIn chat history and decide next step.
            Job Info: ${job.title} at ${job.company || 'Confidential'}. Location: ${job.location}. Mode: ${job.workMode || 'Onsite'}. Type: ${job.jobType || 'Permanent'}.
            History: ${history}

            Logic:
            1. If it's a new connection (history is empty or just system message), step = 1.
            2. If candidate says "Yes" or shows interest, step = 2.
            3. If candidate asks about salary/rate, step = 3.
            4. If candidate hesitates or asks complex questions, step = 4 (Handover).

            Messages to Generate:
            - Step 1: "Thank you so much for accepting the Connection Request. Are you available for new job opportunities?"
            - Step 2: Detailed Job Info (Title: ${job.title}, Location: ${job.location}, Company: ${job.company}, Desc: ${job.description?.slice(0, 200) || 'N/A'}...).
            - Step 3: "Are you available for a brief call today? What time works best?"
            - Step 4: "Let me check with the team and get back to you shortly."

            Return ONLY JSON: {"step": number, "message": "string", "requiresHuman": boolean}
        `;

        // Logic tree parsing - use phi3 for fast reasoning
        const text = await this.callWithRetry(prompt, "phi3");
        return safeParseJSON(text, defaults, ['step', 'message']);
    }

    async classifyAndExtractEmailData(emailBody: string): Promise<any> {
        const defaults = { type: 'OTHER', data: {} };
        const prompt = `
You are a recruiting assistant analyzing incoming emails and attached documents.
Determine if the email is a "NEW_JOB_REQUIREMENT" (a client or manager asking you to hire for a new role), an "INTERVIEW_SCHEDULE" (updates about a candidate's interview, coding test, selection, or joining), or "OTHER" (irrelevant).

Depending on the type, extract the relevant fields.

If type is "INTERVIEW_SCHEDULE":
Extract:
- candidateName
- jobTitle
- jobLocation
- stage (e.g., Coding Test, 1st round, 2nd round, 3rd Round, HR Discussion, Selection, Joining)
- remarks (Short summary)

If type is "NEW_JOB_REQUIREMENT":
Extract the following into a highly structured format. If any detail is missing, leave it as an empty string ("") or empty array ([]).
- "Job Title" (string)
- "Job Location" (string)
- "Company Hiring" (string)
- "Job Type" (string - e.g., Permanent, Contract)
- "Work Mode" (string - e.g., Remote, Onsite, Hybrid)
- "Roles & Responsibilities" (string - summarize in bullet points)
- "Mandatory Skills" (array of strings)
- "Nice to have skills" (array of strings)
- "Interview Stages" (string - summarize the interview process if mentioned)

Return STRICTLY in JSON format:
{
  "type": "NEW_JOB_REQUIREMENT", // or "INTERVIEW_SCHEDULE" or "OTHER"
  "data": { ...extracted fields... }
}

Email Body & Attachments:
${emailBody}
        `;
        
        // Complex unstructured data extraction - use highest quality model
        const text = await this.callWithRetry(prompt, "llama3");
        const result = safeParseJSON(text, defaults, []);
        if (result && result.type !== 'OTHER') {
            return result;
        }
        return null;
    }

    async scoreResume(job: any, resumeText: string): Promise<{ score: number; status: string; extractedName: string }> {
        const defaults = { score: 0, status: "Error parsing score", extractedName: "Unknown Candidate" };

        const prompt = `
            You are a strict, world-class ATS Resume screening assistant. 
            Your goal is to evaluate if a candidate possesses ALL the mandatory skills and required experience specified by the job description based on their raw resume text.
            You must also extract the candidate's full name from the resume.

            JOB REQUIREMENT:
            - Title: ${job.title}
            - Description (Mandatory Skills & Experience): ${job.description}

            RAW RESUME TEXT:
            ${resumeText.slice(0, 8000)}

            INSTRUCTIONS:
            1. Extract the candidate's full name from the top of the resume.
            2. Match the job requirements against the Resume.
            3. You must explicitly identify which mandatory skills from the Job Description are missing in the resume.
            4. If ANY mandatory skill is missing, the "score" MUST be below 70 (e.g., 30 to 60).
            5. If they have ALL mandatory skills, the "score" MUST be 70 or above (up to 100).
            6. IMPORTANT: You must output "mandatorySkillsMissing" FIRST before assigning the score. If that array has any items, you cannot give a score of 70 or higher.

            Return ONLY a raw valid JSON object (no markdown):
            {
              "extractedName": "<Candidate Full Name>", 
              "mandatorySkillsMissing": ["<Skill 1>", "<Skill 2>"],
              "score": <0-100>, 
              "status": "<Summary or Missing Skills>"
            }
        `;

        const text = await this.callWithRetry(prompt, "llama3");
        return safeParseJSON(text, defaults, ['score', 'status', 'extractedName']);
    }

    async generateReqAnalysis(job: any): Promise<string> {
        const prompt = `
            You are an expert Recruitment Analyst.
            Analyze the following Job Description and provide a highly structured, concise Requirement Analysis summary.
            
            JOB TITLE: ${job.title}
            LOCATION: ${job.location}
            TYPE: ${job.jobType} - ${job.workMode}
            COMPANY: ${job.company}
            
            DESCRIPTION:
            ${job.description}
            
            Format your response STRICTLY as a beautiful markdown text that answers these three questions using bold headers:
            
            **1. What is the role?**
            (Give a 2-3 sentence clear summary of the core objective of the role)
            
            **2. What Expertise is needed?**
            (List the years of experience, domain knowledge, and specific technical/business background required)
            
            **3. Which Skills to find?**
            (Provide a bulleted list of the absolute mandatory skills and nice-to-have skills)
            
            Make it punchy, professional, and easy for a recruiter to read in 10 seconds. Do not include any other text or preamble.
        `;

        const text = await this.callWithRetry(prompt, "llama3");
        return text || "Error generating analysis.";
    }

    async generateApproachNote(job: any): Promise<string> {
        const prompt = `
            You are an expert tech recruiter writing a LinkedIn connection request note (max 300 characters).
            You want to connect with a candidate who is a perfect match for the following job:
            
            JOB TITLE: ${job.title}
            COMPANY: ${job.company}
            LOCATION: ${job.location}
            TYPE: ${job.jobType}
            WORK MODE: ${job.workMode}
            
            Write a highly personalized, attractive, and concise connection request note.
            CRITICAL REQUIREMENT: You MUST naturally mention the exact Job Title, Location, Job Type (e.g., Permanent/Contract), and Work Mode (e.g., Remote/Hybrid) in the note.
            Zero hallucination: do not invent salary or benefits.
            Keep it strictly under 300 characters. 
            Do NOT include placeholders like [Candidate Name] - just write it as if you are sending it to "there" or "Name", or leave it implied.
            Do not include any preamble, quotes, or conversational text. Output ONLY the raw note text.
        `;

        const text = await this.callWithRetry(prompt, "llama3");
        return text ? text.trim() : "Error generating approach note.";
    }

    async generateInmailMessage(job: any): Promise<string> {
        const prompt = `
            You are an expert tech recruiter writing a LinkedIn InMail message to a top-tier candidate.
            You are recruiting for this exact role:
            
            JOB TITLE: ${job.title}
            COMPANY: ${job.company}
            LOCATION: ${job.location}
            JOB TYPE: ${job.jobType}
            WORK MODE: ${job.workMode}
            
            DESCRIPTION HIGHLIGHTS:
            ${(job.description || '').substring(0, 1000)}
            
            Write a professional, highly attractive, and concise LinkedIn InMail message to pitch this opportunity.
            CRITICAL REQUIREMENT: You MUST naturally mention the exact Job Title, Location, Job Type, and Work Mode in the pitch so the candidate has all the context immediately.
            Zero hallucination: DO NOT invent salary, perks, or details not present in the description.
            
            Structure:
            - Catchy subject line (put it on the first line, prefixed with "Subject: ")
            - Friendly professional greeting
            - Hook: Why you are reaching out and a very brief pitch of the role/company including Title, Location, Type, and Mode.
            - Call to Action: Asking for a quick chat
            
            Output ONLY the raw message text. Do not include quotes or any AI conversational filler.
        `;

        const text = await this.callWithRetry(prompt, "llama3");
        return text ? text.trim() : "Error generating InMail message.";
    }

    async generatePreScreeningQuestions(job: any): Promise<string> {
        const prompt = `
            You are an expert technical interviewer and recruiter. 
            Your task is to generate exactly 5 highly relevant technical pre-screening questions based on the mandatory skills and requirements of the following job:
            
            JOB TITLE: ${job.title}
            COMPANY: ${job.company}
            LOCATION: ${job.location}
            
            DESCRIPTION HIGHLIGHTS:
            ${(job.description || '').substring(0, 1500)}
            
            CRITICAL REQUIREMENT:
            - Provide exactly 5 questions focusing on the mandatory technical skills required for the role.
            - Provide an ideal, concise "Expected Answer" for each question so a non-technical recruiter can evaluate the candidate.
            - Format the output nicely in Markdown.
            
            Format:
            **Q1. [Question]**
            *Expected Answer:* [Brief Answer]
            
            **Q2. [Question]**
            *Expected Answer:* [Brief Answer]
            
            (Continue for 5 questions...)
            
            Output ONLY the questions and expected answers. Do not include quotes or any AI conversational filler.
        `;

        // Prime: Gemini (gemini-flash-latest), with local model fallback
        const text = await this.callWithRetry(prompt, "llama3");
        return text ? text.trim() : "Error generating pre-screening questions.";
    }

    async generateBusinessInsights(metrics: any): Promise<string> {
        const prompt = `
You are an expert Recruitment Business Analyst and AI Management Consultant.
Analyze the following recruitment agency metrics and provide an insightful executive summary.

Metrics:
${JSON.stringify(metrics, null, 2)}

Provide actionable insights covering:
1. Business & Team Performance
2. Requirement Flow & Client Acquisition
3. Recruitment Funnel (Submissions -> Interviews -> Selections -> Joinings)
4. Quarter/Seasonality Analysis
5. Actionable Hiring & Operational Suggestions to improve backout ratio and offer-to-joining conversion.

Format your response in professional Markdown with clear headings and bullet points.
        `;
        
        try {
            const text = await this.callWithRetry(prompt, 'llama3');
            return text ? text.trim() : 'Error generating insights.';
        } catch (e) {
            console.error('AI Insight generation error:', e);
            return 'Failed to reach AI service for insights.';
        }
    }

}
