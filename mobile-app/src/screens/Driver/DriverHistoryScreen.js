import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

export default function DriverHistoryScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Ride History</Text>
            </View>
            <ScrollView style={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.emptyText}>No rides completed yet.</Text>
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
    card: { backgroundColor: '#14161d', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
    emptyText: { color: '#8e9297' }
});
