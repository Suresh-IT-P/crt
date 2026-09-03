import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

export default function DutyToggle({ isOnline, onToggle }) {
    return (
        <TouchableOpacity 
            style={[styles.container, isOnline ? styles.onlineContainer : styles.offlineContainer]}
            onPress={onToggle}
            activeOpacity={0.8}
        >
            <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={[styles.text, isOnline ? styles.textOnline : styles.textOffline]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 30,
        borderWidth: 1,
    },
    offlineContainer: {
        backgroundColor: '#20222b',
        borderColor: 'rgba(255,255,255,0.06)',
    },
    onlineContainer: {
        backgroundColor: '#B71C1C',
        borderColor: '#B71C1C',
        shadowColor: '#B71C1C',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 5,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    dotOffline: {
        backgroundColor: '#53575d',
    },
    dotOnline: {
        backgroundColor: '#000',
    },
    text: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    textOffline: {
        color: '#8e9297',
    },
    textOnline: {
        color: '#000',
    }
});
