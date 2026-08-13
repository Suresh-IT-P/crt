const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const db = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'cityride'
    });

    try {
        await db.query(`UPDATE taxi_bookings SET status = 'completed' WHERE status NOT IN ('completed', 'cancelled')`);
        console.log('All active rides have been marked as completed.');
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

run();
