import fs from 'fs';

const content = fs.readFileSync('src/server/index.ts', 'utf8');
const lines = content.split('\n');

const routes = [];
const regex = /app\.(get|post|put|delete|patch)\(\s*(\[[^\]]+\]|'[^']+'|"[^"]+")/g;

let match;
while ((match = regex.exec(content)) !== null) {
    routes.push({
        method: match[1].toUpperCase(),
        path: match[2].replace(/'|"/g, '')
    });
}

console.log(`Total Endpoints found: ${routes.length}`);
const methodCounts = {};
routes.forEach(r => {
    methodCounts[r.method] = (methodCounts[r.method] || 0) + 1;
});
console.log('Method counts:', methodCounts);

fs.writeFileSync('qa_suite/discovered_routes.json', JSON.stringify(routes, null, 2));
console.log('Saved to qa_suite/discovered_routes.json');
