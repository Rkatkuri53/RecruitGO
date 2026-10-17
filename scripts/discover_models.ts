import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

async function discover() {
    console.log('--- Google AI Model Discovery ---');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    
    try {
        // We'll use the fetch API directly to list models since the SDK hides the raw response
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        if (data.models) {
            console.log('✅ Models Found! You have access to:');
            data.models.forEach((m: any) => console.log(` - ${m.name}`));
        } else {
            console.log('❌ No models returned. This usually means the "Generative Language API" is disabled in your Google Cloud Console.');
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (e: any) {
        console.log('Critical Error:', e.message);
    }
}

discover();
