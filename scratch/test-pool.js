const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log(`Connecting to Railway proxy at ${process.env.DB_HOST}:${process.env.DB_PORT} as ${process.env.DB_USER}...`);
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            connectTimeout: 10000
        });
        const [rows] = await pool.query('SELECT 1 + 1 AS solution');
        console.log('🎉 SUCCESS! Connected to Railway MySQL database! Test result:', rows[0].solution);
        await pool.end();
    } catch (err) {
        console.error('Connection error:', err.message || err);
    }
}

testConnection();
