const mysql = require('mysql2/promise');
require('dotenv').config();

const passwords = [
    process.env.DB_PASSWORD,
    'qMztTysXDlOuoFajSOGFkiiMEmWfjVZU',
    'CMbpSXGtDQDebiBQvXUBKHWLhAOuBwLi',
    'tADfuzVOcchhMLhmgPFuyykiwuzwJAYv',
    'OsCrBsQQPvrhtgXtgSisFeudOJhodvLj'
].filter(Boolean);

async function testConnections() {
    const host = process.env.DB_HOST || 'tokaido.proxy.rlwy.net';
    const port = parseInt(process.env.DB_PORT) || 14964;
    const user = process.env.DB_USER || 'root';

    console.log(`Testing connection to ${host}:${port} as ${user}...`);

    for (const pass of passwords) {
        console.log(`Trying password: ${pass.substring(0, 5)}...`);
        try {
            const conn = await mysql.createConnection({
                host,
                port,
                user,
                password: pass,
                connectTimeout: 5000
            });
            console.log(`SUCCESS! Password works: ${pass}`);
            await conn.end();
            return pass;
        } catch (err) {
            console.log(`FAILED with ${pass.substring(0, 5)}... -> ${err.code || err.message}`);
        }
    }
    console.log('All passwords failed.');
}

testConnections();
