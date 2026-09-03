const fs = require('fs');
const p = 'g:/cityridetaxis-main/cityridetaxis-main/public/admin_commissions.js';
let data = fs.readFileSync(p, 'utf8');
data = data.replace(/\\`/g, '`');
fs.writeFileSync(p, data);
console.log('Fixed backticks.');
