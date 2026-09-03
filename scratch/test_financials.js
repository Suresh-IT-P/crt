const pricingEngine = require('../pricingEngine');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function runTests() {
    let db;
    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log("--- RUNNING FINANCIAL TESTS ---");

        // Test 1: Category Resolution
        const cat1 = await pricingEngine.resolveRideCategory(db, 99.9, 'local');
        console.log("99.9km resolved to:", cat1);
        if (cat1 !== 'local') throw new Error("Expected local");

        const cat2 = await pricingEngine.resolveRideCategory(db, 100.1, 'local');
        console.log("100.1km resolved to:", cat2);
        if (cat2 !== 'outstation' && cat2 !== 'oneway') throw new Error("Expected outstation/oneway");

        // Test 2: Local Fare calculation
        const localFare = await pricingEngine.calculateCanonicalFare(db, {
            distanceKm: 15,
            durationMins: 30,
            vehicleType: 'sedan',
            category: 'local',
            preRideWaitingCharge: 0
        });
        console.log("Local Fare (15km) calculation:", localFare);

        console.log("--- ALL TESTS PASSED ---");
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        if (db) await db.end();
    }
}

runTests();
