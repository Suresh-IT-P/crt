(function() {
const originalFetch = window.fetch;
function getLoginRedirect(url) {
    return 'admin-login.html';
}
window.fetch = async function (...args) {
const response = await originalFetch(...args);
const url = args[0];
if (typeof url === 'string' && url.includes('/api/auth/logout')) {
return response;
}
if (response.status === 401) {
const redirect = getLoginRedirect(url);
if (redirect) window.location.href = redirect;
}
return response;
};
})();
async function initAdminSession() {
    // 1. Synchronously verify stored credentials
    let user = null;
    try {
        const raw = localStorage.getItem('cityride_master');
        if (raw) user = JSON.parse(raw);
    } catch(e) {}

    // If no credentials, redirect to login page immediately
    if (!user || (!user.id && !user.email)) {
        window.location.href = 'admin-login.html';
        return;
    }

    // 2. Background session check
    try {
        const sessionRes = await fetch('/api/auth/session?role=admin');
        if (sessionRes.ok) {
            const sd = await sessionRes.json();
            if (sd.valid && sd.role === 'admin' && sd.user) {
                user = sd.user;
                localStorage.setItem('cityride_master', JSON.stringify(user));
            }
        }
    } catch (e) {
        console.log('Admin session active in local mode');
    }
}
initAdminSession();
function switchTab(tabId, el) {
const section = document.getElementById(tabId);
if (!section) {
console.warn('Mission Control Warning: Tab section not found ->', tabId);
return;
}
document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
section.classList.add('active');
if (el) el.classList.add('active');
const sidebar = document.getElementById('admin-sidebar');
const burger = document.getElementById('admin-burger');
if (window.innerWidth <= 1024) {
if (sidebar) sidebar.classList.remove('active');
if (burger) burger.classList.remove('active');
}
loadTabData(tabId);
}
const adminBurger = document.getElementById('admin-burger');
const adminSidebar = document.getElementById('admin-sidebar');
if (adminBurger && adminSidebar) {
adminBurger.addEventListener('click', () => {
adminBurger.classList.toggle('active');
adminSidebar.classList.toggle('active');
});
}
async function loadTabData(tabId) {
if (tabId === 'reports') {
    loadSystemReports();
    return;
}
if (tabId === 'offers') {
    loadAdminOffers();
    return;
}
if (tabId === 'underground') {
    loadUndergroundReports();
    return;
}
if (tabId === 'radar') {
    loadLiveFleetRadar();
    return;
}
const bodyId = tabId === 'overview' ? 'overview-table-body' :
tabId === 'bookings' ? 'bookings-table-body' :
tabId === 'fleet' ? 'fleet-table-body' :
tabId === 'wallets' ? 'wallets-table-body' :
tabId === 'users' ? 'users-table-body' :
tabId === 'vendors' ? 'vendors-table-body' :
tabId === 'associations' ? 'associations-table-body' :
tabId === 'tariffs' ? 'tariffs-table-body' : null;
const body = bodyId ? document.getElementById(bodyId) : null;
try {
if (tabId === 'overview') {
const res = await fetch(`${API_BASE_URL}/api/admin/stats`);
if (!res.ok) throw new Error('Stats Fetch Failed');
const stats = await res.json();
const rev = document.getElementById('stat-revenue');
const pro = document.getElementById('stat-profit');
const act = document.getElementById('stat-active');
const dri = document.getElementById('stat-drivers');
const usr = document.getElementById('stat-users');
const updPilots = document.getElementById('upd-pilots');
const updMissions = document.getElementById('upd-missions');
const updCancels = document.getElementById('upd-cancels');

if (rev) rev.textContent = stats && stats.revenue !== undefined ? `\u20B9${stats.revenue.toLocaleString()}` : '\u20B90';
if (pro) pro.textContent = stats && stats.profit !== undefined ? `\u20B9${stats.profit.toLocaleString()}` : '\u20B90';
if (act) act.textContent = stats ? stats.activeBookings : '0';
if (dri) dri.textContent = stats ? stats.totalDrivers : '0';
if (usr) usr.textContent = stats ? stats.totalUsers : '0';
if (updPilots) updPilots.textContent = stats ? stats.pendingPilots || '0' : '0';
if (updMissions) updMissions.textContent = stats ? stats.pendingMissions || '0' : '0';
if (updCancels) updCancels.textContent = stats ? stats.cancelRequests || '0' : '0';
if (typeof renderPerformanceChart === 'function' && stats) { renderPerformanceChart(stats); }
const resB = await fetch(`${API_BASE_URL}/api/admin/bookings`);
if (!resB.ok) throw new Error('Bookings Fetch Failed');
const bookings = await resB.json();
if (!body) return;
body.innerHTML = '';
if (Array.isArray(bookings)) {
            bookings.slice(0, 5).forEach(b => {
                let stopsBadge = '';
                if (b.extra_drops) {
                    try {
                        const stops = typeof b.extra_drops === 'string' ? JSON.parse(b.extra_drops) : b.extra_drops;
                        if (stops && stops.length > 0) {
                            stopsBadge = ` <span style="font-size:0.65rem; background:rgba(255, 193, 7, 0.15); color:#ffc107; padding:2px 6px; border-radius:4px; margin-left:6px; font-weight:800; text-transform:uppercase;">+${stops.length} Stop${stops.length > 1 ? 's' : ''}</span>`;
                        }
                    } catch (e) {}
                }

                body.innerHTML += `
                <tr>
                    <td data-label="Booking ID">#B${b.id}</td>
                    <td data-label="Customer">
                        <strong>${b.customer_name}</strong>
                        ${b.vendor_id ? `<span style="font-size:0.6rem; color:var(--info-blue); font-weight:800; margin-left:5px;">(VENDOR)</span>` : ''}<br>
                        <a href="tel:${b.customer_phone}" style="font-size:0.8rem; color:var(--primary-red); text-decoration:none; font-weight:700;">${b.customer_phone || ''}</a>
                    </td>
                    <td data-label="Route" style="padding: 1.5rem; text-align: left;">
                        <span style="font-size:0.65rem; font-weight:800; color:var(--primary-red); text-transform:uppercase; background:rgba(183, 28, 28, 0.15); padding:2px 6px; border-radius:4px; margin-bottom:0.3rem; display:inline-block;">${(b.trip_type === 'round' ? 'Round Trip' : (b.trip_type === 'rental' ? 'Local Rental' : (b.trip_type || 'One Way').replace('_', ' ')))}</span><br>
                        ${b.pickup_loc} → ${b.drop_loc}${stopsBadge}
                    </td>
<td data-label="Status"><span class="status-tag status-${b.status}">${b.status}</span></td>
<td data-label="Actions">${['pending', 'assigned'].includes(b.status) ? `<button class="action-btn" onclick="cancelBooking(${b.id})">Abort</button>` : '<span style="color:#ccc; font-size:0.8rem;">—</span>'}</td>
</tr>
`;
});
} else {
body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No recent missions found or platform error.</td></tr>';
}
} else if (tabId === 'tariffs') {
    try {
        const resT = await fetch(`${API_BASE_URL}/api/tariffs`);
        if (!resT.ok) throw new Error('Tariffs Fetch Failed');
        const tariffs = await resT.json();
        window._adminTariffsData = tariffs;
        renderVehicleTariffTiles(tariffs);
    } catch (err) {
        console.error('Failed to load tariffs:', err);
        const container = document.getElementById('vehicle-tiles-container');
        if (container) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 2rem; background: rgba(255, 59, 48, 0.1); border: 1px solid rgba(255, 59, 48, 0.3); border-radius: 16px; text-align: center;">
                    <h3 style="color: var(--danger-red); margin-bottom: 0.5rem;">⚠️ Failed to load vehicle tariffs</h3>
                    <p style="color: var(--text-muted); margin-bottom: 1rem;">Database query timed out or server is re-connecting.</p>
                    <button class="btn btn-primary" onclick="loadTabData('tariffs')">🔄 Retry Loading Tariffs</button>
                </div>
            `;
        }
    }
    loadPeakRules();
    loadSpecialLocationCharges();
} else if (tabId === 'system-settings') {
loadSystemSettings();
} else if (tabId === 'commissions') {
loadCommissions();
} else if (tabId === 'bookings') {
const res = await fetch(`${API_BASE_URL}/api/admin/bookings`);
const bookings = await res.json();
if (!body) return;
body.innerHTML = '';
if (!Array.isArray(bookings)) {
body.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#888;">Mission Log currently unavailable.</td></tr>';
return;
}
const aborts = bookings.filter(b => b.status === 'cancel_requested');
const abortSection = document.getElementById('abort-requests-section');
const abortBody = document.getElementById('cancellations-table-body');
if (aborts.length > 0) {
abortSection.style.display = 'block';
abortBody.innerHTML = '';
aborts.forEach(b => {
abortBody.innerHTML += `
<tr>
<td data-label="ID">#B${b.id}</td>
<td data-label="Pilot">
<strong>${b.driver_name || 'Pilot'}</strong><br>
<span style="font-size:0.8rem; color:var(--text-muted)">${b.customer_name} (#B${b.id})</span>
</td>
<td data-label="Reason" style="color:var(--danger-red); font-weight:700;">${b.cancel_reason || 'No Reason Provided'}</td>
<td data-label="Actions">
<button class="action-btn" style="color:#28a745" onclick="approveCancel(${b.id})">Approve Abort</button>
<button class="action-btn" style="color:#dc3545; margin-left:10px" onclick="rejectCancel(${b.id})">Reject</button>
</td>
</tr>
`;
});
} else {
abortSection.style.display = 'none';
}
bookings.forEach(b => {
const isAssigned = b.status === 'assigned';
const fareNum = parseFloat(b.fare.replace('\u20B9', '')) || 0;
const markupNum = parseFloat(b.vendor_markup || 0);
const baseFare = fareNum - markupNum;
let financialInfo = `<strong>\u20B9${fareNum.toFixed(2)}</strong>`;
if (b.vendor_id) {
financialInfo = `
<div style="font-size:0.85rem;">
<span style="color:var(--success-green); font-weight:700;">Profit: \u20B9${markupNum.toFixed(2)}</span><br>
<span style="color:var(--text-muted);">Base: \u20B9${baseFare.toFixed(2)}</span><br>
<strong style="color:var(--primary-red)">Total: \u20B9${fareNum.toFixed(2)}</strong>
<div style="font-size:0.65rem; color:var(--info-blue); font-weight:800; margin-top:4px;">VENDOR: ${b.vendor_business_name || 'PARTNER'}</div>
</div>
`;
}
            let stopsHtml = '';
            if (b.extra_drops) {
                try {
                    const stops = typeof b.extra_drops === 'string' ? JSON.parse(b.extra_drops) : b.extra_drops;
                    if (stops && stops.length > 0) {
                        stopsHtml = `
                            <div style="margin: 4px 0; padding-left: 10px; border-left: 2px dashed rgba(255, 193, 7, 0.4); display: flex; flex-direction: column; gap: 2px;">
                                ${stops.map((s, index) => `
                                    <span style="font-size:0.75rem; color:#ffc107;">📍 Stop #${index + 1}: ${s.address.split(',')[0]}</span>
                                `).join('')}
                            </div>
                        `;
                    }
                } catch (e) {
                    console.error("Failed to parse extra_drops in bookings log", e);
                }
            }

body.innerHTML += `
<tr>
<td data-label="Booking ID">#B${b.id} ${b.vendor_id ? `<br><span style="background: rgba(10, 132, 255, 0.15); color: var(--info-blue); padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: bold; display: inline-block; margin-top: 4px;">Vendor</span>` : ''}</td>
<td data-label="Customer">
<strong style="color:var(--primary-red)">${b.customer_name}</strong><br>
<a href="tel:${b.customer_phone}" style="font-size:0.8rem; color:var(--primary-red); text-decoration:none; font-weight:700;">${b.customer_phone}</a>
</td>
<td data-label="Details" style="padding: 1.5rem; text-align: left;">
<span style="font-size:0.65rem; font-weight:800; color:var(--primary-red); text-transform:uppercase; background:rgba(183, 28, 28, 0.15); padding:2px 6px; border-radius:4px; margin-bottom:0.3rem; display:inline-block;">${(b.trip_type === 'round' ? 'Round Trip' : (b.trip_type === 'rental' ? 'Local Rental' : (b.trip_type || 'One Way').replace('_', ' ')))}</span><br>
<strong>${b.pickup_loc}</strong><br>
${stopsHtml}
<span style="font-size:0.8rem; color:var(--text-muted)">${b.drop_loc}</span><br>
<div style="font-size:0.75rem; color:#666; margin-top:4px;">
<b>Distance:</b> ${b.distance || '0 KM'}
${b.estimated_duration ? ` | <b>Duration:</b> 🕒 ${b.estimated_duration}` : ''}
</div>
${b.trip_type === 'rental' && b.start_odometer ? `
<div style="margin-top:0.5rem; font-size:0.75rem; background:rgba(255, 159, 10, 0.05); padding:8px; border-radius:8px; border:1px solid rgba(255, 159, 10, 0.15);">
<div style="font-weight:800; color:var(--warning-amber); font-size:0.65rem; text-transform:uppercase; margin-bottom:4px;">Rental Audit</div>
<b>Odo:</b> ${b.start_odometer} - ${b.end_odometer || '...'} <br>
${b.journey_start_time && b.journey_end_time ? `<b>Time:</b> ${((new Date(b.journey_end_time) - new Date(b.journey_start_time)) / (1000 * 60 * 60)).toFixed(2)} Hrs` : ''}
</div>
` : ''}
</td>
<td data-label="Financials">${financialInfo}</td>
<td data-label="Driver">${b.driver_name || '<span style="color:#aaa">Unassigned</span>'}</td>
<td data-label="Status"><span class="status-tag status-${b.status}">${b.status}</span></td>
<td data-label="Abort">${['pending', 'assigned'].includes(b.status) ? `<button class="action-btn" onclick="cancelBooking(${b.id})">Cancel Mission</button>` : '<span style="color:#ccc; font-size:0.8rem;">—</span>'}</td>
<td data-label="Transfer">${isAssigned ? `<button class="action-btn" style="color:var(--info-blue); font-weight:700;" onclick='openTransferModal(${b.id}, ${JSON.stringify(b.driver_name || "Unassigned")}, ${JSON.stringify(b.pickup_loc)}, ${JSON.stringify(b.drop_loc)})'>🔄 Transfer</button>` : '<span style="color:#ccc; font-size:0.8rem;">—</span>'}</td>
</tr>
`;
});
} else if (tabId === 'fleet') {
// Load Active Pilots
const resD = await fetch(`${API_BASE_URL}/api/admin/drivers`);
const drivers = await resD.json();
const fleetBody = document.getElementById('fleet-table-body');
if (fleetBody) {
fleetBody.innerHTML = '';
drivers.forEach(d => {
const blockBtn = d.is_blocked 
    ? `<button class="action-btn" style="color:var(--primary-red-pista); margin-left:10px" onclick="toggleBlockDriver(${d.id}, false)">✅ Unblock</button>`
    : `<button class="action-btn" style="color:var(--danger-red); margin-left:10px" onclick="toggleBlockDriver(${d.id}, true)">🚫 Block</button>`;

const statusPill = d.is_blocked
    ? `<span class="status-tag status-cancelled">Blocked</span>`
    : (d.approval_status === 'approved' 
        ? `<span class="status-tag status-completed">Active</span>`
        : `<span class="status-tag status-pending">${d.approval_status || 'Pending'}</span>`);

fleetBody.innerHTML += `
<tr>
<td data-label="Pilot ID">#P${d.id} <br>${statusPill}</td>
<td data-label="Details">
<div class="pilot-info-block">
<div class="p-name">${d.name}</div>
<div class="p-email"><a href="mailto:${d.email}">${d.email}</a></div>
<div class="p-phone"><a href="tel:${d.phone}">${d.phone || 'N/A'}</a></div>
</div>
</td>
<td data-label="Association"><strong style="color:var(--info-blue); font-size:0.85rem;">${d.association_name || 'Direct / Platform'}</strong></td>
<td data-label="Vehicle ID">${d.car_number || '---'}</td>
<td data-label="Category"><span style="text-transform:uppercase; font-size:0.8rem; font-weight:700">${d.vehicle_type || 'sedan'}</span></td>
<td data-label="Model">${d.car_model || '---'}</td>
<td data-label="Actions">
<button class="action-btn" onclick='openEditModal(${JSON.stringify(d).replace(/"/g, "&quot;")})'>Edit</button>
<button class="action-btn" style="color:#2e7d32; margin-left:10px" onclick="viewDriverDocs(${d.id})">Docs</button>
<button class="action-btn" style="color:#f39c12; margin-left:10px" onclick="openPasswordModal('driver', ${d.id}, '${d.name}')">Password</button>
${blockBtn}
<button class="action-btn" style="color:#888; margin-left:10px" onclick="deleteDriver(${d.id})">Revoke</button>
</td>
</tr>
`;
});
}
// Load Applications
const resA = await fetch(`${API_BASE_URL}/api/admin/driver-applications`);
const { applications } = await resA.json();
const appBody = document.getElementById('applications-table-body');
if (appBody) {
appBody.innerHTML = '';
applications.forEach(app => {
const hasAllDocs = app.dl_front && app.rc_book && app.aadhar_front;
appBody.innerHTML += `
<tr>
<td data-label="App ID">#APP-${app.id}</td>
<td data-label="Pilot">
<div class="pilot-info-block">
<div class="p-name">${app.name}</div>
<div class="p-email"><a href="mailto:${app.email}">${app.email}</a></div>
<div class="p-phone"><a href="tel:${app.phone}">${app.phone}</a></div>
</div>
</td>
<td data-label="Vehicle">
${app.car_model}<br>
<strong style="color:var(--primary-red)">${app.car_number}</strong>
</td>
<td data-label="Documents">
<span class="status-tag ${hasAllDocs ? 'status-completed' : 'status-pending'}">
${hasAllDocs ? 'Full Set' : 'Incomplete'}
</span>
</td>
<td data-label="Status"><span class="status-tag status-${app.status}">${app.status}</span></td>
<td data-label="Actions">
<button class="action-btn" onclick='viewApplication(${JSON.stringify(app).replace(/"/g, "&quot;")})'>Verify Docs</button>
</td>
</tr>
`;
});
}
// Load Application History
const resH = await fetch(`${API_BASE_URL}/api/admin/driver-applications/history`);
const { applications: history } = await resH.json();
const historyBody = document.getElementById('app-history-table-body');
if (historyBody) {
historyBody.innerHTML = '';
history.forEach(app => {
historyBody.innerHTML += `
<tr>
<td data-label="App ID">#APP-${app.id}</td>
<td data-label="Pilot">
<div class="pilot-info-block">
<div class="p-name">${app.name}</div>
<div class="p-email"><a href="mailto:${app.email}">${app.email}</a></div>
<div class="p-phone"><a href="tel:${app.phone}">${app.phone}</a></div>
</div>
</td>
<td data-label="Vehicle">
${app.car_model}<br>
<strong style="color:var(--primary-red)">${app.car_number}</strong>
</td>
<td data-label="Date">${new Date(app.created_at).toLocaleDateString()}</td>
<td data-label="Docs">
<button class="action-btn" onclick='viewApplication(${JSON.stringify(app).replace(/"/g, "&quot;")})'>View Docs</button>
</td>
</tr>
`;
});
}
} else if (tabId === 'wallets') {
const res = await fetch(`${API_BASE_URL}/api/admin/drivers`);
const drivers = await res.json();
if (!body) return;
body.innerHTML = '';
drivers.forEach(d => {
body.innerHTML += `
<tr>
<td data-label="Pilot ID">#P${d.id}</td>
<td data-label="Partner Details">
<div class="pilot-info-block">
<div class="p-name">${d.name}</div>
<div class="p-phone"><a href="tel:${d.phone}">${d.phone || 'N/A'}</a></div>
</div>
</td>
<td data-label="Current Balance"><strong style="color:var(--primary-red); font-size: 1.2rem;">\u20B9${parseFloat(d.wallet_balance || 0).toFixed(2)}</strong></td>
<td data-label="Wallet Operations">
<button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick="openWalletModal(${d.id}, ${d.wallet_balance || 0})">💳 Quick Update</button>
</td>
</tr>
`;
});
} else if (tabId === 'users') {
const res = await fetch(`${API_BASE_URL}/api/admin/users`);
const users = await res.json();
if (!body) return;
body.innerHTML = '';
users.forEach(u => {
const blockBtn = u.is_blocked 
    ? `<button class="action-btn" style="color:var(--primary-red-pista); margin-left:10px" onclick="toggleBlockUser(${u.id}, false)">✅ Unblock</button>`
    : `<button class="action-btn" style="color:var(--danger-red); margin-left:10px" onclick="toggleBlockUser(${u.id}, true)">🚫 Block</button>`;

const statusPill = u.is_blocked
    ? `<span class="status-tag status-cancelled">Blocked</span>`
    : `<span class="status-tag status-completed">Active</span>`;

body.innerHTML += `
<tr>
<td data-label="Member ID">#M${u.id} <br>${statusPill}</td>
<td data-label="Details">
<div class="pilot-info-block">
<div class="p-name">${u.name}</div>
<div class="p-email"><a href="mailto:${u.email}">${u.email}</a></div>
<div class="p-phone"><a href="tel:${u.phone}">${u.phone || 'N/A'}</a></div>
</div>
</td>
<td data-label="Registration Date">${new Date(u.created_at).toLocaleDateString()}</td>
<td data-label="Actions">
<button class="action-btn" onclick="openPasswordModal('user', ${u.id}, '${u.name}')">Password</button>
${blockBtn}
<button class="action-btn" style="color:#888; margin-left:10px" onclick="deletePassenger(${u.id})">Revoke</button>
</td>
</tr>
`;
});
} else if (tabId === 'associations') {
try {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/admin/associations`, { 
        headers: token ? { 'Authorization': `Bearer ${token}` } : {} 
    });
    if (!res.ok) throw new Error('Failed to load associations');
    const assocs = await res.json();
    const assocBody = document.getElementById('associations-table-body') || body;
    if (!assocBody) return;
    assocBody.innerHTML = '';
    if (!Array.isArray(assocs) || !assocs.length) {
        assocBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">No associations created yet. Click "+ Add Association" above to create one.</td></tr>';
    } else {
        assocs.forEach(a => {
            assocBody.innerHTML += `
            <tr>
            <td data-label="ID &amp; Name"><strong>${a.name || 'N/A'}</strong><br><span style="font-size:0.8rem;color:var(--text-muted)">ID: #${a.id}</span></td>
            <td data-label="Admin Credentials"><span style="color:var(--primary-red);font-weight:700;">${a.admin_username || 'N/A'}</span><br><span style="font-size:0.75rem;color:var(--text-muted)">(Password encrypted)</span></td>
            <td data-label="Region"><span style="font-weight:700;color:var(--info-blue);">${a.city_name || 'All Tamil Nadu'}</span></td>
            <td data-label="Share Model">${a.commission_type === 'percent' || a.commission_type === 'percentage' ? a.commission_value + '%' : '\u20B9' + a.commission_value + ' fixed'}</td>
            <td data-label="Assoc. Wallet" style="font-size:1.05rem;font-weight:800;color:var(--primary-red)">\u20B9${parseFloat(a.balance||0).toFixed(2)}</td>
            <td data-label="Status"><span class="status-tag ${a.is_active ? 'status-completed' : 'status-cancelled'}">${a.is_active ? 'Active' : 'Inactive'}</span></td>
            <td data-label="Actions" style="white-space:nowrap">
            <button class="action-btn" onclick='openEditAssocModal(${JSON.stringify(a).replace(/"/g, "&quot;")})' title="Edit Details">✏️ Edit</button>
            <button class="action-btn" onclick='openAssocPasswordModal(${a.id}, "${(a.name||'').replace(/"/g, "&quot;")}")' title="Change Password">🔑 Password</button>
            <button class="action-btn" onclick="toggleAssociation(${a.id})" title="${a.is_active ? 'Deactivate' : 'Activate'}">${a.is_active ? '🚫 Deactivate' : '✅ Activate'}</button>
            <button class="action-btn danger" style="color:var(--danger-red)" onclick="deleteAssociation(${a.id}, '${(a.name || '').replace(/'/g,'\\\'')}')" title="Delete Association">🗑️ Delete</button>
            </td>
            </tr>
            `;
        });
    }
} catch (e) {
    console.error('Associations Fetch Error:', e);
}

} else if (tabId === 'vendors') {
const res = await fetch(`${API_BASE_URL}/api/admin/vendors`);
const vendors = await res.json();
if (!body) return;
body.innerHTML = '';
vendors.forEach(v => {
body.innerHTML += `
<tr>
<td data-label="Partner ID">${v.vendor_id}</td>
<td data-label="Business Details">
<strong>${v.business_name}</strong><br>
<span style="font-size:0.85rem; color:var(--text-muted)">${v.name}</span>
</td>
<td data-label="Contact Info">
<div style="font-size:0.85rem;">
<a href="mailto:${v.email}">${v.email}</a><br>
<a href="tel:${v.phone}" style="color:var(--primary-red); text-decoration:none;">${v.phone}</a>
</div>
</td>
<td data-label="Status">
<span class="status-tag ${v.is_blocked ? 'status-cancelled' : 'status-completed'}">
${v.is_blocked ? 'Deactivated' : 'Active'}
</span>
</td>
<td data-label="Actions">
<button class="action-btn" style="color:var(--text-muted); margin-right:10px;" onclick='openEditVendorModal(${JSON.stringify(v).replace(/"/g, "&quot;")})'>Edit</button>
<button class="action-btn" style="color:var(--text-muted)" onclick="deleteVendor(${v.id})">Revoke</button>
</td>
</tr>
`;
});
}
} catch (err) { console.error(err); }
}
function showFleetSubSection(sectionId) {
document.querySelectorAll('.fleet-subsection').forEach(s => s.style.display = 'none');
document.getElementById(`${sectionId}-section`).style.display = 'block';
// Update button styles
const buttons = document.querySelectorAll('#fleet .btn');
buttons.forEach(btn => {
const text = btn.innerText.toLowerCase();
const matched = (sectionId === 'active-pilots' && text.includes('active')) ||
(sectionId === 'pending-apps' && text.includes('pending')) ||
(sectionId === 'onboarding-history' && text.includes('history'));
if (matched) {
btn.style.background = 'var(--primary-red)';
btn.style.color = 'white';
btn.style.border = 'none';
} else {
btn.style.background = 'rgba(255, 255, 255, 0.03)';
btn.style.color = 'var(--text-muted)';
btn.style.border = '1px solid var(--border-color)';
}
});
}
async function cancelBooking(id) {
if (!confirm('Abort this mission?')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/bookings/update-status`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ bookingId: id, status: 'cancelled' })
});
if (res.ok) loadTabData('overview');
} catch (err) { alert('Action failed'); }
}
async function deletePassenger(id) {
if (!confirm('Revoke member access to the network?')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/admin/delete-passenger`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id })
});
if (res.ok) loadTabData('users');
} catch (err) { alert('Revocation failed'); }
}
async function deleteDriver(id) {
if (!confirm('Permanently de-authorize this Pilot from the fleet?')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/admin/delete-driver`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id })
});
if (res.ok) loadTabData('fleet');
} catch (err) { alert('Revocation failed'); }
}
async function deleteVendor(id) {
if (!confirm('Revoke this Partnership? All associated vendor credentials will be deactivated.')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/admin/delete-vendor`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id })
});
if (res.ok) loadTabData('vendors');
} catch (err) { alert('Operation failed'); }
}
async function approveCancel(bookingId) {
if (!confirm('Approve this mission abort?')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/admin/approve-cancel`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ bookingId })
});
if (res.ok) loadTabData('bookings');
} catch (err) { alert('Action failed'); }
}
async function rejectCancel(bookingId) {
const note = prompt('Enter justification for rejection (optional):');
if (note === null) return; // cancelled prompt
if (!confirm('Reject this abort request? This mission will remain assigned.')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/admin/reject-cancel`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ bookingId, note })
});
if (res.ok) loadTabData('bookings');
} catch (err) { alert('Action failed'); }
}
function logoutAdmin() {
fetch('/api/auth/logout', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ role: 'admin' })
}).catch(() => {});
localStorage.removeItem('cityride_master');
window.location.href = 'admin-login.html';
}
// Handle Driver Creation
document.getElementById('create-driver-form').addEventListener('submit', async (e) => {
e.preventDefault();
const data = {
name: document.getElementById('d-name').value,
email: document.getElementById('d-email').value,
password: document.getElementById('d-pass').value,
phone: document.getElementById('d-phone').value,
car_model: document.getElementById('d-car').value,
car_number: document.getElementById('d-num').value,
vehicle_type: document.getElementById('d-type').value,
        association_id: document.getElementById('d-association') ? document.getElementById('d-association').value : null
};
try {
const res = await fetch(`${API_BASE_URL}/api/admin/create-driver`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(data)
});
if (res.ok) {
alert('Partner Authorized Successfully!');
document.getElementById('create-driver-form').reset();
loadTabData('fleet');
} else {
const err = await res.json();
alert(err.error);
}
} catch (err) { alert('Authorization failed'); }
});
// Handle Vendor Creation

document.getElementById('create-assoc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('a-name').value,
        admin_username: document.getElementById('a-username').value,
        admin_password: document.getElementById('a-pass').value,
        city_name: document.getElementById('a-city').value,
        commission_type: document.getElementById('a-comm-type').value,
        commission_value: document.getElementById('a-comm-value').value
    };
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/create-association`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            Swal.fire('Created!', 'Association setup complete.', 'success');
            document.getElementById('create-assoc-form').reset();
            loadTabData('associations');
        } else {
            Swal.fire('Error', result.error || 'Failed to create', 'error');
        }
    } catch(err) {
        Swal.fire('Error', 'Network error', 'error');
    }
});

// ─── ASSOCIATION MANAGEMENT FUNCTIONS (Admin Only) ───

async function adminFetch(url, opts = {}) {
    opts.headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${localStorage.getItem('adminToken')}`, 'Content-Type': 'application/json' };
    return fetch(API_BASE_URL + url, opts);
}

async function openEditAssocModal(assoc) {
    const { value: form } = await Swal.fire({
        title: `✏️ Edit Association`,
        html: `
            <div style="text-align:left;display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div>
                    <label style="font-weight:700;font-size:0.8rem;display:block;margin-bottom:4px">Association Name</label>
                    <input id="ea-name" class="swal2-input" style="margin:0;width:100%" value="${assoc.name || ''}">
                </div>
                <div>
                    <label style="font-weight:700;font-size:0.8rem;display:block;margin-bottom:4px">City / Region</label>
                    <select id="ea-city" class="swal2-input" style="margin:0;width:100%">
                        <option value="">Select District</option>
                        ${['Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore','Dharmapuri','Dindigul','Erode','Kallakurichi','Kanchipuram','Kanyakumari','Karur','Krishnagiri','Madurai','Mayiladuthurai','Nagapattinam','Namakkal','Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet','Salem','Sivaganga','Tenkasi','Thanjavur','Theni','Thoothukudi','Tiruchirappalli','Tirunelveli','Tirupathur','Tiruppur','Tiruvallur','Tiruvannamalai','Tiruvarur','Vellore','Viluppuram','Virudhunagar'].map(d => `<option value="${d}" ${assoc.city_name === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-weight:700;font-size:0.8rem;display:block;margin-bottom:4px">Commission Type</label>
                    <select id="ea-comm-type" class="swal2-input" style="margin:0;width:100%">
                        <option value="fixed" ${assoc.commission_type === 'fixed' ? 'selected' : ''}>Fixed (\u20B9 per ride)</option>
                        <option value="percent" ${assoc.commission_type === 'percent' ? 'selected' : ''}>Percentage (% of fare)</option>
                    </select>
                </div>
                <div>
                    <label style="font-weight:700;font-size:0.8rem;display:block;margin-bottom:4px">Commission Value</label>
                    <input id="ea-comm-val" class="swal2-input" style="margin:0;width:100%" type="number" value="${assoc.commission_value || 0}">
                </div>
                <div>
                    <label style="font-weight:700;font-size:0.8rem;display:block;margin-bottom:4px">Geofence Radius (km)</label>
                    <input id="ea-radius" class="swal2-input" style="margin:0;width:100%" type="number" value="${assoc.radius_km || 10}" placeholder="e.g. 15">
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        confirmButtonColor: '#006B3A',
        background: '#FFFFFF',
        color: '#000',
        preConfirm: () => ({
            id: assoc.id,
            name: document.getElementById('ea-name').value.trim(),
            city_name: document.getElementById('ea-city').value.trim(),
            commission_type: document.getElementById('ea-comm-type').value,
            commission_value: document.getElementById('ea-comm-val').value,
            radius_km: document.getElementById('ea-radius').value
        })
    });
    if (!form) return;
    const res = await adminFetch('/api/admin/update-association', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    if (data.success) { Swal.fire({ icon: 'success', title: 'Updated!', text: 'Association details saved.', background: '#FFFFFF', color: '#000', timer: 1800, showConfirmButton: false }); loadTabData('associations'); }
    else Swal.fire({ icon: 'error', title: 'Error', text: data.error, background: '#FFFFFF', color: '#000' });
}

async function openAssocPasswordModal(assocId, assocName) {
    const { value: form } = await Swal.fire({
        title: `🔑 Credentials: ${assocName}`,
        html: `
            <div style="text-align:left">
                <label style="font-weight:700;font-size:0.85rem;display:block;margin-bottom:6px">New Admin Username</label>
                <input id="ac-username" class="swal2-input" placeholder="Leave blank to keep current" style="margin-bottom:1rem;width:100%">
                <label style="font-weight:700;font-size:0.85rem;display:block;margin-bottom:6px">New Admin Password</label>
                <input id="ac-password" class="swal2-input" type="password" placeholder="Leave blank to keep current" style="width:100%">
                <p style="font-size:0.78rem;color:#888;margin-top:0.75rem">⚠️ Only fill fields you want to change. Blank fields will remain unchanged.</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Update Credentials',
        confirmButtonColor: '#006B3A',
        background: '#FFFFFF',
        color: '#000',
        preConfirm: () => {
            const u = document.getElementById('ac-username').value.trim();
            const p = document.getElementById('ac-password').value.trim();
            if (!u && !p) { Swal.showValidationMessage('Enter a new username or password to change.'); return false; }
            return { id: assocId, admin_username: u || undefined, admin_password: p || undefined };
        }
    });
    if (!form) return;
    // Strip undefined keys
    const body = { id: form.id };
    if (form.admin_username) body.admin_username = form.admin_username;
    if (form.admin_password) body.admin_password = form.admin_password;
    const res = await adminFetch('/api/admin/update-association', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) { Swal.fire({ icon: 'success', title: 'Credentials Updated!', text: 'Login credentials for the association have been changed.', background: '#FFFFFF', color: '#000' }); loadTabData('associations'); }
    else Swal.fire({ icon: 'error', title: 'Error', text: data.error, background: '#FFFFFF', color: '#000' });
}

async function toggleAssociation(assocId) {
    const res = await adminFetch('/api/admin/toggle-association', { method: 'POST', body: JSON.stringify({ id: assocId }) });
    const data = await res.json();
    if (data.success) { loadTabData('associations'); }
    else Swal.fire({ icon: 'error', title: 'Error', text: data.error, background: '#FFFFFF', color: '#000' });
}

async function deleteAssociation(assocId, assocName) {
    const confirm = await Swal.fire({
        title: `Delete Association?`,
        html: `<p>You are about to permanently delete <strong>"${assocName}"</strong>.</p><p style="color:#ff3b30;font-weight:700;margin-top:0.75rem">⚠️ This will unlink all drivers and erase all wallet & tariff data. This cannot be undone.</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Delete It',
        confirmButtonColor: '#ff3b30',
        background: '#FFFFFF',
        color: '#000'
    });
    if (!confirm.isConfirmed) return;
    const res = await adminFetch(`/api/admin/delete-association/${assocId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { Swal.fire({ icon: 'success', title: 'Deleted', text: `${assocName} has been permanently removed.`, background: '#FFFFFF', color: '#000' }); loadTabData('associations'); }
    else Swal.fire({ icon: 'error', title: 'Error', text: data.error, background: '#FFFFFF', color: '#000' });
}


document.getElementById('create-vendor-form').addEventListener('submit', async (e) => {
e.preventDefault();
const data = {
vendor_id: document.getElementById('v-id').value,
name: document.getElementById('v-name').value,
business_name: document.getElementById('v-business').value,
email: document.getElementById('v-email').value,
password: document.getElementById('v-pass').value,
phone: document.getElementById('v-phone').value
};
try {
const res = await fetch(`${API_BASE_URL}/api/admin/create-vendor`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(data)
});
if (res.ok) {
alert('Business Partner Activated Successfully!');
document.getElementById('create-vendor-form').reset();
loadTabData('vendors');
} else {
const err = await res.json();
alert(err.error);
}
} catch (err) { alert('Induction sequence failed'); }
});
function openEditModal(d) {
document.getElementById('edit-d-id').value = d.id;
document.getElementById('edit-d-name').value = d.name;
document.getElementById('edit-d-phone').value = d.phone || '';
document.getElementById('edit-d-car').value = d.car_model || '';
document.getElementById('edit-d-num').value = d.car_number || '';
document.getElementById('edit-d-type').value = d.vehicle_type || 'sedan';
document.getElementById('edit-driver-modal').style.display = 'flex';
}
function closeEditModal() {
document.getElementById('edit-driver-modal').style.display = 'none';
}
document.getElementById('edit-driver-form').addEventListener('submit', async (e) => {
e.preventDefault();
const data = {
id: document.getElementById('edit-d-id').value,
name: document.getElementById('edit-d-name').value,
phone: document.getElementById('edit-d-phone').value,
car_model: document.getElementById('edit-d-car').value,
car_number: document.getElementById('edit-d-num').value,
vehicle_type: document.getElementById('edit-d-type').value
};
try {
const res = await fetch(`${API_BASE_URL}/api/admin/update-driver`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(data)
});
if (res.ok) {
alert('Pilot Registry Updated Successfully.');
closeEditModal();
loadTabData('fleet');
} else {
const err = await res.json();
alert(err.error);
}
} catch (err) { alert('Update sequence failed.'); }
});
function openEditVendorModal(v) {
document.getElementById('edit-v-db-id').value = v.id;
document.getElementById('edit-v-id').value = v.vendor_id;
document.getElementById('edit-v-name').value = v.name;
document.getElementById('edit-v-business').value = v.business_name;
document.getElementById('edit-v-email').value = v.email;
document.getElementById('edit-v-phone').value = v.phone || '';
document.getElementById('edit-v-pass').value = '';
document.getElementById('edit-v-status').value = v.is_blocked || 0;
document.getElementById('edit-vendor-modal').style.display = 'flex';
}
function closeEditVendorModal() {
document.getElementById('edit-vendor-modal').style.display = 'none';
}
document.getElementById('edit-vendor-form').addEventListener('submit', async (e) => {
e.preventDefault();
const data = {
id: document.getElementById('edit-v-db-id').value,
vendor_id: document.getElementById('edit-v-id').value,
name: document.getElementById('edit-v-name').value,
business_name: document.getElementById('edit-v-business').value,
email: document.getElementById('edit-v-email').value,
password: document.getElementById('edit-v-pass').value || null,
phone: document.getElementById('edit-v-phone').value,
is_blocked: parseInt(document.getElementById('edit-v-status').value)
};
try {
const res = await fetch(`${API_BASE_URL}/api/admin/update-vendor`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(data)
});
if (res.ok) {
alert('Business Partner Updated Successfully.');
closeEditVendorModal();
loadTabData('vendors');
} else {
const err = await res.json();
alert(err.error);
}
} catch (err) { alert('Update sequence failed.'); }
});
function openWalletModal(id, balance) {
document.getElementById('edit-w-id').value = id;
document.getElementById('edit-w-balance').value = parseFloat(balance || 0).toFixed(2);
document.getElementById('edit-wallet-modal').style.display = 'flex';
}
function closeWalletModal() {
document.getElementById('edit-wallet-modal').style.display = 'none';
}
document.getElementById('edit-wallet-form').addEventListener('submit', async (e) => {
e.preventDefault();
const data = {
id: document.getElementById('edit-w-id').value,
wallet_balance: document.getElementById('edit-w-balance').value
};
try {
const res = await fetch(`${API_BASE_URL}/api/admin/update-driver-wallet`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(data)
});
if (res.ok) {
alert('Wallet Balance Updated Successfully.');
closeWalletModal();
loadTabData(_activeTab);
} else {
const err = await res.json();
alert(err.error);
}
} catch (err) { alert('Balance update failed.'); }
});
// Transfer Ride Functions
async function openTransferModal(bookingId, currentDriver, pickup, drop) {
document.getElementById('transfer-booking-id').value = bookingId;
document.getElementById('transfer-booking-info').innerHTML =
`<strong>#B${bookingId}:</strong> ${pickup} → ${drop}<br><span style="color:#888">Current Driver: ${currentDriver}</span>`;
document.getElementById('transfer-ride-modal').style.display = 'flex';
// Load drivers into dropdown
const select = document.getElementById('transfer-driver-select');
select.innerHTML = '<option value="">-- Select a driver --</option>';
try {
const res = await fetch(`${API_BASE_URL}/api/admin/drivers`);
const drivers = await res.json();
drivers.forEach(d => {
const opt = document.createElement('option');
opt.value = d.id;
opt.textContent = `${d.name} (${d.vehicle_type?.toUpperCase() || 'N/A'} · ${d.car_number || '---'})`;
select.appendChild(opt);
});
} catch (e) {
select.innerHTML = '<option value="">Failed to load drivers</option>';
}
}
function closeTransferModal() {
document.getElementById('transfer-ride-modal').style.display = 'none';
}
async function submitTransfer() {
const bookingId = document.getElementById('transfer-booking-id').value;
const newDriverId = document.getElementById('transfer-driver-select').value;
if (!newDriverId) { alert('Please select a driver.'); return; }
try {
const res = await fetch(`${API_BASE_URL}/api/admin/transfer-ride`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ bookingId: parseInt(bookingId), newDriverId: parseInt(newDriverId) })
});
const result = await res.json();
if (res.ok) {
alert(`✅ ${result.message}`);
closeTransferModal();
loadTabData('bookings');
} else {
alert(result.error);
}
} catch (err) { alert('Transfer failed.'); }
}
// Credentials Update Functions
function openPasswordModal(type, id, name) {
document.getElementById('pass-target-type').value = type;
document.getElementById('pass-target-id').value = id;
document.getElementById('password-target-name').textContent = `Updating password for: ${name}`;
document.getElementById('new-password').value = '';
document.getElementById('confirm-password').value = '';
document.getElementById('password-modal').style.display = 'flex';
}
function closePasswordModal() {
document.getElementById('password-modal').style.display = 'none';
}
document.getElementById('password-reset-form').addEventListener('submit', async (e) => {
e.preventDefault();
const type = document.getElementById('pass-target-type').value;
const id = document.getElementById('pass-target-id').value;
const newPass = document.getElementById('new-password').value;
const confirmPass = document.getElementById('confirm-password').value;
if (newPass !== confirmPass) {
alert('Passwords do not match!');
return;
}
if (newPass.length < 6) {
alert('Password must be at least 6 characters long.');
return;
}
try {
const endpoint = type === 'driver' ? `${API_BASE_URL}/api/admin/update-driver-password` : `${API_BASE_URL}/api/admin/update-passenger-password`;
const res = await fetch(endpoint, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id, password: newPass })
});
if (res.ok) {
alert('Password updated successfully.');
closePasswordModal();
} else {
const err = await res.json();
alert(err.error || 'Password update failed.');
}
} catch (err) {
alert('Network error occurred.');
}
});
let lightboxRotation = 0;
let lightboxZoom = 1;
function openDocument(path, label) {
if (!path) return;
lightboxRotation = 0;
lightboxZoom = 1;
const img = document.getElementById('lightbox-img');
img.src = path;
img.style.transform = `scale(1) rotate(0deg)`;
document.getElementById('lightbox-title').textContent = label || 'Document Viewer';
document.getElementById('lightbox-modal').style.display = 'flex';
}
function closeLightbox() {
document.getElementById('lightbox-modal').style.display = 'none';
document.getElementById('lightbox-img').src = '';
}
function rotateLightbox(deg) {
lightboxRotation += deg;
updateLightboxTransform();
}
function zoomLightbox(factor) {
lightboxZoom += factor;
if (lightboxZoom < 0.2) lightboxZoom = 0.2;
if (lightboxZoom > 3) lightboxZoom = 3;
updateLightboxTransform();
}
function updateLightboxTransform() {
const img = document.getElementById('lightbox-img');
img.style.transform = `scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`;
}
function downloadLightboxDoc() {
const img = document.getElementById('lightbox-img');
if (!img || !img.src || img.src === window.location.href) {
alert('No document available to download.');
return;
}
const title = document.getElementById('lightbox-title').textContent || 'document';
const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
const tempImg = new Image();
if (img.src.startsWith('http') || img.src.startsWith('//')) {
tempImg.crossOrigin = 'anonymous';
}
function triggerDirectDownload() {
if (img.src.startsWith('data:')) {
try {
const parts = img.src.split(',');
const contentType = parts[0].split(':')[1].split(';')[0];
const byteString = atob(parts[1]);
const arrayBuffer = new ArrayBuffer(byteString.length);
const uint8Array = new Uint8Array(arrayBuffer);
for (let i = 0; i < byteString.length; i++) {
uint8Array[i] = byteString.charCodeAt(i);
}
const blob = new Blob([uint8Array], { type: 'image/png' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `${cleanTitle}.png`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
} catch (e) {
console.error('Base64 blob conversion failed', e);
}
} else {
fetch(img.src)
.then(res => res.blob())
.then(blob => {
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `${cleanTitle}.png`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
})
.catch(err => {
console.error('Fetch blob failed, trying direct link', err);
const link = document.createElement('a');
link.href = img.src;
link.download = `${cleanTitle}.png`;
link.target = '_blank';
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
});
}
}
tempImg.onload = function () {
try {
const canvas = document.createElement('canvas');
canvas.width = tempImg.naturalWidth || 800;
canvas.height = tempImg.naturalHeight || 800;
const ctx = canvas.getContext('2d');
ctx.drawImage(tempImg, 0, 0);
canvas.toBlob(function (blob) {
if (!blob) {
triggerDirectDownload();
return;
}
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = `${cleanTitle}.png`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
}, 'image/png');
} catch (err) {
console.error('Canvas export failed, falling back', err);
triggerDirectDownload();
}
};
tempImg.onerror = function (err) {
console.error('Image load failed, falling back', err);
triggerDirectDownload();
};
tempImg.src = img.src;
}
async function viewDriverDocs(driverId) {
try {
const res = await fetch(`${API_BASE_URL}/api/admin/driver/${driverId}`);
if (!res.ok) throw new Error('Failed to fetch pilot details');
const data = await res.json();
viewApplication(data.driver);
} catch (err) {
alert('Could not retrieve pilot documents: ' + err.message);
}
}
// Application Management Functions
function viewApplication(app) {
const viewer = document.getElementById('doc-viewer-content');
const assocTitle = app.association_name || 'CityRide Driver (Independent)';
const districtTitle = app.district ? ` [📍 ${app.district}]` : '';
document.querySelector('#doc-modal h3').textContent = `Verify: ${app.name} (${app.phone}) — ${assocTitle}${districtTitle}`;
viewer.innerHTML = '';
const docs = [
{ label: '📸 Profile Photo', path: app.profile_photo },
{ label: 'DL Front', path: app.dl_front },
{ label: 'DL Back', path: app.dl_back },
{ label: 'PVC', path: app.pvc },
{ label: 'Aadhar Front', path: app.aadhar_front },
{ label: 'Aadhar Back', path: app.aadhar_back },
{ label: 'RC Book', path: app.rc_book },
{ label: 'Insurance', path: app.insurance },
{ label: 'Pollution', path: app.pollution },
{ label: 'Permit', path: app.permit },
{ label: 'Association ID Card', path: app.association_id_card }
];
docs.forEach(doc => {
if (doc.path) {
viewer.innerHTML += `
<div style="border: 1px solid #eee; padding: 10px; border-radius: 10px;">
<p style="font-size: 0.7rem; font-weight: 800; margin-bottom: 10px;">${doc.label}</p>
<img src="${doc.path}"
onerror="this.src='https://placehold.co/400x300?text=File+Not+Found+On+Server'; this.style.cursor='default'; this.onclick=null;"
style="width: 100%; border-radius: 5px; cursor: pointer;"
onclick="openDocument(this.src, '${doc.label}')">
</div>
`;
} else {
viewer.innerHTML += `
<div style="border: 1px solid #eee; padding: 10px; border-radius: 10px; background: #fffcfc; opacity: 0.5;">
<p style="font-size: 0.7rem; font-weight: 800; margin-bottom: 25px;">${doc.label}</p>
<div style="text-align: center; color: #ccc;">No Doc Uploaded</div>
</div>
`;
}
});
document.getElementById('btn-approve-app').onclick = () => appDecision(app.id, 'approved');
document.getElementById('btn-reject-app').onclick = () => appDecision(app.id, 'rejected');
// Hide/Show approval buttons based on application status
const footer = document.getElementById('doc-footer');
if (app.status === 'approved' || app.wallet_balance !== undefined) {
// This is a driver record or an approved application history
document.getElementById('btn-approve-app').style.display = 'none';
document.getElementById('btn-reject-app').style.display = 'none';
} else {
document.getElementById('btn-approve-app').style.display = 'block';
document.getElementById('btn-reject-app').style.display = 'block';
}
document.getElementById('doc-modal').style.display = 'flex';
}
function closeDocModal() {
document.getElementById('doc-modal').style.display = 'none';
}
async function appDecision(appId, status) {
let note = '';
if (status === 'rejected') {
note = prompt('Enter rejection reason:');
if (note === null) return;
if (!note) { alert('Reason is required for rejection.'); return; }
} else {
if (!confirm('Authorize this Pilot? Moving to active fleet.')) return;
}
try {
const res = await fetch(`${API_BASE_URL}/api/admin/driver-applications/decision`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ appId, status, note })
});
if (res.ok) {
alert(`Application ${status}!`);
closeDocModal();
loadTabData('fleet');
} else {
const err = await res.json();
alert('Decision Error: ' + err.error);
}
} catch (err) { alert('Signal failure.'); }
}
// --- REPORTING LOGIC (CSV/PDF) ---
function downloadCSV() {
fetch(`${API_BASE_URL}/api/admin/bookings`)
.then(res => res.json())
.then(data => {
const csvRows = [];
const headers = ['ID', 'Customer', 'Phone', 'Type', 'Pickup', 'Drop', 'Vehicle', 'Fare', 'Status', 'Driver', 'Car', 'Date'];
csvRows.push(headers.join(','));
data.forEach(b => {
const row = [
b.id,
`"${b.customer_name}"`,
`"${b.customer_phone}"`,
`"${b.trip_type || 'oneway'}"`,
`"${b.pickup_loc}"`,
`"${b.drop_loc}"`,
b.vehicle_type,
b.fare,
b.status,
`"${b.driver_name || 'N/A'}"`,
`"${b.car_number || 'N/A'}"`,
`"${new Date(b.created_at).toLocaleDateString()}"`
];
csvRows.push(row.join(','));
});
const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.setAttribute('href', url);
a.setAttribute('download', `CityRide-Report-${new Date().toISOString().split('T')[0]}.csv`);
a.click();
});
}
async function downloadPDF() {
const { jsPDF } = window.jspdf;
const doc = new jsPDF();
try {
const res = await fetch(`${API_BASE_URL}/api/admin/bookings`);
const data = await res.json();
doc.text("CityRideTaxi - Platform Mission Intelligence Report", 14, 15);
doc.setFontSize(10);
doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
const tableData = data.map(b => [
b.id,
b.customer_name,
(b.trip_type || 'oneway').toUpperCase(),
b.pickup_loc.substring(0, 30) + (b.pickup_loc.length > 30 ? '...' : ''),
b.drop_loc.substring(0, 30) + (b.drop_loc.length > 30 ? '...' : ''),
b.fare,
b.status
]);
doc.autoTable({
head: [['ID', 'Member', 'Type', 'Pickup', 'Dest', 'Fare', 'Status']],
body: tableData,
startY: 30,
styles: { fontSize: 8 }
});
doc.save(`CityRide-Intelligence-Matrix-${new Date().toISOString().split('T')[0]}.pdf`);
} catch (err) {
console.error('PDF Report generation failed', err);
alert("Failed to generate PDF Report");
}
}
// Consolidation: Script continues after the HTML modals