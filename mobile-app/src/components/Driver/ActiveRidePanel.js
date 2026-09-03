import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function ActiveRidePanel({ ride, onAction }) {
    if (!ride) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{ride.status || 'En Route to Pickup'}</Text>
                </View>
                <Text style={styles.idText}>ID: #{ride.id?.toString().slice(-4)}</Text>
            </View>

            <Text style={styles.name}>{ride.passengerName || 'Passenger'}</Text>

            <View style={styles.metricsGrid}>
                <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>EST. FARE</Text>
                    <Text style={[styles.metricVal, { color: '#B71C1C' }]}>{ride.fare || '₹0'}</Text>
                </View>
                <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>TRAVELED</Text>
                    <Text style={styles.metricVal}>{ride.traveled || '0.0 KM'}</Text>
                </View>
                <View style={styles.metricBox}>
                    <Text style={styles.metricLabel}>WAITING</Text>
                    <Text style={styles.metricVal}>₹0</Text>
                </View>
            </View>

            <View style={styles.routeFlow}>
                <View style={styles.routeNode}>
                    <View style={[styles.dot, { backgroundColor: '#B71C1C' }]} />
                    <Text style={styles.routeLabel}>Pickup Location</Text>
                    <Text style={styles.routeVal} numberOfLines={1}>{ride.pickup}</Text>
                </View>
                <View style={styles.routeNode}>
                    <View style={[styles.dot, { backgroundColor: '#ff3b30' }]} />
                    <Text style={styles.routeLabel}>Dropoff Location</Text>
                    <Text style={styles.routeVal} numberOfLines={1}>{ride.drop}</Text>
                </View>
            </View>

            <View style={styles.navRow}>
                <TouchableOpacity style={[styles.navBtn, { borderColor: 'rgba(183,28,28,0.3)' }]}>
                    <Text style={[styles.navBtnText, { color: '#B71C1C' }]}>Nav Pickup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.navBtn, { borderColor: 'rgba(255,59,48,0.3)' }]}>
                    <Text style={[styles.navBtnText, { color: '#ff3b30' }]}>Nav Drop</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn}>
                    <Text style={styles.navBtnText}>Call Client</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
                <TouchableOpacity style={styles.mainActionBtn} onPress={() => onAction('next')}>
                    <Text style={styles.mainActionText}>Arrived at Pickup</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: '#131418', borderLeftWidth: 4, borderLeftColor: '#B71C1C', borderRadius: 16, padding: 15, marginBottom: 15 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    statusBadge: { backgroundColor: 'rgba(183,28,28,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
    statusText: { color: '#B71C1C', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    idText: { fontSize: 12, fontWeight: '700', color: '#8e9297' },
    name: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 15 },
    metricsGrid: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 15 },
    metricBox: { flex: 1 },
    metricLabel: { fontSize: 10, color: '#8e9297', fontWeight: '500', marginBottom: 2 },
    metricVal: { fontSize: 14, fontWeight: '800', color: '#fff' },
    routeFlow: { gap: 12, marginBottom: 15, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)', marginLeft: 5 },
    routeNode: { position: 'relative' },
    dot: { position: 'absolute', left: -16, top: 4, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#000' },
    routeLabel: { fontSize: 10, color: '#8e9297', fontWeight: '600', textTransform: 'uppercase' },
    routeVal: { fontSize: 14, fontWeight: '700', color: '#fff' },
    navRow: { flexDirection: 'row', gap: 8, marginBottom: 15 },
    navBtn: { flex: 1, paddingVertical: 8, backgroundColor: '#20222b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 8, alignItems: 'center' },
    navBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    actionRow: { marginTop: 5 },
    mainActionBtn: { backgroundColor: '#B71C1C', padding: 16, borderRadius: 12, alignItems: 'center' },
    mainActionText: { color: '#fff', fontWeight: '800', fontSize: 15, textTransform: 'uppercase' }
});
