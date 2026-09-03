import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';

import DutyToggle from '../../components/Driver/DutyToggle';
import IncomingPingModal from '../../components/Driver/IncomingPingModal';
import ActiveRidePanel from '../../components/Driver/ActiveRidePanel';
import MiniScreenOverlay from '../../components/Driver/MiniScreenOverlay';
import socketService from '../../services/socket';
import api from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DriverRidesScreen() {
    const [isOnline, setIsOnline] = useState(false);
    const [location, setLocation] = useState(null);
    const [driverInfo, setDriverInfo] = useState({ name: 'Loading...', vehicle: 'Loading...' });
    
    // Opportunities
    const [opportunities, setOpportunities] = useState([]);
    
    // Pings
    const [incomingPing, setIncomingPing] = useState(null);
    
    // Active Ride
    const [activeRide, setActiveRide] = useState(null);

    useEffect(() => {
        setupDriver();
        return () => {
            socketService.disconnect();
        };
    }, []);

    const setupDriver = async () => {
        const id = await AsyncStorage.getItem('driverId') || 'DRIVER_1';
        setDriverInfo({ name: id, vehicle: 'Hatchback (TN-XX-1234)' });
        
        socketService.connect(id);

        socketService.on('driver_opportunities', (data) => {
            setOpportunities(data);
        });

        socketService.on('incoming_ping', (data) => {
            setIncomingPing(data);
        });
    };

    const toggleDuty = async () => {
        if (!isOnline) {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Allow location access to go online.');
                return;
            }
            let loc = await Location.getCurrentPositionAsync({});
            setLocation(loc.coords);
            setIsOnline(true);
            
            // Start watching location
            Location.watchPositionAsync({
                accuracy: Location.Accuracy.High,
                timeInterval: 5000,
                distanceInterval: 10
            }, (locUpdate) => {
                setLocation(locUpdate.coords);
                socketService.emit('driver_location_update', {
                    lat: locUpdate.coords.latitude,
                    lng: locUpdate.coords.longitude
                });
            });

        } else {
            setIsOnline(false);
            setOpportunities([]);
            socketService.emit('driver_offline', {});
        }
    };

    const handleAcceptPing = (ping) => {
        setIncomingPing(null);
        socketService.emit('accept_ride', { rideId: ping.id });
        setActiveRide({
            ...ping,
            status: 'En Route to Pickup'
        });
    };

    const handlePassPing = () => {
        setIncomingPing(null);
    };

    const handleActiveRideAction = (action) => {
        // Simple state machine for demo
        if (activeRide.status === 'En Route to Pickup') {
            setActiveRide({ ...activeRide, status: 'Arrived at Pickup' });
        } else if (activeRide.status === 'Arrived at Pickup') {
            setActiveRide({ ...activeRide, status: 'Trip Started' });
        } else if (activeRide.status === 'Trip Started') {
            setActiveRide(null); // Trip completed
            Alert.alert('Trip Completed', `Collected ₹${activeRide.fare}`);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Mini Screen Floating Overlay (Ola / Uber Style) */}
            <MiniScreenOverlay 
                isOnline={isOnline}
                activeRide={activeRide}
                incomingPing={incomingPing}
                onAcceptPing={handleAcceptPing}
                onAction={handleActiveRideAction}
            />

            <View style={styles.header}>
                <View style={styles.driverInfo}>
                    <Text style={styles.driverName}>{driverInfo.name}</Text>
                    <Text style={styles.driverVehicle}>{driverInfo.vehicle}</Text>
                </View>
                <DutyToggle isOnline={isOnline} onToggle={toggleDuty} />
            </View>

            {isOnline && (
                <View style={styles.radarBar}>
                    <View style={styles.radarDot} />
                    <Text style={styles.radarText}>ONLINE - Scanning for bookings...</Text>
                </View>
            )}

            <ScrollView style={styles.content}>
                
                {!isOnline && !activeRide && (
                    <View style={styles.offlineHero}>
                        <Text style={styles.heroIcon}>🚗</Text>
                        <Text style={styles.heroTitle}>Ready to Earn?</Text>
                        <Text style={styles.heroDesc}>Toggle the switch at the top to go ONLINE. You will start receiving live ride pings.</Text>
                    </View>
                )}

                {activeRide && (
                    <ActiveRidePanel ride={activeRide} onAction={handleActiveRideAction} />
                )}

                {isOnline && location && (
                    <View style={styles.mapContainer}>
                        <MapView 
                            style={styles.map}
                            initialRegion={{
                                latitude: location.latitude,
                                longitude: location.longitude,
                                latitudeDelta: 0.01,
                                longitudeDelta: 0.01
                            }}
                            showsUserLocation={true}
                        >
                            <Marker coordinate={location} title="You are here" />
                        </MapView>
                    </View>
                )}

                {isOnline && !activeRide && (
                    <View style={styles.opportunitiesContainer}>
                        {opportunities.length === 0 ? (
                            <View style={styles.scanningPanel}>
                                <Text style={styles.scanningTitle}>Scanning for Rides</Text>
                                <Text style={styles.scanningSub}>Searching within 5.0 km radius...</Text>
                            </View>
                        ) : (
                            <View style={styles.oppsPanel}>
                                <Text style={styles.oppsTitle}>Live Ride Opportunities</Text>
                                {opportunities.map((opp, idx) => (
                                    <View key={idx} style={styles.oppCard}>
                                        <View style={styles.oppHeader}>
                                            <Text style={styles.oppFare}>{opp.fare}</Text>
                                            <Text style={styles.oppDist}>{opp.distance} away</Text>
                                        </View>
                                        <Text style={styles.oppPickup} numberOfLines={1}>{opp.pickup}</Text>
                                        <Text style={styles.oppDrop} numberOfLines={1}>{opp.drop}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

            </ScrollView>

            <IncomingPingModal 
                visible={!!incomingPing} 
                pingData={incomingPing} 
                onAccept={handleAcceptPing} 
                onPass={handlePassPing} 
            />

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#090a0f' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#101115', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    driverInfo: { gap: 2 },
    driverName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    driverVehicle: { color: '#8e9297', fontSize: 12 },
    radarBar: { backgroundColor: 'rgba(183,28,28,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(183,28,28,0.2)', paddingVertical: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    radarDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#B71C1C' },
    radarText: { color: '#B71C1C', fontSize: 12, fontWeight: '600' },
    content: { padding: 15 },
    offlineHero: { backgroundColor: 'rgba(20,22,29,0.5)', padding: 30, borderRadius: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginTop: 10 },
    heroIcon: { fontSize: 48, marginBottom: 15 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 8 },
    heroDesc: { color: '#8e9297', fontSize: 13, textAlign: 'center', lineHeight: 20 },
    mapContainer: { height: 250, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 15 },
    map: { flex: 1 },
    opportunitiesContainer: { minHeight: 230 },
    scanningPanel: { backgroundColor: '#14161d', padding: 30, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    scanningTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 6 },
    scanningSub: { color: '#8e9297', fontSize: 12 },
    oppsPanel: { backgroundColor: '#14161d', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    oppsTitle: { color: '#8e9297', fontSize: 14, fontWeight: '800', marginBottom: 15 },
    oppCard: { backgroundColor: '#181a20', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    oppHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    oppFare: { color: '#B71C1C', fontSize: 18, fontWeight: '800' },
    oppDist: { color: '#8e9297', fontSize: 12 },
    oppPickup: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4 },
    oppDrop: { color: '#8e9297', fontSize: 12 }
});
