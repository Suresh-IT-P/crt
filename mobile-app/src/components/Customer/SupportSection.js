import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SupportSection() {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>24/7 Helpline & Support</Text>
                <Text style={styles.desc}>Need help with your booking or have a complaint? Our support team is here to help you around the clock.</Text>
            </View>
            <View style={styles.contactList}>
                <View style={styles.contactItem}>
                    <View style={[styles.iconWrap, { backgroundColor: 'rgba(183,28,28,0.15)' }]}>
                        <Text style={styles.icon}>📞</Text>
                    </View>
                    <View>
                        <Text style={styles.contactLabel}>Emergency Support / Complaints</Text>
                        <Text style={[styles.contactValue, { color: '#B71C1C' }]}>+91 98765 43210</Text>
                    </View>
                </View>

                <View style={styles.contactItem}>
                    <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                        <Text style={styles.icon}>✉️</Text>
                    </View>
                    <View>
                        <Text style={styles.contactLabel}>Email Signal Channel</Text>
                        <Text style={[styles.contactValue, { color: '#8e9297', fontWeight: '500' }]}>support@cityridetaxi.com</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { backgroundColor: '#1A1C1E', borderRadius: 20, padding: 25, marginTop: 10 },
    header: { marginBottom: 20 },
    title: { color: '#B71C1C', fontSize: 16, fontWeight: '800', marginBottom: 8 },
    desc: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 20 },
    contactList: { gap: 15 },
    contactItem: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    iconWrap: { width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    icon: { fontSize: 20 },
    contactLabel: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 2 },
    contactValue: { fontSize: 15, fontWeight: '800' }
});
