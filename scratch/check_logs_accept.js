const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server.log');
if (!fs.existsSync(filePath)) {
    console.log('server.log does not exist');
    process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Accept logs in server.log:');
lines.forEach((line) => {
    if (line.includes('/api/bookings/accept')) {
        console.log(line);
    }
});
