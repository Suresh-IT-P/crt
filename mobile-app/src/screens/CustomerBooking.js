import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import api from '../services/api';

export default function CustomerBooking({ route }) {
  const { userId } = route.params || { userId: 'guest' };
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');

  const handleBooking = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please enter both pickup and dropoff locations.');
      return;
    }

    try {
      const response = await api.post('/bookings/create', {
        userId,
        pickup_loc: pickup,
        drop_loc: dropoff,
        vehicle_type: 'hatchback',
        trip_type: 'local'
      });

      if (response.data) {
        Alert.alert('Success', 'Taxi booked successfully! Waiting for driver.');
        // Reset fields
        setPickup('');
        setDropoff('');
      }
    } catch (error) {
      Alert.alert('Booking Error', 'Could not complete the booking.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Book a Ride</Text>

      <Text style={styles.label}>Pickup Location</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter pickup address"
        value={pickup}
        onChangeText={setPickup}
      />

      <Text style={styles.label}>Dropoff Location</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter dropoff address"
        value={dropoff}
        onChangeText={setDropoff}
      />

      <View style={styles.buttonContainer}>
        <Button title="Book Now" onPress={handleBooking} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    marginBottom: 20,
    borderRadius: 8,
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 10,
  }
});
