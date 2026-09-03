const fs = require('fs');
const cp1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function recoverWindows1252(text) {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        const cp = text.charCodeAt(i);
        if (cp1252[cp] !== undefined) bytes[i] = cp1252[cp];
        else if (cp <= 0xFF) bytes[i] = cp;
        else bytes[i] = cp & 0xFF;
    }
    return Buffer.from(bytes).toString('utf8');
}

['public/app.js', 'public/driver.html', 'server.js'].forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    // Check if it's currently at the single-mojibake level
    if (content.includes('â‚¹') || content.includes('â€”')) {
        console.log('Fixing second layer', f);
        const fixed = recoverWindows1252(content);
        fs.writeFileSync(f, fixed, 'utf8');
    }
});
