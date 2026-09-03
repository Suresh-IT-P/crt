import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import api from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BookingConfirmationModal = ({ visible, onClose, bookingDetails, onBookingSuccess }) => {
    const [loading, setLoading] = useState(false);

    if (!bookingDetails) return null;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            const userStr = await AsyncStorage.getItem('cityride_member');
            if (!userStr) {
                alert('Please login to CityRideTaxi to continue.');
                setLoading(false);
                return;
            }
            const user = JSON.parse(userStr);

            const payload = {
                ...bookingDetails,
                userId: user.id
            };

            const response = await api.post('/bookings/create', payload);
            
            if (response.data && response.data.success) {
                onBookingSuccess();
            } else {
                alert(`Booking failed: ${response.data.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Submission Error:', err);
            alert('A network error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Review & Confirm Booking</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeText}>×</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <ScrollView style={styles.body}>
                        <Text style={styles.sectionTitle}>TRIP DETAILS</Text>
                        
                        <View style={styles.infoGrid}>
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>📍 Pickup</Text>
                                <Text style={styles.value}>{bookingDetails.pickup}</Text>
                            </View>

                            {bookingDetails.extraDrops?.map((stop, idx) => (
                                <View key={idx} style={styles.infoRow}>
                                    <Text style={styles.label}>🛑 Stop #{idx + 1}</Text>
                                    <Text style={styles.value}>{stop.address}</Text>
                                </View>
                            ))}

                            <View style={styles.infoRow}>
                                <Text style={styles.label}>🏁 Destination</Text>
                                <Text style={styles.value}>{bookingDetails.drop || 'Rental — No fixed drop'}</Text>
                            </View>

                            <View style={styles.infoRow}>
                                <Text style={styles.label}>🚗 Vehicle</Text>
                                <Text style={styles.value}>{bookingDetails.vehicleName}</Text>
                            </View>
                            
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>🛣 Distance</Text>
                                <Text style={styles.value}>{bookingDetails.distance}</Text>
                            </View>
                            
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>⏱ Est. Duration</Text>
                                <Text style={styles.value}>{bookingDetails.estimatedDuration || '—'}</Text>
                            </View>
                            
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>💰 Estimated Fare</Text>
                                <Text style={[styles.value, { color: '#e53935', fontSize: 16 }]}>{bookingDetails.fare}</Text>
                            </View>

                            <View style={styles.infoRow}>
                                <Text style={styles.label}>💺 Seats Required</Text>
                                <Text style={styles.value}>{bookingDetails.passengers || 1} Passengers</Text>
                            </View>
                            
                            <View style={styles.infoRow}>
                                <Text style={styles.label}>📅 Date & Time</Text>
                                <Text style={styles.value}>{bookingDetails.date} at {bookingDetails.time || 'Now'}</Text>
                            </View>
                        </View>

                        <View style={styles.policy}>
                            <Text style={styles.policyText}>
                                By confirming, you agree to our terms. Tolls, parking, and permit fees (if applicable) are extra and must be paid to the driver directly.
                            </Text>
                        </View>
                        
                        <View style={styles.actions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} disabled={loading}>
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.confirmBtnText}>✅ Accept & Book</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    modalContainer: { backgroundColor: '#181c28', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
    title: { fontSize: 16, fontWeight: '800', color: '#fff' },
    closeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontSize: 24, color: '#8b90a0' },
    body: { padding: 20 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: '#B71C1C', letterSpacing: 1, marginBottom: 12 },
    infoGrid: { marginBottom: 20 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    label: { color: '#8b90a0', fontSize: 14, flex: 1 },
    value: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 2, textAlign: 'right' },
    policy: { backgroundColor: 'rgba(0,0,0,0.2)', padding: 14, borderRadius: 12, marginBottom: 20 },
    policyText: { color: '#8b90a0', fontSize: 12, lineHeight: 18 },
    actions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.07)', borderWidth: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
    cancelBtnText: { color: '#8b90a0', fontWeight: '700', fontSize: 15 },
    confirmBtn: { flex: 2, backgroundColor: '#B71C1C', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 }
});

export default BookingConfirmationModal;
