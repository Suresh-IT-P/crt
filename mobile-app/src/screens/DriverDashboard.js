import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, Switch, FlatList } from 'react-native';
import socket from '../services/socket';
import api from '../services/api';

export default function DriverDashboard({ route, navigation }) {
  const { driverId } = route.params || { driverId: 'mock-id' };
  const [isAvailable, setIsAvailable] = useState(false);
  const [pendingCalls, setPendingCalls] = useState([]);

  useEffect(() => {
    // Connect to socket when dashboard mounts
    if (!socket.connected) {
      socket.connect();
    }

    // Register driver socket
    socket.emit('register-driver', driverId);

    // Listen for new booking calls
    socket.on('new-call', (call) => {
      if (isAvailable) {
        setPendingCalls((prev) => [...prev, call]);
      }
    });

    return () => {
      socket.off('new-call');
    };
  }, [driverId, isAvailable]);

  const toggleAvailability = (value) => {
    setIsAvailable(value);
    // In a real app, you would also update this on the backend
  };

  const acceptCall = async (callId) => {
    try {
      const response = await api.post('/bookings/accept', {
        driverId,
        bookingId: callId
      });
      if (response.data.success) {
        setPendingCalls(pendingCalls.filter(call => call.id !== callId));
        alert('Call accepted successfully!');
      }
    } catch (error) {
      alert('Error accepting call.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Driver Dashboard</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {isAvailable ? 'Available' : 'Offline'}
        </Text>
        <Switch
          value={isAvailable}
          onValueChange={toggleAvailability}
        />
      </View>

      <Text style={styles.subHeader}>Pending Calls</Text>
      {pendingCalls.length === 0 ? (
        <Text style={styles.emptyText}>No pending calls right now.</Text>
      ) : (
        <FlatList
          data={pendingCalls}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.callCard}>
              <Text>Pickup: {item.pickupLocation}</Text>
              <Text>Dropoff: {item.dropoffLocation}</Text>
              <Text>Fare: ${item.fare}</Text>
              <Button title="Accept Call" onPress={() => acceptCall(item.id)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 20,
    elevation: 2,
  },
  statusText: {
    fontSize: 18,
  },
  subHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  callCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    elevation: 2,
  },
  emptyText: {
    fontStyle: 'italic',
    color: '#888',
  }
});
