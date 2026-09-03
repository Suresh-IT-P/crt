import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ServiceTypeSelector = ({ currentCategory, onSelectCategory }) => {
    const tabs = [
        { id: 'local', label: '🚗 Ride' },
        { id: 'rental', label: '⏱ Rental' },
    ];

    return (
        <View style={styles.container}>
            {tabs.map((tab) => {
                const isActive = (tab.id === 'local' && (currentCategory === 'local' || currentCategory === 'outstation')) || (currentCategory === tab.id);
                return (
                    <TouchableOpacity
                        key={tab.id}
                        style={[styles.tab, isActive && styles.activeTab]}
                        onPress={() => onSelectCategory(tab.id)}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: '#B71C1C', // var(--cr-red)
        shadowColor: '#B71C1C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 5,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#8b90a0', // var(--cr-muted)
    },
    activeTabText: {
        color: '#ffffff',
    },
});

export default ServiceTypeSelector;
