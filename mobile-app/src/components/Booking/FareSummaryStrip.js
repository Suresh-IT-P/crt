import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const FareSummaryStrip = ({ vehicle, onBookPress, onViewFareBreakdown }) => {
    if (!vehicle) return null;

    return (
        <View style={styles.container}>
            <View style={styles.infoRow}>
                <View style={styles.item}>
                    <Text style={styles.label}>DISTANCE</Text>
                    <Text style={styles.value}>{vehicle.displayDistance}</Text>
                </View>
                <View style={styles.item}>
                    <Text style={styles.label}>DURATION</Text>
                    <Text style={styles.value}>{vehicle.durationText}</Text>
                </View>
                <View style={styles.item}>
                    <Text style={styles.label}>EST. FARE</Text>
                    <Text style={styles.fareValue}>₹{vehicle.fare}</Text>
                </View>
            </View>
            
            <View style={styles.actionRow}>
                <TouchableOpacity style={styles.eyeBtn} onPress={onViewFareBreakdown}>
                    <Text style={styles.eyeIcon}>ℹ️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bookBtn} onPress={onBookPress}>
                    <Text style={styles.bookBtnText}>Book Now →</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(183,28,28,0.06)',
        borderColor: 'rgba(183,28,28,0.2)',
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    item: {
        flex: 1,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        color: '#8b90a0',
        marginBottom: 4,
    },
    value: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    fareValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#e53935',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    eyeBtn: {
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        marginRight: 10,
    },
    eyeIcon: {
        fontSize: 14,
    },
    bookBtn: {
        flex: 1,
        backgroundColor: '#1a8a4a', // var(--cr-green) approx
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    bookBtnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 15,
    }
});

export default FareSummaryStrip;
