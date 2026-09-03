const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function dumpSchema() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [tables] = await connection.query('SHOW TABLES');
        const tableNameKey = `Tables_in_${process.env.DB_NAME}`;
        
        let schema = '';
        for (let row of tables) {
            const tableName = row[tableNameKey];
            const [createTable] = await connection.query(`SHOW CREATE TABLE ${tableName}`);
            schema += createTable[0]['Create Table'] + ';\n\n';
        }
        
        const fs = require('fs');
        fs.writeFileSync('schema.sql', schema);
        console.log('Schema dumped to schema.sql');
        await connection.end();
    } catch (err) {
        console.error(err);
    }
}
dumpSchema();
