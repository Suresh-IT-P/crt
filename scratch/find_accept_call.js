const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/driver.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('/api/bookings/accept') || line.includes('bookings/accept')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
