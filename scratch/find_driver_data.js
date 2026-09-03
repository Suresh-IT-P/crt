const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/driver.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('driverData =') || line.includes('driverData=')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
