# Scaling RecruitGO: Zero-Cost Multi-Tenant Desktop Architecture

Transitioning RecruitGO from a single-user prototype to a platform capable of supporting an agency with **10+ Account Managers and 50+ Recruiters**—while maintaining it as a local desktop app with **zero API costs**—requires a hybrid architectural approach. 

Here is the strategic blueprint for how we can build this.

## 1. The Distributed Scraping Advantage (Zero SERP Cost)
If 60 people use a centralized cloud app to scrape LinkedIn or DuckDuckGo, that single server IP will be instantly banned, forcing you to buy expensive Rotating Residential Proxies ($500+/mo). 

**The Desktop Solution:** By deploying RecruitGO as a local desktop app (via Electron or Tauri), the scraping load is distributed across **60 different computers and 60 different IP addresses**. 
* **Mechanism:** The desktop app runs a hidden, bundled Chromium instance (Puppeteer/Playwright) natively on the recruiter's machine. 
* **Benefit:** You completely bypass the need for enterprise SERP APIs or proxy networks. Each recruiter's machine naturally scrapes at a human scale, utilizing their own local network.

## 2. Local AI Extraction (Zero OpenAI Cost)
Parsing hundreds of candidate profiles and generating personalized approach notes via OpenAI or Claude would rapidly accumulate API costs across 60 users.
* **Mechanism:** Integrate **Ollama** natively into the desktop deployment. Ollama can run powerful, highly-quantized models like `Llama 3 (8B)` or `Phi-3` directly on the recruiters' local CPU/GPU.
* **Benefit:** Limitless parsing, boolean generation, and email writing for absolutely $0. The "AI Brain" lives inside the recruiter's laptop.

## 3. Handling Multi-Tenancy & Shared Data (The "Hub and Spoke" Model)
Since 10 Account Managers and 50 Recruiters need to collaborate (e.g., AMs posting jobs, Recruiters filling them), you cannot rely solely on the local SQLite database. They need a shared state, but you don't want expensive cloud infrastructure.

**Recommended Approach: "Thin Cloud, Thick Client"**
* **Thick Client (RecruitGO Desktop App):** All the heavy, expensive work (AI processing, web scraping, email drafting, boolean logic) happens on the local desktop app.
* **Thin Cloud (Supabase / Postgres):** You use a lightweight, central database to synchronize the state. When an AM creates a job, it syncs to the central DB. When a Recruiter sources a candidate, the local app pushes the extracted JSON to the central DB.
* **Cost:** You can self-host a Postgres database on a $5/month DigitalOcean droplet, or use Supabase's generous free-tier. Because the database only handles small JSON text objects (and no AI or scraping), the server costs are practically zero.

## 4. Anti-Scraping & Blocking Prevention
Since the app operates locally, you must protect the recruiters' personal LinkedIn accounts from being restricted.
* **Human Emulation:** The local desktop scraper must use random delays (3-7 seconds) between page loads. 
* **DOM Injection:** Instead of aggressively querying the server, the app can inject a "RecruitGO sidebar" directly into the recruiter's Chrome browser via a local extension. This allows the recruiter to browse LinkedIn naturally while the extension silently extracts the data to the local ATS.

---

### Suggested Tech Stack for the Agency Rollout
1. **App Wrapper:** **Tauri** (Lighter and faster than Electron, uses less RAM so the local AI has more breathing room).
2. **Frontend:** React + TailwindCSS (Migrating from the current monolith HTML for better component management).
3. **Local Logic / Automation:** Node.js + Playwright (for stealth scraping).
4. **Local AI:** Ollama (Llama3-8B).
5. **Multi-Tenant Sync DB:** Supabase (Self-hosted or managed) to connect the 60 users together seamlessly.
