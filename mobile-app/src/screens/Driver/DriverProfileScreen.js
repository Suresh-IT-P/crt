import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

export default function DriverProfileScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Driver Profile</Text>
            </View>
            <ScrollView style={styles.content}>
                
                <View style={[styles.card, styles.profileRow]}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>👤</Text>
                    </View>
                    <View style={styles.infoCol}>
                        <Text style={styles.name}>Driver Name</Text>
                        <Text style={styles.phone}>+91 00000 00000</Text>
                        <View style={styles.badgeRow}>
                            <View style={styles.badgeVehicle}><Text style={styles.badgeVehicleText}>HATCHBACK</Text></View>
                            <View style={styles.badgeNumber}><Text style={styles.badgeNumberText}>TN-XX-1234</Text></View>
                        </View>
                        <Text style={styles.model}>Model: Unknown</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Document Compliance</Text>
                    <View style={styles.docList}>
                        {[
                            'Driver\'s License',
                            'Police Verification (PVC)',
                            'Aadhar Identification',
                            'Vehicle Registration (RC)',
                            'Car Insurance & Permits'
                        ].map((doc, i) => (
                            <View key={i} style={styles.docItem}>
                                <Text style={styles.docLabel}>📄 {doc}</Text>
                                <View style={styles.statusVerified}>
                                    <Text style={styles.statusVerifiedText}>Verified</Text>
                                </View>
                            </View>
                        ))}
                    </View>
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
    card: { backgroundColor: '#14161d', padding: 15, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    cardTitle: { fontSize: 14, fontWeight: '800', color: '#8e9297', textTransform: 'uppercase', marginBottom: 15 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(183,28,28,0.1)', borderColor: '#B71C1C', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 40 },
    infoCol: { flex: 1, gap: 4 },
    name: { color: '#fff', fontSize: 18, fontWeight: '800' },
    phone: { color: '#8e9297', fontSize: 14, fontWeight: '500' },
    badgeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    badgeVehicle: { backgroundColor: 'rgba(183,28,28,0.15)', borderColor: 'rgba(183,28,28,0.3)', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeVehicleText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    badgeNumber: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeNumberText: { color: '#8e9297', fontSize: 10, fontWeight: '700' },
    model: { color: '#8e9297', fontSize: 12, marginTop: 4 },
    docList: { gap: 10 },
    docItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    docLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
    statusVerified: { backgroundColor: 'rgba(52,199,89,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    statusVerifiedText: { color: '#34c759', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }
});
