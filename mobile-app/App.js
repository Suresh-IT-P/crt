import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens & Navigators
import LoginScreen from './src/screens/LoginScreen';
import CustomerBookingScreen from './src/screens/CustomerBookingScreen';
import CustomerDashboardScreen from './src/screens/CustomerDashboardScreen';
import DriverDashboardNavigator from './src/navigation/DriverDashboardNavigator';
import { Toast } from './src/components/Toast';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: '#0a0c12' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold' }
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CustomerDashboard" component={CustomerDashboardScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CustomerBooking" component={CustomerBookingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="DriverDashboard" component={DriverDashboardNavigator} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </>
  );
}
