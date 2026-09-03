const fs = require('fs');

let serverFile = fs.readFileSync('server.js', 'utf8');

const commissionApis = `
// --- Admin Commission APIs ---
app.get('/api/admin/commissions', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_commission_configs ORDER BY version DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/commissions', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const {
            customer_commission_percent,
            driver_commission_percent,
            maintenance_percent,
            association_percent,
            cityride_percent,
            effective_from
        } = req.body;

        const cust = parseFloat(customer_commission_percent) || 0;
        const drv = parseFloat(driver_commission_percent) || 0;
        const total = cust + drv;

        const maint = parseFloat(maintenance_percent) || 0;
        const assoc = parseFloat(association_percent) || 0;
        const city = parseFloat(cityride_percent) || 0;

        // Validation
        if (Math.abs(total - (maint + assoc + city)) > 0.01) {
            return res.status(400).json({ error: 'Income allocation (Maintenance + Association + CityRide) must equal Total Commission (Customer + Driver).' });
        }

        const effectiveDate = effective_from ? new Date(effective_from) : new Date();

        // Get max version
        const [verRows] = await db.query('SELECT MAX(version) as maxVer FROM taxi_commission_configs');
        const nextVersion = (verRows[0].maxVer || 0) + 1;

        // Invalidate old active immediately if effectiveDate <= now
        if (effectiveDate <= new Date()) {
            await db.query('UPDATE taxi_commission_configs SET status = "archived", effective_to = NOW() WHERE status = "active"');
        }

        await db.query(\`
            INSERT INTO taxi_commission_configs 
            (version, customer_commission_percent, driver_commission_percent, total_commission_percent, maintenance_percent, association_percent, cityride_percent, effective_from, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`, [
            nextVersion, cust, drv, total, maint, assoc, city, effectiveDate, req.user.id
        ]);

        // Audit Log
        await db.query(\`
            INSERT INTO taxi_audit_logs (admin_id, action, entity_type, entity_id, new_value, remark)
            VALUES (?, 'CREATE', 'COMMISSION_CONFIG', ?, ?, ?)
        \`, [req.user.id, nextVersion, JSON.stringify(req.body), 'New commission configuration created']);

        res.json({ success: true, message: 'Commission configuration created successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/ledger', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_financial_ledger ORDER BY created_at DESC LIMIT 500');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// -----------------------------
`;

// Insert it right before "app.post('/api/admin/settings'"
const anchor = "app.post('/api/admin/settings'";
if (serverFile.includes(anchor)) {
    serverFile = serverFile.replace(anchor, commissionApis + '\n' + anchor);
    fs.writeFileSync('server.js', serverFile);
    console.log("Patched admin APIs successfully.");
} else {
    console.error("Anchor not found.");
    process.exit(1);
}
