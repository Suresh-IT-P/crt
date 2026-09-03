const fs = require('fs');

const path = 'public/admin.html';
let html = fs.readFileSync(path, 'utf8');

if (!html.includes('admin_commissions.js')) {
    html = html.replace('</body>', '<script src="admin_commissions.js"></script>\n</body>');
    fs.writeFileSync(path, html);
    console.log("Injected admin_commissions.js into admin.html");
} else {
    console.log("Already injected.");
}
