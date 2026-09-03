const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    let host = process.env.DB_HOST || 'localhost';
    let port = process.env.DB_PORT || 3306;
    let user = process.env.DB_USER || 'root';
    let password = process.env.DB_PASSWORD || '';
    let database = process.env.DB_NAME || 'railway';

    const conn = await mysql.createConnection({
        host, port, user, password, database
    });

    const [rows] = await conn.query('SELECT * FROM taxi_tariffs');
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
}

run().catch(console.error);
