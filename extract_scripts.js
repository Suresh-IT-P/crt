const fs = require('fs');
const content = fs.readFileSync('public/admin.html', 'utf8');
const scriptRegex = /<script.*?>([\s\S]*?)<\/script>/gi;
let match;
let i = 0;
while ((match = scriptRegex.exec(content)) !== null) {
    fs.writeFileSync(`temp_script_${i}.js`, match[1]);
    console.log(`Wrote script ${i} to temp_script_${i}.js`);
    i++;
}
