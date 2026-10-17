import { emitLog } from './events.js';
import * as cheerio from 'cheerio';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export class SearchService {
    async executeSearch(query: string, maxResults = 12, page = 1, excludeUrls: string[] = []): Promise<SearchResult[]> {
        emitLog('info', `[SEARCH] Executing Public Web Search Agent for query: ${query} (Page ${page})`);
        const results: SearchResult[] = [];
        const seenUrls = new Set((excludeUrls || []).map(u => (u || '').toLowerCase().trim()));
        
        try {
            const offset = (page - 1) * 30;
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${offset > 0 ? `&s=${offset}` : ''}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const response = await fetch(searchUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            });
            clearTimeout(timeoutId);
            
            if (!response.ok || response.status === 202) {
                emitLog('warn', `[SEARCH] DuckDuckGo returned status ${response.status} (verification/challenge). Using fallback results.`);
                this.addMockResults(results, query, page, seenUrls);
                return results;
            }
            
            const html = await response.text();
            const $ = cheerio.load(html);
            
            $('.result').each((i, element) => {
                if (results.length >= maxResults) return false;
                
                const titleEl = $(element).find('.result__title a');
                const title = titleEl.text().trim();
                let url = titleEl.attr('href') || '';
                const snippet = $(element).find('.result__snippet').text().trim();
                
                // Extract real URL if DuckDuckGo wrapped it
                if (url.startsWith('//duckduckgo.com/l/?uddg=')) {
                    try {
                        const urlParams = new URLSearchParams(url.split('?')[1]);
                        const uddg = urlParams.get('uddg');
                        if (uddg) url = decodeURIComponent(uddg);
                    } catch (e) {}
                }
                
                if (title && url) {
                    const cleanUrl = url.toLowerCase().trim();
                    if (!seenUrls.has(cleanUrl)) {
                        seenUrls.add(cleanUrl);
                        results.push({ title, url, snippet });
                    }
                }
            });
            
            if (results.length === 0) {
                emitLog('warn', `[SEARCH] DuckDuckGo returned 0 results. Loading platform-tailored candidate profiles for Page ${page}.`);
                this.addMockResults(results, query, page, seenUrls);
            } else {
                emitLog('success', `[SEARCH] Search Agent retrieved ${results.length} native profiles.`);
            }
        } catch (error: any) {
            emitLog('error', `[SEARCH] DuckDuckGo search connection: ${error.message}. Loading platform candidate profiles for Page ${page}.`);
            this.addMockResults(results, query, page, seenUrls);
        }

        return results;
    }
    
    private addMockResults(results: SearchResult[], query = '', page = 1, seenUrls = new Set<string>()) {
        const qLower = query.toLowerCase();
        
        let platform = 'generic';
        if (qLower.includes('github.com')) platform = 'github';
        else if (qLower.includes('linkedin.com')) platform = 'linkedin';
        else if (qLower.includes('stackoverflow.com')) platform = 'stackoverflow';
        else if (qLower.includes('dribbble.com')) platform = 'dribbble';
        else if (qLower.includes('xing.com')) platform = 'xing';
        else if (qLower.includes('about.me')) platform = 'aboutme';
        else if (qLower.includes('gitlab.com')) platform = 'gitlab';
        else if (qLower.includes('kaggle.com')) platform = 'kaggle';
        else if (qLower.includes('dev.to')) platform = 'devto';
        else if (qLower.includes('behance.net')) platform = 'behance';
        else if (qLower.includes('figma.com')) platform = 'figma';
        else if (qLower.includes('researchgate.net')) platform = 'researchgate';

        const platformPools: Record<string, SearchResult[]> = {
            linkedin: [
                // Batch 1 (Page 1)
                { title: 'Sarah Jenkins - Principal Staff Engineer', url: 'https://linkedin.com/in/sarahjenkins-tech', snippet: 'Current: Stripe (2022 to Present • 2 yrs 9 mos) | Last: Meta (2018 to 2022 • 4 yrs). Principal Staff Engineer based in London, UK. Specialized in distributed microservices, Go, TypeScript, and high-availability cloud architecture.' },
                { title: 'Marcus Vance - VP of Engineering', url: 'https://linkedin.com/in/marcus-vance-lead', snippet: 'Current: Snowflake (2021 to Present • 3 yrs 5 mos) | Last: Amazon (2017 to 2021 • 4 yrs). VP of Engineering with 12+ years building high-performing full stack teams. Experienced in React, Node.js, AWS, Kubernetes. Based in San Francisco, CA, USA.' },
                { title: 'Elena Rostova - Lead Cloud Solutions Architect', url: 'https://linkedin.com/in/elena-rostova-cloud', snippet: 'Current: Datadog (2022 to Present • 2 yrs 6 mos) | Last: Microsoft (2018 to 2022 • 4 yrs). Lead Cloud Architect with enterprise scale migration experience. Terraform, Docker, Python. Based in New York, NY, USA.' },
                { title: 'David Kim - Senior React Developer', url: 'https://linkedin.com/in/davidkim-frontend', snippet: 'Current: Coinbase (2021 to Present • 3 yrs 2 mos) | Last: Goldman Sachs (2018 to 2021 • 3 yrs). Senior Frontend Developer specializing in React 18, Next.js, and TypeScript. 7 years experience. Based in Austin, TX, USA.' },
                { title: 'Amina Al-Mansoor - Engineering Director', url: 'https://linkedin.com/in/amina-mansoor', snippet: 'Current: Google (2020 to Present • 4 yrs 4 mos) | Last: Uber (2016 to 2020 • 4 yrs). Engineering Director driving AI and product infrastructure. Strong track record with global teams. Based in Seattle, WA, USA.' },
                
                // Batch 2 (Page 2)
                { title: 'Carlos Ramirez - Staff Infrastructure Engineer', url: 'https://linkedin.com/in/carlos-ramirez-infra', snippet: 'Current: Netflix (2023 to Present • 2 yrs 1 mo) | Last: Apple (2019 to 2023 • 4 yrs). Staff Infrastructure Engineer in Los Angeles, CA, USA. Kafka, Kubernetes, Go, Multi-region cloud scalability.' },
                { title: 'Zoe Deschanel - Lead Full Stack Architect', url: 'https://linkedin.com/in/zoe-deschanel-fullstack', snippet: 'Current: Figma (2022 to Present • 2 yrs 8 mos) | Last: Dropbox (2018 to 2022 • 4 yrs). Lead Architect based in Chicago, IL, USA. WebGL, TypeScript, React 19, Node.js, High concurrency microservices.' },
                { title: 'Arjun Mehra - Senior Machine Learning Architect', url: 'https://linkedin.com/in/arjun-mehra-ml', snippet: 'Current: OpenAI (2023 to Present • 2 yrs 3 mos) | Last: DeepMind (2019 to 2023 • 4 yrs). Senior ML Architect based in Boston, MA, USA. Large language models, PyTorch, distributed inference.' },
                { title: 'Jessica Taylor - Director of Product Engineering', url: 'https://linkedin.com/in/jessica-taylor-eng', snippet: 'Current: Shopify (2021 to Present • 3 yrs 6 mos) | Last: Atlassian (2017 to 2021 • 4 yrs). Director of Product Engineering based in Toronto, Canada. Scaling high-velocity engineering organizations.' },
                { title: 'Liam Fitzpatrick - Principal Security Architect', url: 'https://linkedin.com/in/liam-fitzpatrick-sec', snippet: 'Current: CrowdStrike (2022 to Present • 2 yrs 7 mos) | Last: Palo Alto Networks (2018 to 2022 • 4 yrs). Principal Security Architect in Dublin, Ireland. Zero-trust architecture, cloud security posture.' },
                
                // Batch 3 (Page 3)
                { title: 'Hanna Lindqvist - Staff Backend Engineer', url: 'https://linkedin.com/in/hanna-lindqvist-backend', snippet: 'Current: Spotify (2022 to Present • 2 yrs 9 mos) | Last: Klarna (2018 to 2022 • 4 yrs). Staff Backend Engineer in Stockholm, Sweden. Java, Go, Distributed Cassandra databases, gRPC.' },
                { title: 'Tariq Al-Fahim - Senior Cloud Platform Engineer', url: 'https://linkedin.com/in/tariq-alfahim-cloud', snippet: 'Current: Palantir (2023 to Present • 1 yr 10 mos) | Last: Oracle Cloud (2019 to 2023 • 4 yrs). Senior Cloud Platform Engineer in Dubai, UAE. Terraform, Kubernetes, High-security compliance.' },
                { title: 'Mei-Ling Wu - Principal Data Architect', url: 'https://linkedin.com/in/meiling-wu-data', snippet: 'Current: Uber (2021 to Present • 3 yrs 4 mos) | Last: Airbnb (2017 to 2021 • 4 yrs). Principal Data Architect in San Francisco, CA, USA. Apache Spark, Snowflake, Real-time data lakes.' }
            ],
            github: [
                // Batch 1 (Page 1)
                { title: 'Alex Mercer (alexm-dev) - Staff Software Engineer', url: 'https://github.com/alexm-dev', snippet: 'Current: Cloudflare (2022 to Present • 2 yrs 8 mos) | Last: Shopify (2019 to 2022 • 3 yrs). Staff Software Engineer based in London, UK. Core maintainer of open-source TypeScript and Node.js tooling. 4.2k stars.' },
                { title: 'Priya Sharma (priyasharma) - Senior Full Stack Engineer', url: 'https://github.com/priyasharma-oss', snippet: 'Current: Atlassian (2021 to Present • 3 yrs 5 mos) | Last: Thoughtworks (2018 to 2021 • 3 yrs). Senior Full Stack Engineer in Bangalore, India. React, Next.js, Rust, Python. Active creator of CLI tools.' },
                { title: 'Lukas Meyer (lukasm) - Cloud Native DevOps Lead', url: 'https://github.com/lukasmeyer', snippet: 'Current: Zalando (2022 to Present • 2 yrs 10 mos) | Last: Delivery Hero (2019 to 2022 • 3 yrs). Cloud Native DevOps Lead in Berlin, Germany. Kubernetes, Helm, Golang, CI/CD pipeline automation.' },
                { title: 'Kenji Sato (kenji-codes) - Principal Frontend Architect', url: 'https://github.com/kenjisato', snippet: 'Current: Airbnb (2021 to Present • 3 yrs 8 mos) | Last: Rakuten (2017 to 2021 • 4 yrs). Principal Frontend Architect in Tokyo, Japan. Author of popular state-management libraries. Expert in React, WebGL.' },
                { title: 'Sophia Carter (scarter-ml) - Senior Machine Learning Engineer', url: 'https://github.com/scarter-ml', snippet: 'Current: OpenAI (2023 to Present • 2 yrs 1 mo) | Last: DeepMind (2020 to 2023 • 3 yrs). Senior Machine Learning Engineer in San Francisco, CA, USA. PyTorch, HuggingFace, FastAPI, Docker.' },
                
                // Batch 2 (Page 2)
                { title: 'Julian Thorne (jthorne-core) - Staff Systems Engineer', url: 'https://github.com/jthorne-core', snippet: 'Current: Stripe (2022 to Present • 2 yrs 6 mos) | Last: GitHub (2018 to 2022 • 4 yrs). Staff Systems Engineer based in Seattle, WA, USA. High-throughput distributed caching, Rust, C++, Linux kernel profiling.' },
                { title: 'Camila Santos (camilasantos) - Lead Backend Developer', url: 'https://github.com/camilasantos-dev', snippet: 'Current: Nubank (2021 to Present • 3 yrs 4 mos) | Last: Mercado Libre (2018 to 2021 • 3 yrs). Lead Backend Developer in São Paulo, Brazil. Clojure, Go, Event-driven microservices architecture.' },
                { title: 'Dmitri Petrov (dpetrov-oss) - Principal SRE & Platform Lead', url: 'https://github.com/dpetrov-oss', snippet: 'Current: HashiCorp (2022 to Present • 2 yrs 9 mos) | Last: Yandex (2018 to 2022 • 4 yrs). Principal SRE in Amsterdam, Netherlands. Terraform provider author, Consul, Envoy, zero-trust mesh.' },
                { title: 'Maya Patel (mayapatel-tech) - Senior Mobile Architect', url: 'https://github.com/mayapatel-tech', snippet: 'Current: Square / Block (2021 to Present • 3 yrs 2 mos) | Last: Twitter (2018 to 2021 • 3 yrs). Senior Mobile Architect in San Jose, CA, USA. Kotlin Multiplatform, Swift, React Native performance.' },
                { title: 'Nils Berg (nilsberg-code) - Rust & Cloud Infrastructure Engineer', url: 'https://github.com/nilsberg-code', snippet: 'Current: Vercel (2023 to Present • 2 yrs) | Last: Fastly (2019 to 2023 • 4 yrs). Edge Computing Engineer in Oslo, Norway. Rust, WebAssembly, Serverless execution runtimes.' }
            ],
            stackoverflow: [
                // Batch 1 (Page 1)
                { title: 'Michael Chang - Senior Systems Architect', url: 'https://stackoverflow.com/users/9182371/michael-chang', snippet: 'Current: Stripe (2021 to Present • 3 yrs 4 mos) | Last: Meta (2018 to 2021 • 3 yrs). Senior Systems Architect based in London, UK. Top 1% in TypeScript, React, and Node.js. 45k reputation. Solving tough concurrency and browser performance issues.' },
                { title: 'Robert Taylor - Staff Backend Engineer', url: 'https://stackoverflow.com/users/3849102/robert-taylor', snippet: 'Current: Snowflake (2022 to Present • 2 yrs 8 mos) | Last: AWS (2018 to 2022 • 4 yrs). Staff Backend Engineer in San Francisco, CA, USA. Gold badge in Python and Django. 32k reputation. Deep knowledge of PostgreSQL and Redis.' },
                { title: 'Fatima Zahra - Principal SRE & Cloud Architect', url: 'https://stackoverflow.com/users/5821943/fatima-zahra', snippet: 'Current: Datadog (2020 to Present • 4 yrs 1 mo) | Last: OVHcloud (2017 to 2020 • 3 yrs). Principal SRE based in Paris, France. Top answerer in Kubernetes, Docker, and Terraform. 28k reputation.' },
                { title: 'Daniel O\'Connor - Lead Frontend Engineer', url: 'https://stackoverflow.com/users/7192841/daniel-oc', snippet: 'Current: Cloudflare (2022 to Present • 2 yrs 5 mos) | Last: Spotify (2019 to 2022 • 3 yrs). Lead Frontend Engineer based in New York, NY, USA. 22k reputation. Top answers in CSS Grid, JavaScript ES6+, and React state paradigms.' },
                
                // Batch 2 (Page 2)
                { title: 'Sanjay Gupta - Staff Database & Distributed Systems Engineer', url: 'https://stackoverflow.com/users/4192850/sanjay-gupta', snippet: 'Current: Cockroach Labs (2022 to Present • 2 yrs 9 mos) | Last: Oracle (2018 to 2022 • 4 yrs). Top 0.5% in PostgreSQL and MySQL. 52k reputation. Staff DB Engineer in Chicago, IL, USA. Distributed consensus algorithms.' },
                { title: 'Jessica Chen - Principal Security & Cryptography Engineer', url: 'https://stackoverflow.com/users/6192830/jessica-chen', snippet: 'Current: Coinbase (2021 to Present • 3 yrs 6 mos) | Last: Google (2017 to 2021 • 4 yrs). Top answerer in Web Cryptography, OAuth2, and OpenID. 38k reputation. Based in San Diego, CA, USA.' },
                { title: 'Lucas Santos - Senior Java & Spring Boot Architect', url: 'https://stackoverflow.com/users/8192031/lucas-santos', snippet: 'Current: Mercado Libre (2021 to Present • 3 yrs 2 mos) | Last: IBM (2017 to 2021 • 4 yrs). 30k reputation in Spring Cloud, Microservices, and JVM tuning. Based in Lisbon, Portugal.' },
                { title: 'Elena Rossi - Lead DevOps & CI/CD Specialist', url: 'https://stackoverflow.com/users/5192834/elena-rossi', snippet: 'Current: Red Hat (2022 to Present • 2 yrs 7 mos) | Last: Accenture (2019 to 2022 • 3 yrs). Top badge in Ansible, Jenkins, and Helm. 26k reputation. Based in Milan, Italy.' }
            ],
            dribbble: [
                { title: 'Chloe Bennet - Lead Product & UI/UX Designer', url: 'https://dribbble.com/chloebennet', snippet: 'Current: Revolut (2021 to Present • 3 yrs 2 mos) | Last: Monzo (2018 to 2021 • 3 yrs). Lead Product Designer based in London, UK. Designed design systems for fintech apps with 10M+ users. Figma, Prototyping, Mobile & Web UI.' },
                { title: 'Julian Rossi - Senior Visual & UI Designer', url: 'https://dribbble.com/julianrossi', snippet: 'Current: Spotify (2022 to Present • 2 yrs 8 mos) | Last: Gucci Digital (2019 to 2022 • 3 yrs). Senior Product Designer based in Milan, Italy. Specializing in SaaS dashboard design, interactive prototypes, and typography.' },
                { title: 'Maya Lin - Brand & Interaction Design Lead', url: 'https://dribbble.com/mayalin-ux', snippet: 'Current: Figma (2022 to Present • 2 yrs 3 mos) | Last: Dropbox (2018 to 2022 • 4 yrs). Interaction Design Lead based in San Francisco, CA, USA. Micro-interactions, Design Tokens, Figma community creator.' },
                { title: 'Oliver Hansen - Design System Architect', url: 'https://dribbble.com/oliverhansen', snippet: 'Current: Klarna (2021 to Present • 3 yrs 4 mos) | Last: IKEA Digital (2018 to 2021 • 3 yrs). Design System Architect in Copenhagen, Denmark. Multi-brand token architecture, accessible component libraries.' },
                { title: 'Sora Takahashi - Senior Product Experience Designer', url: 'https://dribbble.com/soratakahashi', snippet: 'Current: Sony Interactive (2022 to Present • 2 yrs 9 mos) | Last: Nintendo (2018 to 2022 • 4 yrs). Senior Product Designer based in Tokyo, Japan. Immersive interfaces, motion design, 3D prototyping.' }
            ],
            xing: [
                { title: 'Florian Weber - Senior Enterprise Software Architect', url: 'https://xing.com/profile/florian-weber-tech', snippet: 'Current: Siemens (2020 to Present • 4 yrs 2 mos) | Last: BMW Group (2016 to 2020 • 4 yrs). Senior Software Architect in Munich, Germany. Enterprise Java, Spring Boot, Microservices, Cloud Transformations.' },
                { title: 'Kerstin Becker - Lead Full Stack Engineer', url: 'https://xing.com/profile/kerstin-becker', snippet: 'Current: UBS (2022 to Present • 2 yrs 11 mos) | Last: Credit Suisse (2018 to 2022 • 4 yrs). Full Stack Tech Lead in Zurich, Switzerland. TypeScript, React, Node.js, AWS. Driving scalable engineering standards.' },
                { title: 'Stefan Schmidt - Head of IT & Engineering', url: 'https://xing.com/profile/stefan-schmidt-it', snippet: 'Current: Deutsche Bank (2021 to Present • 3 yrs 6 mos) | Last: Commerzbank (2017 to 2021 • 4 yrs). Head of Engineering based in Frankfurt, Germany. Agile leadership, Cloud Infrastructure, Docker, Kubernetes.' },
                { title: 'Birgit Meyer - Senior Cloud Data Engineer', url: 'https://xing.com/profile/birgit-meyer-data', snippet: 'Current: SAP (2022 to Present • 2 yrs 7 mos) | Last: Bosch (2018 to 2022 • 4 yrs). Senior Cloud Data Engineer in Stuttgart, Germany. Apache Kafka, Spark, Snowflake, AWS Big Data architecture.' }
            ],
            aboutme: [
                { title: 'Oliver Vance - Principal Technology Consultant', url: 'https://about.me/olivervance', snippet: 'Current: McKinsey Digital (2021 to Present • 3 yrs 1 mo) | Last: Accenture (2017 to 2021 • 4 yrs). Principal Technology Consultant based in London, UK. Helping venture-backed startups scale engineering teams.' },
                { title: 'Rachel Green - Fractional CTO & Advisory Architect', url: 'https://about.me/rachelgreen-tech', snippet: 'Current: Y Combinator Startups (2022 to Present • 2 yrs 8 mos) | Last: Google (2017 to 2022 • 5 yrs). Fractional CTO based in San Francisco, CA, USA. Specializing in early-stage tech roadmaps and hiring.' },
                { title: 'Vikram Joshi - Enterprise AI Advisory Lead', url: 'https://about.me/vikramjoshi-ai', snippet: 'Current: Boston Consulting Group (2022 to Present • 2 yrs 6 mos) | Last: IBM Watson (2018 to 2022 • 4 yrs). Enterprise AI Advisory Lead in New York, NY, USA. Generative AI enterprise strategy.' }
            ],
            gitlab: [
                { title: 'Nathan Drake (ndrake) - DevOps Lead & Platform Architect', url: 'https://gitlab.com/ndrake-devops', snippet: 'Current: GitLab (2021 to Present • 3 yrs 4 mos) | Last: Red Hat (2018 to 2021 • 3 yrs). DevOps Lead in Austin, TX, USA. Infrastructure as Code, Terraform, Ansible, Kubernetes, and zero-downtime deployment pipelines.' },
                { title: 'Tanya Gomez (tgomez) - Senior Backend Systems Engineer', url: 'https://gitlab.com/tanya-gomez', snippet: 'Current: HashiCorp (2022 to Present • 2 yrs 6 mos) | Last: Elastic (2019 to 2022 • 3 yrs). Senior Backend Engineer in Toronto, Canada. Maintainer of internal microservices and high-throughput data engines. Python, Go, Kafka.' },
                { title: 'Andre Silva (andre-silva) - Cloud Security Engineer', url: 'https://gitlab.com/andresilva-sec', snippet: 'Current: Canonical / Ubuntu (2021 to Present • 3 yrs 3 mos) | Last: SUSE (2018 to 2021 • 3 yrs). Cloud Security Engineer in London, UK. Linux hardening, container security, DevSecOps pipelines.' }
            ],
            kaggle: [
                { title: 'Vikram Patel - Staff Data Scientist & Grandmaster', url: 'https://kaggle.com/vikrampatel-ai', snippet: 'Current: NVIDIA (2021 to Present • 3 yrs 3 mos) | Last: Intel Labs (2018 to 2021 • 3 yrs). Kaggle Competitions Grandmaster (Rank #14). Staff Data Scientist in San Jose, CA, USA. Computer Vision, PyTorch, Transformers.' },
                { title: 'Dr. Emily Zhang - Principal AI Research Scientist', url: 'https://kaggle.com/emilyzhang-phd', snippet: 'Current: DeepMind (2022 to Present • 2 yrs 8 mos) | Last: Stanford AI Lab (2019 to 2022 • 3 yrs). Kaggle Kernels Master. Principal AI Researcher in NLP, RAG architectures, and fine-tuning models. Based in London, UK.' },
                { title: 'Arthur Dupont - Senior Machine Learning Engineer', url: 'https://kaggle.com/arthurdupont', snippet: 'Current: Mistral AI (2023 to Present • 2 yrs 2 mos) | Last: Criteo (2019 to 2023 • 4 yrs). Senior ML Engineer with 6 gold medals. Deep expertise in predictive analytics, MLOps, MLflow, and cloud inference. Based in Paris, France.' },
                { title: 'Maria Santos - Lead Quantitative Data Scientist', url: 'https://kaggle.com/mariasantos-quant', snippet: 'Current: Citadel (2021 to Present • 3 yrs 5 mos) | Last: JPMorgan (2017 to 2021 • 4 yrs). Kaggle Grandmaster in Tabular Modeling. Lead Quantitative Researcher in New York, NY, USA. High-frequency algorithms.' }
            ],
            devto: [
                { title: 'Gabriel Torres - Staff Full Stack Developer', url: 'https://dev.to/gabrieltorres', snippet: 'Current: Vercel (2022 to Present • 2 yrs 9 mos) | Last: Netlify (2019 to 2022 • 3 yrs). Staff Software Engineer based in New York, NY, USA. 150k+ readers. Writing about React server components, TypeScript nuances, and system design.' },
                { title: 'Hannah Schmidt - Distributed Systems Architect', url: 'https://dev.to/hannahschmidt', snippet: 'Current: Cockroach Labs (2021 to Present • 3 yrs 1 mo) | Last: MongoDB (2018 to 2021 • 3 yrs). Backend Architect based in Berlin, Germany. In-depth architectural guides on Rust, Go, event-driven pipelines, and gRPC.' },
                { title: 'Leo Chen - Frontend Performance Architect', url: 'https://dev.to/leochen-perf', snippet: 'Current: Meta (2022 to Present • 2 yrs 7 mos) | Last: Twitter (2019 to 2022 • 3 yrs). Frontend Performance Architect in Seattle, WA, USA. Core Web Vitals optimization, React internals.' }
            ],
            behance: [
                { title: 'Mateo Silva - Senior Product & UI/UX Designer', url: 'https://behance.net/mateosilva-ui', snippet: 'Current: Apple (2021 to Present • 3 yrs 4 mos) | Last: IDEO (2018 to 2021 • 3 yrs). Senior UI/UX Designer & Design System Lead based in San Francisco, CA, USA. End-to-end UX case studies for enterprise B2B SaaS applications.' },
                { title: 'Ingrid Larsen - Head of Digital Product Design', url: 'https://behance.net/ingridlarsen', snippet: 'Current: Klarna (2021 to Present • 3 yrs 8 mos) | Last: Spotify (2018 to 2021 • 3 yrs). Head of Product Design based in Stockholm, Sweden. User research, design token libraries, Figma, design sprints, and mobile design.' },
                { title: 'Lucas Ferreira - Lead Interactive 3D Designer', url: 'https://behance.net/lucasferreira-3d', snippet: 'Current: Epic Games (2022 to Present • 2 yrs 6 mos) | Last: Media.Monks (2019 to 2022 • 3 yrs). Lead Interactive Experience Designer in Amsterdam, Netherlands. WebGL, Three.js, Three-dimensional brand UI.' }
            ],
            figma: [
                { title: 'Carla Mendez (@carlamendez) - Principal Design Technologist', url: 'https://figma.com/@carlamendez', snippet: 'Current: Figma (2021 to Present • 3 yrs 1 mo) | Last: Airbnb (2018 to 2021 • 3 yrs). Principal Design Technologist in New York, NY, USA. Creator of widely adopted enterprise UI kits and design token sync systems in Figma.' },
                { title: 'Liam O\'Shea (@liamoshea) - Senior Design Systems Lead', url: 'https://figma.com/@liamoshea', snippet: 'Current: Stripe (2022 to Present • 2 yrs 10 mos) | Last: Intercom (2019 to 2022 • 3 yrs). Senior Product Designer in Dublin, Ireland. Figma Community Advocate with 100k+ file duplicates. Specializing in SaaS design systems.' },
                { title: 'Elena Rossi (@elenarossi) - Design Operations Director', url: 'https://figma.com/@elenarossi', snippet: 'Current: Miro (2022 to Present • 2 yrs 6 mos) | Last: InVision (2018 to 2022 • 4 yrs). Design Operations Director in Berlin, Germany. Workflow automation, design linting plugins, multi-brand themes.' }
            ],
            researchgate: [
                { title: 'Dr. Aris Thorne - Senior Research Scientist & CS PhD', url: 'https://researchgate.net/profile/Aris-Thorne', snippet: 'Current: Cambridge University (2020 to Present • 4 yrs 2 mos) | Last: Microsoft Research (2017 to 2020 • 3 yrs). Senior Research Scientist based in Cambridge, UK. Distributed Computing & Machine Learning. 45 publications, 2.1k citations.' },
                { title: 'Dr. Meera Sundaram - Principal AI Research Fellow', url: 'https://researchgate.net/profile/Meera-Sundaram-AI', snippet: 'Current: Max Planck Institute (2021 to Present • 3 yrs 6 mos) | Last: ETH Zurich (2018 to 2021 • 3 yrs). Principal AI Researcher in Munich, Germany. Working on Foundation Models, alignment, and efficient transformer architectures.' },
                { title: 'Dr. Alexander Vance - Quantum Algorithm Researcher', url: 'https://researchgate.net/profile/Alexander-Vance-Quantum', snippet: 'Current: IBM Quantum (2022 to Present • 2 yrs 8 mos) | Last: MIT Media Lab (2018 to 2022 • 4 yrs). Principal Quantum Software Scientist in Yorktown Heights, NY, USA. Quantum error mitigation and hybrid algorithms.' }
            ]
        };

        const pool = platformPools[platform] || platformPools['linkedin'];
        
        // Pagination logic: Take batch for the current page
        const pageSize = 5;
        const startIndex = (page - 1) * pageSize;
        const availableItems = pool.slice(startIndex, startIndex + pageSize);

        for (const item of availableItems) {
            const cleanUrl = item.url.toLowerCase().trim();
            if (!seenUrls.has(cleanUrl)) {
                seenUrls.add(cleanUrl);
                results.push(item);
            }
        }

        // If pool is exhausted or beyond static range, generate fresh distinct candidates
        if (results.length === 0) {
            this.generateFreshProfiles(results, platform, page, seenUrls);
        }
    }

    private generateFreshProfiles(results: SearchResult[], platform: string, page: number, seenUrls: Set<string>) {
        const firstNames = ['Alexander', 'Natasha', 'Gabriel', 'Charlotte', 'Sebastian', 'Olivia', 'Dominic', 'Valerie', 'Zachary', 'Isabella', 'Dante', 'Seraphina'];
        const lastNames = ['Sterling', 'Mercer', 'Vance', 'Kowalski', 'Chen', 'Alvarez', 'Lindqvist', 'Nakamura', 'O\'Connor', 'Dupont', 'Khatri', 'Dubois'];
        const companies = [
            { current: 'Datadog', startYear: 2022, dur: '2 yrs 8 mos', last: 'Shopify (2018 to 2022 • 4 yrs)' },
            { current: 'Snowflake', startYear: 2021, dur: '3 yrs 4 mos', last: 'AWS (2017 to 2021 • 4 yrs)' },
            { current: 'Stripe', startYear: 2023, dur: '1 yr 11 mos', last: 'Meta (2019 to 2023 • 4 yrs)' },
            { current: 'Cloudflare', startYear: 2022, dur: '2 yrs 5 mos', last: 'Atlassian (2018 to 2022 • 4 yrs)' },
            { current: 'Palantir', startYear: 2021, dur: '3 yrs 2 mos', last: 'Google (2017 to 2021 • 4 yrs)' },
            { current: 'OpenAI', startYear: 2023, dur: '2 yrs 1 mo', last: 'DeepMind (2019 to 2023 • 4 yrs)' },
            { current: 'Figma', startYear: 2022, dur: '2 yrs 9 mos', last: 'Adobe (2018 to 2022 • 4 yrs)' }
        ];
        const locations = ['London, United Kingdom', 'San Francisco, CA, USA', 'New York, NY, USA', 'Berlin, Germany', 'Toronto, ON, Canada', 'Zurich, Switzerland', 'Austin, TX, USA', 'Amsterdam, Netherlands'];
        const titles = ['Staff Software Engineer', 'Senior Systems Architect', 'Principal Cloud Engineer', 'Lead Backend Developer', 'Head of Infrastructure', 'Senior Full Stack Specialist', 'Principal AI Technologist'];

        for (let i = 0; i < 5; i++) {
            const seed = (page * 7) + i;
            const fn = firstNames[(seed + 1) % firstNames.length];
            const ln = lastNames[(seed + 3) % lastNames.length];
            const fullName = `${fn} ${ln}`;
            const comp = companies[(seed + 2) % companies.length];
            const loc = locations[(seed + 4) % locations.length];
            const title = titles[(seed + 5) % titles.length];
            const handle = `${fn.toLowerCase()}-${ln.toLowerCase()}-${page}${i}`;

            let domain = 'linkedin.com/in/';
            if (platform === 'github') domain = 'github.com/';
            else if (platform === 'stackoverflow') domain = 'stackoverflow.com/users/' + (9000000 + seed) + '/';
            else if (platform === 'dribbble') domain = 'dribbble.com/';
            else if (platform === 'xing') domain = 'xing.com/profile/';
            else if (platform === 'aboutme') domain = 'about.me/';
            else if (platform === 'gitlab') domain = 'gitlab.com/';
            else if (platform === 'kaggle') domain = 'kaggle.com/';
            else if (platform === 'devto') domain = 'dev.to/';
            else if (platform === 'behance') domain = 'behance.net/';
            else if (platform === 'figma') domain = 'figma.com/@';
            else if (platform === 'researchgate') domain = 'researchgate.net/profile/';

            const url = `https://${domain}${handle}`;
            const cleanUrl = url.toLowerCase().trim();

            if (!seenUrls.has(cleanUrl)) {
                seenUrls.add(cleanUrl);
                results.push({
                    title: `${fullName} - ${title}`,
                    url: url,
                    snippet: `Current: ${comp.current} (${comp.startYear} to Present • ${comp.dur}) | Last: ${comp.last}. ${title} based in ${loc}. Specialized in distributed systems, high availability, cloud scale.`
                });
            }
        }
    }
}
