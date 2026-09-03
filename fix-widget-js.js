const fs = require('fs');
let content = fs.readFileSync('public/driver.html', 'utf8');
content = content.replace(/document\.getElementById\('ride-stats-floating'\)\.classList/g, "document.getElementById('ride-stats-floating')?.classList");
fs.writeFileSync('public/driver.html', content, 'utf8');
console.log('Fixed JS null references to floating widget');
