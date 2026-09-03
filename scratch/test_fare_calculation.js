const assert = require('assert');

// 1. Replicate calcWaitingCharge helper from server.js
function calcWaitingCharge(actualTripDistKm, actualDurationMins) {
    const allowedMins = (parseFloat(actualTripDistKm) || 0) * 2;
    const waitingMins = Math.max(0, actualDurationMins - allowedMins);
    const waitingCharge = waitingMins * 2; // ₹2 per minute
    return { allowedMins, waitingMins, waitingCharge };
}

// Replicate parseNumeric from server.js
function parseNumeric(val) {
    if (val === null || val === undefined) return 0;
    return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

console.log('--- RUNNING FARE & PRECISION TESTS ---');

// Test Case 1: High resolution single-meter precision parsing
const distStr1 = '1.234 KM'; // 1 km 234 m
const parsedDist1 = parseNumeric(distStr1);
assert.strictEqual(parsedDist1, 1.234, 'Distance parsing should preserve 3 decimal places');
console.log('✓ Parse high-precision distance string: 1.234 KM ->', parsedDist1);

// Test Case 2: calcWaitingCharge calculations
// Case 2a: Duration is less than allowed duration (Allowed = 1.234 * 2 = 2.468 mins)
// Expected waiting charge = 0
const res1 = calcWaitingCharge(1.234, 2.0);
assert.strictEqual(res1.allowedMins, 2.468, 'Allowed minutes must be exactly distance * 2');
assert.strictEqual(res1.waitingCharge, 0, 'Waiting charge should be 0 when duration is within allowed limit');
console.log('✓ Allowed mins:', res1.allowedMins, '| Duration 2.0 | Waiting charge:', res1.waitingCharge);

// Case 2b: Duration exceeds allowed duration (Allowed = 1.234 * 2 = 2.468 mins)
// Duration = 10 mins. Excess = 7.532 mins.
// Expected waiting charge = 7.532 * 2 = 15.064
const res2 = calcWaitingCharge(1.234, 10.0);
assert.strictEqual(res2.allowedMins, 2.468);
assert.deepStrictEqual(Math.round(res2.waitingMins * 1000) / 1000, 7.532);
assert.deepStrictEqual(Math.round(res2.waitingCharge * 1000) / 1000, 15.064);
console.log('✓ Allowed mins:', res2.allowedMins, '| Duration 10.0 | Waiting charge:', res2.waitingCharge);

// Test Case 3: Oneway fare breakdown wait charges sum
const preRideWaitingCharge = 10; // ₹10 pre-ride waiting
const journeyWaiting = res2.waitingCharge; // ₹15.064
const totalWaitingCharge = preRideWaitingCharge + journeyWaiting;
assert.strictEqual(totalWaitingCharge, 25.064, 'Total waiting charge must sum pre-ride and journey waiting charges');
console.log('✓ Total waiting charge:', totalWaitingCharge);

console.log('--- ALL TESTS PASSED SUCCESSFULLY ---');
