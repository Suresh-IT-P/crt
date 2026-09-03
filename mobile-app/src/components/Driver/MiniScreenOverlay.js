import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, Linking, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * MiniScreenOverlay Component for Driver App
 * Displays a compact, high-visibility floating mini screen overlay when driver goes Online 
 * or has an Active Ride (similar to Ola / Uber driver heads-up widget).
 */
export default function MiniScreenOverlay({ isOnline, activeRide, incomingPing, onAcceptPing, onAction }) {
    const [appState, setAppState] = useState(AppState.currentState);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (appState.match(/inactive|background/) && nextAppState === 'active') {
                setIsMinimized(false);
            } else if (nextAppState.match(/inactive|background/)) {
                setIsMinimized(true);
            }
            setAppState(nextAppState);
        });

        return () => {
            subscription.remove();
        };
    }, [appState]);

    // Open Google Maps navigation for current ride
    const openGoogleMapsNavigation = () => {
        if (!activeRide) return;
        const dest = activeRide.status === 'En Route to Pickup' 
            ? (activeRide.pickup_loc || activeRide.pickup) 
            : (activeRide.drop_loc || activeRide.drop);
            
        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
        Linking.openURL(url).catch(err => console.error('Error opening Google Maps:', err));
    };

    if (!isOnline && !activeRide && !incomingPing) return null;

    // Mini screen floating bubble when app is minimized or manually forced mini
    return (
        <View style={styles.floatingContainer}>
            {/* Incoming Ping Mini Head */}
            {incomingPing && (
                <View style={styles.incomingMiniCard}>
                    <View style={styles.badgeRow}>
                        <Text style={styles.pingBadge}>⚡ NEW RIDE PING</Text>
                        <Text style={styles.fareText}>₹{incomingPing.fare || '0'}</Text>
                    </View>

                    <Text style={styles.locText} numberOfLines={1}>
                        📍 {incomingPing.pickup_loc || incomingPing.pickup || 'Pickup Location'}
                    </Text>

                    <View style={styles.btnRow}>
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => onAcceptPing(incomingPing)}>
                            <Text style={styles.acceptBtnText}>ACCEPT ⚡</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Active Ongoing Trip Mini Widget */}
            {!incomingPing && activeRide && (
                <View style={styles.activeMiniCard}>
                    <TouchableOpacity style={styles.headerRow} onPress={() => setIsCollapsed(!isCollapsed)}>
                        <View style={styles.statusPill}>
                            <Text style={styles.statusDot}>🟢</Text>
                            <Text style={styles.statusText}>{activeRide.status || 'Active Trip'}</Text>
                        </View>
                        <Text style={styles.toggleIcon}>{isCollapsed ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {!isCollapsed && (
                        <View style={styles.detailsBody}>
                            <Text style={styles.locText} numberOfLines={1}>
                                📍 {activeRide.status === 'En Route to Pickup' ? (activeRide.pickup_loc || 'Pickup') : (activeRide.drop_loc || 'Destination')}
                            </Text>

                            <View style={styles.actionGrid}>
                                <TouchableOpacity style={styles.navBtn} onPress={openGoogleMapsNavigation}>
                                    <Text style={styles.navBtnText}>🗺️ Navigate</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.actionBtn} onPress={() => onAction && onAction('next')}>
                                    <Text style={styles.actionBtnText}>
                                        {activeRide.status === 'En Route to Pickup' ? 'Arrived' : activeRide.status === 'Arrived at Pickup' ? 'Start Trip' : 'Complete'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* Online Scanning Mode Mini Indicator */}
            {!incomingPing && !activeRide && isOnline && (
                <View style={styles.onlineMiniPill}>
                    <Text style={styles.pulseDot}>🟢</Text>
                    <Text style={styles.onlineText}>ONLINE — Mini Mode Active</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    floatingContainer: {
        position: 'absolute',
        top: 45,
        left: 15,
        right: 15,
        zIndex: 99999,
        elevation: 10,
    },
    incomingMiniCard: {
        backgroundColor: '#14161d',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1.5,
        borderColor: '#22c55e',
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    pingBadge: {
        color: '#4ade80',
        fontWeight: '800',
        fontSize: 12,
        letterSpacing: 0.5,
    },
    fareText: {
        color: '#facc15',
        fontWeight: '800',
        fontSize: 16,
    },
    locText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 10,
    },
    btnRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    acceptBtn: {
        backgroundColor: '#22c55e',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
    },
    acceptBtnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 13,
    },
    activeMiniCard: {
        backgroundColor: '#0f1117',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 6,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        fontSize: 10,
    },
    statusText: {
        color: '#4ade80',
        fontWeight: '800',
        fontSize: 13,
    },
    toggleIcon: {
        color: '#8e9297',
        fontSize: 12,
    },
    detailsBody: {
        marginTop: 8,
    },
    actionGrid: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 6,
    },
    navBtn: {
        flex: 1,
        backgroundColor: '#1e293b',
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    navBtnText: {
        color: '#60a5fa',
        fontWeight: '700',
        fontSize: 12,
    },
    actionBtn: {
        flex: 1,
        backgroundColor: '#B71C1C',
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
    },
    actionBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 12,
    },
    onlineMiniPill: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16,185,129,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.3)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    pulseDot: {
        fontSize: 8,
    },
    onlineText: {
        color: '#10b981',
        fontWeight: '700',
        fontSize: 11,
    },
});
