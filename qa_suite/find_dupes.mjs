import fs from 'fs';

const content = fs.readFileSync('src/server/index.ts', 'utf8');
const lines = content.split('\n');

const routes = [];
const regex = /app\.(get|post|put|delete|patch)\(\s*(\[[^\]]+\]|'[^']+'|"[^"]+")/g;

lines.forEach((line, idx) => {
    let match;
    const lineRegex = /app\.(get|post|put|delete|patch)\(\s*(\[[^\]]+\]|'[^']+'|"[^"]+")/g;
    while ((match = lineRegex.exec(line)) !== null) {
        routes.push({
            line: idx + 1,
            method: match[1].toUpperCase(),
            path: match[2].replace(/'|"/g, '')
        });
    }
});

const groups = {};
routes.forEach(r => {
    const key = `${r.method} ${r.path}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r.line);
});

console.log('--- DUPLICATE ROUTES AND LINE NUMBERS ---');
for (const [k, v] of Object.entries(groups)) {
    if (v.length > 1) {
        console.log(`${k} -> Lines: ${v.join(', ')}`);
    }
}
