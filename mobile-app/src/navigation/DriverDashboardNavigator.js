import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Import Screens
import DriverRidesScreen from '../screens/Driver/DriverRidesScreen';
import DriverEarningsScreen from '../screens/Driver/DriverEarningsScreen';
import DriverWalletScreen from '../screens/Driver/DriverWalletScreen';
import DriverHistoryScreen from '../screens/Driver/DriverHistoryScreen';
import DriverProfileScreen from '../screens/Driver/DriverProfileScreen';

const Tab = createBottomTabNavigator();

export default function DriverDashboardNavigator() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: 'rgba(14,16,22,0.96)',
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(255,255,255,0.06)',
                    height: 60,
                    paddingBottom: 5,
                    paddingTop: 5,
                },
                tabBarActiveTintColor: '#B71C1C',
                tabBarInactiveTintColor: '#8e9297',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '700',
                }
            }}
        >
            <Tab.Screen 
                name="Rides" 
                component={DriverRidesScreen}
                options={{ tabBarLabel: 'Rides' }} 
            />
            <Tab.Screen 
                name="Earnings" 
                component={DriverEarningsScreen} 
                options={{ tabBarLabel: 'Earnings' }} 
            />
            <Tab.Screen 
                name="Wallet" 
                component={DriverWalletScreen} 
                options={{ tabBarLabel: 'Wallet' }} 
            />
            <Tab.Screen 
                name="History" 
                component={DriverHistoryScreen} 
                options={{ tabBarLabel: 'History' }} 
            />
            <Tab.Screen 
                name="Profile" 
                component={DriverProfileScreen} 
                options={{ tabBarLabel: 'Profile' }} 
            />
        </Tab.Navigator>
    );
}
