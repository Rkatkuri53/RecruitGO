import * as fs from 'fs';
import * as path from 'path';

let cachedKnowledgeBase: string | null = null;
let lastLoadTime = 0;
const CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute so we can pick up new files without restarting

export function getAiKnowledgeBase(): string {
    const now = Date.now();
    if (cachedKnowledgeBase !== null && (now - lastLoadTime) < CACHE_TTL_MS) {
        return cachedKnowledgeBase;
    }

    const refDir = path.join(process.cwd(), 'data', 'ai_references');
    
    // Ensure directory exists
    if (!fs.existsSync(refDir)) {
        try {
            fs.mkdirSync(refDir, { recursive: true });
        } catch (e) {
            console.error('[KNOWLEDGE BASE] Failed to create ai_references directory', e);
            return '';
        }
    }

    let combinedText = '';

    try {
        const files = fs.readdirSync(refDir);
        for (const file of files) {
            if (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')) {
                const filePath = path.join(refDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                combinedText += `\n--- REFERENCE FROM ${file} ---\n${content.trim()}\n`;
            }
        }
    } catch (e) {
        console.error('[KNOWLEDGE BASE] Error reading ai_references directory:', e);
    }

    cachedKnowledgeBase = combinedText.trim();
    lastLoadTime = now;
    
    return cachedKnowledgeBase;
}
