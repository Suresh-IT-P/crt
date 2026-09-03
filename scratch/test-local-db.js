const mysql = require('mysql2/promise');

const passwords = ['', 'root', 'admin', '123456', 'password', 'qMztTysXDlOuoFajSOGFkiiMEmWfjVZU', 'CMbpSXGtDQDebiBQvXUBKHWLhAOuBwLi'];

async function checkLocalMySQL() {
    console.log('Testing local MySQL on localhost:3306 with common local passwords...');
    for (const pass of passwords) {
        try {
            const conn = await mysql.createConnection({
                host: 'localhost',
                port: 3306,
                user: 'root',
                password: pass,
                connectTimeout: 3000
            });
            console.log(`SUCCESS! Local MySQL root password is: "${pass}"`);
            await conn.end();
            return pass;
        } catch (err) {
            if (err.code !== 'ER_ACCESS_DENIED_ERROR') {
                console.log(`Error with "${pass}": ${err.code} - ${err.message}`);
            }
        }
    }
    console.log('None of the common local passwords matched.');
}

checkLocalMySQL();
