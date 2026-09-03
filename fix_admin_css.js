const fs = require('fs');

const path = 'public/admin.html';
let html = fs.readFileSync(path, 'utf8');

const newCSS = `
    <style>
        :root {
            --admin-sidebar: #0A0A0B; 
            --admin-bg: #121214; 
            --primary-red: #10B981; 
            --primary-red-pista: #34D399;
            --primary-red-hover: #059669;
            --dark-charcoal: #FFFFFF;
            --text-main: #FFFFFF;
            --text-muted: #A1A1AA;
            --white: #18181B; 
            --border-color: rgba(255, 255, 255, 0.08);
            --success-green: #10B981;
            --danger-red: #EF4444;
            --warning-amber: #F59E0B;
            --info-blue: #3B82F6;
        }
        body { background: var(--admin-bg) !important; color: var(--text-main) !important; display: flex; height: 100vh; overflow: hidden; scroll-behavior: smooth; font-family: 'Outfit', sans-serif; }
        .sidebar { width: 280px; background: var(--admin-sidebar); color: var(--text-main); padding: 2.5rem 1.5rem; display: flex; flex-direction: column; flex-shrink: 0; transition: all 0.4s cubic-bezier(0.4,0,0.2,1); height: 100vh; position: sticky; top: 0; overflow-y: auto; padding-bottom: 4rem; border-right: 1px solid var(--border-color); }
        .sidebar::-webkit-scrollbar { width: 4px; }
        .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .sidebar .logo { margin-bottom: 4rem; cursor: pointer; filter: brightness(1.5); }
        .sidebar-nav { flex-grow: 1; display: flex; flex-direction: column; min-height: min-content; }
        .nav-item { padding: 1rem 1.2rem; margin-bottom: 0.4rem; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 1rem; opacity: 0.6; font-size: 0.9rem; color: var(--text-main) !important; font-weight: 600 !important; }
        .logout-item { margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem; opacity: 0.8; }
        .nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.03); opacity: 1; }
        .nav-item.active { border-left: 3px solid var(--primary-red); color: var(--primary-red) !important; font-weight: 700 !important; background: linear-gradient(90deg, rgba(16,185,129,0.1) 0%, transparent 100%); }
        .main-stage { flex-grow: 1; padding: 3rem; overflow-y: auto; background: var(--admin-bg); scroll-behavior: smooth; }
        .main-stage::-webkit-scrollbar { width: 8px; }
        .main-stage::-webkit-scrollbar-track { background: var(--admin-bg); }
        .main-stage::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .main-stage::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .stage-header { margin-bottom: 3rem; display: flex; justify-content: space-between; align-items: center; }
        .stage-header h1 { color: var(--text-main) !important; font-weight: 800 !important; margin-bottom: 0.5rem; letter-spacing: -0.5px; }
        .stage-header p { color: var(--text-muted) !important; font-weight: 500 !important; }
        
        .stat-banner { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 3rem; }
        .b-card { background: var(--white); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); color: var(--text-main) !important; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .b-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .b-card h4 { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem; letter-spacing: 1px; font-weight: 700; }
        .b-card .val { font-size: 2rem; font-weight: 800; color: var(--text-main); }
        
        /* SweetAlert Overrides */
        .swal2-popup { background: var(--white) !important; color: var(--text-main) !important; border: 1px solid var(--border-color) !important; border-radius: 16px !important; box-shadow: 0 20px 50px rgba(0,0,0,0.5) !important; }
        .swal2-title { color: var(--text-main) !important; font-weight: 800 !important; }
        .swal2-html-container { color: var(--text-muted) !important; font-weight: 500 !important; }
        .swal2-input, .swal2-textarea, .swal2-select { background: var(--admin-bg) !important; color: var(--text-main) !important; border: 1px solid var(--border-color) !important; font-weight: 500 !important; }
        .swal2-validation-message { background: rgba(239,68,68,0.1) !important; color: var(--danger-red) !important; }
        
        /* Forms */
        input, select, textarea { background: var(--admin-bg) !important; color: var(--text-main) !important; border: 1px solid var(--border-color) !important; padding: 0.85rem 1rem !important; border-radius: 8px !important; outline: none !important; transition: all 0.2s ease !important; font-weight: 500 !important; width: 100%; box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: var(--primary-red) !important; box-shadow: 0 0 0 3px rgba(16,185,129,0.15) !important; }
        label { color: var(--text-muted) !important; font-weight: 600 !important; font-size: 0.75rem !important; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem !important; display: inline-block !important; }
        
        /* Tables */
        .data-table-container { background: var(--white); border-radius: 16px; padding: 2rem; border: 1px solid var(--border-color); overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .data-table-container::-webkit-scrollbar { width: 6px; height: 6px; }
        .data-table-container::-webkit-scrollbar-track { background: transparent; }
        .data-table-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .data-table-container::-webkit-scrollbar-thumb:hover { background: var(--primary-red); }
        .cityride-table { width: 100%; border-collapse: collapse; }
        .cityride-table th { text-align: left; padding: 1rem 1.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; border-bottom: 1px solid var(--border-color); letter-spacing: 1px; }
        .cityride-table td { padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.9rem; vertical-align: middle; color: var(--text-main); font-weight: 500; transition: background 0.2s ease; }
        .cityride-table tr:hover td { background: rgba(255,255,255,0.02); }
        
        /* Status Tags */
        .status-tag { padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .status-pending { background: rgba(245,158,11,0.1); color: var(--warning-amber); border: 1px solid rgba(245,158,11,0.2); }
        .status-assigned { background: rgba(59,130,246,0.1); color: var(--info-blue); border: 1px solid rgba(59,130,246,0.2); }
        .status-completed { background: rgba(16,185,129,0.1); color: var(--success-green); border: 1px solid rgba(16,185,129,0.2); }
        .status-cancelled, .status-cancel_requested { background: rgba(239,68,68,0.1); color: var(--danger-red); border: 1px solid rgba(239,68,68,0.2); }
        
        /* Buttons */
        .action-btn { background: none; border: none; cursor: pointer; color: var(--primary-red); font-weight: 600; font-size: 0.8rem; transition: color 0.2s ease; }
        .action-btn:hover { color: var(--primary-red-pista); text-decoration: underline; }
        .btn { padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; border: none; transition: all 0.2s ease; }
        .btn-primary { background: var(--primary-red); color: #000000; font-weight: 700; }
        .btn-primary:hover { background: var(--primary-red-pista); transform: translateY(-1px); box-shadow: 0 4px 15px rgba(16,185,129,0.2); }
        
        /* Tabs */
        .tab-section { display: none; }
        .tab-section.active { display: block; animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        /* Map Modal Overrides */
        .map-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; }
        .map-modal-content { background: var(--white); padding: 0; border-radius: 16px; width: 90%; max-width: 550px; max-height: 90vh; overflow-y: auto; box-shadow: 0 30px 60px rgba(0,0,0,0.5); animation: modalSlideUp 0.4s ease; border: 1px solid var(--border-color); color: var(--text-main); }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .map-header { background: var(--admin-bg); color: var(--text-main); padding: 1.5rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); }
        .close-map { background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.2s; }
        .close-map:hover { color: var(--text-main); }
        
        /* Mobile overrides */
        @media (max-width: 1024px) {
            body { flex-direction: column; overflow-y: auto; }
            .sidebar { position: fixed; left: -280px; top: 0; height: 100vh; z-index: 10000; transition: all 0.4s ease; width: 280px; background: var(--admin-sidebar); padding-top: 5rem; }
            .sidebar.active { left: 0; }
            .mobile-header { display: flex; background: var(--admin-sidebar); color: var(--text-main); padding: 1.25rem 2rem; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 9000; border-bottom: 1px solid var(--border-color); }
            .main-stage { padding: 1.5rem; }
            .stat-banner { grid-template-columns: 1fr 1fr; gap: 1rem; }
            .data-table-container { padding: 1rem; }
        }
        
        /* Subsections & Cards */
        .vehicle-tiles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }
        .vehicle-tile-card { background: var(--admin-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; }
        .vehicle-tile-card:hover { border-color: var(--primary-red); transform: translateY(-2px); }
        .vehicle-tile-card.active { border-color: var(--primary-red); background: rgba(16,185,129,0.05); }
        .vehicle-tile-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .vehicle-tile-icon { font-size: 1.8rem; width: 48px; height: 48px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .vehicle-tile-title { font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin: 0; }
        .vehicle-tile-sub { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }
        .rate-summary-pill { display: flex; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 0.5rem; }
        .rate-summary-pill .cat-name { font-weight: 600; color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; }
        .rate-summary-pill .cat-val { font-weight: 700; color: var(--text-main); font-size: 0.8rem; }
        .expanded-tariff-card { background: var(--admin-bg); border: 1px solid var(--primary-red); border-radius: 16px; padding: 1.5rem; margin-bottom: 3rem; animation: fadeIn 0.3s ease; }
        .category-tariff-card { background: var(--white); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; margin-bottom: 1rem; }
        
        .pilot-info-block { display: flex; flex-direction: column; gap: 4px; }
        .pilot-info-block .p-name { font-weight: 600; color: var(--text-main); font-size: 0.9rem; }
        .pilot-info-block .p-email a { font-size: 0.75rem; color: var(--info-blue); text-decoration: none; }
        .pilot-info-block .p-phone a { font-size: 0.75rem; color: var(--primary-red); text-decoration: none; font-weight: 600; }
    </style>
`;

const startIndex = html.indexOf('<style>');
const endIndex = html.indexOf('</style>', startIndex) + 8;

if (startIndex !== -1 && endIndex !== -1) {
    const updatedHtml = html.substring(0, startIndex) + newCSS + html.substring(endIndex);
    fs.writeFileSync(path, updatedHtml);
    console.log("Successfully overhauled admin.html CSS.");
} else {
    console.log("Error: <style> block not found.");
}
