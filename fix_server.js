const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const broken = `            LEFT JOIN passengers u ON b.user_id = u.id 
        const [rows] = await db.query(sql, [req.params.driverId]);`;

const fixed = `            LEFT JOIN passengers u ON b.user_id = u.id 
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            WHERE b.driver_id = ? AND b.status IN ("assigned", "ongoing", "finished", "completed", "cancel_requested")
            ORDER BY b.created_at DESC
        \`;
        const [rows] = await db.query(sql, [req.params.driverId]);`;

// normalize
const codeN = code.replace(/\r\n/g, '\n');
const brokenN = broken.replace(/\r\n/g, '\n');
const fixedN = fixed.replace(/\r\n/g, '\n');

if (codeN.includes(brokenN)) {
    fs.writeFileSync('server.js', codeN.replace(brokenN, fixedN));
    console.log('Fixed syntax error!');
} else {
    console.log('Target not found.');
}
