// commissionEngine.js - Handles Financial Settlements, Ledgers, and Snapshots

async function settleRideFinancials(db, {
    bookingId,
    distanceKm,
    category,
    vehicleType,
    baseKmFare,
    waitingCharge,
    extraDropsCharge,
    peakCharge,
    specialCharge,
    finalFare,
    vendorMarkup,
    driverId,
    vendorId,
    associationId,
    assocCustomerOverrideAmount
}) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Fetch Active Commission Config
        const [configRows] = await conn.query('SELECT * FROM taxi_commission_configs WHERE status = "active" AND effective_from <= NOW() ORDER BY effective_from DESC LIMIT 1');
        if (configRows.length === 0) throw new Error("No active commission configuration found.");
        const config = configRows[0];
        const commissionVersionId = config.version;
        const custPct = parseFloat(config.customer_commission_percent);
        const drvPct = parseFloat(config.driver_commission_percent);
        const maintPct = parseFloat(config.maintenance_percent);
        const assocPct = parseFloat(config.association_percent);
        const cityPct = parseFloat(config.cityride_percent);
        const totalPct = parseFloat(config.total_commission_percent);

        // 2. Fetch Active Tariff Version (for snapshot)
        // (Assuming we query taxi_tariff_versions or just use id 1 as a placeholder if not fully implemented)
        const [tariffVer] = await conn.query('SELECT id FROM taxi_tariff_versions WHERE status = "active" LIMIT 1');
        const tariffVersionId = tariffVer.length > 0 ? tariffVer[0].id : null;

        // 3. Create Pricing Snapshot
        await conn.query(`
            INSERT INTO taxi_ride_pricing_snapshots 
            (booking_id, distance_km, ride_category, vehicle_type, tariff_version_id, commission_version_id, base_fare, distance_charge, peak_charge, special_location_charge, extra_drops_charge, waiting_charge, vendor_markup, final_fare, customer_commission_pct, driver_commission_pct, maintenance_pct, association_pct, cityride_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE final_fare = VALUES(final_fare)
        `, [
            bookingId, distanceKm, category, vehicleType, tariffVersionId, commissionVersionId,
            baseKmFare, 0, peakCharge, specialCharge, extraDropsCharge, waitingCharge, vendorMarkup, finalFare,
            custPct, drvPct, maintPct, assocPct, cityPct
        ]);

        // 4. Calculate Absolute Amounts (Platform standard)
        const totalCommissionAmount = (finalFare * totalPct) / 100;
        let driverCommissionAmount = (finalFare * drvPct) / 100;
        const maintAmount = (totalCommissionAmount * maintPct) / totalPct;
        let assocAmount = (totalCommissionAmount * assocPct) / totalPct;
        const cityAmount = (totalCommissionAmount * cityPct) / totalPct;

        // --- Hybrid Association Commission Overrides ---
        let assocNote = `Commission share from Finish Trip #B${bookingId}`;
        if (associationId) {
            const [assocRows] = await conn.query('SELECT commission_driver_pct, commission_driver_fixed FROM taxi_associations WHERE id = ?', [associationId]);
            if (assocRows.length > 0) {
                const cDrvPct = parseFloat(assocRows[0].commission_driver_pct) || 0;
                const cDrvFixed = parseFloat(assocRows[0].commission_driver_fixed) || 0;
                
                let customDriverDeduction = 0;
                if (cDrvPct > 0 || cDrvFixed > 0) {
                    customDriverDeduction = (finalFare * (cDrvPct / 100)) + cDrvFixed;
                    driverCommissionAmount += customDriverDeduction;
                }
                
                // The Association earns whatever we pulled from the Customer + whatever we pulled from the Driver
                const cCustOverride = parseFloat(assocCustomerOverrideAmount) || 0;
                if (cCustOverride > 0 || customDriverDeduction > 0) {
                    assocAmount = cCustOverride + customDriverDeduction;
                    assocNote = `Hybrid Commission: Cust(₹${cCustOverride.toFixed(2)}) + Drv(₹${customDriverDeduction.toFixed(2)}) for Trip #B${bookingId}`;
                }
            }
        }

        // 5. Idempotent Ledger Entries
        const insertLedger = async (type, amt) => {
            await conn.query(`
                INSERT INTO taxi_financial_ledger (booking_id, transaction_type, amount, reference_version_id, status)
                VALUES (?, ?, ?, ?, 'completed')
                ON DUPLICATE KEY UPDATE amount = VALUES(amount)
            `, [bookingId, type, amt, commissionVersionId]);
        };

        await insertLedger('ride_fare', finalFare);
        await insertLedger('driver_commission', driverCommissionAmount);
        await insertLedger('maintenance_allocation', maintAmount);
        if (associationId) {
            await insertLedger('association_allocation', assocAmount);
        }
        await insertLedger('cityride_allocation', cityAmount);

        // 6. Wallet Updates
        // Driver Wallet deduction (driver pays the commission to platform)
        if (driverId && driverCommissionAmount > 0) {
            await conn.query('UPDATE taxi_drivers SET wallet_balance = wallet_balance - ? WHERE id = ?', [driverCommissionAmount, driverId]);
        }

        // Association Wallet credit
        if (associationId && assocAmount > 0) {
            await conn.query(`
                INSERT INTO taxi_association_wallets (association_id, balance) 
                VALUES (?, ?) 
                ON DUPLICATE KEY UPDATE balance = balance + ?
            `, [associationId, assocAmount, assocAmount]);
            
            await conn.query(`
                INSERT INTO taxi_association_wallet_transactions (association_id, booking_id, driver_id, amount, type, note) 
                VALUES (?, ?, ?, ?, 'credit', ?)
            `, [associationId, bookingId, driverId, assocAmount, assocNote]);
        }

        await conn.commit();
        console.log(`[FINANCE] Settlement complete for B#${bookingId}`);
    } catch (err) {
        await conn.rollback();
        console.error(`[FINANCE ERROR] Settlement failed for B#${bookingId}:`, err);
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { settleRideFinancials };
