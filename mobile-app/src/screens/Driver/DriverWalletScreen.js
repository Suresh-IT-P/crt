import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput } from 'react-native';

export default function DriverWalletScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Wallet</Text>
            </View>
            <ScrollView style={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
                    <Text style={styles.balanceValue}>₹0.00</Text>
                    
                    <View style={styles.banner}>
                        <Text style={styles.bannerText}>₹10/day platform access fee is automatically deducted at 6 AM. A flat ₹5 platform fee applies per ride completion.</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Add Money to Wallet</Text>
                    
                    <View style={styles.addMoneyWrap}>
                        <View style={styles.qrPlaceholder}>
                            <Text style={styles.qrText}>QR CODE</Text>
                        </View>
                        <Text style={styles.upiText}>Scan & Pay via UPI</Text>
                        <Text style={styles.upiId}>UPI ID: admin@upi</Text>
                        
                        <View style={styles.inputRow}>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Enter Amount (₹)" 
                                placeholderTextColor="#8e9297" 
                                keyboardType="numeric"
                            />
                            <TouchableOpacity style={styles.notifyBtn}>
                                <Text style={styles.notifyBtnText}>Notify Admin</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Transaction Ledger</Text>
                    <View style={styles.ledgerEmpty}>
                        <Text style={styles.ledgerEmptyText}>No transactions yet.</Text>
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
    balanceLabel: { fontSize: 12, color: '#8e9297', fontWeight: '700' },
    balanceValue: { fontSize: 32, fontWeight: '800', color: '#fff', marginVertical: 5 },
    banner: { backgroundColor: 'rgba(183,28,28,0.04)', borderColor: 'rgba(183,28,28,0.15)', borderWidth: 1, padding: 10, borderRadius: 8, marginTop: 10 },
    bannerText: { color: '#fff', fontSize: 11, lineHeight: 16 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: '#8e9297', textTransform: 'uppercase', marginBottom: 15 },
    addMoneyWrap: { alignItems: 'center' },
    qrPlaceholder: { width: 150, height: 150, backgroundColor: '#fff', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    qrText: { color: '#000', fontWeight: 'bold' },
    upiText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    upiId: { color: '#B71C1C', fontSize: 13, marginTop: 4 },
    inputRow: { flexDirection: 'row', width: '100%', gap: 10, marginTop: 15 },
    input: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff' },
    notifyBtn: { backgroundColor: '#B71C1C', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 10 },
    notifyBtnText: { color: '#fff', fontWeight: '800' },
    ledgerEmpty: { padding: 20, alignItems: 'center' },
    ledgerEmptyText: { color: '#8e9297' }
});
