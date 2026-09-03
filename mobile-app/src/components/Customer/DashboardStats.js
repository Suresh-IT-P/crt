import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DashboardStats({ totalJourneys, recentMissionId }) {
    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(183,28,28,0.15)' }]}>
                    <Text style={styles.icon}>📈</Text>
                </View>
                <View style={styles.textWrap}>
                    <Text style={styles.label}>TOTAL JOURNEYS</Text>
                    <Text style={[styles.value, { color: '#B71C1C' }]}>{totalJourneys}</Text>
                </View>
            </View>

            <View style={styles.card}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(52,199,89,0.12)' }]}>
                    <Text style={styles.icon}>✓</Text>
                </View>
                <View style={styles.textWrap}>
                    <Text style={styles.label}>RECENT MISSION</Text>
                    <Text style={[styles.value, { color: '#34c759', fontSize: 16, marginTop: 4 }]} numberOfLines={1}>
                        {recentMissionId ? `Ride #${recentMissionId}` : 'None'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flexDirection: 'row', gap: 15, marginBottom: 25 },
    card: { flex: 1, backgroundColor: '#14161d', borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    icon: { fontSize: 18 },
    textWrap: { flex: 1 },
    label: { fontSize: 10, color: '#8e9297', fontWeight: '700', letterSpacing: 1 },
    value: { fontSize: 24, fontWeight: '800' }
});
