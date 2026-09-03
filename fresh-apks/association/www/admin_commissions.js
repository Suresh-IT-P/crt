// Admin Commissions UI Integration

document.addEventListener('DOMContentLoaded', () => {
    // Inject Menu Item
    const menuContainer = document.querySelector('.sidebar-menu') || document.querySelector('.nav') || document.querySelector('nav');
    if (menuContainer) {
        const menuItem = document.createElement('div');
        menuItem.innerHTML = `<a href="#" onclick="showSection('commissions-section')" class="nav-item">💰 Financial & Commission Config</a>`;
        menuContainer.appendChild(menuItem);
    }

    // Inject Section
    const mainContent = document.querySelector('main') || document.querySelector('.content') || document.body;
    const section = document.createElement('div');
    section.id = 'commissions-section';
    section.className = 'admin-section';
    section.style.display = 'none';
    section.innerHTML = `
        <h2>Financial & Commission Configuration</h2>
        
        <div class="config-card" style="border:1px solid #ccc; padding:20px; border-radius:8px; margin-bottom: 20px;">
            <h3>Active Configuration</h3>
            <div id="active-commission-display">Loading...</div>
        </div>

        <div class="config-card" style="border:1px solid #ccc; padding:20px; border-radius:8px; margin-bottom: 20px;">
            <h3>Create New Configuration Version</h3>
            <form id="commission-form">
                <label>Customer Commission %</label>
                <input type="number" id="cust-comm" step="0.01" required value="3">
                <br><br>
                <label>Driver Commission %</label>
                <input type="number" id="drv-comm" step="0.01" required value="9">
                <br><br>
                <label>Maintenance Allocation %</label>
                <input type="number" id="maint-alloc" step="0.01" required value="5">
                <br><br>
                <label>Association Allocation %</label>
                <input type="number" id="assoc-alloc" step="0.01" required value="3.5">
                <br><br>
                <label>CityRide Allocation %</label>
                <input type="number" id="city-alloc" step="0.01" required value="3.5">
                <br><br>
                <label>Effective From</label>
                <input type="datetime-local" id="effective-from" required>
                <br><br>
                <button type="submit" style="background:var(--primary);color:white;padding:10px 20px;border:none;border-radius:5px;">Save New Version</button>
            </form>
        </div>

        <div class="config-card" style="border:1px solid #ccc; padding:20px; border-radius:8px;">
            <h3>Configuration History</h3>
            <table border="1" width="100%" cellpadding="5">
                <thead>
                    <tr>
                        <th>Version</th>
                        <th>Cust %</th>
                        <th>Drv %</th>
                        <th>Total %</th>
                        <th>Maint %</th>
                        <th>Assoc %</th>
                        <th>City %</th>
                        <th>Effective From</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="commission-history-tbody"></tbody>
            </table>
        </div>
    `;
    mainContent.appendChild(section);

    // Logic
    async function loadCommissions() {
        try {
            const res = await fetch('/api/admin/commissions', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') } });
            const data = await res.json();
            
            const tbody = document.getElementById('commission-history-tbody');
            tbody.innerHTML = '';
            
            let activeFound = false;
            
            data.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>\${c.version}</td>
                    <td>\${c.customer_commission_percent}</td>
                    <td>\${c.driver_commission_percent}</td>
                    <td>\${c.total_commission_percent}</td>
                    <td>\${c.maintenance_percent}</td>
                    <td>\${c.association_percent}</td>
                    <td>\${c.cityride_percent}</td>
                    <td>\${new Date(c.effective_from).toLocaleString()}</td>
                    <td>\${c.status}</td>
                `;
                tbody.appendChild(tr);

                if (!activeFound && c.status === 'active') {
                    activeFound = true;
                    document.getElementById('active-commission-display').innerHTML = `
                        <p><strong>Version:</strong> \${c.version}</p>
                        <p><strong>Customer:</strong> \${c.customer_commission_percent}% | <strong>Driver:</strong> \${c.driver_commission_percent}%</p>
                        <p><strong>Allocations:</strong> Maintenance: \${c.maintenance_percent}% | Association: \${c.association_percent}% | CityRide: \${c.cityride_percent}%</p>
                    `;
                }
            });
        } catch (e) {
            console.error("Failed to load commissions", e);
        }
    }

    document.getElementById('commission-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const cust = parseFloat(document.getElementById('cust-comm').value);
        const drv = parseFloat(document.getElementById('drv-comm').value);
        const maint = parseFloat(document.getElementById('maint-alloc').value);
        const assoc = parseFloat(document.getElementById('assoc-alloc').value);
        const city = parseFloat(document.getElementById('city-alloc').value);
        
        const total = cust + drv;
        const allocTotal = maint + assoc + city;
        
        if (Math.abs(total - allocTotal) > 0.01) {
            alert(`Validation Failed! Total Commission (\${total}%) must equal Allocation Total (\${allocTotal}%)`);
            return;
        }

        try {
            const res = await fetch('/api/admin/commissions', {
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
                alert("Saved successfully!");
                loadCommissions();
            } else {
                alert("Error: " + data.error);
            }
        } catch (e) {
            alert("Network error.");
        }
    });

    // Load initial data
    loadCommissions();
});
