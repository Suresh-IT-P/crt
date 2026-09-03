import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (role) => {
    try {
      const endpoint = role === 'driver' ? '/driver/login' : '/auth/login';
      const payload = {
        phone: username,
        email: username,
        password
      };
      
      const response = await api.post(endpoint, payload);

      if (response.data.success || response.data.user || response.status === 200) {
        const user = response.data.user || {};
        const userId = String(user.id || username);
        const userName = user.name || username;

        await AsyncStorage.setItem('role', role);
        if (role === 'driver') {
          await AsyncStorage.setItem('driverId', userId);
          navigation.navigate('DriverDashboard', { driverId: userId });
        } else {
          await AsyncStorage.setItem('userId', userId);
          await AsyncStorage.setItem('userName', userName);
          navigation.navigate('CustomerDashboard');
        }
      } else {
        Alert.alert('Login Failed', response.data.error || 'Invalid credentials');
      }
    } catch (error) {
      console.error('Login error:', error);
      const msg = error.response?.data?.error || 'Something went wrong while logging in. Please check your credentials.';
      Alert.alert('Login Error', msg);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>City Ride Taxis</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      
      <View style={styles.buttonContainer}>
        <Button title="Login as Driver" onPress={() => handleLogin('driver')} />
      </View>
      <View style={styles.buttonContainer}>
        <Button title="Login as Customer" onPress={() => handleLogin('user')} color="#28a745" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
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
    marginBottom: 15,
  }
});
