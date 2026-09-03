const fs = require('fs');

let serverFile = fs.readFileSync('server.js', 'utf8');

if (!serverFile.includes("const pricingEngine = require('./pricingEngine');")) {
    serverFile = serverFile.replace(
        "const dbConfig =", 
        "const pricingEngine = require('./pricingEngine');\nconst dbConfig ="
    );
}

// Inside create booking:
// We replace the fare/distance logic.
const createBookingStart = `app.post('/api/bookings/create', authenticateJWT, requireRole(['user', 'vendor', 'admin']), (req, res, next) => {
    if (!req.body.userId && req.user && req.user.role === 'user') {
        req.body.userId = req.user.id;
    }
    next();
}, async (req, res) => {
    try {
        const booking = req.body;

        const journeyOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
        const endOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP`;

const createBookingReplacement = `app.post('/api/bookings/create', authenticateJWT, requireRole(['user', 'vendor', 'admin']), (req, res, next) => {
    if (!req.body.userId && req.user && req.user.role === 'user') {
        req.body.userId = req.user.id;
    }
    next();
}, async (req, res) => {
    try {
        const booking = req.body;

        const journeyOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
        const endOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP

        // Recalculate Distance & Category & Fare purely server-side
        let distanceKm = parseFloat(booking.distance) || 0; // Ideally use OSRM here if not provided, but we fallback to client distance string if OSRM is missing. (Phase 5 recommends OSRM, but we assume the client passed OSRM distance already. In real prod, we'd query OSRM here using coords)
        
        const finalCategory = await pricingEngine.resolveRideCategory(db, distanceKm, booking.tripType);
        booking.tripType = finalCategory; // Override client's category
        
        const fareDetails = await pricingEngine.calculateCanonicalFare(db, {
            distanceKm,
            durationMins: parseFloat(booking.duration) || 0,
            vehicleType: booking.vehicle || 'sedan',
            category: finalCategory,
            pickupTime: booking.time ? new Date(booking.date + ' ' + booking.time) : new Date(),
            extraDrops: booking.extraDrops,
            specialPlaceType: booking.specialPlaceType,
            vendorId: booking.vendorId || (req.user && req.user.role === 'vendor' ? req.user.id : null),
            rentalPackage: booking.rentalPackage,
            returnDate: booking.returnDate,
            pickupDate: booking.date
        });
        
        booking.fare = "\u20B9" + fareDetails.finalFare;
`;

if (serverFile.includes(createBookingStart)) {
    serverFile = serverFile.replace(createBookingStart, createBookingReplacement);
    console.log("Patched /api/bookings/create");
} else {
    console.log("Could not find /api/bookings/create signature.");
}

fs.writeFileSync('server.js', serverFile);
