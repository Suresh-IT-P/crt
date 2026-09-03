const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/driver.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let start = 0;
let end = 0;
lines.forEach((line, index) => {
    if (line.includes('id="waiting-timer-panel"')) {
        start = Math.max(1, index - 2);
        end = index + 25;
    }
});

if (start && end) {
    for (let i = start; i <= end; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
    }
} else {
    console.log('Panel not found');
}
