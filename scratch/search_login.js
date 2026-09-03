const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/driver-login.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('cityride_pilot') || line.includes('localStorage.setItem')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
