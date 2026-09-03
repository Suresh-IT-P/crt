const fs = require('fs');
let code = fs.readFileSync('public/driver.html', 'utf8');

const target1 = "document.getElementById('nav-pickup-btn').href = `https://www.google.com/maps/search/?api=1&query=${pLngLat}`;";
const target2 = "document.getElementById('nav-drop-btn').href = navDropUrl;";
const fullTarget = target1 + "\n" + target2;
const fullTargetCRLF = target1 + "\r\n" + target2;

const replacement = target1 + "\n" + target2 + "\n\n" + 
`const navPickupBtn = document.getElementById('nav-pickup-btn');
const navDropBtn = document.getElementById('nav-drop-btn');
if (ride.status === 'assigned' || ride.status === 'reached_pickup') {
    navPickupBtn.style.opacity = '1';
    navPickupBtn.style.pointerEvents = 'auto';
    navDropBtn.style.opacity = '0.4';
    navDropBtn.style.pointerEvents = 'none';
} else if (ride.status === 'ongoing') {
    navPickupBtn.style.opacity = '0.4';
    navPickupBtn.style.pointerEvents = 'none';
    navDropBtn.style.opacity = '1';
    navDropBtn.style.pointerEvents = 'auto';
} else {
    navPickupBtn.style.opacity = '0.4';
    navPickupBtn.style.pointerEvents = 'none';
    navDropBtn.style.opacity = '0.4';
    navDropBtn.style.pointerEvents = 'none';
}`;

if (code.includes(fullTargetCRLF)) {
    code = code.replace(fullTargetCRLF, replacement.split('\n').join('\r\n'));
    fs.writeFileSync('public/driver.html', code);
    console.log('Successfully patched using CRLF target.');
} else if (code.includes(fullTarget)) {
    code = code.replace(fullTarget, replacement);
    fs.writeFileSync('public/driver.html', code);
    console.log('Successfully patched using LF target.');
} else {
    console.log('Target string not found in public/driver.html');
}
