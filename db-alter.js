require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const db = mysql.createPool({
        host: process.env.DB_HOST || 'altaria.proxy.rlwy.net',
        port: process.env.DB_PORT || 43053,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'E-Bcd146EeaFaDDe1fGg5EeEEcDBff54',
        database: process.env.DB_NAME || 'railway',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        console.log("Checking schema...");
        
        try {
            await db.query("ALTER TABLE taxi_commission_configs ADD COLUMN customer_commission_type VARCHAR(20) DEFAULT 'percentage'");
            console.log("Added customer_commission_type to taxi_commission_configs");
        } catch (e) {
            console.log("customer_commission_type might already exist:", e.message);
        }

        try {
            await db.query("ALTER TABLE taxi_commission_configs ADD COLUMN driver_commission_type VARCHAR(20) DEFAULT 'percentage'");
            console.log("Added driver_commission_type to taxi_commission_configs");
        } catch (e) {
            console.log("driver_commission_type might already exist:", e.message);
        }

        const fixedCols = [
            'customer_commission_fixed', 'driver_commission_fixed', 
            'total_commission_fixed', 'maintenance_fixed', 
            'association_fixed', 'cityride_fixed'
        ];
        for (const col of fixedCols) {
            try {
                await db.query(`ALTER TABLE taxi_commission_configs ADD COLUMN ${col} DECIMAL(10,2) DEFAULT 0`);
                console.log(`Added ${col} to taxi_commission_configs`);
            } catch (e) {
                console.log(`${col} might already exist:`, e.message);
            }
        }
        
        // Let's migrate existing commission_type to the new columns
        await db.query("UPDATE taxi_commission_configs SET customer_commission_type = commission_type, driver_commission_type = commission_type WHERE commission_type IS NOT NULL");
        console.log("Migrated existing commission types.");
        
        // Also update associations table
        try {
            await db.query("ALTER TABLE taxi_associations ADD COLUMN customer_commission_type VARCHAR(20) DEFAULT 'percentage'");
            console.log("Added customer_commission_type to taxi_associations");
        } catch (e) {
            console.log("customer_commission_type might already exist in associations:", e.message);
        }

        try {
            await db.query("ALTER TABLE taxi_associations ADD COLUMN driver_commission_type VARCHAR(20) DEFAULT 'percentage'");
            console.log("Added driver_commission_type to taxi_associations");
        } catch (e) {
            console.log("driver_commission_type might already exist in associations:", e.message);
        }
        
        await db.query("UPDATE taxi_associations SET customer_commission_type = commission_type, driver_commission_type = commission_type WHERE commission_type IS NOT NULL");
        
        console.log("Success!");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await db.end();
    }
}
run();
