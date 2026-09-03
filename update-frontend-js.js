const fs = require('fs');
let content = fs.readFileSync('public/driver.html', 'utf8');

// Update syncDashboardStats to include filter params
const syncTarget = `fetch(\`\${API_BASE_URL}/api/driver/dashboard-stats/\${driverData.id}\`, { signal: controller.signal }).catch(() => null)`;
const syncReplacement = `fetch(\`\${API_BASE_URL}/api/driver/dashboard-stats/\${driverData.id}\${
                document.getElementById('filter-from-date')?.value && document.getElementById('filter-to-date')?.value ? 
                '?startDate=' + document.getElementById('filter-from-date').value + '&endDate=' + document.getElementById('filter-to-date').value : ''
            }\`, { signal: controller.signal }).catch(() => null)`;

content = content.replace(syncTarget, syncReplacement);

// Add applyDateFilter and clearDateFilter
const filterFns = `
function applyDateFilter() {
    const f = document.getElementById('filter-from-date').value;
    const t = document.getElementById('filter-to-date').value;
    if(!f || !t) {
        Swal.fire('Validation Error', 'Please select both From and To dates', 'error');
        return;
    }
    if(new Date(f) > new Date(t)) {
        Swal.fire('Validation Error', 'From date cannot be after To date', 'error');
        return;
    }
    syncDashboardStats();
}
function clearDateFilter() {
    document.getElementById('filter-from-date').value = '';
    document.getElementById('filter-to-date').value = '';
    syncDashboardStats();
}
`;

if (!content.includes('function applyDateFilter()')) {
    content = content.replace('async function syncDashboardStats() {', filterFns + '\nasync function syncDashboardStats() {');
}

// Rewrite renderEarningsChart
const chartTargetStart = `function renderEarningsChart() {`;
const chartTargetEnd = `const chartData = days.map(d => earningsMap[d]);`;

// Need to completely rewrite the logic between these two
const newChartLogic = `function renderEarningsChart() {
const ctx = document.getElementById('earningsChart');
if (!ctx) return;

const fDate = document.getElementById('filter-from-date')?.value;
const tDate = document.getElementById('filter-to-date')?.value;

let labels = [];
let chartData = [];
let daysForList = [];
let earningsMapForList = {};

if (fDate && tDate) {
    // Custom Date Range
    let currDate = new Date(fDate);
    let endDateObj = new Date(tDate);
    
    // Safety check, max 31 days to avoid massive arrays
    let diffTime = Math.abs(endDateObj - currDate);
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays > 31) endDateObj = new Date(currDate.getTime() + (31 * 24 * 60 * 60 * 1000));
    
    while(currDate <= endDateObj) {
        const dStr = currDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const ymd = currDate.toISOString().split('T')[0];
        labels.push(dStr);
        daysForList.push({ key: ymd, display: dStr });
        earningsMapForList[ymd] = 0;
        currDate.setDate(currDate.getDate() + 1);
    }
    
    if (window.weeklyEarningsData) {
        window.weeklyEarningsData.forEach(ride => {
            if (ride.status === 'completed') {
                const date = new Date(ride.journey_end_time || ride.created_at);
                const ymd = date.toISOString().split('T')[0];
                const fareNum = parseFloat(ride.fare.replace(/[^0-9.]/g, '')) || 0;
                if (earningsMapForList[ymd] !== undefined) {
                    earningsMapForList[ymd] += fareNum;
                }
            }
        });
    }
    chartData = daysForList.map(d => earningsMapForList[d.key]);
    
} else {
    // Default 7 days of the week view
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const earningsMap = { 'Sun': 0, 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0 };
    if (window.weeklyEarningsData) {
        window.weeklyEarningsData.forEach(ride => {
            if (ride.status === 'completed') {
                const date = new Date(ride.journey_end_time || ride.created_at);
                const dayName = days[date.getDay()];
                const fareNum = parseFloat(ride.fare.replace(/[^0-9.]/g, '')) || 0;
                earningsMap[dayName] += fareNum;
            }
        });
    }
    labels = days;
    chartData = days.map(d => earningsMap[d]);
    daysForList = days.map((d, i) => ({ key: i, display: d }));
    daysForList.forEach(d => { earningsMapForList[d.key] = earningsMap[d.display]; });
}

const dayWiseList = document.getElementById('day-wise-earnings-list');
if (dayWiseList) {
    dayWiseList.innerHTML = '';
    daysForList.forEach(day => {
        const profit = earningsMapForList[day.key] || 0;
        let rideCount = 0;
        if (window.weeklyEarningsData) {
            rideCount = window.weeklyEarningsData.filter(r => {
                if(r.status !== 'completed') return false;
                const date = new Date(r.journey_end_time || r.created_at);
                if (fDate && tDate) {
                    return date.toISOString().split('T')[0] === day.key;
                } else {
                    return date.getDay() === day.key;
                }
            }).length;
        }
        if (profit > 0 || rideCount > 0) {
            dayWiseList.innerHTML += \`
                <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:700; color:var(--text-white);">\${day.display}</span>
                        <span style="font-size:0.75rem; color:var(--text-gray);">\${rideCount} Ride\${rideCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div style="font-weight:800; color:var(--success-green);">₹\${profit.toFixed(2)}</div>
                </div>\`;
        }
    });
    if (dayWiseList.innerHTML === '') {
        dayWiseList.innerHTML = '<div style="text-align:center; color:var(--text-gray); font-size:0.8rem; padding:10px;">No earnings found for this period</div>';
    }
}
`;

const chartStartIdx = content.indexOf(chartTargetStart);
const chartEndIdx = content.indexOf(chartTargetEnd) + chartTargetEnd.length;

if (chartStartIdx !== -1 && chartEndIdx !== -1) {
    content = content.substring(0, chartStartIdx) + newChartLogic + content.substring(chartEndIdx);
    
    // Fix the chart labels variable (was hardcoded to days, now it's labels)
    content = content.replace(/labels:\s*days,/, 'labels: labels,');
    
    fs.writeFileSync('public/driver.html', content, 'utf8');
    console.log('Successfully updated JS in driver.html');
} else {
    console.log('Target chart block not found');
}
