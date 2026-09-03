import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, DeviceEventEmitter, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

class ToastManager {
    static show({ message, type = 'success', duration = 3000 }) {
        DeviceEventEmitter.emit('SHOW_TOAST', { message, type, duration });
    }
}

export const Toast = () => {
    const [toastAnim] = useState(new Animated.Value(-150));
    const [message, setMessage] = useState('');
    const [type, setType] = useState('success');

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener('SHOW_TOAST', (data) => {
            setMessage(data.message);
            setType(data.type);
            
            // Slide in
            Animated.timing(toastAnim, {
                toValue: 50,
                duration: 400,
                useNativeDriver: true
            }).start(() => {
                // Wait and slide out
                setTimeout(() => {
                    Animated.timing(toastAnim, {
                        toValue: -150,
                        duration: 300,
                        useNativeDriver: true
                    }).start();
                }, data.duration || 3000);
            });
        });

        return () => listener.remove();
    }, []);

    const getBgColor = () => {
        switch (type) {
            case 'success': return 'rgba(16, 185, 129, 0.95)'; // emerald
            case 'pending': return 'rgba(245, 158, 11, 0.95)'; // gold
            case 'assigned': return 'rgba(59, 130, 246, 0.95)'; // blue
            case 'pickup': return 'rgba(139, 92, 246, 0.95)'; // purple
            case 'ongoing': return 'rgba(16, 185, 129, 0.95)'; // emerald
            case 'completed': return 'rgba(16, 185, 129, 0.95)'; // emerald
            case 'cancelled': return 'rgba(239, 68, 68, 0.95)'; // red
            default: return 'rgba(51, 51, 51, 0.95)';
        }
    };

    return (
        <Animated.View style={[
            styles.toastContainer, 
            { 
                transform: [{ translateY: toastAnim }], 
                backgroundColor: getBgColor() 
            }
        ]}>
            <Text style={styles.toastText}>{message}</Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        top: 0,
        width: width - 40,
        left: 20,
        padding: 16,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        zIndex: 99999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    toastText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 15,
        textAlign: 'center'
    }
});

export default ToastManager;
