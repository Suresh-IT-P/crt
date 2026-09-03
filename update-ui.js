const fs = require('fs');

let content = fs.readFileSync('public/driver.html', 'utf8');

// 1. Remove floating widget
const floatingStart = '<div class="ride-stats-floating hidden" id="ride-stats-floating" style="display: flex;">';
const floatingEndStr = '</div>\n                </div>\n\n                <!-- Live Map View when Online -->';
const fStartIdx = content.indexOf(floatingStart);
const fEndIdx = content.indexOf('<!-- Live Map View when Online -->');
if (fStartIdx !== -1 && fEndIdx !== -1) {
    content = content.substring(0, fStartIdx) + content.substring(fEndIdx);
}

// 2. Extract and remove ledger from wallet
const ledgerStart = '                <!-- Ledger list of transactions -->\r\n                <div class="glass-card">\r\n                    <div class="card-header">\r\n                        <div class="card-title"><i class="ph-bold ph-list-dashes"></i> Transaction Ledger</div>\r\n                    </div>\r\n                    <div class="ledger-list" id="transaction-ledger-list">\r\n                        <!-- Loaded dynamically -->\r\n                    </div>\r\n                </div>';

let ledgerHtml = '';
const lIdx = content.indexOf('<!-- Ledger list of transactions -->');
if (lIdx !== -1) {
    const lEndIdx = content.indexOf('</section>', lIdx);
    ledgerHtml = content.substring(lIdx, lEndIdx).trim();
    content = content.substring(0, lIdx) + '\n            ' + content.substring(lEndIdx);
}

// 3. Insert Ledger and Day-wise Earnings into view-earnings
const earnEndStr = '<!-- Performance ratings and counts -->';
const earnIdx = content.indexOf(earnEndStr);
if (earnIdx !== -1 && ledgerHtml) {
    const dayWiseHtml = `
                <!-- Day-wise Data -->
                <div class="glass-card">
                    <div class="card-header">
                        <div class="card-title"><i class="ph-bold ph-calendar-blank"></i> Day-wise Earnings</div>
                    </div>
                    <div id="day-wise-earnings-list" style="display:flex; flex-direction:column; gap:8px;">
                        <!-- Dynamically populated -->
                    </div>
                </div>

                <!-- Transaction Ledger moved here -->
                ${ledgerHtml}

                `;
    content = content.substring(0, earnIdx) + dayWiseHtml + content.substring(earnIdx);
}

// 4. Update JS to populate Day-wise Earnings
const jsTarget = `const chartData = days.map(d => earningsMap[d]);`;
const newJs = `const dayWiseList = document.getElementById('day-wise-earnings-list');
if (dayWiseList) {
    dayWiseList.innerHTML = '';
    days.forEach(day => {
        const profit = earningsMap[day] || 0;
        let rideCount = 0;
        if (window.weeklyEarningsData) {
            rideCount = window.weeklyEarningsData.filter(r => r.status === 'completed' && new Date(r.journey_end_time || r.created_at).getDay() === days.indexOf(day)).length;
        }
        if (profit > 0 || rideCount > 0) {
            dayWiseList.innerHTML += \`
                <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:700; color:var(--text-white);">\${day}</span>
                        <span style="font-size:0.75rem; color:var(--text-gray);">\${rideCount} Ride\${rideCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="font-weight:800; color:var(--success-green);">₹\${profit.toFixed(2)}</div>
                </div>\`;
        }
    });
    if (dayWiseList.innerHTML === '') {
        dayWiseList.innerHTML = '<div style="text-align:center; color:var(--text-gray); font-size:0.8rem; padding:10px;">No earnings this week</div>';
    }
}

const chartData = days.map(d => earningsMap[d]);`;

content = content.replace(jsTarget, newJs);

fs.writeFileSync('public/driver.html', content, 'utf8');
console.log('UI updated successfully!');
