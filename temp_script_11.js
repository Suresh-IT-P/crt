function applyToggleVisual(enabled) {
const slider = document.getElementById('adr-toggle-slider');
const knob = document.getElementById('adr-toggle-knob');
const status = document.getElementById('adr-toggle-status');
const input = document.getElementById('adr-toggle-input');
if (!slider) return;
if (enabled) {
slider.style.background = '#e65100';
knob.style.transform = 'translateX(24px)';
status.textContent = 'Enabled';
status.style.color = '#e65100';
input.checked = true;
} else {
slider.style.background = '#444';
knob.style.transform = 'translateX(0)';
status.textContent = 'Disabled';
status.style.color = '#888';
input.checked = false;
}
}
async function loadCommissions() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/commissions`, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') } });
        if (!res.ok) throw new Error('Commissions Fetch Failed');
        const data = await res.json();
        
        const tbody = document.getElementById('commission-history-tbody');
        if (tbody) tbody.innerHTML = '';
        
        let activeFound = false;
        
        data.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.version}</td>
                <td>${c.customer_commission_percent}%</td>
                <td>${c.driver_commission_percent}%</td>
                <td>${c.total_commission_percent}%</td>
                <td>${c.maintenance_percent}%</td>
                <td>${c.association_percent}%</td>
                <td>${c.cityride_percent}%</td>
                <td>${new Date(c.effective_from).toLocaleString()}</td>
                <td>${c.status === 'active' ? '<span class="status-badge" style="background:#28a745;color:white;padding:2px 8px;border-radius:12px;font-size:0.75rem;">Active</span>' : (c.status === 'scheduled' ? '<span class="status-badge" style="background:#ffc107;color:black;padding:2px 8px;border-radius:12px;font-size:0.75rem;">Scheduled</span>' : '<span class="status-badge" style="background:#6c757d;color:white;padding:2px 8px;border-radius:12px;font-size:0.75rem;">Archived</span>')}</td>
            `;
            if (tbody) tbody.appendChild(tr);

            if (!activeFound && c.status === 'active') {
                activeFound = true;
                const activeDisplay = document.getElementById('active-commission-display');
                if (activeDisplay) {
                    activeDisplay.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px; margin-bottom:10px;">
                            <span><strong>Version:</strong> v${c.version}</span>
                            <span style="color:var(--text-muted); font-size:0.85rem;">Effective: ${new Date(c.effective_from).toLocaleString()}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div><strong style="color:var(--primary-red-pista);">Customer Fee:</strong> ${c.customer_commission_percent}%</div>
                            <div><strong style="color:var(--primary-red-pista);">Driver Deduction:</strong> ${c.driver_commission_percent}%</div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1);">
                            <div><strong style="color:var(--success-green);">Maint:</strong> ${c.maintenance_percent}%</div>
                            <div><strong style="color:var(--success-green);">Assoc:</strong> ${c.association_percent}%</div>
                            <div><strong style="color:var(--success-green);">CityRide:</strong> ${c.cityride_percent}%</div>
                        </div>
                    `;
                }
            }
        });
    } catch (e) {
        console.error("Failed to load commissions", e);
        Swal.fire({ title: 'Error', text: 'Failed to load commission configuration history.', icon: 'error', background: '#1a1a2e', color: '#fff' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const commForm = document.getElementById('commission-form');
    if (commForm) {
        commForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const cust = parseFloat(document.getElementById('cust-comm').value) || 0;
            const drv = parseFloat(document.getElementById('drv-comm').value) || 0;
            const maint = parseFloat(document.getElementById('maint-alloc').value) || 0;
            const assoc = parseFloat(document.getElementById('assoc-alloc').value) || 0;
            const city = parseFloat(document.getElementById('city-alloc').value) || 0;
            
            const total = (cust + drv).toFixed(2);
            const allocTotal = (maint + assoc + city).toFixed(2);
            
            if (Math.abs(total - allocTotal) > 0.01) {
                Swal.fire({
                    title: 'Validation Failed',
                    text: `Total Commission (${total}%) must exactly equal Allocation Total (${allocTotal}%).`,
                    icon: 'warning',
                    background: '#1a1a2e', color: '#fff'
                });
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/commissions`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
                    },
                    body: JSON.stringify({
                        customer_commission_percent: cust,
                        driver_commission_percent: drv,
                        maintenance_percent: maint,
                        association_percent: assoc,
                        cityride_percent: city,
                        effective_from: document.getElementById('effective-from').value || undefined
                    })
                });
                const data = await res.json();
                if (data.success) {
                    Swal.fire({
                        title: 'Success!',
                        text: 'New Profit Configuration saved and deployed.',
                        icon: 'success',
                        background: '#1a1a2e', color: '#fff',
                        timer: 2000,
                        showConfirmButton: false
                    });
                    loadCommissions();
                } else {
                    Swal.fire({ title: 'Error', text: data.error, icon: 'error', background: '#1a1a2e', color: '#fff' });
                }
            } catch (e) {
                Swal.fire({ title: 'Error', text: 'Network connection failed.', icon: 'error', background: '#1a1a2e', color: '#fff' });
            }
        });
    }
});

async function loadSystemSettings() {
loadSurgeRules();
try {
const token = localStorage.getItem('token');
const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
headers: { 'Authorization': `Bearer ${token}` }
});
if (!res.ok) throw new Error('Failed to load settings');
const settings = await res.json();
const enabled = settings['air_distance_restrict'] === '1';
applyToggleVisual(enabled);
const localKm = document.getElementById('adr-local-km');
if (localKm && settings['air_distance_local_km']) localKm.value = settings['air_distance_local_km'];
const outstationKm = document.getElementById('adr-outstation-km');
if (outstationKm && settings['air_distance_outstation_km']) outstationKm.value = settings['air_distance_outstation_km'];
} catch (err) {
console.error('loadSystemSettings error:', err);
const status = document.getElementById('adr-toggle-status');
if (status) { status.textContent = 'Error'; status.style.color = '#e53935'; }
}
}
async function saveAirDistanceSetting(checked) {
try {
const token = localStorage.getItem('token');
applyToggleVisual(checked);
const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
body: JSON.stringify({ key: 'air_distance_restrict', value: checked ? '1' : '0' })
});
if (!res.ok) throw new Error('Failed to save setting');
showAlertBanner(checked ? '📡 Air Distance Restriction ENABLED' : '📡 Air Distance Restriction DISABLED', 'success');
} catch (err) {
console.error('saveAirDistanceSetting error:', err);
showAlertBanner('Failed to save setting.', 'error');
loadSystemSettings();
}
}
async function saveAirDistanceKm(key, value) {
try {
const token = localStorage.getItem('token');
const res = await fetch(`${API_BASE_URL}/api/admin/settings`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
body: JSON.stringify({ key, value })
});
if (!res.ok) throw new Error('Failed to save setting');
showAlertBanner('Radius distance updated successfully.', 'success');
} catch (err) {
console.error('saveAirDistanceKm error:', err);
showAlertBanner('Failed to update distance.', 'error');
}
}

async function loadSurgeRules() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/surge-config`);
        if (!res.ok) return;
        const configs = await res.json();
        configs.forEach(c => {
            if (c.surge_key === 'night_surge' && document.getElementById('surge-night-val')) {
                document.getElementById('surge-night-val').value = c.multiplier;
            }
            if (c.surge_key === 'rain_surge' && document.getElementById('surge-rain-val')) {
                document.getElementById('surge-rain-val').value = c.multiplier;
            }
            if (c.surge_key === 'demand_surge' && document.getElementById('surge-demand-val')) {
                document.getElementById('surge-demand-val').value = c.multiplier;
            }
        });
    } catch (e) { console.error('Failed to load surge rules', e); }
}

async function updateSurgeRule(surgeKey, inputId) {
    const val = document.getElementById(inputId)?.value;
    if (!val || isNaN(parseFloat(val))) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/surge-config/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ surge_key: surgeKey, multiplier: parseFloat(val), is_active: 1 })
        });
        if (res.ok) {
            showAlertBanner(`⚡ ${surgeKey.replace('_', ' ').toUpperCase()} updated to ${val}x`, 'success');
        } else {
            showAlertBanner('Failed to update surge rule', 'error');
        }
    } catch (e) { showAlertBanner('Network error', 'error'); }
}