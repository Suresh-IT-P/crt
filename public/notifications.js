/**
 * CityRide Taxi - Customer Panel Universal Notification Engine
 * Handles real-time Activity Toasts, Audio Chimes, Browser Push Notifications & Notification Center
 */

(function (window) {
    'use strict';

    const STORAGE_KEY = 'cityride_customer_notifications';
    const MAX_HISTORY = 30;

    // --- 1. WEB AUDIO API CHIME GENERATOR ---
    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    function playChime(type) {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;

            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'success' || type === 'ride_accepted') {
                // Dual high chime (C5 -> G5)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
            } else if (type === 'ride_completed') {
                // Triple fanfare (C5 -> E5 -> G5 -> C6)
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.1);
                osc.frequency.setValueAtTime(783.99, now + 0.2);
                osc.frequency.setValueAtTime(1046.50, now + 0.3);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                osc.start(now);
                osc.stop(now + 0.7);
            } else if (type === 'reached_pickup' || type === 'ride_ongoing') {
                // Upward arpeggio
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now); // A4
                osc.frequency.setValueAtTime(554.37, now + 0.1); // C#5
                osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
            } else if (type === 'ride_cancelled' || type === 'error') {
                // Low warning tone
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now); // A3
                osc.frequency.setValueAtTime(196, now + 0.15); // G3
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            } else {
                // Subtle default notification beep
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now); // D5
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            }
        } catch (e) {
            console.warn('[CustomerNotifications] Audio chime error:', e.message);
        }
    }

    // --- 2. BROWSER PUSH NOTIFICATION ---
    function requestPushPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }

    function sendPushNotification(title, body, iconUrl) {
        if ('Notification' in window && Notification.permission === 'granted') {
            if (document.hidden) {
                try {
                    new Notification(title, {
                        body: body,
                        icon: iconUrl || '/car.png',
                        badge: '/car.png',
                        tag: 'cityride-activity-' + Date.now()
                    });
                } catch (e) {
                    console.warn('[CustomerNotifications] Push notification error:', e.message);
                }
            }
        }
    }

    // --- 3. TOAST CONTAINER CREATION ---
    function getOrCreateToastContainer() {
        let container = document.getElementById('cr-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'cr-toast-container';
            container.className = 'cr-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    // Map activity key to visual configs
    const ACTIVITY_CONFIGS = {
        ride_booked: {
            title: '🚕 Ride Requested!',
            colorClass: 'cr-toast-pending',
            icon: '🚖',
            sound: 'info'
        },
        pending: {
            title: '🚕 Ride Requested!',
            colorClass: 'cr-toast-pending',
            icon: '🚖',
            sound: 'info'
        },
        ride_accepted: {
            title: '⚡ Captain Assigned!',
            colorClass: 'cr-toast-assigned',
            icon: '👨‍✈️',
            sound: 'ride_accepted'
        },
        assigned: {
            title: '⚡ Captain Assigned!',
            colorClass: 'cr-toast-assigned',
            icon: '👨‍✈️',
            sound: 'ride_accepted'
        },
        reached_pickup: {
            title: '📍 Captain at Pickup!',
            colorClass: 'cr-toast-pickup',
            icon: '📍',
            sound: 'reached_pickup'
        },
        ride_ongoing: {
            title: '🏁 Trip Started!',
            colorClass: 'cr-toast-ongoing',
            icon: '🚗',
            sound: 'ride_ongoing'
        },
        ongoing: {
            title: '🏁 Trip Started!',
            colorClass: 'cr-toast-ongoing',
            icon: '🚗',
            sound: 'ride_ongoing'
        },
        ride_completed: {
            title: '🎉 Trip Completed!',
            colorClass: 'cr-toast-completed',
            icon: '🏁',
            sound: 'ride_completed'
        },
        completed: {
            title: '🎉 Trip Completed!',
            colorClass: 'cr-toast-completed',
            icon: '🏁',
            sound: 'ride_completed'
        },
        finished: {
            title: '🎉 Trip Completed!',
            colorClass: 'cr-toast-completed',
            icon: '🏁',
            sound: 'ride_completed'
        },
        ride_cancelled: {
            title: '❌ Ride Cancelled',
            colorClass: 'cr-toast-cancelled',
            icon: '🚫',
            sound: 'ride_cancelled'
        },
        cancelled: {
            title: '❌ Ride Cancelled',
            colorClass: 'cr-toast-cancelled',
            icon: '🚫',
            sound: 'ride_cancelled'
        },
        chat: {
            title: '💬 New Message',
            colorClass: 'cr-toast-assigned', // Blue color works well for chat
            icon: '💬',
            sound: 'info'
        }
    };

    // --- 4. SHOW TOAST NOTIFICATION ---
    function showToast(activityType, customTitle, message, duration = 5000, bookingId = null) {
        // DEDUPLICATION: Check if this exact notification type for this exact booking was already shown
        const history = getStoredNotifications();
        if (bookingId) {
            const alreadyShownForBooking = history.some(item => item.type === activityType && item.bookingId === bookingId);
            if (alreadyShownForBooking) return;
        } else {
            // Fallback: If no bookingId, at least prevent identical spam in quick succession
            const recentlyShown = history.slice(0, 5).some(item => item.type === activityType && item.message === message && (Date.now() - item.timestamp < 60000));
            if (recentlyShown) return;
        }

        const config = ACTIVITY_CONFIGS[activityType] || {
            title: customTitle || 'Activity Update',
            colorClass: 'cr-toast-info',
            icon: '🔔',
            sound: 'info'
        };

        const displayTitle = customTitle || config.title;
        const container = getOrCreateToastContainer();

        const toast = document.createElement('div');
        toast.className = `cr-toast-card ${config.colorClass}`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        toast.innerHTML = `
            <div class="cr-toast-icon">${config.icon}</div>
            <div class="cr-toast-content">
                <div class="cr-toast-header">
                    <span class="cr-toast-title">${escapeHtml(displayTitle)}</span>
                    <span class="cr-toast-time">${timestamp}</span>
                </div>
                <div class="cr-toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="cr-toast-close" onclick="this.parentElement.remove()" title="Close">&times;</button>
        `;

        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('active');
        });

        // Play audio chime
        playChime(config.sound);

        // Push desktop notification
        sendPushNotification(displayTitle, message);

        // Save to History Center
        saveNotificationToHistory({
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            type: activityType,
            title: displayTitle,
            message: message,
            timestamp: Date.now(),
            icon: config.icon,
            bookingId: bookingId,
            read: false
        });

        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.remove('active');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }

    // --- 5. NOTIFICATION HISTORY CENTER & STORAGE ---
    function getStoredNotifications() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveNotificationToHistory(item) {
        const history = getStoredNotifications();
        history.unshift(item);
        if (history.length > MAX_HISTORY) history.pop();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) {}

        updateNotificationBadge();
        renderNotificationCenterDrawer();
    }

    function markAllAsRead() {
        const history = getStoredNotifications();
        history.forEach(item => item.read = true);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) {}
        updateNotificationBadge();
        renderNotificationCenterDrawer();
    }

    function updateNotificationBadge() {
        const history = getStoredNotifications();
        const unreadCount = history.filter(i => !i.read).length;
        const badgeEls = document.querySelectorAll('.cr-notif-badge');

        badgeEls.forEach(badge => {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        });
    }

    function renderNotificationCenterDrawer() {
        const listEl = document.getElementById('cr-notif-list');
        if (!listEl) return;

        const history = getStoredNotifications();
        if (history.length === 0) {
            listEl.innerHTML = `
                <div class="cr-notif-empty">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">🔔</div>
                    <div style="font-weight: 600; color: var(--cr-text-muted);">No activity notifications yet</div>
                    <div style="font-size: 0.8rem; color: var(--cr-text-muted); opacity: 0.7;">Updates about your rides will appear here in real time.</div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = history.map(item => {
            const timeAgo = formatTimeAgo(item.timestamp);
            const isUnread = !item.read;
            return `
                <div class="cr-notif-item ${isUnread ? 'unread' : ''}">
                    <div class="cr-notif-item-icon">${item.icon || '🔔'}</div>
                    <div class="cr-notif-item-body">
                        <div class="cr-notif-item-title">${escapeHtml(item.title)}</div>
                        <div class="cr-notif-item-msg">${escapeHtml(item.message)}</div>
                        <div class="cr-notif-item-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function formatTimeAgo(ts) {
        if (!ts) return 'Just now';
        const diffSecs = Math.floor((Date.now() - ts) / 1000);
        if (diffSecs < 30) return 'Just now';
        if (diffSecs < 60) return `${diffSecs}s ago`;
        const diffMins = Math.floor(diffSecs / 60);
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return new Date(ts).toLocaleDateString();
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    // Toggle drawer UI
    function toggleNotificationDrawer() {
        let drawer = document.getElementById('cr-notif-drawer');
        if (!drawer) {
            createNotificationDrawerUI();
            drawer = document.getElementById('cr-notif-drawer');
        }
        if (drawer) {
            const isOpen = drawer.classList.contains('active');
            if (isOpen) {
                drawer.classList.remove('active');
            } else {
                markAllAsRead();
                drawer.classList.add('active');
            }
        }
    }

    function createNotificationDrawerUI() {
        if (document.getElementById('cr-notif-drawer')) return;

        const drawer = document.createElement('div');
        drawer.id = 'cr-notif-drawer';
        drawer.className = 'cr-notif-drawer';
        drawer.innerHTML = `
            <div class="cr-notif-drawer-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.2rem;">🔔</span>
                    <span style="font-weight:700; font-size:1rem; color:var(--cr-text-main);">Activity Updates</span>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <button class="cr-notif-clear-btn" id="cr-notif-clear-all" title="Clear All History">Clear All</button>
                    <button class="cr-notif-close-btn" id="cr-notif-close-drawer">&times;</button>
                </div>
            </div>
            <div class="cr-notif-drawer-body" id="cr-notif-list">
                <!-- Notifications list rendered dynamically -->
            </div>
        `;
        document.body.appendChild(drawer);

        document.getElementById('cr-notif-close-drawer').addEventListener('click', () => {
            drawer.classList.remove('active');
        });

        document.getElementById('cr-notif-clear-all').addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            updateNotificationBadge();
            renderNotificationCenterDrawer();
        });

        renderNotificationCenterDrawer();
    }

    // Helper method to notify from socket payloads
    function processSocketActivity(data) {
        if (!data) return;
        const status = (data.status || '').toLowerCase();
        const bId = data.bookingId || data.id || null;
        
        if (status === 'assigned') {
            const driverInfo = data.driverName ? `Captain ${data.driverName} (${data.carModel || ''} ${data.carNumber || ''}) accepted your ride.` : 'A captain has accepted your booking request!';
            showToast('ride_accepted', '⚡ Captain Assigned!', driverInfo, 5000, bId);
        } else if (status === 'reached_pickup') {
            showToast('reached_pickup', '📍 Captain at Pickup!', data.message || 'Your captain has arrived at your pickup location!', 5000, bId);
        } else if (status === 'ongoing') {
            showToast('ride_ongoing', '🏁 Trip Started!', 'Your trip has started! Wishing you a safe & smooth journey.', 5000, bId);
        } else if (status === 'completed' || status === 'finished') {
            const fareMsg = data.finalFare ? `Total Fare: ${data.finalFare}.` : '';
            showToast('ride_completed', '🎉 Trip Completed!', `You have reached your destination! ${fareMsg} Thank you for riding with us.`, 5000, bId);
        } else if (status === 'cancelled') {
            showToast('ride_cancelled', '❌ Ride Cancelled', `Booking #${bId || ''} has been cancelled.`, 5000, bId);
        } else if (status === 'pending') {
            showToast('ride_booked', '🚕 Ride Requested!', `Booking #${bId || ''} placed successfully. Finding your nearest driver...`, 5000, bId);
        }
    }

    // Auto-initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        requestPushPermission();
        updateNotificationBadge();
        
        // Attach click handler to any button with class 'cr-notif-bell-btn'
        document.querySelectorAll('.cr-notif-bell-btn').forEach(btn => {
            btn.addEventListener('click', toggleNotificationDrawer);
        });
    });

    // Global Public API
    window.CustomerNotifications = {
        notify: showToast,
        processSocketActivity: processSocketActivity,
        toggleDrawer: toggleNotificationDrawer,
        requestPermission: requestPushPermission,
        playChime: playChime
    };

})(window);
