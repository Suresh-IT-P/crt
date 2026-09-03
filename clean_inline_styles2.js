const fs = require('fs');

const path = 'public/admin.html';
let html = fs.readFileSync(path, 'utf8');

// The multi-line replace for remaining input/select styles
html = html.replace(/style="background:\s*rgba\(255,255,255,0\.1\);\s*border-color:\s*rgba\(255,255,255,0\.1\);\s*color:\s*white;[^"]*"/g, '');

// Also fix the hardcoded "color: rgba(255,255,255,0.7);" if any still exist
html = html.replace(/style="color:\s*rgba\(255,255,255,0\.7\);"/g, 'style="color: var(--text-muted);"');

// Write back
fs.writeFileSync(path, html);
console.log("Successfully cleaned up remaining inline styles");
