// Custom Global Alert Override
document.addEventListener('DOMContentLoaded', () => {
    // Inject the alert HTML into the body
    const alertOverlay = document.createElement('div');
    alertOverlay.className = 'alert-overlay';
    alertOverlay.id = 'global-alert-overlay';
    alertOverlay.innerHTML = `
        <style>
            .alert-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
            .alert-overlay.active { display: flex; }
            .alert-box { background: var(--cr-bg, #fff); padding: 24px; border-radius: 16px; max-width: 90%; width: 320px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .alert-icon { font-size: 40px; margin-bottom: 12px; }
            .alert-message { font-size: 1rem; color: var(--cr-text-main, #333); margin-bottom: 20px; font-weight: 500; word-wrap: break-word; }
            .alert-btn { background: var(--cr-primary, #B71C1C); color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; width: 100%; cursor: pointer; font-size: 1rem; }
        </style>
        <div class="alert-box">
            <div class="alert-icon">⚠️</div>
            <div class="alert-message" id="global-alert-msg-text"></div>
            <button class="alert-btn" id="global-alert-close">Understood</button>
        </div>
    `;
    document.body.appendChild(alertOverlay);

    const closeBtn = document.getElementById('global-alert-close');
    closeBtn.addEventListener('click', () => {
        alertOverlay.classList.remove('active');
    });

    // Override the default alert
    window.alert = function(message) {
        const msgText = document.getElementById('global-alert-msg-text');
        const alertBox = alertOverlay.querySelector('.alert-box');
        const alertIcon = alertOverlay.querySelector('.alert-icon');

        if (msgText) {
            msgText.textContent = message;
            
            // Celebration Trigger
            if (message.includes('CONGRATULATIONS')) {
                alertBox.classList.add('celebration');
                alertOverlay.classList.add('celebration-active');
                alertIcon.textContent = '🎉';
            } else {
                alertBox.classList.remove('celebration');
                alertOverlay.classList.remove('celebration-active');
                alertIcon.textContent = '⚠️';
            }
            
            alertOverlay.classList.add('active');
        } else {
            console.log("ALERT FALLBACK:", message);
        }
    };
});
