export const allowedVehicleTypes = ['bike', 'auto', 'hatchback', 'sedan', 'suv', '8plus1', 'van24'];
export const allowedTripTypes = ['local', 'oneway', 'round', 'rental'];

export function getTransformedType(obj, type) {
    if (!obj) return null;
    switch (type) {
        case 'bike': return obj.bike;
        case 'auto': return obj.auto;
        case 'hatchback': return obj.hatchback;
        case 'sedan': return obj.sedan;
        case 'suv': return obj.suv;
        case '8plus1': return obj['8plus1'];
        case 'van24': return obj.van24;
        default: return null;
    }
}

export function setTransformedType(obj, type, val) {
    if (!obj) return;
    switch (type) {
        case 'bike': obj.bike = val; break;
        case 'auto': obj.auto = val; break;
        case 'hatchback': obj.hatchback = val; break;
        case 'sedan': obj.sedan = val; break;
        case 'suv': obj.suv = val; break;
        case '8plus1': obj['8plus1'] = val; break;
        case 'van24': obj.van24 = val; break;
    }
}

export function getTripPricing(info, tripTypeId) {
    if (!info) return null;
    switch (tripTypeId) {
        case 'local': return info.local;
        case 'oneway': return info.oneway;
        case 'round': return info.round;
        case 'rental': return info.rental;
        default: return null;
    }
}

export function getRentalConfig(rentalInfo, packageVal) {
    if (!rentalInfo) return null;
    switch (packageVal) {
        case '2-20': return rentalInfo['2-20'] || null;
        case '4-40': return rentalInfo['4-40'] || null;
        case '8-80': return rentalInfo['8-80'] || null;
        case '12-120': return rentalInfo['12-120'] || null;
        default: return null;
    }
}

export function calculateLocalSlabFare(dist, config) {
    let fare = 0;
    let d = dist;
    const r4 = (config && config.slab4_rate !== undefined) ? config.slab4_rate : 17;
    const r3 = (config && config.slab3_rate !== undefined) ? config.slab3_rate : 19;
    const r2 = (config && config.slab2_rate !== undefined) ? config.slab2_rate : 25;
    const r1 = (config && config.slab1_rate !== undefined) ? config.slab1_rate : 30;

    if (d > 50) { fare += (d - 50) * r4; d = 50; }
    if (d > 30) { fare += (d - 30) * r3; d = 30; }
    if (d > 10) { fare += (d - 10) * r2; d = 10; }
    if (d > 0) { fare += d * r1; }
    return fare;
}

export function getPeakSurcharge(timeStr, peakRules = []) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    const tm = h * 60 + m;

    let highestSurcharge = 0;
    peakRules.forEach(rule => {
        const [sh, sm] = rule.start_time.split(':').map(Number);
        const [eh, em] = rule.end_time.split(':').map(Number);
        const stm = sh * 60 + sm;
        const etm = eh * 60 + em;

        let inPeak = false;
        if (stm <= etm) {
            inPeak = (tm >= stm && tm <= etm);
        } else {
            // wraps around midnight (e.g. 22:00 to 06:00)
            inPeak = (tm >= stm || tm <= etm);
        }

        if (inPeak) {
            const surcharge = parseFloat(rule.surcharge_percentage) / 100;
            if (surcharge > highestSurcharge) highestSurcharge = surcharge;
        }
    });
    return highestSurcharge;
}

export const FALLBACK_PRICING = {
    bike: {
        name: 'Classy Bike Taxi', capacity: '1 Seater', maxPassengers: 1,
        local: { base: 0, perKm: 10, minKm: 5 },
        oneway: { base: 0, perKm: 10, minKm: 5, convenience: 0 }
    },
    auto: {
        name: 'Auto', capacity: '3+1 Seater', maxPassengers: 3,
        local: { base: 60, perKm: 12, minKm: 0 },
        oneway: { base: 0, perKm: 9, minKm: 50 },
        round: { base: 0, perKm: 8, minKmPerDay: 100 },
        rental: { '2-20': { base: 200, extraKm: 10, extraHour: 80 }, '4-40': { base: 380, extraKm: 10, extraHour: 80 }, '8-80': { base: 700, extraKm: 9, extraHour: 70 }, '12-120': { base: 1000, extraKm: 9, extraHour: 70 } }
    },
    hatchback: {
        name: 'Hatchback', capacity: '4+1 Seater', maxPassengers: 4,
        local: { base: 150, perKm: 20, minKm: 0 },
        oneway: { base: 0, perKm: 11, minKm: 100 },
        round: { base: 0, perKm: 10, minKmPerDay: 200 },
        rental: { '2-20': { base: 450, extraKm: 15, extraHour: 120 }, '4-40': { base: 850, extraKm: 15, extraHour: 120 }, '8-80': { base: 1600, extraKm: 14, extraHour: 100 }, '12-120': { base: 2200, extraKm: 13, extraHour: 100 } }
    },
    sedan: {
        name: 'Sedan', capacity: '4+1 Seater', maxPassengers: 4,
        local: { base: 200, perKm: 25, minKm: 0 },
        oneway: { base: 0, perKm: 13, minKm: 130 },
        round: { base: 0, perKm: 12, minKmPerDay: 250 },
        rental: { '2-20': { base: 600, extraKm: 18, extraHour: 150 }, '4-40': { base: 1100, extraKm: 18, extraHour: 150 }, '8-80': { base: 2100, extraKm: 16, extraHour: 120 }, '12-120': { base: 2800, extraKm: 15, extraHour: 120 } }
    },
    suv: {
        name: 'SUV', capacity: '6+1 Seater', maxPassengers: 6,
        local: { base: 300, perKm: 35, minKm: 0 },
        oneway: { base: 0, perKm: 19, minKm: 130 },
        round: { base: 0, perKm: 18, minKmPerDay: 250 },
        rental: { '2-20': { base: 900, extraKm: 25, extraHour: 250 }, '4-40': { base: 1600, extraKm: 25, extraHour: 250 }, '8-80': { base: 3100, extraKm: 22, extraHour: 200 }, '12-120': { base: 4200, extraKm: 20, extraHour: 200 } }
    },
    '8plus1': {
        name: 'Tempo Traveller', capacity: '8+1 Seater', maxPassengers: 8,
        local: { base: 600, perKm: 32, minKm: 0 },
        oneway: { base: 0, perKm: 22, minKm: 150 },
        round: { base: 0, perKm: 20, minKmPerDay: 250 },
        rental: { '2-20': { base: 1800, extraKm: 30, extraHour: 300 }, '4-40': { base: 3200, extraKm: 30, extraHour: 300 }, '8-80': { base: 6000, extraKm: 28, extraHour: 250 }, '12-120': { base: 8500, extraKm: 25, extraHour: 250 } }
    },
    van24: {
        name: 'Omni Bus', capacity: '24+1 Seater', maxPassengers: 24,
        local: { base: 1500, perKm: 55, minKm: 0 },
        oneway: { base: 0, perKm: 42, minKm: 200 },
        round: { base: 0, perKm: 38, minKmPerDay: 300 },
        rental: { '2-20': { base: 4000, extraKm: 50, extraHour: 500 }, '4-40': { base: 7000, extraKm: 50, extraHour: 500 }, '8-80': { base: 13000, extraKm: 45, extraHour: 450 }, '12-120': { base: 18000, extraKm: 40, extraHour: 400 } }
    }
};

export const DISPLAY_INFO = {
    bike: { name: 'Classy Bike Taxi', capacity: '1 Seater', maxPassengers: 1 },
    auto: { name: 'Auto', capacity: '3+1 Seater', maxPassengers: 3 },
    hatchback: { name: 'Hatchback', capacity: '4+1 Seater', maxPassengers: 4 },
    sedan: { name: 'Sedan', capacity: '4+1 Seater', maxPassengers: 4 },
    suv: { name: 'SUV', capacity: '6+1 Seater', maxPassengers: 6 },
    '8plus1': { name: 'Tempo Traveller', capacity: '8+1 Seater', maxPassengers: 8 },
    van24: { name: 'Omni Bus', capacity: '24+1 Seater', maxPassengers: 24 }
};
