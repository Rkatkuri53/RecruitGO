# RecruitGO - Next-Gen AI Recruitment & Autonomous ATS Platform

> Built for the **Google AI Builder Cup**  
> Powered by **Google Gemini AI** & **Google Cloud Run**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Google%20Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://recruitgo-422436871792.asia-southeast1.run.app)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini%201.5-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## 🌟 Overview

**RecruitGO** is an enterprise-grade AI-powered Recruitment and Applicant Tracking System (ATS) engineered to transform how recruitment agencies source, screen, validate, and place talent. 

By leveraging **Google Gemini 1.5**, RecruitGO automates end-to-end recruitment workflows: from parsing multi-format job descriptions into structured Boolean matrices across 8 developer and talent platforms, to automated resume parsing, candidate scoring, and multi-role provenance approvals.

---

## 🚀 Live Cloud Deployment

- **Live URL**: [https://recruitgo-422436871792.asia-southeast1.run.app](https://recruitgo-422436871792.asia-southeast1.run.app)
- **Deployment**: Google Cloud Run (`asia-southeast1`)
- **Container**: Fully automated Docker multi-stage build

### 1-Click Role Profiles for Demo:
To test different organizational perspectives, click any profile on the login screen:
- **Recruiter**: `recruiter@myrecruiter.com` / `recruiter123`
- **Team Lead**: `teamlead@myrecruiter.com` / `teamlead123`
- **Account Manager**: `am@myrecruiter.com` / `am123`
- **Management / Admin**: `admin@myrecruiter.com` / `admin123`

---

## 🧠 Powered by Google Gemini AI

1. **3-Tier Multi-Platform Boolean Search Matrix**:
   - Generates precision Boolean search queries optimized across 8 platforms:
     - LinkedIn (Level 1 Strict, Level 2 Balanced, Level 3 High-Yield Open-to-Work)
     - Google X-Ray Search
     - GitHub Developer Profiles
     - StackOverflow Technical Talent
     - Xing, ResearchGate, Dribbble, Medium
2. **AI Candidate Scoring & Semantic Match**:
   - Compares candidate resumes against job requisitions using semantic similarity and vector scoring.
3. **Automated Resume Ingestion**:
   - Parses incoming resumes from email or file uploads, extracting contact info, work history, skills, and experience details.
4. **Autonomous AI Content Generation**:
   - Creates personalized InMail outreach messages, candidate screening notes, and client submittal briefs.

---

## 🏗️ Architecture

```
[ User Browser ]
       │
       ▼ (HTTPS Web & REST API)
[ Google Cloud Run ] (Express API + Web UI + Embedded High-Performance Storage)
       │
       ▼ (Gemini 1.5 Flash / Pro API)
[ Google AI Studio / Gemini API ]
```

- **Stateless & Scalable**: Cloud Run auto-scales compute on-demand.
- **Pure Google Stack**: 100% self-contained on Google Cloud Run with Google Gemini AI. Zero external third-party database dependencies.

---

## 💻 Local Setup & Development

### Prerequisites
- Node.js (v20+ recommended)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Rkatkuri53/RecruitGO.git
   cd RecruitGO
   ```

2. **Install dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and add your Gemini API Key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Build TypeScript**:
   ```bash
   npm run build
   ```

5. **Start the Application**:
   ```bash
   npm run dashboard
   ```
   Open [http://localhost:8745](http://localhost:8745) in your browser.

---

## 🔒 Security & Privacy

- **No Secrets Committed**: All API keys, passwords, and private credentials are excluded via `.gitignore`.
- **Candidate Data Privacy**: Candidate resume documents and local session caches are excluded from the repository.

---

## 📄 License
ISC License. Built for the Google AI Builder Cup.
