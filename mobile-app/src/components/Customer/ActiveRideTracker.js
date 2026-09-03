import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export default function ActiveRideTracker({ activeRide, driverLocation, onCancel }) {
    if (!activeRide) return null;

    const isFinished = activeRide.status === 'finished';
    const isOngoing = activeRide.status === 'ongoing' || activeRide.status === 'assigned';
    
    const renderOTP = () => {
        if (activeRide.trip_type === 'local') {
            if (activeRide.status === 'assigned') {
                return (
                    <View style={styles.otpBox}>
                        <Text style={styles.otpLabel}>Mission Start OTP</Text>
                        <Text style={styles.otpValue}>{activeRide.journey_otp || '----'}</Text>
                        <Text style={styles.otpSub}>Provide this to your captain to start.</Text>
                    </View>
                );
            }
        } else {
            if (activeRide.status === 'assigned') {
                return (
                    <View style={styles.otpBox}>
                        <Text style={styles.otpLabel}>Mission Start OTP</Text>
                        <Text style={styles.otpValue}>{activeRide.journey_otp || '----'}</Text>
                        <Text style={styles.otpSub}>Provide this to your captain to start.</Text>
                    </View>
                );
            } else if (activeRide.status === 'ongoing') {
                return (
                    <View style={[styles.otpBox, { backgroundColor: 'rgba(52,199,89,0.05)', borderColor: '#34c759' }]}>
                        <Text style={[styles.otpLabel, { color: '#34c759' }]}>Trip Completion OTP</Text>
                        <Text style={styles.otpValue}>{activeRide.end_otp || '----'}</Text>
                        <Text style={styles.otpSub}>Provide this to your captain to finish.</Text>
                    </View>
                );
            }
        }
        return null;
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Active Trip Details</Text>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{activeRide.status}</Text>
                </View>
            </View>

            {/* Map Placeholder for now if driverLocation is provided */}
            {driverLocation && (
                <View style={styles.mapContainer}>
                    <MapView 
                        style={styles.map}
                        initialRegion={{
                            latitude: driverLocation.latitude,
                            longitude: driverLocation.longitude,
                            latitudeDelta: 0.05,
                            longitudeDelta: 0.05
                        }}
                    >
                        <Marker coordinate={driverLocation} title="Driver Location" />
                    </MapView>
                </View>
            )}

            <View style={styles.detailsContainer}>
                <View style={styles.tagsRow}>
                    <View style={styles.tag}><Text style={styles.tagText}>{activeRide.trip_type || 'Local'}</Text></View>
                    <View style={[styles.tag, { backgroundColor: 'rgba(255,255,255,0.08)' }]}><Text style={[styles.tagText, { color: '#fff' }]}>🚗 {activeRide.vehicle_type}</Text></View>
                </View>

                <View style={styles.routeBox}>
                    <Text style={styles.routeLabel}>FROM:</Text>
                    <Text style={styles.routeVal}>{activeRide.pickup_loc}</Text>
                </View>
                <View style={styles.routeBox}>
                    <Text style={styles.routeLabel}>TO:</Text>
                    <Text style={styles.routeVal}>{activeRide.drop_loc || 'Rental / As Directed'}</Text>
                </View>

                {isFinished ? (
                    <View style={styles.invoiceBox}>
                        <Text style={styles.invoiceTitle}>Final Invoice</Text>
                        <Text style={styles.invoiceText}>Total Fare: <Text style={{ color: '#34c759' }}>{activeRide.fare}</Text></Text>
                        <Text style={styles.invoiceText}>Distance: {activeRide.actual_distance || '0.0 KM'}</Text>
                    </View>
                ) : (
                    <View style={styles.liveDetailsBox}>
                        <Text style={styles.liveTitle}>Ride Details</Text>
                        <Text style={styles.liveText}>Distance Covered: <Text style={{ color: '#B71C1C' }}>{activeRide.actual_distance || '0.0 KM'}</Text></Text>
                        <Text style={styles.liveText}>Live Fare: <Text style={{ color: '#B71C1C' }}>{activeRide.fare || activeRide.estimated_fare}</Text></Text>
                    </View>
                )}

                {renderOTP()}

                {(activeRide.status === 'pending' || activeRide.status === 'assigned') && (
                    <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                        <Text style={styles.cancelBtnText}>🛑 Cancel Mission Request</Text>
                    </TouchableOpacity>
                )}
            </View>

            {activeRide.driver_name && (
                <View style={styles.driverBox}>
                    <Text style={styles.driverLabel}>YOUR DRIVER</Text>
                    <Text style={styles.driverName}>{activeRide.driver_name}</Text>
                    <Text style={styles.driverCar}>{activeRide.car_model} - {activeRide.car_number}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: '#14161d', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 20, marginBottom: 25, borderLeftWidth: 5, borderLeftColor: '#B71C1C' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 18, fontWeight: '800', color: '#fff' },
    statusBadge: { backgroundColor: 'rgba(10,132,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    statusText: { color: '#0a84ff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    mapContainer: { height: 200, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#14161d', marginBottom: 20 },
    map: { flex: 1 },
    detailsContainer: { marginTop: 10 },
    tagsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    tag: { backgroundColor: 'rgba(183,28,28,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    tagText: { color: '#B71C1C', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    routeBox: { marginBottom: 15 },
    routeLabel: { fontSize: 10, color: '#8e9297', fontWeight: '700', textTransform: 'uppercase' },
    routeVal: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 2 },
    invoiceBox: { marginTop: 20, padding: 15, backgroundColor: 'rgba(52,199,89,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52,199,89,0.15)' },
    invoiceTitle: { color: '#34c759', fontWeight: '700', marginBottom: 10 },
    invoiceText: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 5 },
    liveDetailsBox: { marginTop: 20, padding: 15, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    liveTitle: { color: '#B71C1C', fontWeight: '700', marginBottom: 10 },
    liveText: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 5 },
    otpBox: { marginTop: 20, padding: 15, backgroundColor: 'rgba(183,28,28,0.05)', borderRadius: 12, borderWidth: 1, borderColor: '#B71C1C', borderStyle: 'dashed', alignItems: 'center' },
    otpLabel: { color: '#B71C1C', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    otpValue: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 8, marginVertical: 5 },
    otpSub: { color: '#8e9297', fontSize: 11 },
    cancelBtn: { marginTop: 20, backgroundColor: 'rgba(183,28,28,0.05)', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#B71C1C', alignItems: 'center' },
    cancelBtnText: { color: '#B71C1C', fontWeight: '700', fontSize: 14 },
    driverBox: { marginTop: 20, backgroundColor: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
    driverLabel: { fontSize: 10, color: '#8e9297', fontWeight: '700', marginBottom: 10 },
    driverName: { color: '#B71C1C', fontSize: 18, fontWeight: '800' },
    driverCar: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 4 }
});
