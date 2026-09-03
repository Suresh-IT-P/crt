
        let performanceChartInstance = null;
        let revenueChartInstance = null;
        let networkChartInstance = null;

        function renderPerformanceChart(stats) {
            // Helper for common tooltip style
            const commonTooltip = {
                backgroundColor: '#18181B',
                titleColor: '#FFFFFF',
                bodyColor: '#A1A1AA',
                borderColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                padding: 12,
                displayColors: true
            };

            // 1. Mission Status (Doughnut)
            const ctxPerf = document.getElementById('performanceChart');
            if (ctxPerf) {
                if (performanceChartInstance) performanceChartInstance.destroy();
                
                const pending = parseInt(stats.pendingMissions) || 0;
                const active = parseInt(stats.activeBookings) || 0;
                const cancelled = parseInt(stats.cancelRequests) || 0;
                
                let dataValues = [pending, active, cancelled];
                let bgColors = ['#F59E0B', '#3B82F6', '#EF4444'];
                if (pending === 0 && active === 0 && cancelled === 0) {
                    dataValues = [1];
                    bgColors = ['#27272A'];
                }
                
                performanceChartInstance = new Chart(ctxPerf, {
                    type: 'doughnut',
                    data: {
                        labels: (pending === 0 && active === 0 && cancelled === 0) ? ['No Active Missions'] : ['Pending Assignment', 'Active Missions', 'Cancel Requests'],
                        datasets: [{ data: dataValues, backgroundColor: bgColors, borderColor: '#121214', borderWidth: 2, hoverOffset: 4 }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '75%',
                        plugins: { legend: { display: false }, tooltip: commonTooltip }
                    }
                });
            }

            // 2. Financial Overview (Bar)
            const ctxRev = document.getElementById('revenueChart');
            if (ctxRev) {
                if (revenueChartInstance) revenueChartInstance.destroy();
                
                const revenue = parseFloat(stats.revenue) || 0;
                const profit = parseFloat(stats.profit) || 0;
                
                revenueChartInstance = new Chart(ctxRev, {
                    type: 'bar',
                    data: {
                        labels: ['Total Revenue', 'Platform Profit'],
                        datasets: [{
                            label: 'Amount (\u20B9)',
                            data: [revenue, profit],
                            backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(16, 185, 129, 0.8)'],
                            borderColor: ['#3B82F6', '#10B981'],
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#A1A1AA' } },
                            x: { grid: { display: false }, ticks: { color: '#A1A1AA' } }
                        },
                        plugins: { legend: { display: false }, tooltip: commonTooltip }
                    }
                });
            }

            // 3. Network Growth (Doughnut)
            const ctxNet = document.getElementById('networkChart');
            if (ctxNet) {
                if (networkChartInstance) networkChartInstance.destroy();
                
                const users = parseInt(stats.totalUsers) || 0;
                const drivers = parseInt(stats.totalDrivers) || 0;
                
                let dataValues = [users, drivers];
                let bgColors = ['#8B5CF6', '#10B981']; // Purple and Green
                if (users === 0 && drivers === 0) {
                    dataValues = [1];
                    bgColors = ['#27272A'];
                }
                
                networkChartInstance = new Chart(ctxNet, {
                    type: 'doughnut',
                    data: {
                        labels: (users === 0 && drivers === 0) ? ['No Members'] : ['Total Users', 'Total Partners'],
                        datasets: [{ data: dataValues, backgroundColor: bgColors, borderColor: '#121214', borderWidth: 2, hoverOffset: 4 }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '75%',
                        plugins: { legend: { display: false }, tooltip: commonTooltip }
                    }
                });
            }
        }

        // --- SYSTEM REPORTS MANAGEMENT ---
        let currentReportType = 'associations';
        let reportDataCache = [];
        let reportChartInstance = null;

        function switchReportSubTab(type) {
            currentReportType = type;
            const btnAssoc = document.getElementById('btn-report-assoc');
            const btnVeh = document.getElementById('btn-report-vehicle');
            const btnDriver = document.getElementById('btn-report-driver');

            const allBtns = [
                { id: 'associations', el: btnAssoc, title: '🏢 Association Performance Breakdown' },
                { id: 'vehicles', el: btnVeh, title: '🚗 Vehicle Level Performance Breakdown' },
                { id: 'drivers', el: btnDriver, title: '👨‍✈️ Driver Performance & Audit Report' }
            ];

            allBtns.forEach(item => {
                if (item.el) {
                    if (item.id === type) {
                        item.el.style.background = 'var(--primary-red)';
                        item.el.style.color = '#FFFFFF';
                        document.getElementById('report-table-title').innerHTML = item.title;
                    } else {
                        item.el.style.background = 'transparent';
                        item.el.style.color = 'var(--text-muted)';
                    }
                }
            });
            loadSystemReports();
        }

        async function loadSystemReports() {
            try {
                const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
                const startDate = document.getElementById('report-start-date')?.value || '';
                const endDate = document.getElementById('report-end-date')?.value || '';
                let queryParams = [];
                if (startDate && endDate) {
                    queryParams.push(`startDate=${startDate}`, `endDate=${endDate}`);
                }
                const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

                const endpoint = currentReportType === 'associations' ? '/api/admin/reports/associations' :
                                 currentReportType === 'vehicles' ? '/api/admin/reports/vehicles' :
                                 '/api/admin/reports/drivers';

                const res = await fetch(`${API_BASE_URL}${endpoint}${queryString}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (!res.ok) throw new Error('Failed to load report data');
                const data = await res.json();
                reportDataCache = data;

                if (currentReportType === 'associations') {
                    renderAssociationReport(data);
                } else if (currentReportType === 'vehicles') {
                    renderVehicleReport(data);
                } else {
                    renderDriverReport(data);
                }
                renderReportChart(data, currentReportType);
            } catch (err) {
                console.error('Error loading reports:', err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire('Error', 'Failed to fetch report data.', 'error');
                }
            }
        }

        function renderAssociationReport(data) {
            const head = document.getElementById('reports-table-head');
            const body = document.getElementById('reports-table-body');
            if (!head || !body) return;

            head.innerHTML = `
                <tr>
                    <th>Association Name</th>
                    <th>District / City</th>
                    <th>Pilots</th>
                    <th>Completed Rides</th>
                    <th>Cancelled</th>
                    <th>Gross Revenue</th>
                    <th>Commission</th>
                    <th>Status</th>
                </tr>
            `;

            let totalAssoc = data.length;
            let totalPilots = 0;
            let totalRides = 0;
            let totalRev = 0;

            if (data.length === 0) {
                body.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">No association data available.</td></tr>`;
            } else {
                body.innerHTML = data.map(item => {
                    totalPilots += parseInt(item.total_drivers) || 0;
                    totalRides += parseInt(item.completed_rides) || 0;
                    totalRev += parseFloat(item.total_revenue) || 0;
                    
                    const statusPill = item.is_active 
                        ? `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--primary-red-pista); border: 1px solid var(--primary-red-pista);">Active</span>`
                        : `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger-red); border: 1px solid var(--danger-red);">Inactive</span>`;
                    
                    const comm = item.commission_type === 'percentage' 
                        ? `${item.commission_value}%` 
                        : `\u20B9${item.commission_value}`;

                    return `
                        <tr>
                            <td><strong>${item.name || 'N/A'}</strong></td>
                            <td>${item.city_name || 'N/A'}</td>
                            <td>${item.total_drivers || 0}</td>
                            <td>${item.completed_rides || 0}</td>
                            <td>${item.cancelled_rides || 0}</td>
                            <td style="color: var(--primary-red-pista); font-weight: 600;">\u20B9${(parseFloat(item.total_revenue) || 0).toLocaleString()}</td>
                            <td>${comm}</td>
                            <td>${statusPill}</td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('report-card-1-label').textContent = 'TOTAL ASSOCIATIONS';
            document.getElementById('report-card-1-val').textContent = totalAssoc;
            document.getElementById('report-card-2-label').textContent = 'TOTAL PILOTS';
            document.getElementById('report-card-2-val').textContent = totalPilots;
            document.getElementById('report-card-3-label').textContent = 'COMPLETED MISSIONS';
            document.getElementById('report-card-3-val').textContent = totalRides;
            document.getElementById('report-card-4-label').textContent = 'GROSS REVENUE';
            document.getElementById('report-card-4-val').textContent = `\u20B9${totalRev.toLocaleString()}`;
        }

        function renderVehicleReport(data) {
            const head = document.getElementById('reports-table-head');
            const body = document.getElementById('reports-table-body');
            if (!head || !body) return;

            head.innerHTML = `
                <tr>
                    <th>Vehicle Category</th>
                    <th>Registered Drivers</th>
                    <th>Completed Rides</th>
                    <th>Cancelled Rides</th>
                    <th>Gross Revenue</th>
                    <th>Avg Fare / Ride</th>
                </tr>
            `;

            let totalCategories = data.length;
            let totalDrivers = 0;
            let totalRides = 0;
            let totalRev = 0;

            const vehicleNames = {
                'bike': '🏍️ Bike',
                'auto': '🛺 Auto (3+1)',
                'hatchback': '🚗 Hatchback (4+1)',
                'sedan': '🚘 Sedan',
                'suv': '🚙 SUV',
                '8plus1': '🚐 Tempo Traveller (8+1)',
                'van24': '🚌 Omni Bus (24+1)'
            };

            if (data.length === 0) {
                body.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 2rem;">No vehicle data available.</td></tr>`;
            } else {
                body.innerHTML = data.map(item => {
                    const drivers = parseInt(item.registered_drivers) || 0;
                    const rides = parseInt(item.completed_rides) || 0;
                    const rev = parseFloat(item.total_revenue) || 0;
                    const avgFare = rides > 0 ? (rev / rides).toFixed(2) : '0.00';

                    totalDrivers += drivers;
                    totalRides += rides;
                    totalRev += rev;

                    const vLabel = vehicleNames[item.vehicle_type?.toLowerCase()] || item.vehicle_type?.toUpperCase();

                    return `
                        <tr>
                            <td><strong>${vLabel}</strong></td>
                            <td>${drivers}</td>
                            <td>${rides}</td>
                            <td>${item.cancelled_rides || 0}</td>
                            <td style="color: var(--primary-red-pista); font-weight: 600;">\u20B9${rev.toLocaleString()}</td>
                            <td>\u20B9${avgFare}</td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('report-card-1-label').textContent = 'VEHICLE TYPES';
            document.getElementById('report-card-1-val').textContent = totalCategories;
            document.getElementById('report-card-2-label').textContent = 'TOTAL DRIVERS';
            document.getElementById('report-card-2-val').textContent = totalDrivers;
            document.getElementById('report-card-3-label').textContent = 'COMPLETED MISSIONS';
            document.getElementById('report-card-3-val').textContent = totalRides;
            document.getElementById('report-card-4-label').textContent = 'GROSS REVENUE';
            document.getElementById('report-card-4-val').textContent = `\u20B9${totalRev.toLocaleString()}`;
        }

        function renderDriverReport(data) {
            const head = document.getElementById('reports-table-head');
            const body = document.getElementById('reports-table-body');
            if (!head || !body) return;

            head.innerHTML = `
                <tr>
                    <th>Driver Name & Contact</th>
                    <th>Vehicle & Plate</th>
                    <th>Association</th>
                    <th>Completed Rides</th>
                    <th>Cancelled</th>
                    <th>Total Earnings</th>
                    <th>Wallet Balance</th>
                    <th>Status</th>
                </tr>
            `;

            let totalDrivers = data.length;
            let totalActiveDrivers = 0;
            let totalRides = 0;
            let totalEarnings = 0;

            const vehicleNames = {
                'bike': '🏍️ Bike', 'auto': '🛺 Auto', 'hatchback': '🚗 Hatchback',
                'sedan': '🚘 Sedan', 'suv': '🚙 SUV', '8plus1': '🚐 Tempo', 'van24': '🚌 Bus'
            };

            if (data.length === 0) {
                body.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">No driver data available.</td></tr>`;
            } else {
                body.innerHTML = data.map(item => {
                    const rides = parseInt(item.completed_rides) || 0;
                    const earnings = parseFloat(item.total_earnings) || 0;
                    const wallet = parseFloat(item.wallet_balance) || 0;

                    if (item.approval_status === 'approved' && !item.is_blocked) {
                        totalActiveDrivers++;
                    }
                    totalRides += rides;
                    totalEarnings += earnings;

                    const statusPill = item.is_blocked 
                        ? `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger-red); border: 1px solid var(--danger-red);">Blocked</span>`
                        : item.approval_status === 'approved'
                        ? `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--primary-red-pista); border: 1px solid var(--primary-red-pista);">Active</span>`
                        : `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: var(--warning-amber); border: 1px solid var(--warning-amber);">${item.approval_status || 'Pending'}</span>`;

                    const vType = vehicleNames[item.vehicle_type?.toLowerCase()] || item.vehicle_type || 'Sedan';

                    return `
                        <tr>
                            <td>
                                <div><strong>${item.driver_name || 'N/A'}</strong></div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">${item.phone || ''}</div>
                            </td>
                            <td>
                                <div>${vType} - ${item.car_model || ''}</div>
                                <div style="font-size: 0.75rem; color: var(--info-blue); font-weight: 600;">${item.car_number || 'N/A'}</div>
                            </td>
                            <td>${item.association_name || 'Direct'}</td>
                            <td>${rides}</td>
                            <td>${item.cancelled_rides || 0}</td>
                            <td style="color: var(--primary-red-pista); font-weight: 600;">\u20B9${earnings.toLocaleString()}</td>
                            <td>\u20B9${wallet.toFixed(2)}</td>
                            <td>${statusPill}</td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('report-card-1-label').textContent = 'TOTAL DRIVERS';
            document.getElementById('report-card-1-val').textContent = totalDrivers;
            document.getElementById('report-card-2-label').textContent = 'ACTIVE DRIVERS';
            document.getElementById('report-card-2-val').textContent = totalActiveDrivers;
            document.getElementById('report-card-3-label').textContent = 'COMPLETED MISSIONS';
            document.getElementById('report-card-3-val').textContent = totalRides;
            document.getElementById('report-card-4-label').textContent = 'TOTAL EARNINGS';
            document.getElementById('report-card-4-val').textContent = `\u20B9${totalEarnings.toLocaleString()}`;
        }

        function renderReportChart(data, type) {
            const ctx = document.getElementById('reportAnalyticsChart');
            if (!ctx) return;
            if (reportChartInstance) reportChartInstance.destroy();

            let labels = [];
            let chartData = [];
            let colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#6366F1', '#14B8A6', '#F97316'];

            if (type === 'associations') {
                labels = data.map(d => d.name || 'N/A');
                chartData = data.map(d => parseFloat(d.total_revenue) || 0);
            } else if (type === 'vehicles') {
                const vehicleNames = {
                    'bike': 'Bike', 'auto': 'Auto', 'hatchback': 'Hatchback',
                    'sedan': 'Sedan', 'suv': 'SUV', '8plus1': 'Tempo (8+1)', 'van24': 'Omni (24+1)'
                };
                labels = data.map(d => vehicleNames[d.vehicle_type?.toLowerCase()] || d.vehicle_type);
                chartData = data.map(d => parseFloat(d.total_revenue) || 0);
            } else {
                const topDrivers = [...data].sort((a, b) => (parseFloat(b.total_earnings) || 0) - (parseFloat(a.total_earnings) || 0)).slice(0, 7);
                labels = topDrivers.map(d => d.driver_name || 'Driver');
                chartData = topDrivers.map(d => parseFloat(d.total_earnings) || 0);
            }

            if (chartData.length === 0 || chartData.every(v => v === 0)) {
                labels = ['No Data'];
                chartData = [1];
                colors = ['#27272A'];
            }

            reportChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: chartData,
                        backgroundColor: colors,
                        borderColor: '#121214',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#A1A1AA', font: { family: 'Outfit', size: 11 } }
                        }
                    }
                }
            });
        }

        function resetReportDates() {
            if (document.getElementById('report-start-date')) document.getElementById('report-start-date').value = '';
            if (document.getElementById('report-end-date')) document.getElementById('report-end-date').value = '';
            loadSystemReports();
        }

        function exportReportCSV() {
            if (!reportDataCache || reportDataCache.length === 0) {
                if (typeof Swal !== 'undefined') Swal.fire('Notice', 'No report data available to export.', 'info');
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,";
            if (currentReportType === 'associations') {
                csvContent += "Association Name,District/City,Total Pilots,Completed Rides,Cancelled Rides,Gross Revenue,Commission\n";
                reportDataCache.forEach(row => {
                    const line = `"${row.name || ''}","${row.city_name || ''}",${row.total_drivers || 0},${row.completed_rides || 0},${row.cancelled_rides || 0},${row.total_revenue || 0},"${row.commission_type === 'percentage' ? row.commission_value + '%' : '\u20B9' + row.commission_value}"`;
                    csvContent += line + "\n";
                });
            } else if (currentReportType === 'vehicles') {
                csvContent += "Vehicle Category,Registered Drivers,Completed Rides,Cancelled Rides,Gross Revenue,Avg Fare\n";
                reportDataCache.forEach(row => {
                    const rides = parseInt(row.completed_rides) || 0;
                    const rev = parseFloat(row.total_revenue) || 0;
                    const avgFare = rides > 0 ? (rev / rides).toFixed(2) : '0.00';
                    const line = `"${row.vehicle_type}",${row.registered_drivers || 0},${rides},${row.cancelled_rides || 0},${rev},${avgFare}`;
                    csvContent += line + "\n";
                });
            } else {
                csvContent += "Driver Name,Phone,Car Model,Car Number,Vehicle Type,Association,Completed Rides,Cancelled Rides,Total Earnings,Wallet Balance,Status\n";
                reportDataCache.forEach(row => {
                    const line = `"${row.driver_name || ''}","${row.phone || ''}","${row.car_model || ''}","${row.car_number || ''}","${row.vehicle_type || ''}","${row.association_name || ''}",${row.completed_rides || 0},${row.cancelled_rides || 0},${row.total_earnings || 0},${row.wallet_balance || 0},"${row.approval_status}"`;
                    csvContent += line + "\n";
                });
            }

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `cityride_${currentReportType}_report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function exportReportPDF() {
            if (!reportDataCache || reportDataCache.length === 0) {
                if (typeof Swal !== 'undefined') Swal.fire('Notice', 'No report data available to export.', 'info');
                return;
            }

            try {
                const jspdfObj = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
                if (!jspdfObj) {
                    if (typeof Swal !== 'undefined') Swal.fire('Error', 'PDF library loading...', 'warning');
                    return;
                }
                const doc = new jspdfObj();

                doc.setFillColor(18, 18, 20);
                doc.rect(0, 0, 210, 297, 'F');

                doc.setTextColor(16, 185, 129);
                doc.setFontSize(18);
                doc.setFont("helvetica", "bold");
                doc.text("CityRide Taxi Enterprise Report", 14, 20);

                doc.setTextColor(161, 161, 170);
                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                const reportTitle = currentReportType === 'associations' ? 'Association Level Performance Audit' :
                                    currentReportType === 'vehicles' ? 'Vehicle Level Performance Audit' :
                                    'Driver Performance & Audit Report';
                doc.text(`${reportTitle} - Generated on ${new Date().toLocaleString()}`, 14, 28);

                if (typeof doc.autoTable === 'function') {
                    doc.autoTable({
                        html: '#reports-table',
                        startY: 35,
                        theme: 'grid',
                        headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: 'bold' },
                        bodyStyles: { fillColor: [18, 18, 20], textColor: [220, 220, 225] },
                        alternateRowStyles: { fillColor: [24, 24, 27] },
                        gridLineColor: [40, 40, 45]
                    });
                }

                doc.save(`cityride_${currentReportType}_report.pdf`);
            } catch (err) {
                console.error("PDF Export Error:", err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire('Error', 'Failed to generate PDF.', 'error');
                }
            }
        }

        // --- UNDERGROUND LEVEL AUDIT & TELEMETRY ---
        let _undergroundData = { stats: {}, rides: [], associations: [], drivers: [] };

        async function loadUndergroundReports() {
            const assoc = document.getElementById('ug-filter-assoc')?.value || 'all';
            const driver = document.getElementById('ug-filter-driver')?.value || 'all';
            const vehicleType = document.getElementById('ug-filter-vehicle-type')?.value || 'all';
            const vehicle = document.getElementById('ug-filter-vehicle')?.value || '';
            const user = document.getElementById('ug-filter-user')?.value || '';
            const status = document.getElementById('ug-filter-status')?.value || 'all';
            const startDate = document.getElementById('ug-filter-start-date')?.value || '';
            const endDate = document.getElementById('ug-filter-end-date')?.value || '';

            const tbody = document.getElementById('ug-reports-table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading Underground Audit Data...</td></tr>`;

            try {
                const queryParams = new URLSearchParams({
                    association_id: assoc,
                    driver_id: driver,
                    vehicle_type: vehicleType,
                    vehicle_search: vehicle,
                    user_id: user,
                    status: status,
                    start_date: startDate,
                    end_date: endDate
                });

                const res = await fetch(`${API_BASE_URL}/api/admin/underground-reports?${queryParams.toString()}`);
                if (!res.ok) throw new Error('Failed to load underground audit data');

                _undergroundData = await res.json();
                renderUndergroundUI();
            } catch (err) {
                console.error('loadUndergroundReports Error:', err);
                if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger-red); padding: 2rem;">Error: ${err.message}</td></tr>`;
            }
        }

        function populateDriverDropdown(selectedAssocId = 'all', selectedDriverId = 'all') {
            const driverSelect = document.getElementById('ug-filter-driver');
            if (!driverSelect) return;

            const currentVal = selectedDriverId !== 'all' ? selectedDriverId : (driverSelect.value || 'all');
            driverSelect.innerHTML = '<option value="all">-- All Drivers / Pilots --</option>';

            if (Array.isArray(_undergroundData.drivers)) {
                _undergroundData.drivers.forEach(d => {
                    if (selectedAssocId === 'all' || String(d.association_id) === String(selectedAssocId)) {
                        const opt = document.createElement('option');
                        opt.value = d.id;
                        opt.textContent = `${d.name} (${d.phone} - ${d.car_number || 'N/A'})`;
                        if (String(d.id) === String(currentVal)) {
                            opt.selected = true;
                        }
                        driverSelect.appendChild(opt);
                    }
                });
            }
        }

        function onAssocFilterChange() {
            const assocVal = document.getElementById('ug-filter-assoc')?.value || 'all';
            populateDriverDropdown(assocVal, 'all');
        }

        function renderUndergroundUI() {
            const { stats, rides, associations } = _undergroundData;

            // 1. Populate Association Dropdown if empty
            const assocSelect = document.getElementById('ug-filter-assoc');
            if (assocSelect && assocSelect.options.length <= 1 && Array.isArray(associations)) {
                associations.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = `${a.name} (${a.city_name})`;
                    assocSelect.appendChild(opt);
                });
            }

            // 2. Populate Driver Dropdown dynamically mapped to active Association filter
            const activeAssocId = assocSelect?.value || 'all';
            populateDriverDropdown(activeAssocId);

            // 3. Render Stat Banner
            const cardRides = document.getElementById('ug-card-rides');
            const cardGross = document.getElementById('ug-card-gross');
            const cardComm = document.getElementById('ug-card-comm');
            const cardPayout = document.getElementById('ug-card-payout');
            const cardUsers = document.getElementById('ug-card-users');
            const cardCancels = document.getElementById('ug-card-cancels');

            if (cardRides) cardRides.textContent = stats.total_rides || 0;
            if (cardGross) cardGross.textContent = `\u20B9${parseFloat(stats.gross_revenue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
            if (cardComm) cardComm.textContent = `\u20B9${parseFloat(stats.platform_commission || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
            if (cardPayout) cardPayout.textContent = `\u20B9${parseFloat(stats.driver_payout || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
            if (cardUsers) cardUsers.textContent = stats.unique_customers || 0;
            if (cardCancels) cardCancels.textContent = stats.cancelled_rides || 0;

            // 4. Render Table Rows
            const tbody = document.getElementById('ug-reports-table-body');
            const countEl = document.getElementById('ug-record-count');
            if (countEl) countEl.textContent = `Showing ${rides.length} records`;

            if (!tbody) return;

            if (!rides || rides.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem;">No underground telemetry data matching the selected filters.</td></tr>`;
                return;
            }

            tbody.innerHTML = rides.map(r => {
                const rawFareStr = String(r.fare || '0').replace(/[^0-9.]/g, '');
                const fare = parseFloat(rawFareStr) || 0;
                const comm = (fare * 0.10).toFixed(2);
                const payout = (fare * 0.90).toFixed(2);
                const isCancelled = r.status === 'cancelled' || r.status === 'cancel_requested';
                const statusClass = (r.status === 'completed' || r.status === 'finished') ? 'status-completed' : isCancelled ? 'status-cancelled' : 'status-pending';

                const rowStyle = isCancelled ? 'style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #EF4444;"' : '';
                const badgeStyle = isCancelled ? 'style="background: rgba(239, 68, 68, 0.25); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.6); font-weight: 800; padding: 4px 10px; border-radius: 6px;"' : '';

                return `
                    <tr ${rowStyle}>
                        <td><strong ${isCancelled ? 'style="color:#EF4444;"' : ''}>#B-${r.id}</strong></td>
                        <td><small style="color:var(--text-muted); font-weight:600;">${new Date(r.created_at).toLocaleDateString('en-IN')}<br>${new Date(r.created_at).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</small></td>
                        <td><strong>${r.association_name || 'Independent'}</strong><br><small style="color:var(--text-muted);">${r.association_city || 'CityRide Network'}</small></td>
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${r.driver_photo ? `<img src="${r.driver_photo}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);">` : `<span style="font-size:1.2rem;">👨‍✈️</span>`}
                                <div>
                                    <strong>${r.driver_name || 'Unassigned'}</strong>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">📞 ${r.driver_phone || 'N/A'} • <code>${r.car_number || 'No Plate'}</code></div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <strong>#USR-${r.user_id || 'GUEST'}</strong><br>
                            <small style="color:var(--text-muted);">${r.passenger_name || 'Customer'}</small><br>
                            <small style="color:var(--primary-red);">📞 ${r.passenger_phone || 'N/A'}</small>
                        </td>
                        <td>
                            <div style="max-width:220px; font-size:0.78rem;">
                                <div style="color:var(--success-green); font-weight:700;">🟢 ${r.pickup_loc || 'N/A'}</div>
                                <div style="color:var(--danger-red); font-weight:700; margin-top:2px;">🔴 ${r.drop_loc || 'N/A'}</div>
                            </div>
                        </td>
                        <td>
                            <strong style="${isCancelled ? 'color:#EF4444; text-decoration:line-through;' : 'color:var(--primary-red-pista);'}">\u20B9${fare.toFixed(2)}</strong>
                            <div style="font-size:0.72rem; color:var(--text-muted);">Comm: \u20B9${comm} | Net: \u20B9${payout}</div>
                        </td>
                        <td><span class="status-tag ${statusClass}" ${badgeStyle}>${(r.status || 'PENDING').toUpperCase()}</span></td>
                        <td>
                            <button class="action-btn" ${isCancelled ? 'style="border-color:#EF4444; color:#EF4444;"' : ''} onclick="openUndergroundAuditModal(${r.id})">🔍 Telemetry</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function resetUndergroundFilters() {
            const assoc = document.getElementById('ug-filter-assoc');
            const vType = document.getElementById('ug-filter-vehicle-type');
            const vehicle = document.getElementById('ug-filter-vehicle');
            const user = document.getElementById('ug-filter-user');
            const status = document.getElementById('ug-filter-status');
            const start = document.getElementById('ug-filter-start-date');
            const end = document.getElementById('ug-filter-end-date');

            if (assoc) assoc.value = 'all';
            if (vType) vType.value = 'all';
            if (vehicle) vehicle.value = '';
            if (user) user.value = '';
            if (status) status.value = 'all';
            if (start) start.value = '';
            if (end) end.value = '';

            populateDriverDropdown('all', 'all');
            loadUndergroundReports();
        }

        function openUndergroundAuditModal(bookingId) {
            const ride = _undergroundData.rides.find(x => x.id === bookingId);
            if (!ride) return;

            const rawFareStr = String(ride.fare || '0').replace(/[^0-9.]/g, '');
            const fare = parseFloat(rawFareStr) || 0;
            const comm = (fare * 0.10).toFixed(2);
            const payout = (fare * 0.90).toFixed(2);

            Swal.fire({
                title: `Underground Telemetry Audit: #B-${ride.id}`,
                html: `
                    <div style="text-align:left; font-size:0.85rem; font-family:'Outfit',sans-serif;">
                        <div style="background:#0B140A; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); margin-bottom:12px;">
                            <div style="font-size:0.75rem; color:#A1A1AA; font-weight:700; text-transform:uppercase;">CUSTOMER TELEMETRY DATA</div>
                            <div style="margin-top:4px;"><strong>User ID:</strong> #USR-${ride.user_id || 'N/A'}</div>
                            <div><strong>Customer Name:</strong> ${ride.passenger_name || 'Passenger'}</div>
                            <div><strong>Contact Phone:</strong> ${ride.passenger_phone || 'N/A'}</div>
                        </div>
                        
                        <div style="background:#0B140A; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); margin-bottom:12px;">
                            <div style="font-size:0.75rem; color:#A1A1AA; font-weight:700; text-transform:uppercase;">ASSIGNED PILOT &amp; ASSOCIATION</div>
                            <div style="margin-top:4px;"><strong>Association:</strong> ${ride.association_name || 'CityRide Independent'} (${ride.association_city || 'Salem'})</div>
                            <div><strong>Pilot:</strong> ${ride.driver_name || 'Unassigned'} (ID: #DRV-${ride.driver_id || 'N/A'})</div>
                            <div><strong>Pilot Phone:</strong> ${ride.driver_phone || 'N/A'}</div>
                            <div><strong>Vehicle Specs:</strong> ${ride.car_model || 'Standard'} • Plate: <code>${ride.car_number || 'N/A'}</code> (${(ride.vehicle_type || '').toUpperCase()})</div>
                        </div>

                        <div style="background:#0B140A; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
                            <div style="font-size:0.75rem; color:#A1A1AA; font-weight:700; text-transform:uppercase;">FINANCIAL &amp; GPS AUDIT</div>
                            <div style="margin-top:4px;"><strong>Trip Type:</strong> ${(ride.trip_type || 'LOCAL').toUpperCase()}</div>
                            <div><strong>Gross Fare:</strong> <span style="color:#34D399; font-weight:800;">\u20B9${fare.toFixed(2)}</span></div>
                            <div><strong>Platform Commission (10%):</strong> \u20B9${comm}</div>
                            <div><strong>Pilot Net Payout (90%):</strong> \u20B9${payout}</div>
                            <div><strong>Odometer/GPS Distance:</strong> ${ride.actual_distance || ride.distance || '0'} KM</div>
                            <div><strong>Status:</strong> ${(ride.status || 'PENDING').toUpperCase()}</div>
                            ${ride.cancel_reason ? `<div style="color:#EF4444; margin-top:4px;"><strong>Cancel Reason:</strong> ${ride.cancel_reason}</div>` : ''}
                        </div>
                    </div>
                `,
                showConfirmButton: true,
                confirmButtonText: 'Close Telemetry Audit',
                confirmButtonColor: '#10B981',
                background: '#152613',
                color: '#FFFFFF'
            });
        }

        function exportUndergroundCSV() {
            if (!_undergroundData.rides || !_undergroundData.rides.length) {
                showAlertBanner('No underground audit records to export.', 'error');
                return;
            }
            const headers = ['Booking ID', 'Created At', 'Association', 'Driver Name', 'Driver Phone', 'Vehicle Model', 'Car Number', 'User ID', 'Passenger Name', 'Passenger Phone', 'Pickup Location', 'Drop Location', 'Trip Type', 'Vehicle Type', 'Gross Fare', 'Commission', 'Driver Payout', 'Status'];
            const rows = _undergroundData.rides.map(r => {
                const fare = parseFloat(r.fare || 0);
                return [
                    `#B-${r.id}`,
                    new Date(r.created_at).toLocaleString('en-IN'),
                    r.association_name || 'Independent',
                    r.driver_name || 'Unassigned',
                    r.driver_phone || '',
                    r.car_model || '',
                    r.car_number || '',
                    `#USR-${r.user_id || 'N/A'}`,
                    r.passenger_name || '',
                    r.passenger_phone || '',
                    `"${(r.pickup_loc || '').replace(/"/g, '""')}"`,
                    `"${(r.drop_loc || '').replace(/"/g, '""')}"`,
                    r.trip_type || 'local',
                    r.vehicle_type || 'sedan',
                    fare.toFixed(2),
                    (fare * 0.10).toFixed(2),
                    (fare * 0.90).toFixed(2),
                    r.status || 'pending'
                ].join(',');
            });

            const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `Underground_Audit_Report_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showAlertBanner('📊 Underground CSV Export downloaded successfully!', 'success');
        }

        function exportUndergroundPDF() {
            if (!_undergroundData.rides || !_undergroundData.rides.length) {
                showAlertBanner('No underground audit records to export.', 'error');
                return;
            }
            if (typeof jspdf === 'undefined') {
                showAlertBanner('PDF library loading...', 'error');
                return;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');

            doc.setFontSize(16);
            doc.text('CityRideTaxi - Underground Level Telemetry Audit Report', 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated On: ${new Date().toLocaleString('en-IN')} | Total Records: ${_undergroundData.rides.length}`, 14, 22);

            const tableData = _undergroundData.rides.map(r => [
                `#B-${r.id}`,
                new Date(r.created_at).toLocaleDateString('en-IN'),
                r.association_name || 'Independent',
                `${r.driver_name || 'Unassigned'}\n(${r.car_number || 'N/A'})`,
                `#USR-${r.user_id || 'N/A'}\n${r.passenger_name || ''}\n${r.passenger_phone || ''}`,
                `${r.pickup_loc || ''}\n-> ${r.drop_loc || ''}`,
                `\u20B9${parseFloat(r.fare || 0).toFixed(2)}`,
                (r.status || 'PENDING').toUpperCase()
            ]);

            doc.autoTable({
                head: [['Booking ID', 'Date', 'Association', 'Pilot & Vehicle', 'Customer Data', 'Route', 'Gross Fare', 'Status']],
                body: tableData,
                startY: 28,
                styles: { fontSize: 8, cellPadding: 3 },
                headStyles: { fillColor: [16, 185, 129] }
            });

            doc.save(`Underground_Level_Audit_Report_${Date.now()}.pdf`);
            showAlertBanner('📄 Underground PDF Report generated successfully!', 'success');
        }

        // --- LIVE FLEET RADAR & ENTERPRISE CONTROLS ---
        let fleetRadarMap = null;
        let fleetRadarMarkers = [];

        function showAlertBanner(message, type = 'info') {
            if (typeof Swal !== 'undefined') {
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true,
                    background: '#152613',
                    color: '#FFFFFF',
                    customClass: {
                        popup: 'cityride-toast-popup'
                    },
                    didOpen: (toast) => {
                        toast.addEventListener('mouseenter', Swal.stopTimer);
                        toast.addEventListener('mouseleave', Swal.resumeTimer);
                    }
                });
                Toast.fire({
                    icon: type === 'error' ? 'error' : 'success',
                    title: message
                });
            } else {
                alert(message);
            }
        }

        async function loadLiveFleetRadar() {
            try {
                const mapContainer = document.getElementById('fleet-radar-map');
                if (!mapContainer) return;
                
                if (typeof L === 'undefined') {
                    console.error('Leaflet library is loading...');
                    return;
                }

                if (!fleetRadarMap) {
                    fleetRadarMap = L.map('fleet-radar-map').setView([11.6643, 78.1460], 10);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19,
                        attribution: '© OpenStreetMap'
                    }).addTo(fleetRadarMap);
                }

                const res = await fetch(`${API_BASE_URL}/api/admin/live-fleet`);
                if (!res.ok) throw new Error('Live fleet fetch failed');
                const drivers = await res.json();

                fleetRadarMarkers.forEach(m => fleetRadarMap.removeLayer(m));
                fleetRadarMarkers = [];

                let total = drivers.length;
                let online = 0;
                let busy = 0;
                let offline = 0;
                const bounds = [];

                drivers.forEach((d, idx) => {
                    const isOnline = d.is_online && !d.is_blocked;
                    if (d.is_blocked || !d.is_online) offline++;
                    else if (isOnline) online++;

                    let lat = parseFloat(d.latitude);
                    let lng = parseFloat(d.longitude);
                    
                    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
                        lat = 11.6643 + ((idx % 5) * 0.02);
                        lng = 78.1460 + (Math.floor(idx / 5) * 0.02);
                    }

                    bounds.push([lat, lng]);

                    const statusColor = d.is_blocked ? '#EF4444' : (d.is_online ? '#10B981' : '#A1A1AA');
                    const statusLabel = d.is_blocked ? 'BLOCKED' : (d.is_online ? 'ONLINE' : 'OFFLINE');

                    const markerHtml = `<div style="background: ${statusColor}; width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 12px ${statusColor};"></div>`;
                    const customIcon = L.divIcon({ html: markerHtml, className: 'radar-marker-icon', iconSize: [16, 16] });

                    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(fleetRadarMap);
                    marker.bindPopup(`
                        <div style="font-family: 'Outfit', sans-serif; padding: 4px;">
                            <div style="font-weight: 800; font-size: 1rem; color: #18181B;">${d.name || 'Pilot'}</div>
                            <div style="font-size: 0.8rem; color: #555; margin-top: 2px;">📞 ${d.phone || 'N/A'}</div>
                            <div style="font-size: 0.8rem; color: #555;">🚗 ${d.car_model || ''} (${d.car_number || 'N/A'})</div>
                            <div style="margin-top: 6px;"><span class="badge" style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">${statusLabel}</span></div>
                        </div>
                    `);

                    fleetRadarMarkers.push(marker);
                });

                document.getElementById('radar-stat-total').textContent = total;
                document.getElementById('radar-stat-online').textContent = online;
                document.getElementById('radar-stat-busy').textContent = busy;
                document.getElementById('radar-stat-offline').textContent = offline;

                if (bounds.length > 0) {
                    fleetRadarMap.fitBounds(bounds, { padding: [40, 40] });
                }
            } catch (err) {
                console.error('Radar Map Error:', err);
            }
        }

        function filterBookingsTable() {
            const q = document.getElementById('search-bookings-input')?.value.toLowerCase().trim() || '';
            const rows = document.querySelectorAll('#bookings-table-body tr');
            rows.forEach(r => {
                const text = (r.innerText || r.textContent || '').toLowerCase();
                r.style.display = text.includes(q) ? '' : 'none';
            });
        }

        function filterFleetTable() {
            const q = document.getElementById('search-fleet-input')?.value.toLowerCase().trim() || '';
            const rows = document.querySelectorAll('#fleet-table-body tr');
            rows.forEach(r => {
                const text = (r.innerText || r.textContent || '').toLowerCase();
                r.style.display = text.includes(q) ? '' : 'none';
            });
        }

        async function toggleBlockDriver(id, newStatus) {
            const actionText = newStatus ? 'Block access for this Pilot?' : 'Restore access for this Pilot?';
            if (!confirm(actionText)) return;
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/toggle-block`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, type: 'driver', status: newStatus ? 1 : 0 })
                });
                if (res.ok) {
                    loadTabData('fleet');
                } else {
                    alert('Action failed');
                }
            } catch (err) { alert('Network error'); }
        }

        async function toggleBlockUser(id, newStatus) {
            const actionText = newStatus ? 'Block access for this Member?' : 'Restore access for this Member?';
            if (!confirm(actionText)) return;
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/toggle-block`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, type: 'user', status: newStatus ? 1 : 0 })
                });
                if (res.ok) {
                    loadTabData('users');
                } else {
                    alert('Action failed');
                }
            } catch (err) { alert('Network error'); }
        }

        function openWalletModal(id, currentBalance) {
            document.getElementById('edit-w-id').value = id;
            document.getElementById('edit-w-current-bal').textContent = `\u20B9${parseFloat(currentBalance || 0).toFixed(2)}`;
            document.getElementById('edit-w-amount').value = '';
            document.getElementById('edit-w-note').value = '';
            document.getElementById('edit-wallet-modal').style.display = 'flex';
        }

        function closeWalletModal() {
            document.getElementById('edit-wallet-modal').style.display = 'none';
        }

        document.getElementById('edit-wallet-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-w-id').value;
            const mode = document.getElementById('edit-w-type').value;
            const amount = parseFloat(document.getElementById('edit-w-amount').value);
            const note = document.getElementById('edit-w-note').value;

            if (isNaN(amount) || amount <= 0) {
                alert('Please enter a valid amount');
                return;
            }

            try {
                let endpoint = '/api/admin/driver/wallet-transaction';
                let bodyData = { id, type: mode, amount, note };

                if (mode === 'set') {
                    endpoint = '/api/admin/update-driver-wallet';
                    bodyData = { id, wallet_balance: amount };
                }

                const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyData)
                });

                if (res.ok) {
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({ icon: 'success', title: 'Wallet Updated!', text: 'Transaction processed successfully.', background: '#FFFFFF', color: '#000', timer: 1600, showConfirmButton: false });
                    }
                    closeWalletModal();
                    loadTabData('wallets');
                } else {
                    const err = await res.json();
                    alert(err.error || 'Wallet update failed');
                }
            } catch (err) {
                alert('Transaction processing failed');
            }
        });

        // --- DISTRICT ASSOCIATION ACTIONS ---
        document.getElementById('create-assoc-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('a-name')?.value;
            const admin_username = document.getElementById('a-username')?.value;
            const admin_password = document.getElementById('a-pass')?.value;
            const city_name = document.getElementById('a-city')?.value;
            const commission_type = document.getElementById('a-comm-type')?.value;
            const commission_value = parseFloat(document.getElementById('a-comm-value')?.value) || 0;

            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/create-association`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, admin_username, admin_password, city_name, commission_type, commission_value })
                });
                const data = await res.json();
                if (res.ok) {
                    showAlertBanner('✅ Association created successfully!', 'success');
                    document.getElementById('create-assoc-form').reset();
                    document.getElementById('create-assoc-container').style.display = 'none';
                    loadTabData('associations');
                } else {
                    showAlertBanner(data.error || 'Failed to create association', 'error');
                }
            } catch (err) { showAlertBanner('Network error creating association', 'error'); }
        });

        async function toggleAssociation(id) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/toggle-association`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                if (res.ok) {
                    showAlertBanner('Association status updated', 'success');
                    loadTabData('associations');
                } else {
                    showAlertBanner('Failed to update association status', 'error');
                }
            } catch (e) { showAlertBanner('Network error', 'error'); }
        }

        async function deleteAssociation(id, name) {
            if (!confirm(`Are you sure you want to delete association "${name}"?`)) return;
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/delete-association/${id}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    showAlertBanner(`Association "${name}" deleted.`, 'success');
                    loadTabData('associations');
                } else {
                    showAlertBanner('Failed to delete association', 'error');
                }
            } catch (e) { showAlertBanner('Network error', 'error'); }
        }

        function openAssocPasswordModal(id, name) {
            openPasswordModal('association', id, name);
        }

        function openEditAssocModal(assoc) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: `Edit ${assoc.name}`,
                    html: `
                        <div style="text-align:left; font-size:0.9rem; font-family:'Outfit', sans-serif;">
                            <label style="font-weight:bold; color:#18181B;">Association Name</label>
                            <input id="swal-a-name" class="swal2-input" value="${assoc.name || ''}" placeholder="Association Name">
                            <label style="font-weight:bold; color:#18181B; margin-top:10px; display:block;">City / District</label>
                            <input id="swal-a-city" class="swal2-input" value="${assoc.city_name || ''}" placeholder="City Name">
                            <label style="font-weight:bold; color:#18181B; margin-top:10px; display:block;">Commission Type</label>
                            <select id="swal-a-type" class="swal2-input" style="width:100%; height:45px;">
                                <option value="percent" ${assoc.commission_type === 'percent' || assoc.commission_type === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
                                <option value="fixed" ${assoc.commission_type === 'fixed' ? 'selected' : ''}>Fixed (\u20B9)</option>
                            </select>
                            <label style="font-weight:bold; color:#18181B; margin-top:10px; display:block;">Share Value</label>
                            <input id="swal-a-val" type="number" class="swal2-input" value="${assoc.commission_value || 0}">
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Save Changes',
                    preConfirm: () => {
                        return {
                            id: assoc.id,
                            name: document.getElementById('swal-a-name').value,
                            city_name: document.getElementById('swal-a-city').value,
                            commission_type: document.getElementById('swal-a-type').value,
                            commission_value: parseFloat(document.getElementById('swal-a-val').value) || 0
                        };
                    }
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            const res = await fetch(`${API_BASE_URL}/api/admin/update-association`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(result.value)
                            });
                            if (res.ok) {
                                showAlertBanner('Association updated successfully!', 'success');
                                loadTabData('associations');
                            } else {
                                showAlertBanner('Failed to update association', 'error');
                            }
                        } catch (e) { showAlertBanner('Network error', 'error'); }
                    }
                });
            }
        }
async function loadAdminOffers() {
    try {
        const res = await fetch('/api/admin/offers', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') }
        });
        const offers = await res.json();
        const tbody = document.getElementById('offers-table-body');
        tbody.innerHTML = '';
        if (offers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No offers found.</td></tr>';
            return;
        }
        offers.forEach(o => {
            const statusBadge = o.is_active 
                ? '<span class="status-badge status-active">Active</span>'
                : '<span class="status-badge status-blocked">Inactive</span>';
            const toggleAction = o.is_active ? 0 : 1;
            
            const valStr = o.discount_type === 'percentage' ? `${o.discount_value}%` : `₹${o.discount_value}`;
            const maxStr = o.max_discount ? `<br><small style="color:var(--text-muted);">Max ₹${o.max_discount}</small>` : '';
            const minStr = o.min_trip_amount > 0 ? `Min Trip: ₹${o.min_trip_amount}<br>` : '';
            const vehStr = `<small>Vehicles: ${o.valid_vehicle_types}</small>`;
            const usesStr = o.total_uses_allowed ? `${o.current_uses} / ${o.total_uses_allowed}` : 'Unlimited';
            const expStr = o.valid_until ? new Date(o.valid_until).toLocaleString() : 'No Expiry';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:700; color:var(--primary-red);">${o.code}<br><small style="color:var(--text-muted);font-weight:400;">${o.description}</small></td>
                <td style="font-weight:700;">${valStr}${maxStr}</td>
                <td>${minStr}${vehStr}<br><small>Max per user: ${o.max_uses_per_user}</small></td>
                <td>${usesStr}</td>
                <td>${expStr}</td>
                <td>${statusBadge}</td>
                <td style="display:flex; gap:8px;">
                    <button class="btn-secondary" onclick="toggleOffer(${o.id}, ${toggleAction})" style="padding:4px 8px; font-size:0.8rem;">
                        ${o.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn-danger" onclick="deleteOffer(${o.id})" style="padding:4px 8px; font-size:0.8rem;">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error loading offers:', e);
    }
}

function updateVehicleDropdownText() {
    const checked = Array.from(document.querySelectorAll('.veh-checkbox:checked')).map(cb => cb.parentNode.textContent.trim());
    const textSpan = document.getElementById('offer-vehicles-text');
    if (checked.length === 0) {
        textSpan.textContent = 'None Selected';
    } else if (checked.length <= 2) {
        textSpan.textContent = checked.join(', ');
    } else {
        textSpan.textContent = checked.length + ' Vehicles Selected';
    }
}

document.addEventListener('click', (e) => {
    const btn = document.getElementById('offer-vehicles-btn');
    const dropdown = document.getElementById('offer-vehicles-dropdown');
    if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

async function submitNewOffer() {
    const checkedVehicles = Array.from(document.querySelectorAll('.veh-checkbox:checked')).map(cb => cb.value);
    const selectedVehicles = checkedVehicles.length > 0 ? checkedVehicles.join(',') : 'ALL';

    const payload = {
        code: document.getElementById('offer-code').value,
        description: document.getElementById('offer-desc').value,
        discount_type: document.getElementById('offer-type').value,
        discount_value: document.getElementById('offer-value').value,
        max_discount: document.getElementById('offer-max').value || null,
        min_trip_amount: document.getElementById('offer-min').value || 0,
        max_uses_per_user: document.getElementById('offer-user-limit').value || 1,
        total_uses_allowed: document.getElementById('offer-global-limit').value || null,
        valid_vehicle_types: selectedVehicles,
        valid_until: document.getElementById('offer-expiry').value || null
    };

    if (!payload.code || !payload.description || !payload.discount_value) {
        return alert('Code, Description, and Discount Value are required');
    }
    
    try {
        const res = await fetch('/api/admin/offers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('create-offer-form').reset();
            loadAdminOffers();
            Swal.fire('Success', 'Enterprise Promotion created!', 'success');
        } else {
            Swal.fire('Error', data.error, 'error');
        }
    } catch (e) {
        alert('Request failed');
    }
}

async function toggleOffer(id, is_active) {
    try {
        await fetch('/api/admin/offers/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') },
            body: JSON.stringify({ id, is_active })
        });
        loadAdminOffers();
    } catch (e) { console.error(e); }
}

async function deleteOffer(id) {
    if(!confirm('Are you sure you want to delete this offer?')) return;
    try {
        await fetch('/api/admin/offers/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('adminToken') }
        });
        loadAdminOffers();
    } catch (e) { console.error(e); }
}
    