import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

export default function DriverEarningsScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Earnings Summary</Text>
            </View>
            <ScrollView style={styles.content}>
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>₹0</Text>
                        <Text style={styles.statLabel}>TODAY</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>₹0</Text>
                        <Text style={styles.statLabel}>THIS WEEK</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>₹0</Text>
                        <Text style={styles.statLabel}>ALL-TIME</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Performance Indicators</Text>
                    <View style={styles.perfRow}>
                        <View style={styles.perfItem}>
                            <View style={[styles.perfCircle, { borderColor: '#B71C1C' }]}>
                                <Text style={[styles.perfText, { color: '#B71C1C' }]}>4.8★</Text>
                            </View>
                            <Text style={styles.perfLabel}>RATING</Text>
                        </View>
                        <View style={styles.perfItem}>
                            <View style={[styles.perfCircle, { borderColor: '#34c759' }]}>
                                <Text style={[styles.perfText, { color: '#34c759' }]}>96%</Text>
                            </View>
                            <Text style={styles.perfLabel}>ACCEPTANCE</Text>
                        </View>
                        <View style={styles.perfItem}>
                            <View style={[styles.perfCircle, { borderColor: '#ff3b30' }]}>
                                <Text style={[styles.perfText, { color: '#ff3b30' }]}>2%</Text>
                            </View>
                            <Text style={styles.perfLabel}>CANCELLATION</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Active Weekly Incentive</Text>
                    <View style={styles.incentiveRow}>
                        <Text style={styles.incentiveText}>Complete 10 rides to earn bonus</Text>
                        <Text style={styles.incentiveCount}>0/10 Rides</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBar, { width: '0%' }]}></View>
                    </View>
                    <Text style={styles.incentiveDesc}>Target reward: ₹500.00 cash bonus added straight to wallet balance.</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#090a0f' },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
    content: { padding: 15 },
    statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    statValue: { fontSize: 18, fontWeight: '800', color: '#fff' },
    statLabel: { fontSize: 10, color: '#8e9297', fontWeight: '600', marginTop: 4 },
    card: { backgroundColor: '#14161d', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    cardTitle: { fontSize: 14, fontWeight: '800', color: '#8e9297', textTransform: 'uppercase', marginBottom: 15 },
    perfRow: { flexDirection: 'row', justifyContent: 'space-around' },
    perfItem: { alignItems: 'center' },
    perfCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    perfText: { fontSize: 14, fontWeight: '800' },
    perfLabel: { fontSize: 10, color: '#8e9297', fontWeight: '600' },
    incentiveRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    incentiveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    incentiveCount: { color: '#B71C1C', fontSize: 12, fontWeight: '700' },
    progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#B71C1C' },
    incentiveDesc: { color: '#8e9297', fontSize: 11, marginTop: 10 }
});
