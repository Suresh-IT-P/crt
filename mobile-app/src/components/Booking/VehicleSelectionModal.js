import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, SafeAreaView } from 'react-native';

const getVehicleIcon = (type) => {
    switch(type) {
        case 'bike': return '🏍️';
        case 'auto': return '🛺';
        case 'hatchback': return '🚗';
        case 'sedan': return '🚕';
        case 'suv': return '🚙';
        case '8plus1': return '🚐';
        case 'van24': return '🚌';
        default: return '🚗';
    }
};

const VehicleSelectionModal = ({ visible, onClose, vehicles, routeText, onSelectVehicle, selectedVehicle }) => {
    
    // Automatically select the first valid one if not selected (handled by parent typically)

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Select Your Vehicle</Text>
                            <Text style={styles.routeText} numberOfLines={1}>{routeText}</Text>
                        </View>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>×</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 20 }}>
                        {vehicles.length === 0 ? (
                            <Text style={styles.emptyText}>Calculating vehicles...</Text>
                        ) : (
                            vehicles.map((v, index) => {
                                const isSelected = selectedVehicle?.vType === v.vType;
                                const isDisabled = v.isDisabled;

                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.card,
                                            isSelected && styles.cardSelected,
                                            isDisabled && styles.cardDisabled
                                        ]}
                                        onPress={() => !isDisabled && onSelectVehicle(v)}
                                        disabled={isDisabled}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.icon}>{getVehicleIcon(v.vType)}</Text>
                                        
                                        <View style={styles.infoCol}>
                                            <Text style={styles.name}>{v.vehicleName}</Text>
                                            <Text style={styles.capacity}>{v.capacity} • {v.durationText}</Text>
                                        </View>
                                        
                                        <View style={styles.priceCol}>
                                            <Text style={styles.fare}>₹{v.fare}</Text>
                                        </View>

                                        {isDisabled && (
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>Over Cap</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity 
                            style={[styles.selectBtn, !selectedVehicle && styles.selectBtnDisabled]}
                            disabled={!selectedVehicle}
                            onPress={onClose} // Confirming selection just closes modal, state already updated
                        >
                            <Text style={styles.selectBtnText}>
                                {selectedVehicle ? `Select ${selectedVehicle.vehicleName} — ₹${selectedVehicle.fare} →` : 'Select a Vehicle'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#181c28', // var(--cr-card)
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '88%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
    },
    routeText: {
        fontSize: 13,
        color: '#8b90a0',
        marginTop: 4,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    closeBtnText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
        lineHeight: 22,
    },
    body: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    emptyText: {
        color: '#8b90a0',
        textAlign: 'center',
        marginTop: 20,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    cardSelected: {
        borderColor: '#B71C1C',
        backgroundColor: 'rgba(183,28,28,0.08)',
    },
    cardDisabled: {
        opacity: 0.4,
    },
    icon: {
        fontSize: 32,
        marginRight: 16,
    },
    infoCol: {
        flex: 1,
    },
    name: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    capacity: {
        fontSize: 12,
        color: '#8b90a0',
        marginTop: 2,
    },
    priceCol: {
        alignItems: 'flex-end',
    },
    fare: {
        fontSize: 18,
        fontWeight: '800',
        color: '#e53935',
    },
    badge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(183,28,28,0.2)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#ff5252',
        textTransform: 'uppercase',
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.07)',
    },
    selectBtn: {
        backgroundColor: '#B71C1C',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    selectBtnDisabled: {
        backgroundColor: 'rgba(183,28,28,0.4)',
    },
    selectBtnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 16,
    }
});

export default VehicleSelectionModal;
