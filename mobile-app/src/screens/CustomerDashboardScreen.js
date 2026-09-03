import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import DashboardStats from '../components/Customer/DashboardStats';
import ActiveRideTracker from '../components/Customer/ActiveRideTracker';
import RideHistoryList from '../components/Customer/RideHistoryList';
import SupportSection from '../components/Customer/SupportSection';
import socketService from '../services/socket';
import api from '../services/api';
import ToastManager from '../components/Toast';

export default function CustomerDashboardScreen() {
    const navigation = useNavigation();
    const [user, setUser] = useState({ name: 'User', id: 1 });
    const [rides, setRides] = useState([]);
    const [activeRide, setActiveRide] = useState(null);
    const [driverLocation, setDriverLocation] = useState(null);

    useEffect(() => {
        loadData();
        return () => {
            socketService.disconnect();
        };
    }, []);

    const loadData = async () => {
        try {
            const userId = await AsyncStorage.getItem('userId') || '1';
            const userName = await AsyncStorage.getItem('userName') || 'User';
            setUser({ id: userId, name: userName });

            // Initialize Socket
            socketService.connect(userId);
            
            socketService.on('booking_created', (data) => {
                fetchRides(userId);
                ToastManager.show({
                    message: `🚕 Ride Requested! Booking #B${data.bookingId} placed successfully.`,
                    type: 'pending'
                });
            });

            socketService.on('booking_status_update', (data) => {
                fetchRides(userId);
                if (data.status === 'reached_pickup') {
                    ToastManager.show({
                        message: '📍 Captain at Pickup! Your captain has arrived.',
                        type: 'pickup'
                    });
                } else if (data.status === 'ongoing') {
                    ToastManager.show({
                        message: '🏁 Trip Started! Safe travels.',
                        type: 'ongoing'
                    });
                } else if (data.status === 'finished' || data.status === 'completed') {
                    ToastManager.show({
                        message: `🎉 Trip Completed! Total Fare: ₹${data.finalFare || '--'}`,
                        type: 'completed'
                    });
                } else if (data.status === 'cancelled') {
                    ToastManager.show({
                        message: '❌ Ride Cancelled.',
                        type: 'cancelled'
                    });
                }
            });
            
            socketService.on('booking_confirmed', (data) => {
                fetchRides(userId);
                const msg = data.driverName ? `⚡ Captain Assigned! ${data.driverName} is on the way.` : '⚡ Captain Assigned!';
                ToastManager.show({
                    message: msg,
                    type: 'assigned'
                });
            });
            
            socketService.on('chat_notification', (data) => {
                ToastManager.show({
                    message: `💬 ${data.senderName}: ${data.message}`,
                    type: 'assigned', // using 'assigned' (blue) for chat
                    duration: 4000
                });
            });
            
            socketService.on('driver_location', (data) => {
                if (data.latitude && data.longitude) {
                    setDriverLocation({ latitude: data.latitude, longitude: data.longitude });
                }
            });

            await fetchRides(userId);
        } catch (e) {
            console.error('Failed to load dashboard data:', e);
        }
    };

    const fetchRides = async (userId) => {
        try {
            const res = await api.get(`/user/bookings/${userId}`);
            if (res.data) {
                setRides(res.data);
                
                // Find active ride (pending, assigned, ongoing, finished)
                const active = res.data.find(r => ['pending', 'assigned', 'ongoing', 'finished'].includes(r.status));
                setActiveRide(active || null);
            }
        } catch (e) {
            console.error('Failed to fetch rides:', e);
            // Mock data if backend fails during dev
            const mockRides = [
                { id: 101, status: 'assigned', pickup_loc: 'Airport', drop_loc: 'Downtown', trip_type: 'local', vehicle_type: 'Sedan', driver_name: 'John Doe', car_model: 'Toyota Camry', car_number: 'TN-01-AB-1234', journey_otp: '4582', fare: '₹500', created_at: new Date().toISOString() }
            ];
            setRides(mockRides);
            setActiveRide(mockRides[0]);
        }
    };

    const handleLogout = async () => {
        await AsyncStorage.multiRemove(['userId', 'userName', 'role']);
        navigation.replace('Login');
    };

    const handleCancelRide = () => {
        Alert.alert('Cancel Ride', 'Are you sure you want to cancel this booking?', [
            { text: 'No' },
            { 
                text: 'Yes, Cancel', 
                style: 'destructive',
                onPress: () => {
                    // Call API to cancel
                    setActiveRide(null);
                    fetchRides(user.id);
                }
            }
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>CityRideTaxi</Text>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.welcomeBox}>
                    <Text style={styles.welcomeText}>Welcome back, <Text style={styles.accentText}>{user.name}</Text></Text>
                    <Text style={styles.subText}>Track your premium journey history and current bookings.</Text>
                </View>

                <DashboardStats 
                    totalJourneys={rides.length} 
                    recentMissionId={rides.length > 0 ? rides[0].id : null} 
                />

                <ActiveRideTracker 
                    activeRide={activeRide} 
                    driverLocation={driverLocation} 
                    onCancel={handleCancelRide}
                />

                <View style={styles.historySection}>
                    <View style={styles.historyHeader}>
                        <Text style={styles.historyTitle}>Your Ride History</Text>
                        <TouchableOpacity style={styles.bookBtn} onPress={() => navigation.navigate('CustomerBooking')}>
                            <Text style={styles.bookBtnText}>+ Book New Ride</Text>
                        </TouchableOpacity>
                    </View>
                    
                    <RideHistoryList rides={rides} />
                </View>

                <SupportSection />
                
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#090a0f' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: 'rgba(10,12,18,0.95)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
    backBtn: { padding: 5 },
    backText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
    logoutBtn: { backgroundColor: 'rgba(183,28,28,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(183,28,28,0.3)' },
    logoutText: { color: '#B71C1C', fontWeight: '700', fontSize: 12 },
    content: { padding: 15 },
    welcomeBox: { marginBottom: 30, marginTop: 10 },
    welcomeText: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 5 },
    accentText: { color: '#B71C1C' },
    subText: { color: '#8e9297', fontSize: 14 },
    historySection: { backgroundColor: '#14161d', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    historyTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
    bookBtn: { backgroundColor: '#B71C1C', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
    bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 }
});
