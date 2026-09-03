const fs = require('fs');
let html = fs.readFileSync('public/admin.html', 'utf8');

const oldHtml = `    <main class="main-stage">
                <div class="b-card">
                    <h4>Member Base</h4>
                    <div class="val" id="stat-users">0</div>
                </div>
            </div>`;

const newHtml = `    <main class="main-stage">
        <!-- Overview Tab -->
        <div id="overview" class="tab-section active">
            <div class="stage-header">
                <div>
                    <h1>Platform <span class="text-accent">Insight</span></h1>
                    <p>Real-time performance analytics for the fleet.</p>
                </div>
            </div>

            <div class="stat-banner" style="grid-template-columns: repeat(5, 1fr);">
                <div class="b-card">
                    <h4>Total Revenue</h4>
                    <div class="val" id="stat-revenue">₹0</div>
                </div>
                <div class="b-card" style="border: 1px solid var(--primary-red); background: rgba(0, 107, 58, 0.02);">
                    <h4>Platform Profit</h4>
                    <div class="val" id="stat-profit" style="color: var(--primary-red);">₹0</div>
                </div>
                <div class="b-card">
                    <h4>Live Missions</h4>
                    <div class="val" id="stat-active">0</div>
                </div>
                <div class="b-card">
                    <h4>Partners</h4>
                    <div class="val" id="stat-drivers">0</div>
                </div>
                <div class="b-card">
                    <h4>Member Base</h4>
                    <div class="val" id="stat-users">0</div>
                </div>
            </div>`;

const normalizedHtml = html.replace(/\r\n/g, '\n');
const normalizedOld = oldHtml.replace(/\r\n/g, '\n');

if (normalizedHtml.includes(normalizedOld)) {
    fs.writeFileSync('public/admin.html', normalizedHtml.replace(normalizedOld, newHtml));
    console.log('Success');
} else {
    console.log('Target not found.');
}
