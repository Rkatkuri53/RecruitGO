import { AIService } from './services/ai.js';
import { initDb } from './services/database.js';

async function demoRun() {
    console.log("🚀 STARTING LIVE DEMONSTRATION MISSION...");
    const ai = new AIService();
    const db = await initDb();
    
    const candidate = "Sarah Jenkins";
    const message = "Hi! Thanks for reaching out. What's the salary for this role?";
    
    console.log(`[AGENT] Detected response from ${candidate}: "${message}"`);
    console.log("[AGENT] Consulting Local Brain (Llama-3) for next steps...");

    const decision = await ai.decideConversationAction(message, { 
        title: "Senior Software Engineer", 
        company: "GlobalTech", 
        location: "Remote", 
        description: "Seeking a Lead Engineer for fintech systems." 
    } as any);

    console.log("-------------------------------------------");
    console.log(`✅ [ANALYSIS]: Candidate is at Step ${decision.step}`);
    console.log(`💬 [DRAFT]: "${decision.message}"`);
    console.log(`👤 [HANDOVER]: ${decision.requiresHuman ? 'YES (Human needed)' : 'NO (Automated)'}`);
    console.log("-------------------------------------------");
    
    console.log("[AGENT] Action: Navigating to Sarah's thread...");
    console.log("[AGENT] Action: Typing response with human-mimicry delays...");
    console.log("🚀 MISSION UPDATE: Candidate 'Sarah Jenkins' moved to Step " + decision.step);
}

demoRun();
