/**
 * CityRide Platform - Standalone Configuration
 * 
 * Deployed on AWS EC2. Frontend and backend run on the same server,
 * so all API calls use relative paths (no external API root needed).
 */

// App mode - modified during native compilation
window.APP_MODE = 'web';

// No external API root — all requests go to the same origin
const API_BASE_URL = "";

console.log("🚀 CityRide Engine - Standalone Mode (same-origin API)");

// Reusable Passcode Visibility Toggle Helper
window.togglePasswordVisibility = function(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    
    if (isPassword) {
        // Show crossed eye
        button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    } else {
        // Show open eye
        button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
};

// Add cross-origin credentials support for fetch/XHR if API_BASE_URL is not empty
if (API_BASE_URL) {
    const _of = window.fetch.bind(window);
    window.fetch = function(i, o) {
        if(typeof i==="string"&&i.startsWith("/")) i=API_BASE_URL+i;
        else if(typeof i==="string"&&i.startsWith(API_BASE_URL)){}else{return _of(i,o);}
        o = o || {};
        o.credentials = "include";
        return _of(i, o);
    };

    const _xo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u) {
        if(typeof u==="string"&&u.startsWith("/")) u=API_BASE_URL+u;
        return _xo.apply(this, arguments);
    };

    const _xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.withCredentials = true;
        return _xs.apply(this, arguments);
    };
}

// Automatically request native permissions & battery optimization exemption on Capacitor app startup
document.addEventListener('DOMContentLoaded', async () => {
    if (window.Capacitor && window.Capacitor.Plugins) {
        const plugins = window.Capacitor.Plugins;
        
        try {
            if (plugins.Geolocation) {
                await plugins.Geolocation.requestPermissions();
            }
        } catch(e) { console.warn("Geolocation permission prompt failed", e); }
        
        try {
            if (plugins.LocalNotifications) {
                await plugins.LocalNotifications.requestPermissions();
            }
        } catch(e) { console.warn("Notification permission prompt failed", e); }

        // Battery optimization bypass prompt (Customer & Driver)
        try {
            if (plugins.CustomerBackgroundPlugin) {
                await plugins.CustomerBackgroundPlugin.requestIgnoreBatteryOptimizations();
            } else if (plugins.DriverBackgroundPlugin) {
                await plugins.DriverBackgroundPlugin.requestIgnoreBatteryOptimizations();
            }
        } catch(e) { console.warn("Battery optimization request error", e); }

        // Prompt Google Play Services Location Turn On Dialog
        try {
            if (plugins.BackgroundLocationPlugin) {
                await plugins.BackgroundLocationPlugin.promptEnableLocation();
            }
        } catch(e) { console.warn("Location prompt error", e); }
    }
});

// Native & Web Google Location Settings Resolution Helper
window.ensureLocationEnabled = async function() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundLocationPlugin) {
        try {
            const res = await window.Capacitor.Plugins.BackgroundLocationPlugin.promptEnableLocation();
            if (res && res.enabled) return true;
        } catch(e) {
            console.warn("Native location prompt error:", e);
        }
    }
    return false;
};

// Global Geolocation error interceptor to present Google Location Accuracy dialog
if (navigator.geolocation) {
    const origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = function(successCallback, errorCallback, options) {
        origGetCurrentPosition(successCallback, async function(err) {
            // Error code 1: Permission Denied, Error code 2: Position Unavailable (GPS Off)
            if (err && (err.code === 1 || err.code === 2)) {
                const enabled = await window.ensureLocationEnabled();
                if (enabled) {
                    return origGetCurrentPosition(successCallback, errorCallback, options);
                }
                // Fallback Google Maps-styled Location Turn On modal
                showGoogleLocationModal(() => {
                    origGetCurrentPosition(successCallback, errorCallback, options);
                });
            }
            if (typeof errorCallback === 'function') errorCallback(err);
        }, options);
    };
}

function showGoogleLocationModal(retryFn) {
    if (document.getElementById('google-location-accuracy-modal')) return;
    const modalHtml = `
    <div id="google-location-accuracy-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeInModal 0.2s ease;">
        <div style="background: #FFFFFF; border-radius: 28px; width: 100%; max-width: 360px; padding: 24px 24px 20px 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); font-family: 'Outfit','Inter',sans-serif; color: #1C2B23; text-align: left; position: relative;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(112, 193, 87, 0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="#006B3A"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.25rem; font-weight: 800; color: #1C2B23;">Use location?</h3>
            <p style="margin: 0 0 24px 0; font-size: 0.88rem; color: #5F7367; line-height: 1.45; font-weight: 500;">
                To continue, let your device turn on location using Google's location service.
            </p>
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 12px;">
                <button onclick="document.getElementById('google-location-accuracy-modal').remove();" style="background: transparent; border: none; padding: 10px 16px; font-weight: 800; font-size: 0.85rem; color: #5F7367; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">CANCEL</button>
                <button id="btn-turn-on-gps" style="background: linear-gradient(135deg, #70C157, #006B3A); border: none; padding: 12px 22px; border-radius: 12px; font-weight: 800; font-size: 0.85rem; color: #FFFFFF; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(0, 107, 58, 0.25);">TURN ON</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('btn-turn-on-gps').addEventListener('click', async () => {
        const modal = document.getElementById('google-location-accuracy-modal');
        if (modal) modal.remove();
        const enabled = await window.ensureLocationEnabled();
        if (enabled && typeof retryFn === 'function') {
            retryFn();
        } else if (typeof retryFn === 'function') {
            retryFn();
        }
    });
}

