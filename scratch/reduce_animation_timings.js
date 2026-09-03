const fs = require('fs');
const path = require('path');

// 1. Modify public/style.css
console.log('Modifying public/style.css...');
const cssPath = path.join(__dirname, '../public/style.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Replacements for transition and animation timings in style.css
css = css.replace(/--transition:\s*all\s+0\.4s/g, '--transition:all 0.2s');
css = css.replace(/transition:\s*opacity\s+0\.8s\s+ease,\s*visibility\s+0\.8s\s+ease/g, 'transition:opacity 0.4s ease,visibility 0.4s ease');
css = css.replace(/animation:\s*gridMove\s+6s/g, 'animation:gridMove 3s');
css = css.replace(/animation:\s*orbPulse\s+3s/g, 'animation:orbPulse 1.5s');
css = css.replace(/animation:\s*ringRotate\s+1\.4s/g, 'animation:ringRotate 0.7s');
css = css.replace(/animation:\s*ringRotate\s+2s/g, 'animation:ringRotate 1s');
css = css.replace(/animation:\s*logoBounce\s+3s/g, 'animation:logoBounce 1.5s');
css = css.replace(/animation:\s*logoFocus\s+3s/g, 'animation:logoFocus 1.5s');
css = css.replace(/animation:\s*fadeInUpSplash\s+0\.8s\s+ease\s+0\.3s/g, 'animation:fadeInUpSplash 0.4s ease 0.15s');
css = css.replace(/animation:\s*fadeInUpSplash\s+0\.8s\s+ease\s+0\.6s/g, 'animation:fadeInUpSplash 0.4s ease 0.3s');
css = css.replace(/animation:\s*roadLines\s+0\.8s/g, 'animation:roadLines 0.4s');
css = css.replace(/animation:\s*carDrive\s+2\.5s/g, 'animation:carDrive 1.25s');
css = css.replace(/animation:\s*progressFill\s+3s/g, 'animation:progressFill 1.5s');
css = css.replace(/animation:\s*progressFill\s+3\.2s/g, 'animation:progressFill 1.6s');
css = css.replace(/animation:\s*progress-load\s+3s/g, 'animation:progress-load 1.5s');
css = css.replace(/animation:\s*float-pulse\s+2\.5s/g, 'animation:float-pulse 1.25s');
css = css.replace(/animation:\s*premium-pulse\s+2s/g, 'animation:premium-pulse 1s');
css = css.replace(/animation:\s*breathe\s+2s/g, 'animation:breathe 1s');
css = css.replace(/animation:\s*celebrate-pop\s+0\.6s/g, 'animation:celebrate-pop 0.3s');
css = css.replace(/animation:\s*jiggle\s+0\.6s/g, 'animation:jiggle 0.3s');
css = css.replace(/animation:\s*modalSlideUp\s+0\.5s/g, 'animation:modalSlideUp 0.25s');
css = css.replace(/animation:\s*pulseHighlight\s+2s/g, 'animation:pulseHighlight 1s');

fs.writeFileSync(cssPath, css, 'utf8');
console.log('✓ Modifying public/style.css complete.');

// 2. Modify public/index.html
console.log('Modifying public/index.html...');
const indexPath = path.join(__dirname, '../public/index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = indexHtml.replace(/3200/g, '1600');
fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('✓ Modifying public/index.html complete.');

// 3. Modify public/dashboard.html
console.log('Modifying public/dashboard.html...');
const dashPath = path.join(__dirname, '../public/dashboard.html');
let dashHtml = fs.readFileSync(dashPath, 'utf8');
dashHtml = dashHtml.replace(/3200/g, '1600');
dashHtml = dashHtml.replace(/animation:\s*pulse\s+2s\s+infinite/g, 'animation:pulse 1s infinite');
dashHtml = dashHtml.replace(/animation:\s*pulse-soft\s+2s\s+infinite/g, 'animation:pulse-soft 1s infinite');
dashHtml = dashHtml.replace(/animation:\s*bannerShake\s+0\.5s\s+ease/g, 'animation:bannerShake 0.25s ease');
dashHtml = dashHtml.replace(/transition:\s*all\s+0\.2s\s+ease/g, 'transition:all 0.1s ease');
dashHtml = dashHtml.replace(/transition:\s*all\s+0\.2s/g, 'transition:all 0.1s');
dashHtml = dashHtml.replace(/transition:\s*all\s+0\.4s/g, 'transition:all 0.2s');

fs.writeFileSync(dashPath, dashHtml, 'utf8');
console.log('✓ Modifying public/dashboard.html complete.');

console.log('--- ALL FILES UPDATED SUCCESSFULY ---');
