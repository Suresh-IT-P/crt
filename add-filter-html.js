const fs = require('fs');
let content = fs.readFileSync('public/driver.html', 'utf8');

const targetStr = '<section id="view-earnings" class="tab-view hidden">';
const filterHtml = `
                <!-- Date Filter -->
                <div class="glass-card" style="margin-bottom: 12px; padding: 12px;">
                    <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 8px; color: var(--text-white); display: flex; align-items: center; gap: 6px;">
                        <i class="ph-bold ph-funnel"></i> Filter Earnings
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <div style="flex: 1;">
                            <label style="display:block; font-size:0.7rem; color:var(--text-gray); margin-bottom:4px; font-weight:700;">From Date</label>
                            <input type="date" id="filter-from-date" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); color: var(--text-white); font-family: var(--font-family); box-sizing: border-box;">
                        </div>
                        <div style="flex: 1;">
                            <label style="display:block; font-size:0.7rem; color:var(--text-gray); margin-bottom:4px; font-weight:700;">To Date</label>
                            <input type="date" id="filter-to-date" style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); color: var(--text-white); font-family: var(--font-family); box-sizing: border-box;">
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="applyDateFilter()" class="btn btn-primary" style="flex: 1; padding: 10px; border-radius: 8px; font-weight: 800; font-size: 0.85rem;"><i class="ph-bold ph-check"></i> Apply</button>
                        <button onclick="clearDateFilter()" class="btn" style="flex: 1; padding: 10px; border-radius: 8px; font-weight: 800; font-size: 0.85rem; background: rgba(255,255,255,0.1); color: var(--text-white); border: none;"><i class="ph-bold ph-x"></i> Clear</button>
                    </div>
                </div>`;

const idx = content.indexOf(targetStr);
if (idx !== -1) {
    content = content.substring(0, idx + targetStr.length) + '\n' + filterHtml + content.substring(idx + targetStr.length);
    fs.writeFileSync('public/driver.html', content, 'utf8');
    console.log('Successfully injected Date Filter HTML into driver.html');
} else {
    console.log('Target string not found in driver.html');
}
