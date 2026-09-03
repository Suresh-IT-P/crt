const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/driver.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Searching for waiting timer references in driver.html:');
lines.forEach((line, index) => {
    if (line.includes('waitingTimerInterval') || line.includes('Allowed') || line.includes('W. Charge') || line.includes('startWaitingTimer') || line.includes('stopWaitingTimer')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
