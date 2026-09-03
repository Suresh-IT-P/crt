const fs = require('fs');
const path = require('path');
const axios = require('axios');

const baseDir = path.join(__dirname, '../public/phosphor');

if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
}

const weights = ['bold', 'fill', 'regular'];

async function downloadFile(url, destPath) {
    console.log(`Downloading: ${url} -> ${destPath}`);
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function run() {
    for (const weight of weights) {
        const weightDir = path.join(baseDir, weight);
        if (!fs.existsSync(weightDir)) {
            fs.mkdirSync(weightDir, { recursive: true });
        }

        // CSS
        const cssUrl = `https://unpkg.com/@phosphor-icons/web@2.1.1/src/${weight}/style.css`;
        const cssDest = path.join(weightDir, 'style.css');
        await downloadFile(cssUrl, cssDest);

        // Fonts
        const fontName = weight === 'regular' ? 'Phosphor' : `Phosphor-${weight.charAt(0).toUpperCase() + weight.slice(1)}`;
        const fontExtensions = ['woff2', 'woff', 'ttf'];

        for (const ext of fontExtensions) {
            const fontUrl = `https://unpkg.com/@phosphor-icons/web@2.1.1/src/${weight}/${fontName}.${ext}`;
            const fontDest = path.join(weightDir, `${fontName}.${ext}`);
            try {
                await downloadFile(fontUrl, fontDest);
            } catch (err) {
                console.error(`Failed to download ${fontUrl}:`, err.message);
            }
        }
    }
    console.log('Phosphor Icons local download complete!');
}

run().catch(console.error);
