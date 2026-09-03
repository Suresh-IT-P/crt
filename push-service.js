const admin = require('firebase-admin');

let isInitialized = false;

function initFirebase() {
    if (isInitialized) return;
    try {
        if (!admin.apps.length) {
            // In a production environment, pass credentials like this:
            // const serviceAccount = require('./firebase-service-account.json');
            // admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
            
            // This attempts to initialize using GOOGLE_APPLICATION_CREDENTIALS environment variable
            admin.initializeApp();
            isInitialized = true;
            console.log('[FCM] Firebase Admin initialized.');
        } else {
            isInitialized = true;
        }
    } catch (err) {
        console.warn('[FCM WARNING] Failed to initialize Firebase Admin. Make sure you set GOOGLE_APPLICATION_CREDENTIALS.', err.message);
    }
}

/**
 * Sends a high-priority data message to the driver's device.
 * A data-only message will wake up the Capacitor background handler directly
 * instead of just posting to the system notification tray.
 * 
 * @param {string} driverToken - The FCM device token for the driver
 * @param {Object} rideData - Information about the ride (pickup, drop, fare, etc.)
 */
async function sendRidePopupToDriver(driverToken, rideData) {
    if (!driverToken) {
        console.warn('[FCM] Cannot send ride popup: No driver token provided.');
        return false;
    }

    initFirebase();

    // Data payloads in FCM must ONLY contain string values.
    const dataPayload = {
        type: 'incoming_ride_request',
        bookingId: String(rideData.id || ''),
        pickupLocation: String(rideData.pickup_loc || 'Unknown'),
        dropLocation: String(rideData.drop_loc || 'Unknown'),
        fare: String(rideData.fare || '0'),
        distance: String(rideData.distance || '0'),
        timestamp: String(Date.now())
    };

    const message = {
        token: driverToken,
        data: dataPayload,
        android: {
            priority: 'high',
            // ttl: 0 ensures the message is delivered immediately and wakes the device (or dropped if offline)
            ttl: 0, 
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('[FCM] Successfully sent ride popup to driver:', response);
        return true;
    } catch (error) {
        console.error('[FCM ERROR] Error sending ride popup to driver:', error);
        return false;
    }
}

module.exports = {
    initFirebase,
    sendRidePopupToDriver
};
