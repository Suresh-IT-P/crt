const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const filesToCompress = [
    path.join(__dirname, '../public/dashboard.html'),
    path.join(__dirname, '../public/sw.js'),
    path.join(__dirname, '../public/driver.html'),
    path.join(__dirname, '../public/admin.html'),
    path.join(__dirname, '../public/vendor.html'),
    path.join(__dirname, '../public/index.html'),
    path.join(__dirname, '../public/auth.html'),
    path.join(__dirname, '../public/app.js'),
    path.join(__dirname, '../public/style.css'),
    path.join(__dirname, '../public/phosphor/regular/style.css'),
    path.join(__dirname, '../public/phosphor/bold/style.css'),
    path.join(__dirname, '../public/phosphor/fill/style.css')
];

filesToCompress.forEach(file => {
    if (!fs.existsSync(file)) {
        console.error(`File does not exist: ${file}`);
        return;
    }
    const content = fs.readFileSync(file);

    // Gzip compression
    const gzipContent = zlib.gzipSync(content);
    fs.writeFileSync(file + '.gz', gzipContent);
    console.log(`GZipped: ${path.basename(file)} -> ${path.basename(file)}.gz`);

    // Brotli compression
    const brotliContent = zlib.brotliCompressSync(content);
    fs.writeFileSync(file + '.br', brotliContent);
    console.log(`Brotli compressed: ${path.basename(file)} -> ${path.basename(file)}.br`);
});
