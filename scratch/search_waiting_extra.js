const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/driver.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('active-waiting-charge') || line.toLowerCase().includes('waiting extra') || line.toLowerCase().includes('waiting_extra')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
