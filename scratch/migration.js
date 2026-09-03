const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function runMigration() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        console.log("Connected to DB, running migrations...");

        const sql = `
            CREATE TABLE IF NOT EXISTS taxi_commission_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version INT NOT NULL,
                customer_commission_percent DECIMAL(5,2) NOT NULL,
                driver_commission_percent DECIMAL(5,2) NOT NULL,
                total_commission_percent DECIMAL(5,2) NOT NULL,
                maintenance_percent DECIMAL(5,2) NOT NULL,
                association_percent DECIMAL(5,2) NOT NULL,
                cityride_percent DECIMAL(5,2) NOT NULL,
                effective_from DATETIME NOT NULL,
                effective_to DATETIME NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_by VARCHAR(100) DEFAULT 'system',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS taxi_tariff_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vehicle_type VARCHAR(50),
                category VARCHAR(50),
                config JSON,
                version INT NOT NULL,
                effective_from DATETIME NOT NULL,
                effective_to DATETIME NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_by VARCHAR(100) DEFAULT 'system',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS taxi_ride_pricing_snapshots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NOT NULL,
                distance_km DECIMAL(10,3) NOT NULL,
                ride_category VARCHAR(50) NOT NULL,
                vehicle_type VARCHAR(50) NOT NULL,
                tariff_version_id INT NULL,
                commission_version_id INT NULL,
                base_fare DECIMAL(10,2) DEFAULT 0,
                distance_charge DECIMAL(10,2) DEFAULT 0,
                peak_charge DECIMAL(10,2) DEFAULT 0,
                special_location_charge DECIMAL(10,2) DEFAULT 0,
                extra_drops_charge DECIMAL(10,2) DEFAULT 0,
                waiting_charge DECIMAL(10,2) DEFAULT 0,
                vendor_markup DECIMAL(10,2) DEFAULT 0,
                final_fare DECIMAL(10,2) NOT NULL,
                customer_commission_pct DECIMAL(5,2) DEFAULT 0,
                driver_commission_pct DECIMAL(5,2) DEFAULT 0,
                maintenance_pct DECIMAL(5,2) DEFAULT 0,
                association_pct DECIMAL(5,2) DEFAULT 0,
                cityride_pct DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY idx_snapshot_booking (booking_id)
            );

            CREATE TABLE IF NOT EXISTS taxi_financial_ledger (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NOT NULL,
                transaction_type VARCHAR(50) NOT NULL, 
                amount DECIMAL(10,2) NOT NULL,
                reference_version_id INT NULL,
                status VARCHAR(20) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY idx_ledger_booking_type (booking_id, transaction_type)
            );

            CREATE TABLE IF NOT EXISTS taxi_audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id VARCHAR(100) NULL,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(100) NOT NULL,
                entity_id VARCHAR(100) NULL,
                old_value JSON NULL,
                new_value JSON NULL,
                remark TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        await connection.query(sql);
        console.log("Tables created successfully.");

        // Insert default commission if not exists
        const [commissions] = await connection.query("SELECT * FROM taxi_commission_configs WHERE status='active'");
        if (commissions.length === 0) {
            await connection.query(`
                INSERT INTO taxi_commission_configs 
                (version, customer_commission_percent, driver_commission_percent, total_commission_percent, maintenance_percent, association_percent, cityride_percent, effective_from) 
                VALUES (1, 3.00, 9.00, 12.00, 5.00, 3.50, 3.50, NOW())
            `);
            console.log("Inserted default commission config.");
        }

        // Insert default settings
        const settings = [
            { key: 'classification_mode', val: 'AUTOMATIC' },
            { key: 'local_enabled', val: 'true' },
            { key: 'outstation_enabled', val: 'true' },
            { key: 'local_threshold_km', val: '100' }
        ];

        for (const s of settings) {
            await connection.query(`
                INSERT INTO taxi_settings (setting_key, setting_value) 
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            `, [s.key, s.val]);
        }
        console.log("Inserted default settings.");
        
        console.log("Migration complete.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        if (connection) await connection.end();
    }
}

runMigration();
