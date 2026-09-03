import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';

export default function IncomingPingModal({ visible, pingData, onAccept, onPass }) {
    const [timeLeft, setTimeLeft] = useState(15);

    useEffect(() => {
        let timer;
        if (visible && pingData) {
            setTimeLeft(15);
            timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        onPass();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [visible, pingData]);

    if (!pingData) return null;

    const progressPercent = (timeLeft / 15) * 100;

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <View style={styles.overlay}>
                <View style={styles.header}>
                    <Text style={styles.subtitle}>INCOMING RIDE REQUEST</Text>
                    <Text style={styles.title}>{pingData.vehicleName || 'TAXI'}</Text>
                </View>

                <View style={styles.timerWrap}>
                    {/* Placeholder for the SVG Ring Timer */}
                    <View style={styles.timerCircle}>
                        <Text style={styles.timerNumber}>{timeLeft}</Text>
                    </View>
                </View>

                <View style={styles.detailsCard}>
                    <View style={styles.metricsRow}>
                        <View style={styles.metric}>
                            <Text style={styles.metricLabel}>EST. FARE</Text>
                            <Text style={[styles.metricVal, { color: '#B71C1C' }]}>{pingData.fare}</Text>
                        </View>
                        <View style={[styles.metric, { alignItems: 'center' }]}>
                            <Text style={styles.metricLabel}>DISTANCE</Text>
                            <Text style={styles.metricVal}>{pingData.distance}</Text>
                        </View>
                        <View style={[styles.metric, { alignItems: 'flex-end' }]}>
                            <Text style={styles.metricLabel}>DURATION</Text>
                            <Text style={styles.metricVal}>{pingData.estimatedDuration || '-'}</Text>
                        </View>
                    </View>

                    <View style={styles.routeFlow}>
                        <View style={styles.routeNode}>
                            <View style={[styles.dot, { backgroundColor: '#B71C1C' }]} />
                            <Text style={styles.routeLabel}>Pickup</Text>
                            <Text style={styles.routeVal} numberOfLines={1}>{pingData.pickup}</Text>
                        </View>
                        <View style={styles.routeNode}>
                            <View style={[styles.dot, { backgroundColor: '#ff3b30' }]} />
                            <Text style={styles.routeLabel}>Dropoff</Text>
                            <Text style={styles.routeVal} numberOfLines={1}>{pingData.drop || 'Rental'}</Text>
                        </View>
                    </View>

                    <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 10, color: '#8e9297', fontWeight: '600' }}>SEATS REQUIRED</Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#4caf50' }}>💺 {pingData.passengers || pingData.seatingCapacity || 1} Passengers</Text>
                    </View>
                </View>

                <View style={styles.btnGroup}>
                    <TouchableOpacity style={styles.passBtn} onPress={onPass}>
                        <Text style={styles.passText}>Pass</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(pingData)}>
                        <Text style={styles.acceptText}>Accept</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(9,10,15,0.98)', padding: 30, justifyContent: 'space-between' },
    header: { alignItems: 'center', marginTop: 20 },
    subtitle: { fontSize: 12, color: '#B71C1C', fontWeight: '800', letterSpacing: 2 },
    title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 6 },
    timerWrap: { alignItems: 'center', marginVertical: 30 },
    timerCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 8, borderColor: '#B71C1C', justifyContent: 'center', alignItems: 'center' },
    timerNumber: { fontSize: 48, fontWeight: '800', color: '#fff' },
    detailsCard: { backgroundColor: '#181a20', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    metricsRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 15, marginBottom: 15 },
    metric: { flex: 1 },
    metricLabel: { fontSize: 10, color: '#8e9297', fontWeight: '600' },
    metricVal: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 4 },
    routeFlow: { gap: 15 },
    routeNode: { paddingLeft: 20, position: 'relative' },
    dot: { width: 10, height: 10, borderRadius: 5, position: 'absolute', left: 0, top: 5, borderWidth: 2, borderColor: '#000' },
    routeLabel: { fontSize: 10, color: '#8e9297', fontWeight: '600', textTransform: 'uppercase' },
    routeVal: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 2 },
    btnGroup: { flexDirection: 'row', gap: 15, marginBottom: 20 },
    passBtn: { flex: 1, backgroundColor: '#20222b', padding: 18, borderRadius: 16, alignItems: 'center' },
    passText: { color: '#8e9297', fontWeight: '800', fontSize: 16 },
    acceptBtn: { flex: 2.5, backgroundColor: '#B71C1C', padding: 18, borderRadius: 16, alignItems: 'center' },
    acceptText: { color: '#fff', fontWeight: '800', fontSize: 16 }
});
