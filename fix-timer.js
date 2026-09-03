const fs = require('fs');
let content = fs.readFileSync('public/driver.html', 'utf8');

const correctBlock = `
        const elapsedDisplay = document.getElementById('timer-elapsed-display');
        const waitingTimeEl = document.getElementById('timer-waiting-time');
        const waitingChargeEl = document.getElementById('timer-waiting-charge');
        const activeWaitingChargeEl = document.getElementById('active-waiting-charge');
        if (elapsedSecs <= allowedSecs) {
            const remainingSecs = allowedSecs - elapsedSecs;
            const rM = Math.floor(remainingSecs / 60);
            const rS = remainingSecs % 60;
            if (elapsedDisplay) {
                elapsedDisplay.textContent = \`00:\${String(rM).padStart(2,'0')}:\${String(rS).padStart(2,'0')}\`;
                elapsedDisplay.style.color = 'var(--danger-red)';
            }
            if (badge) {
                badge.textContent = 'GRACE PERIOD';
                badge.style.background = 'rgba(220, 38, 38, 0.12)';
                badge.style.color = 'var(--danger-red)';
            }
            if (bar) {
                bar.style.background = 'var(--danger-red)';
                const pct = Math.min(100, (elapsedSecs / allowedSecs) * 100);
                bar.style.width = \`\${pct}%\`;
            }
            if (waitingTimeEl) waitingTimeEl.textContent = "0:00";
            if (waitingChargeEl) waitingChargeEl.textContent = "₹0";
        } else {
            const waitingSecs = elapsedSecs - allowedSecs;
            const wH = Math.floor(waitingSecs / 3600);
            const wM = Math.floor((waitingSecs % 3600) / 60);
            const wS = waitingSecs % 60;
            const waitingMinsFloat = waitingSecs / 60;
            const waitingCharge = Math.ceil(waitingMinsFloat * 2);
            if (elapsedDisplay) {
                const totalH = Math.floor(elapsedSecs / 3600);
                const totalM = Math.floor((elapsedSecs % 3600) / 60);
                const totalS = elapsedSecs % 60;
                elapsedDisplay.textContent = \`\${String(totalH).padStart(2,'0')}:\${String(totalM).padStart(2,'0')}:\${String(totalS).padStart(2,'0')}\`;
                elapsedDisplay.style.color = 'var(--success-green)';
            }
            if (badge) {
                badge.textContent = 'WAITING CHARGES';
                badge.style.background = 'rgba(0, 107, 58, 0.12)';
                badge.style.color = 'var(--success-green)';
            }
            if (bar) {
                bar.style.background = 'var(--success-green)';
                bar.style.width = '100%';
            }
            
            const wTimeStr = wH > 0 ? \`\${wH}:\${String(wM).padStart(2,'0')}:\${String(wS).padStart(2,'0')}\` : \`\${wM}:\${String(wS).padStart(2,'0')}\`;\n`;

const startStr = "const bar = document.getElementById('timer-progress-bar');";
const endStr = "if (waitingTimeEl) waitingTimeEl.textContent = wTimeStr;";

const startIdx = content.indexOf(startStr) + startStr.length;
const endIdx = content.indexOf(endStr);
if (startIdx > startStr.length && endIdx > startIdx) {
    content = content.substring(0, startIdx) + correctBlock + "            " + content.substring(endIdx);
    fs.writeFileSync('public/driver.html', content, 'utf8');
    console.log('Fixed driver.html timer colors successfully!');
} else {
    console.log('Could not find boundaries.', startIdx, endIdx);
}
