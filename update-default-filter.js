const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const targetStr = `} else {
            historyQuery += \` ORDER BY COALESCE(b.journey_end_time, b.created_at) DESC LIMIT 50\`; // Default view
        }`;

const replacementStr = `} else {
            historyQuery += \` AND DATE(COALESCE(b.journey_end_time, b.created_at)) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) ORDER BY COALESCE(b.journey_end_time, b.created_at) ASC\`; // Default view (last 7 days)
        }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync('server.js', content, 'utf8');
    console.log('Updated server.js default filter');
} else {
    console.log('Target string not found');
}
