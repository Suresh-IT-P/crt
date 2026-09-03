const fs = require('fs');

const path = 'public/admin.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Remove input specific inline styles that ruin the dark theme
html = html.replace(/style="background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);\s*border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);\s*color:\s*white;?"/g, '');

// 2. Fix hardcoded white labels to use CSS variables
html = html.replace(/style="color:\s*rgba\(255,\s*255,\s*255,\s*0\.7\);?"/g, 'style="color: var(--text-muted);"');

// 3. Remove hardcoded black color from options
html = html.replace(/style="color:\s*black;?"/g, '');

// 4. Remove inline background styles on data-table-containers
html = html.replace(/style="display:\s*none;\s*margin-bottom:\s*3rem;\s*background:\s*var\(--admin-sidebar\);\s*color:\s*white;?"/g, 'style="display: none; margin-bottom: 3rem;"');
html = html.replace(/style="background:\s*var\(--white\);\s*border:\s*1px\s*solid\s*var\(--border-color\);\s*padding:\s*2rem;?"/g, '');

// 5. Fix form button text colors
html = html.replace(/style="background:\s*var\(--primary-red\);\s*color:\s*white;\s*padding:\s*0\.6rem\s*1\.2rem;\s*border:\s*none;?"/g, 'class="btn btn-primary"');
html = html.replace(/style="background:\s*rgba\(255,\s*255,\s*255,\s*0\.03\);\s*color:\s*var\(--text-muted\);\s*padding:\s*0\.6rem\s*1\.2rem;\s*border:\s*1px\s*solid\s*var\(--border-color\);?"/g, 'class="btn" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border-color);"');

// 6. Fix "color: white" on close buttons
html = html.replace(/style="background:\s*none;\s*border:\s*none;\s*color:\s*white;\s*cursor:\s*pointer;\s*font-size:\s*1\.5rem;\s*line-height:\s*1;?"/g, 'class="close-map" style="font-size: 1.5rem; line-height: 1;"');

// 7. Remove any other hardcoded inline black/white colors that might conflict
// We won't blindly replace "color: white" because some text might actually need to be white (e.g., buttons).
// But we will fix the h3 color that was red.
html = html.replace(/style="margin-bottom:\s*2rem;\s*color:\s*#d32f2f;\s*display:\s*flex;\s*align-items:\s*center;\s*gap:\s*10px;?"/g, 'style="margin-bottom: 2rem; color: var(--danger-red); display: flex; align-items: center; gap: 10px;"');


fs.writeFileSync(path, html);
console.log("Successfully cleaned inline styles in admin.html");
