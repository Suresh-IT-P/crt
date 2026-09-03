const http = require('http');

async function testEndpoint(name, options, postData = null) {
    return new Promise((resolve, reject) => {
        console.log(`\n--- Testing ${name} ---`);
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: options.path,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(postData ? { 'Content-Length': Buffer.byteLength(JSON.stringify(postData)) } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch(e) {
                    parsed = data;
                }
                console.log(`Status: ${res.statusCode}`);
                if (res.statusCode >= 400) {
                    console.error('Error Response:', parsed);
                } else {
                    console.log('Success. Data preview:', typeof parsed === 'object' ? JSON.stringify(parsed).substring(0, 300) + '...' : parsed);
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', (e) => {
            console.error(`Request failed: ${e.message}`);
            resolve({ status: 500, error: e.message });
        });

        if (postData) {
            req.write(JSON.stringify(postData));
        }
        req.end();
    });
}

async function runTests() {
    let allPassed = true;

    // 1. Test standard tariffs (ensuring existing routes are unaffected)
    const tariffs = await testEndpoint('Standard Tariffs (GET /api/tariffs)', { path: '/api/tariffs' });
    if (tariffs.status !== 200 || !Array.isArray(tariffs.data)) allPassed = false;

    // 2. Test special location charges endpoint
    const specialCharges = await testEndpoint('Special Location Charges (GET /api/special-location-charges)', { path: '/api/special-location-charges' });
    if (specialCharges.status !== 200 || !Array.isArray(specialCharges.data)) allPassed = false;

    // 3. Test fare breakdown WITHOUT special location
    const fareWithout = await testEndpoint('Fare Breakdown Normal (POST /api/fare-breakdown)', { path: '/api/fare-breakdown', method: 'POST' }, {
        vehicleType: 'sedan',
        tripType: 'oneway',
        distance: 10,
        fare: 250 // Base fare example
    });
    if (fareWithout.status !== 200) allPassed = false;
    let normalFare = fareWithout.data?.totalFare;

    // 4. Test fare breakdown WITH special location (mall = 10%)
    const fareWith = await testEndpoint('Fare Breakdown WITH Special Location (POST /api/fare-breakdown)', { path: '/api/fare-breakdown', method: 'POST' }, {
        vehicleType: 'sedan',
        tripType: 'oneway',
        distance: 10,
        fare: 250,
        specialPlaceType: 'mall'
    });
    if (fareWith.status !== 200) allPassed = false;

    if (fareWithout.data && fareWith.data) {
        console.log(`\nFare Comparison:`);
        console.log(`Normal Fare: ${fareWithout.data.totalFare}`);
        console.log(`Fare w/ Special Location: ${fareWith.data.totalFare}`);
        
        const hasSurcharge = fareWith.data.breakdown.some(item => item.label.includes('Special Location') || item.label.includes('Surcharge'));
        console.log(`Surcharge correctly appeared in breakdown: ${hasSurcharge ? 'YES ✅' : 'NO ❌'}`);
        if (!hasSurcharge) allPassed = false;
    }

    console.log(`\n=== TEST SUITE RESULT: ${allPassed ? 'ALL PASSED ✅' : 'SOME FAILURES ❌'} ===`);
}

runTests();
