const fs = require('fs');

let serverFile = fs.readFileSync('server.js', 'utf8');

const finishTripStart = `app.post('/api/bookings/finish-trip', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {`;
const finishTripIndex = serverFile.indexOf(finishTripStart);
if (finishTripIndex === -1) {
    console.error("Could not find finish-trip endpoint.");
    process.exit(1);
}

const nextEndpointIndex = serverFile.indexOf("app.post('/api/bookings/update-gps-location'");
const chunk = serverFile.substring(finishTripIndex, nextEndpointIndex);
const lastBraceIndex = chunk.lastIndexOf('});');

const oldFinishTrip = serverFile.substring(finishTripIndex, finishTripIndex + lastBraceIndex + 3);

const newFinishTrip = `app.post('/api/bookings/finish-trip', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId, endOdometer, latitude, longitude, clientDistance } = req.body;
        const booking = req.booking;

        let endCoords = null;
        if (latitude !== undefined && longitude !== undefined) {
            endCoords = longitude + ',' + latitude;
        }

        let distanceCovered = 0;
        let durationMins = 0;
        const startTime = new Date(booking.journey_start_time);
        const endTime = new Date();
        durationMins = (endTime - startTime) / (1000 * 60);

        // Fetch GPS logs for distance fallback
        const [gpsLogs] = await db.query('SELECT latitude, longitude, accuracy, speed, created_at FROM taxi_ride_gps_logs WHERE booking_id = ? ORDER BY id ASC', [bookingId]);
        
        if (!endCoords && gpsLogs.length > 0) {
            const lastLog = gpsLogs[gpsLogs.length - 1];
            endCoords = lastLog.longitude + ',' + lastLog.latitude;
        }

        // Distance Resolution Logic (Priority: Odometer -> GPS -> Client Odometer)
        if (endOdometer && booking.start_odometer && /^\\d{1,6}$/.test(String(endOdometer).trim())) {
            distanceCovered = parseInt(endOdometer) - parseInt(booking.start_odometer);
            if (distanceCovered < 0) distanceCovered = 0;
        } else if (booking.trip_type !== 'rental') {
            let startCoords = booking.start_gps_coords || null;
            if (startCoords === 'null,null') startCoords = null;

            let serverDistance = 0;
            const cachedState = activeRidesGpsState.get(bookingId);
            if (cachedState) {
                serverDistance = cachedState.cumulativeDistance;
            } else {
                serverDistance = await calculateOdometerDistance(bookingId, startCoords, booking.journey_start_time, gpsLogs);
            }
            distanceCovered = serverDistance;

            if (clientDistance !== undefined && clientDistance !== null) {
                const parsedClientDist = parseFloat(clientDistance);
                if (!isNaN(parsedClientDist) && parsedClientDist > 0) {
                    if (gpsLogs.length < 3) {
                        distanceCovered = Math.min(parsedClientDist, 200);
                    } else {
                        const maxAllowed = serverDistance * 1.15 + 2.0;
                        if (parsedClientDist <= maxAllowed) distanceCovered = parsedClientDist;
                    }
                }
            }
        } else {
            distanceCovered = clientDistance || 0;
        }

        // Determine Category Dynamically
        const finalCategory = await pricingEngine.resolveRideCategory(db, distanceCovered, booking.trip_type);
        
        // Calculate pre-ride waiting
        let preRideWaitingCharge = 0;
        if (booking.reached_pickup_time && booking.journey_start_time) {
            const reachedTime = new Date(booking.reached_pickup_time);
            const journeyStartTime = new Date(booking.journey_start_time);
            const preRideElapsedMins = (journeyStartTime - reachedTime) / (1000 * 60);
            if (preRideElapsedMins > 5) {
                preRideWaitingCharge = Math.max(0, Math.ceil((preRideElapsedMins - 5) * 2));
            }
        }

        // Fare Calculation via Canonical Engine
        const fareDetails = await pricingEngine.calculateCanonicalFare(db, {
            distanceKm: distanceCovered,
            durationMins,
            vehicleType: booking.vehicle_type,
            category: finalCategory,
            pickupTime: booking.pickup_time ? new Date(booking.pickup_date + ' ' + booking.pickup_time) : new Date(),
            extraDrops: booking.extra_drops,
            specialPlaceType: booking.special_place_type,
            vendorId: booking.vendor_id,
            rentalPackage: booking.rental_package,
            returnDate: booking.return_date,
            pickupDate: booking.pickup_date,
            preRideWaitingCharge
        });

        const finalFareStr = "\u20B9" + fareDetails.finalFare;
        const distanceStr = distanceCovered.toFixed(3) + " KM";
        
        // Settle financials atomically
        let vendorMarkup = 0;
        if (booking.vendor_id && parseFloat(booking.vendor_markup) > 0) {
            vendorMarkup = parseFloat(booking.vendor_markup);
        }

        await commissionEngine.settleRideFinancials(db, {
            bookingId,
            distanceKm: distanceCovered,
            category: finalCategory,
            vehicleType: booking.vehicle_type,
            baseKmFare: fareDetails.baseKmFare,
            waitingCharge: fareDetails.waitingCharge,
            extraDropsCharge: fareDetails.extraDropsCharge,
            peakCharge: fareDetails.peakCharge,
            specialCharge: fareDetails.specialCharge,
            finalFare: fareDetails.finalFare,
            vendorMarkup,
            driverId: booking.driver_id,
            vendorId: booking.vendor_id,
            associationId: booking.association_id
        });

        // Update booking status
        const nextStatus = (booking.vendor_id || finalCategory === 'local') ? "completed" : "finished";
        await db.query(
            'UPDATE taxi_bookings SET status = ?, end_odometer = ?, journey_end_time = NOW(), fare = ?, actual_distance = ?, distance = ?, end_gps_coords = ?, trip_type = ? WHERE id = ?',
            [nextStatus, endOdometer || null, finalFareStr, distanceStr, distanceStr, endCoords, finalCategory, bookingId]
        );

        activeRidesGpsState.delete(bookingId);

        if (booking.user_id) {
            emitEvent(\`user:\${booking.user_id}\`, 'booking_status_update', { bookingId, status: nextStatus, finalFare: finalFareStr });
        }
        emitEvent('admin', 'booking_status_update', { bookingId, status: nextStatus, driverId: booking.driver_id });
        emitEvent(\`booking:\${bookingId}\`, 'booking_status_update', { bookingId, status: nextStatus });

        return res.json({
            success: true,
            finalFare: finalFareStr,
            distance: distanceCovered.toFixed(3),
            duration: durationMins.toFixed(1),
            waitingCharge: fareDetails.waitingCharge,
            vendorProfit: vendorMarkup,
            status: nextStatus
        });
    } catch (err) {
        console.error("finish-trip error:", err);
        res.status(500).json({ error: err.message });
    }
});`;

serverFile = serverFile.replace(oldFinishTrip, newFinishTrip);

fs.writeFileSync('server.js', serverFile);
console.log("Patched finish-trip successfully");
