import fs from 'fs';

const content = fs.readFileSync('src/server/index.ts', 'utf8');
const lines = content.split('\n');

const block1 = lines.slice(524, 956).join('\n');
const block2 = lines.slice(957, 1389).join('\n');

console.log('Block 1 length:', block1.length, 'Block 2 length:', block2.length);
if (block1 === block2) {
    console.log('BLOCKS ARE 100% IDENTICAL DUPLICATES!');
} else {
    console.log('Blocks differ. Let us check differences:');
    // Compare routes
    const r1 = [];
    const r2 = [];
    const reg = /app\.(get|post|put|delete)\('([^']+)'/g;
    let m;
    while (m = reg.exec(block1)) r1.push(`${m[1]} ${m[2]}`);
    while (m = reg.exec(block2)) r2.push(`${m[1]} ${m[2]}`);
    console.log('Block 1 routes:', r1);
    console.log('Block 2 routes:', r2);
}
