const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const targetBlock = `        // Recent ride history (last 50 completed, finished, and cancelled rides with customer details)
        const [rideHistory] = await db.query(
            \`SELECT b.id, b.pickup_loc, b.drop_loc, b.fare, b.distance, b.actual_distance, b.vehicle_type, b.trip_type, 
                    b.journey_start_time, b.journey_end_time, b.status, b.pickup_date, b.pickup_time, b.created_at,
                    COALESCE(b.passenger_name, u.name, tu.name) as customer_name,
                    COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone
             FROM taxi_bookings b
             LEFT JOIN passengers u ON b.user_id = u.id
             LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
             WHERE b.driver_id = ? AND b.status IN ('completed', 'finished', 'cancelled')
             ORDER BY COALESCE(b.journey_end_time, b.created_at) DESC LIMIT 50\`, [driverId]
        );`;

const newBlock = `        const { startDate, endDate } = req.query;
        let historyQuery = \`SELECT b.id, b.pickup_loc, b.drop_loc, b.fare, b.distance, b.actual_distance, b.vehicle_type, b.trip_type, 
                    b.journey_start_time, b.journey_end_time, b.status, b.pickup_date, b.pickup_time, b.created_at,
                    COALESCE(b.passenger_name, u.name, tu.name) as customer_name,
                    COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone
             FROM taxi_bookings b
             LEFT JOIN passengers u ON b.user_id = u.id
             LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
             WHERE b.driver_id = ? AND b.status IN ('completed', 'finished', 'cancelled')\`;
        
        const historyParams = [driverId];

        if (startDate && endDate) {
            historyQuery += \` AND DATE(COALESCE(b.journey_end_time, b.created_at)) >= ? AND DATE(COALESCE(b.journey_end_time, b.created_at)) <= ?\`;
            historyParams.push(startDate, endDate);
            historyQuery += \` ORDER BY COALESCE(b.journey_end_time, b.created_at) ASC\`; // Ascending order when viewing specific date range for charts
        } else {
            historyQuery += \` ORDER BY COALESCE(b.journey_end_time, b.created_at) DESC LIMIT 50\`; // Default view
        }

        const [rideHistory] = await db.query(historyQuery, historyParams);`;

if (content.includes("ORDER BY COALESCE(b.journey_end_time, b.created_at) DESC LIMIT 50")) {
    content = content.replace(targetBlock, newBlock);
    fs.writeFileSync('server.js', content, 'utf8');
    console.log('Successfully updated server.js');
} else {
    console.log('Target block not found in server.js');
}