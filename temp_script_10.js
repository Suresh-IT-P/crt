window.addEventListener('load', () => {
const splash = document.getElementById('splash-screen');
if (splash) {
setTimeout(() => {
splash.classList.add('splash-hidden');
document.body.style.setProperty('overflow', 'auto', 'important');
}, 3200);
}
});