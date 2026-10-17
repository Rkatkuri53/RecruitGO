import fs from 'fs';

const html = fs.readFileSync('public/index.html', 'utf8');

// Find all elements with id ending in -view or class containing view
const viewIds = [];
const viewMatches = html.matchAll(/id="([^"]*view[^"]*)"/gi);
for (const m of viewMatches) {
    viewIds.push(m[1]);
}

// Find all modals
const modalIds = [];
const modalMatches = html.matchAll(/id="([^"]*modal[^"]*)"/gi);
for (const m of modalMatches) {
    modalIds.push(m[1]);
}

// Find all sidebar nav items
const navIds = [];
const navMatches = html.matchAll(/id="([^"]*nav-[^"]*)"/gi);
for (const m of navMatches) {
    navIds.push(m[1]);
}

// Find role selection options
const roleMatches = [...html.matchAll(/selectLocalRole\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

console.log('Views found:', [...new Set(viewIds)]);
console.log('Modals found:', [...new Set(modalIds)]);
console.log('Nav buttons found:', [...new Set(navIds)]);
console.log('Roles found:', [...new Set(roleMatches)]);

const inventory = {
    views: [...new Set(viewIds)],
    modals: [...new Set(modalIds)],
    nav_items: [...new Set(navIds)],
    roles: [...new Set(roleMatches)]
};

fs.writeFileSync('qa_suite/ui_inventory.json', JSON.stringify(inventory, null, 2));
