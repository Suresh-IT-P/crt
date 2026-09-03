import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function RideHistoryList({ rides }) {
    if (!rides || rides.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No rides found. Begin your journey today!</Text>
            </View>
        );
    }

    const getStatusStyle = (status) => {
        switch(status?.toLowerCase()) {
            case 'pending': return { bg: 'rgba(255,159,10,0.1)', text: '#ff9f0a' };
            case 'assigned': return { bg: 'rgba(10,132,255,0.1)', text: '#0a84ff' };
            case 'completed': return { bg: 'rgba(52,199,89,0.1)', text: '#34c759' };
            case 'cancelled': return { bg: 'rgba(255,59,48,0.1)', text: '#ff3b30' };
            case 'ongoing': return { bg: 'rgba(10,132,255,0.15)', text: '#0a84ff' };
            case 'finished': return { bg: 'rgba(183,28,28,0.15)', text: '#B71C1C' };
            default: return { bg: 'rgba(255,255,255,0.1)', text: '#fff' };
        }
    };

    return (
        <View style={styles.container}>
            {rides.map((ride, idx) => {
                const sStyle = getStatusStyle(ride.status);
                return (
                    <View key={idx} style={styles.card}>
                        <View style={styles.headerRow}>
                            <Text style={styles.idText}>ID: #{ride.id}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: sStyle.bg }]}>
                                <Text style={[styles.statusText, { color: sStyle.text }]}>{ride.status}</Text>
                            </View>
                        </View>
                        <View style={styles.routeRow}>
                            <Text style={styles.routeText} numberOfLines={1}>{ride.pickup_loc} → {ride.drop_loc}</Text>
                        </View>
                        <View style={styles.detailsRow}>
                            <Text style={styles.detailText}>{new Date(ride.created_at || Date.now()).toLocaleDateString()}</Text>
                            <Text style={styles.detailText}>{ride.vehicle_type}</Text>
                            <Text style={[styles.detailText, { color: '#B71C1C', fontWeight: '700' }]}>{ride.fare || ride.estimated_fare}</Text>
                        </View>
                        
                        <View style={styles.actionsRow}>
                            {ride.status === 'completed' || ride.status === 'finished' ? (
                                <TouchableOpacity style={styles.actionBtn}>
                                    <Text style={styles.actionBtnText}>View Invoice</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { gap: 15 },
    emptyContainer: { padding: 40, alignItems: 'center' },
    emptyText: { color: '#8e9297', fontSize: 14 },
    card: { backgroundColor: '#14161d', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    idText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    routeRow: { marginBottom: 10 },
    routeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    detailText: { color: '#8e9297', fontSize: 12 },
    actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 10 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(183,28,28,0.3)', backgroundColor: 'rgba(183,28,28,0.1)' },
    actionBtnText: { color: '#B71C1C', fontSize: 11, fontWeight: '700' }
});
