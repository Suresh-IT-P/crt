const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
['index.html', 'dashboard.html', 'vendor.html', 'admin.html'].forEach(file => {
    const filePath = path.join(publicDir, file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            if (line.includes('/api/auth/session') || line.includes('localStorage.getItem')) {
                console.log(`${file}:${index + 1}: ${line.trim()}`);
            }
        });
    }
});
