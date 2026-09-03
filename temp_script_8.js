
        const VEHICLE_TYPES = [
            { key: 'bike', name: 'Bike Taxi', capacity: '1 Seater', icon: '🏍️' },
            { key: 'auto', name: 'Auto Rickshaw', capacity: '3+1 Seater', icon: '🛺' },
            { key: 'hatchback', name: 'Hatchback Economy', capacity: '4+1 Seater', icon: '🚗' },
            { key: 'sedan', name: 'Sedan Premium', capacity: '4+1 Seater', icon: '🚘' },
            { key: 'suv', name: 'SUV Classic', capacity: '6+1 Seater', icon: '🚙' },
            { key: '8plus1', name: 'Tempo Traveler', capacity: '8+1 Seater', icon: '🚐' },
            { key: 'van24', name: 'Omni Bus', capacity: '24+1 Seater', icon: '🚌' }
        ];

        let _activeVehicleKey = null;

        function renderVehicleTariffTiles(tariffs) {
            const container = document.getElementById('vehicle-tiles-container');
            if (!container) return;

            container.innerHTML = VEHICLE_TYPES.map(v => {
                const vehicleTariffs = tariffs.filter(t => t.vehicle_type === v.key && t.category !== 'rental');
                
                let summaryHtml = '';
                if (vehicleTariffs.length === 0) {
                    summaryHtml = `<div class="rate-summary-pill" style="justify-content:center; color:var(--text-muted);">No rates configured</div>`;
                } else {
                    summaryHtml = vehicleTariffs.map(t => {
                        const config = typeof t.config === 'string' ? JSON.parse(t.config) : t.config;
                        let rateVal = '';
                        if (t.category === 'local') {
                            const base = config.base !== undefined ? config.base : (config.slab1_rate !== undefined ? config.slab1_rate : 0);
                            const rate = config.perKm !== undefined ? config.perKm : (config.slab1_rate !== undefined ? config.slab1_rate : 0);
                            rateVal = `Base \u20B9${base} | \u20B9${rate}/km`;
                        } else {
                            const base = config.base || 0;
                            const perKm = config.perKm || 0;
                            rateVal = base > 0 ? `Base \u20B9${base} | \u20B9${perKm}/km` : `\u20B9${perKm}/km`;
                        }

                        return `
                            <div class="rate-summary-pill">
                                <span class="cat-name">${t.category.toUpperCase()}</span>
                                <span class="cat-val">${rateVal}</span>
                            </div>
                        `;
                    }).join('');
                }

                const isSelected = _activeVehicleKey === v.key;

                return `
                    <div class="vehicle-tile-card ${isSelected ? 'active' : ''}" onclick="expandVehicleTariff('${v.key}')">
                        <div>
                            <div class="vehicle-tile-header">
                                <div class="vehicle-tile-icon">${v.icon}</div>
                                <span class="status-tag status-assigned" style="font-size:0.65rem;">${v.capacity}</span>
                            </div>
                            <h3 class="vehicle-tile-title">${v.name.toUpperCase()}</h3>
                            <div class="vehicle-tile-sub">Vehicle Key: <code style="color:var(--info-blue); font-weight:700;">${v.key}</code></div>
                            <div class="vehicle-rate-summary">
                                ${summaryHtml}
                            </div>
                        </div>
                        <div class="vehicle-tile-footer">
                            <span>Manage Rate Tariffs</span>
                            <span style="font-size:1.1rem;">→</span>
                        </div>
                    </div>
                `;
            }).join('');

            if (_activeVehicleKey) {
                expandVehicleTariff(_activeVehicleKey);
            } else {
                const expView = document.getElementById('expanded-vehicle-tariff-view');
                if (expView) expView.style.display = 'none';
            }
        }

        function expandVehicleTariff(vehicleKey) {
            _activeVehicleKey = vehicleKey;
            
            if (window._adminTariffsData) {
                const container = document.getElementById('vehicle-tiles-container');
                if (container) {
                    container.querySelectorAll('.vehicle-tile-card').forEach(card => card.classList.remove('active'));
                }
            }

            const vehicleInfo = VEHICLE_TYPES.find(v => v.key === vehicleKey) || { name: vehicleKey.toUpperCase(), icon: '🚖', capacity: 'Standard' };
            const vehicleTariffs = (window._adminTariffsData || []).filter(t => t.vehicle_type === vehicleKey && t.category !== 'rental');

            const expView = document.getElementById('expanded-vehicle-tariff-view');
            if (!expView) return;

            expView.style.display = 'block';

            const CATEGORY_NAMES = {
                local: { label: 'Standard Rate Tariff', desc: 'Distance slab pricing up to 100 KM + standard rate above 100 KM with configurable base fare and min KM' }
            };

            const allCategories = ['local'];

            const categoriesHtml = allCategories.map(cat => {
                const t = vehicleTariffs.find(x => x.category === cat) || vehicleTariffs[0];
                const catMeta = CATEGORY_NAMES.local;

                let rateDetailsHtml = '';
                if (!t) {
                    rateDetailsHtml = `<div style="color:var(--danger-red); font-size:0.85rem; font-weight:600;">Not configured in database</div>`;
                } else {
                    const config = typeof t.config === 'string' ? JSON.parse(t.config) : t.config;
                    const baseFare = config.base !== undefined ? config.base : 0;
                    const minKm = config.minKm || 0;
                    const above100 = config.above100_rate !== undefined ? config.above100_rate : (config.slab11_rate || config.perKm || 13);
                    
                    rateDetailsHtml = `
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding-bottom:6px; margin-bottom:8px; border-bottom:1px dashed rgba(255,255,255,0.08);">
                            <span><span style="color:var(--text-muted)">Base Fare:</span> <strong style="color:var(--primary-red)">\u20B9${baseFare}</strong></span>
                            <span><span style="color:var(--text-muted)">Min KM:</span> <strong>${minKm} KM</strong></span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.8rem;">
                            <div><span style="color:var(--text-muted)">0-5 KM:</span> <strong>\u20B9${config.slab1_rate !== undefined ? config.slab1_rate : 30}/km</strong></div>
                            <div><span style="color:var(--text-muted)">6-10 KM:</span> <strong>\u20B9${config.slab2_rate !== undefined ? config.slab2_rate : 28}/km</strong></div>
                            <div><span style="color:var(--text-muted)">11-20 KM:</span> <strong>\u20B9${config.slab3_rate !== undefined ? config.slab3_rate : 26}/km</strong></div>
                            <div><span style="color:var(--text-muted)">21-30 KM:</span> <strong>\u20B9${config.slab4_rate !== undefined ? config.slab4_rate : 24}/km</strong></div>
                            <div><span style="color:var(--text-muted)">31-40 KM:</span> <strong>\u20B9${config.slab5_rate !== undefined ? config.slab5_rate : 22}/km</strong></div>
                            <div><span style="color:var(--text-muted)">41-50 KM:</span> <strong>\u20B9${config.slab6_rate !== undefined ? config.slab6_rate : 20}/km</strong></div>
                            <div><span style="color:var(--text-muted)">51-60 KM:</span> <strong>\u20B9${config.slab7_rate !== undefined ? config.slab7_rate : 18}/km</strong></div>
                            <div><span style="color:var(--text-muted)">61-70 KM:</span> <strong>\u20B9${config.slab8_rate !== undefined ? config.slab8_rate : 16}/km</strong></div>
                            <div><span style="color:var(--text-muted)">71-80 KM:</span> <strong>\u20B9${config.slab9_rate !== undefined ? config.slab9_rate : 15}/km</strong></div>
                            <div><span style="color:var(--text-muted)">81-90 KM:</span> <strong>\u20B9${config.slab10_rate !== undefined ? config.slab10_rate : 14}/km</strong></div>
                            <div><span style="color:var(--text-muted)">91-100 KM:</span> <strong>\u20B9${config.slab11_rate !== undefined ? config.slab11_rate : 13}/km</strong></div>
                            <div style="grid-column: span 2; background:rgba(10,132,255,0.1); border:1px solid rgba(10,132,255,0.2); padding:6px 10px; border-radius:6px; margin-top:4px; text-align:center;">
                                <span style="color:var(--text-muted)">Above 100 KM Standard Rate:</span> <strong style="color:var(--info-blue)">\u20B9${above100}/km</strong>
                            </div>
                        </div>
                    `;
                }

                const jsonStr = t ? JSON.stringify(t).replace(/'/g, "&apos;") : '';

                return `
                    <div class="category-tariff-card">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                                <span style="font-weight:800; font-size:0.95rem; color:#fff; text-transform:uppercase; letter-spacing:0.5px;">${catMeta.label}</span>
                                <span class="status-tag status-completed" style="font-size:0.65rem;">ACTIVE TARIFF</span>
                            </div>
                            <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">${catMeta.desc}</p>
                            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:12px; margin-bottom:1.25rem;">
                                ${rateDetailsHtml}
                            </div>
                        </div>
                        <div>
                            ${t ? `<button class="btn btn-primary" style="width:100%; padding:0.65rem; font-size:0.82rem;" onclick='openTariffModal(${jsonStr})'>⚙️ Edit Rate Tariff Configuration</button>` : `<button class="btn" style="width:100%; padding:0.65rem; font-size:0.82rem; background:rgba(255,255,255,0.05); color:var(--text-muted);" disabled>Not Available</button>`}
                        </div>
                    </div>
                `;
            }).join('');

            expView.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:1.25rem; margin-bottom:1.5rem;">
                    <div style="display:flex; align-items:center; gap:14px; min-width:0;">
                        <div style="font-size:2rem; width:52px; height:52px; flex-shrink:0; background:rgba(183,28,28,0.15); border:1px solid var(--primary-red); border-radius:14px; display:flex; align-items:center; justify-content:center;">${vehicleInfo.icon}</div>
                        <div style="min-width:0;">
                            <h2 style="margin:0; font-size:1.3rem; font-weight:800; color:#fff; word-break:break-word;">${vehicleInfo.name.toUpperCase()} RATE TARIFFS</h2>
                            <span style="font-size:0.78rem; color:var(--text-muted);">${vehicleInfo.capacity} • Vehicle Key: <code style="color:var(--info-blue); font-weight:700;">${vehicleKey}</code></span>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="collapseVehicleTariffView()" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:0.6rem 1.2rem; font-size:0.82rem; white-space:nowrap; flex-shrink:0; margin-left:auto;">← Back to All Vehicles</button>
                </div>
                <div class="category-tariff-grid">
                    ${categoriesHtml}
                </div>
            `;

            expView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function collapseVehicleTariffView() {
            _activeVehicleKey = null;
            const expView = document.getElementById('expanded-vehicle-tariff-view');
            if (expView) expView.style.display = 'none';
            if (window._adminTariffsData) {
                renderVehicleTariffTiles(window._adminTariffsData);
            }
        }

        function openTariffModal(t) {
            const config = typeof t.config === 'string' ? JSON.parse(t.config) : t.config;
            document.getElementById('edit-t-id').value = t.id;
            document.getElementById('edit-t-category').value = t.category;
            document.getElementById('tariff-info').textContent = `${t.vehicle_type.toUpperCase()} - RATE TARIFF CONFIGURATION`;
            const container = document.getElementById('tariff-fields-container');
            container.innerHTML = `
                <div class="input-group">
                    <label>Base Fare (\u20B9)</label>
                    <input type="number" step="0.01" id="edit-t-base" value="${config.base !== undefined ? config.base : 0}" required>
                </div>
                <div class="input-group">
                    <label>Min KM Distance</label>
                    <input type="number" id="edit-t-min" value="${config.minKm || 0}" required>
                </div>
                <div class="input-group">
                    <label>Rate 0-5 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab1" value="${config.slab1_rate !== undefined ? config.slab1_rate : 30}" required>
                </div>
                <div class="input-group">
                    <label>Rate 6-10 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab2" value="${config.slab2_rate !== undefined ? config.slab2_rate : 28}" required>
                </div>
                <div class="input-group">
                    <label>Rate 11-20 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab3" value="${config.slab3_rate !== undefined ? config.slab3_rate : 26}" required>
                </div>
                <div class="input-group">
                    <label>Rate 21-30 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab4" value="${config.slab4_rate !== undefined ? config.slab4_rate : 24}" required>
                </div>
                <div class="input-group">
                    <label>Rate 31-40 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab5" value="${config.slab5_rate !== undefined ? config.slab5_rate : 22}" required>
                </div>
                <div class="input-group">
                    <label>Rate 41-50 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab6" value="${config.slab6_rate !== undefined ? config.slab6_rate : 20}" required>
                </div>
                <div class="input-group">
                    <label>Rate 51-60 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab7" value="${config.slab7_rate !== undefined ? config.slab7_rate : 18}" required>
                </div>
                <div class="input-group">
                    <label>Rate 61-70 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab8" value="${config.slab8_rate !== undefined ? config.slab8_rate : 16}" required>
                </div>
                <div class="input-group">
                    <label>Rate 71-80 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab9" value="${config.slab9_rate !== undefined ? config.slab9_rate : 15}" required>
                </div>
                <div class="input-group">
                    <label>Rate 81-90 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab10" value="${config.slab10_rate !== undefined ? config.slab10_rate : 14}" required>
                </div>
                <div class="input-group">
                    <label>Rate 91-100 KM (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-slab11" value="${config.slab11_rate !== undefined ? config.slab11_rate : 13}" required>
                </div>
                <div class="input-group" style="grid-column: span 2;">
                    <label style="color:var(--info-blue) !important; font-weight:800 !important;">Above 100 KM Standard Rate (\u20B9/km)</label>
                    <input type="number" step="0.01" id="edit-t-above100" value="${config.above100_rate !== undefined ? config.above100_rate : (config.slab11_rate || config.perKm || 13)}" required>
                </div>
            `;
            document.getElementById('tariff-modal').style.display = 'flex';
        }

        function closeTariffModal() {
            document.getElementById('tariff-modal').style.display = 'none';
        }

        document.getElementById('tariff-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-t-id').value;
            const config = {
                base: parseFloat(document.getElementById('edit-t-base').value) || 0,
                minKm: parseInt(document.getElementById('edit-t-min').value) || 0,
                slab1_rate: parseFloat(document.getElementById('edit-t-slab1').value) || 0,
                slab2_rate: parseFloat(document.getElementById('edit-t-slab2').value) || 0,
                slab3_rate: parseFloat(document.getElementById('edit-t-slab3').value) || 0,
                slab4_rate: parseFloat(document.getElementById('edit-t-slab4').value) || 0,
                slab5_rate: parseFloat(document.getElementById('edit-t-slab5').value) || 0,
                slab6_rate: parseFloat(document.getElementById('edit-t-slab6').value) || 0,
                slab7_rate: parseFloat(document.getElementById('edit-t-slab7').value) || 0,
                slab8_rate: parseFloat(document.getElementById('edit-t-slab8').value) || 0,
                slab9_rate: parseFloat(document.getElementById('edit-t-slab9').value) || 0,
                slab10_rate: parseFloat(document.getElementById('edit-t-slab10').value) || 0,
                slab11_rate: parseFloat(document.getElementById('edit-t-slab11').value) || 0,
            };
            try {
const res = await fetch(`${API_BASE_URL}/api/admin/update-tariff`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id, config })
});
if (res.ok) {
alert('Tariff updated successfully!');
closeTariffModal();
loadTabData('tariffs');
} else {
const err = await res.json();
alert(err.error);
}
} catch (err) { alert('Update failed'); }
});
let _peakRulesData = [];
async function loadPeakRules() {
try {
const res = await fetch(`${API_BASE_URL}/api/peak-rules`);
const rules = await res.json();
_peakRulesData = rules;
const body = document.getElementById('peak-rules-table-body');
if (!body) return;
body.innerHTML = '';
rules.forEach(r => {
body.innerHTML += `
<tr>
<td data-label="Start Time">${r.start_time}</td>
<td data-label="End Time">${r.end_time}</td>
<td data-label="Surcharge"><strong style="color:#e65100">+${r.surcharge_percentage}%</strong></td>
<td data-label="Actions">
<button class="action-btn" style="color:#1565c0" onclick="openPeakRuleModal(${r.id})">Edit</button>
<button class="action-btn" style="color:#d32f2f; margin-left: 8px;" onclick="deletePeakRule(${r.id})">Remove</button>
</td>
</tr>
`;
});
} catch (err) { console.error('Failed to load peak rules', err); }
}
function openPeakRuleModal(ruleId = null) {
let rule = null;
if (ruleId) {
if (typeof ruleId === 'number' || typeof ruleId === 'string') {
rule = _peakRulesData.find(r => r.id == ruleId);
}
}
if (rule) {
document.getElementById('p-id').value = rule.id;
document.getElementById('p-start').value = rule.start_time ? rule.start_time.substring(0, 5) : '';
document.getElementById('p-end').value = rule.end_time ? rule.end_time.substring(0, 5) : '';
document.getElementById('p-percent').value = rule.surcharge_percentage;
document.querySelector('#peak-rule-modal h3').textContent = 'Edit Peak Rule';
document.querySelector('#peak-rule-modal .btn').textContent = 'Update Rule';
} else {
document.getElementById('p-id').value = '';
document.getElementById('p-start').value = '';
document.getElementById('p-end').value = '';
document.getElementById('p-percent').value = '';
document.querySelector('#peak-rule-modal h3').textContent = 'Add Peak Rule';
document.querySelector('#peak-rule-modal .btn').textContent = 'Add Rule';
}
document.getElementById('peak-rule-modal').style.display = 'flex';
}
function closePeakRuleModal() {
document.getElementById('peak-rule-modal').style.display = 'none';
}
async function savePeakRule(e) {
e.preventDefault();
const id = document.getElementById('p-id').value;
const data = {
start_time: document.getElementById('p-start').value,
end_time: document.getElementById('p-end').value,
surcharge_percentage: document.getElementById('p-percent').value
};
try {
const endpoint = id ? `${API_BASE_URL}/api/admin/peak-rules/update` : `${API_BASE_URL}/api/admin/peak-rules/add`;
if (id) data.id = id;
const res = await fetch(endpoint, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(data)
});
if (res.ok) {
alert(id ? 'Peak rule updated!' : 'Peak rule added!');
closePeakRuleModal();
loadPeakRules();
} else {
const err = await res.json();
alert(err.error || 'Failed to save rule');
}
} catch (err) { alert('Failed to save rule'); }
}
async function deletePeakRule(id) {
if (!confirm('Remove this peak surcharge rule?')) return;
try {
const res = await fetch(`${API_BASE_URL}/api/admin/peak-rules/delete`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id })
});
if (res.ok) {
        loadPeakRules();
        loadSpecialLocationCharges();
}
} catch (err) { alert('Failed to delete rule'); }
}

// ============================================================
// SPECIAL LOCATION CHARGES CRUD
// ============================================================
let _specialLocationData = [];
async function loadSpecialLocationCharges() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/special-location-charges`);
        const charges = await res.json();
        _specialLocationData = charges;
        const body = document.getElementById('special-location-table-body');
        if (!body) return;
        body.innerHTML = '';
        if (!charges.length) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">No special location charges configured.</td></tr>';
            return;
        }
        charges.forEach(c => {
            const isActive = c.is_active;
            const updated = c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Place Type"><code style="color:#a78bfa; font-size:0.85rem;">${c.place_type}</code></td>
                <td data-label="Display Name"><strong>${c.display_name}</strong></td>
                <td data-label="Surcharge (%)" style="color:#6c63ff; font-weight:700;">${parseFloat(c.surcharge_percentage).toFixed(1)}%</td>
                <td data-label="Status"><span style="font-size:0.75rem; font-weight:800; padding:3px 10px; border-radius:20px; background:${isActive ? 'rgba(46,125,50,0.2)' : 'rgba(183,28,28,0.15)'}; color:${isActive ? '#66bb6a' : '#ef5350'};">${isActive ? 'Active' : 'Inactive'}</span></td>
                <td data-label="Updated">${updated}</td>
                <td data-label="Actions" style="white-space:nowrap;">
                    <button class="action-btn" onclick="openSpecialLocationModal(${c.id})" style="margin-right:4px;">Edit</button>
                    <button class="action-btn" onclick="toggleSpecialLocation(${c.id})" style="background:${isActive ? 'rgba(183,28,28,0.15)' : 'rgba(46,125,50,0.15)'}; margin-right:4px;">${isActive ? 'Disable' : 'Enable'}</button>
                    <button class="action-btn" onclick="deleteSpecialLocation(${c.id})" style="background:rgba(183,28,28,0.15); color:#ef5350;">Del</button>
                </td>
            `;
            body.appendChild(row);
        });
    } catch (err) { console.error('Failed to load special location charges', err); }
}

function openSpecialLocationModal(chargeId) {
    const modal = document.getElementById('special-location-modal');
    if (!modal) return;
    const charge = chargeId ? _specialLocationData.find(c => c.id === chargeId) : null;
    document.getElementById('sl-id').value = charge ? charge.id : '';
    document.getElementById('sl-place-type').value = charge ? charge.place_type : '';
    document.getElementById('sl-place-type').disabled = !!charge; // can't change place_type after creation
    document.getElementById('sl-display-name').value = charge ? charge.display_name : '';
    document.getElementById('sl-percent').value = charge ? charge.surcharge_percentage : '';
    document.getElementById('sl-is-active').value = charge ? (charge.is_active ? '1' : '0') : '1';
    modal.querySelector('h3').textContent = charge ? 'Edit Special Location Charge' : 'Add Special Location Charge';
    modal.style.display = 'flex';
}
function closeSpecialLocationModal() {
    const modal = document.getElementById('special-location-modal');
    if (modal) modal.style.display = 'none';
}
async function saveSpecialLocation(e) {
    e.preventDefault();
    const id = document.getElementById('sl-id').value;
    const data = {
        place_type: document.getElementById('sl-place-type').value,
        display_name: document.getElementById('sl-display-name').value,
        surcharge_percentage: document.getElementById('sl-percent').value,
        is_active: document.getElementById('sl-is-active').value === '1'
    };
    try {
        const endpoint = id
            ? `${API_BASE_URL}/api/admin/special-location-charges/update`
            : `${API_BASE_URL}/api/admin/special-location-charges/add`;
        if (id) data.id = id;
        const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        const result = await res.json();
        if (res.ok && !result.error) {
            alert(id ? 'Location charge updated!' : 'Location charge added!');
            closeSpecialLocationModal();
            loadSpecialLocationCharges();
        } else {
            alert(result.error || 'Failed to save charge');
        }
    } catch (err) { alert('Failed to save special location charge'); }
}
async function toggleSpecialLocation(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/special-location-charges/toggle`, {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id })
        });
        if (res.ok) loadSpecialLocationCharges();
        else alert('Failed to toggle status');
    } catch (err) { alert('Failed to toggle status'); }
}
async function deleteSpecialLocation(id) {
    if (!confirm('Remove this special location charge permanently?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/special-location-charges/delete`, {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id })
        });
        if (res.ok) loadSpecialLocationCharges();
        else alert('Failed to delete');
    } catch (err) { alert('Failed to delete'); }
}

let _activeTab = 'overview';
document.querySelectorAll('.nav-item').forEach(item => {
item.addEventListener('click', () => {
const match = item.getAttribute('onclick')?.match(/switchTab\('(\w+)'/);
if (match) _activeTab = match[1];
});
});
loadTabData('overview');
setInterval(() => { loadTabData(_activeTab); }, 20000);

// --- SOCKET.IO: Real-time connection ---
(function initAdminSocket() {
    if (typeof io === 'undefined') {
        console.warn('[Socket.IO] io client library not loaded.');
        return;
    }
    const raw = localStorage.getItem('cityride_master');
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch(e) {}
    try {
        const adminSocket = io({
            auth: { token: parsed?.token || '' },
            transports: ['websocket', 'polling'],
            reconnectionDelay: 2000,
            reconnectionAttempts: 20
        });
        if (adminSocket) {
            adminSocket.on('connect', () => console.log('[Socket.IO] Admin connected:', adminSocket.id));
            adminSocket.on('disconnect', (r) => console.warn('[Socket.IO] Admin disconnected:', r));
            ['new_opportunity', 'booking_status_update', 'booking_confirmed'].forEach(ev => {
                adminSocket.on(ev, () => {
                    if (typeof loadTabData === 'function') loadTabData(_activeTab);
                });
            });
        }
    } catch(e) {
        console.warn('[Socket.IO] Admin socket init error:', e.message);
    }
})();