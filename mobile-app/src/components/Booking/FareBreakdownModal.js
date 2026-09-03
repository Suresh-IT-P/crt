import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, SafeAreaView, ScrollView } from 'react-native';

const FareBreakdownModal = ({ visible, onClose, breakdown }) => {
    if (!breakdown) return null;

    return (
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Fare Breakdown</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeText}>×</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <ScrollView style={styles.body}>
                        <View style={styles.row}>
                            <Text style={styles.label}>🛣 Distance</Text>
                            <Text style={styles.value}>{breakdown.distanceKm} KM</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>⏱ Est. Duration</Text>
                            <Text style={styles.value}>{breakdown.durationText}</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={styles.label}>🚗 Vehicle</Text>
                            <Text style={styles.value}>{breakdown.vehicleName}</Text>
                        </View>
                        
                        {breakdown.perKm > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>💰 Rate / KM</Text>
                                <Text style={styles.value}>₹{breakdown.perKm}</Text>
                            </View>
                        )}
                        
                        {breakdown.baseFare > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>🏠 Base Fare</Text>
                                <Text style={styles.value}>₹{breakdown.baseFare}</Text>
                            </View>
                        )}

                        {breakdown.driverAllowance > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>👨‍🚕 Driver Betta</Text>
                                <Text style={styles.value}>₹{breakdown.driverAllowance}</Text>
                            </View>
                        )}

                        {breakdown.extraDropsCharge > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>🛑 Extra Stops ({breakdown.extraDropsCount})</Text>
                                <Text style={styles.value}>₹{breakdown.extraDropsCharge}</Text>
                            </View>
                        )}

                        {breakdown.peakCharge > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>⚡ Peak Surcharge</Text>
                                <Text style={[styles.value, { color: '#ff9f0a' }]}>₹{breakdown.peakCharge}</Text>
                            </View>
                        )}

                        {breakdown.specialLocationCharge > 0 && (
                            <View style={styles.row}>
                                <Text style={styles.label}>🏛️ {breakdown.specialLocationName} (+{breakdown.specialSurchargePct}%)</Text>
                                <Text style={[styles.value, { color: '#6c63ff' }]}>₹{breakdown.specialLocationCharge}</Text>
                            </View>
                        )}

                        <View style={styles.row}>
                            <Text style={styles.label}>📊 Platform Fee</Text>
                            <Text style={styles.value}>₹{breakdown.gst}</Text>
                        </View>

                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Estimated Total</Text>
                            <Text style={styles.totalValue}>₹{breakdown.total}</Text>
                        </View>
                        
                        <Text style={styles.note}>ℹ️ Actual fare may vary based on route, waiting time, peak hours & tolls.</Text>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
    modalContainer: { backgroundColor: '#181c28', borderRadius: 24, overflow: 'hidden' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
    title: { fontSize: 16, fontWeight: '800', color: '#fff' },
    closeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontSize: 24, color: '#8b90a0' },
    body: { padding: 20 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
    label: { color: '#8b90a0', fontSize: 14, fontWeight: '500' },
    value: { color: '#fff', fontSize: 14, fontWeight: '700' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, padding: 16, backgroundColor: 'rgba(183,28,28,0.1)', borderColor: 'rgba(183,28,28,0.25)', borderWidth: 1, borderRadius: 12 },
    totalLabel: { fontWeight: '700', color: '#fff', fontSize: 16 },
    totalValue: { fontWeight: '800', color: '#e53935', fontSize: 20 },
    note: { fontSize: 11, color: '#8b90a0', marginTop: 16, textAlign: 'center', lineHeight: 16 }
});

export default FareBreakdownModal;
