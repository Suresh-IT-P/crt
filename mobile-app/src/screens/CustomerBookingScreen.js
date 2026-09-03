import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker'; // We need this package
import DateTimePicker from '@react-native-community/datetimepicker'; // We need this package
import * as Location from 'expo-location';

import api from '../services/api';
import ServiceTypeSelector from '../components/Booking/ServiceTypeSelector';
import LocationInput from '../components/Booking/LocationInput';
import VehicleSelectionModal from '../components/Booking/VehicleSelectionModal';
import FareSummaryStrip from '../components/Booking/FareSummaryStrip';
import FareBreakdownModal from '../components/Booking/FareBreakdownModal';
import BookingConfirmationModal from '../components/Booking/BookingConfirmationModal';

import {
    allowedVehicleTypes,
    allowedTripTypes,
    getTransformedType,
    getTripPricing,
    getRentalConfig,
    calculateLocalSlabFare,
    getPeakSurcharge,
    FALLBACK_PRICING,
    DISPLAY_INFO
} from '../utils/fareCalculator';

export default function CustomerBookingScreen({ navigation }) {
    // --- State ---
    const [currentCategory, setCurrentCategory] = useState('local');
    const [bookingType, setBookingType] = useState('now');
    
    const [pickup, setPickup] = useState(null);
    const [drop, setDrop] = useState(null);
    const [extraDrops, setExtraDrops] = useState([]);
    const [fetchingLiveLoc, setFetchingLiveLoc] = useState(false);

    // --- Live Location Fetching Handler ---
    const handleFetchLiveLocation = async () => {
        try {
            setFetchingLiveLoc(true);
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Please allow location permission in your device settings to detect your pickup address.');
                return;
            }
            
            let loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            const lat = loc.coords.latitude;
            const lng = loc.coords.longitude;
            const coords = `${lng},${lat}`;

            // Reverse geocode location using backend proxy API
            try {
                const res = await api.get(`/proxy/reverse?lon=${lng}&lat=${lat}`);
                if (res.data && res.data.features && res.data.features.length > 0) {
                    const p = res.data.features[0].properties;
                    const parts = [p.name, p.road, p.suburb, p.city, p.state].filter(Boolean);
                    const address = parts.length > 0 ? parts.join(', ') : (p.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                    setPickup({ address, coords });
                } else {
                    setPickup({ address: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, coords });
                }
            } catch (e) {
                console.warn('Reverse geocode failed:', e);
                setPickup({ address: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, coords });
            }
        } catch (err) {
            console.error('Error fetching live location:', err);
            Alert.alert('Location Error', 'Unable to fetch current location. Please make sure GPS / Location Services are enabled on your device.');
        } finally {
            setFetchingLiveLoc(false);
        }
    };
    
    const [date, setDate] = useState(new Date());
    const [time, setTime] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [returnDate, setReturnDate] = useState(new Date());
    const [showReturnDatePicker, setShowReturnDatePicker] = useState(false);
    
    const [rentalPackage, setRentalPackage] = useState('8-80');
    const [passengers, setPassengers] = useState('1');
    const [specialPlaceType, setSpecialPlaceType] = useState('');

    // API Data
    const [tariffs, setTariffs] = useState(null);
    const [peakRules, setPeakRules] = useState([]);
    const [specialLocationCharges, setSpecialLocationCharges] = useState([]);
    
    // UI Modals
    const [vehicles, setVehicles] = useState([]);
    const [showVehicles, setShowVehicles] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [showFareBreakdown, setShowFareBreakdown] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    
    const [calculating, setCalculating] = useState(false);

    // --- Fetch Tariffs on Mount ---
    useEffect(() => {
        fetchTariffs();
    }, []);

    const fetchTariffs = async () => {
        try {
            const [res, peakRes, spRes] = await Promise.all([
                api.get('/tariffs'),
                api.get('/peak-rules'),
                api.get('/special-location-charges')
            ]);
            
            setPeakRules(peakRes.data || []);
            setSpecialLocationCharges(Array.isArray(spRes.data) ? spRes.data.filter(c => c.is_active) : []);

            const data = res.data;
            const transformed = Object.create(null);
            
            data.forEach(t => {
                if (allowedVehicleTypes.includes(t.vehicle_type)) {
                    if (!getTransformedType(transformed, t.vehicle_type)) {
                        transformed[t.vehicle_type] = { ...DISPLAY_INFO[t.vehicle_type] };
                    }
                    if (t.category !== '__proto__' && t.category !== 'constructor') {
                        const targetObj = getTransformedType(transformed, t.vehicle_type);
                        if (targetObj) {
                            const val = typeof t.config === 'string' ? JSON.parse(t.config) : t.config;
                            targetObj[t.category] = val;
                        }
                    }
                }
            });
            setTariffs(transformed);
        } catch (err) {
            console.log('Tariff fetch failed, using fallback.', err);
            setTariffs(FALLBACK_PRICING);
        }
    };

    // --- Actions ---
    const addExtraDrop = () => {
        if (extraDrops.length >= 3) return alert('Max 3 extra stops allowed.');
        setExtraDrops([...extraDrops, null]);
    };
    
    const removeExtraDrop = (index) => {
        const newDrops = [...extraDrops];
        newDrops.splice(index, 1);
        setExtraDrops(newDrops);
    };
    
    const updateExtraDrop = (index, val) => {
        const newDrops = [...extraDrops];
        newDrops[index] = val;
        setExtraDrops(newDrops);
    };

    const handleSearchVehicles = async () => {
        if (!pickup) return alert('Please enter a pickup location.');
        if (currentCategory !== 'rental' && !drop) return alert('Please enter a destination.');
        
        setCalculating(true);
        setSelectedVehicle(null);
        
        try {
            let distanceInKm = 0;
            let durationInMins = 0;

            if (pickup && (drop || currentCategory === 'rental')) {
                if (currentCategory !== 'rental') {
                    // OSRM Call
                    let url = `/proxy/route?pickup=${pickup.coords}&drop=${drop.coords}`;
                    const validExtras = extraDrops.filter(d => d?.coords).map(d => d.coords);
                    if (validExtras.length > 0) {
                        url += `&extraDrops=${validExtras.join(';')}`;
                    }
                    
                    const response = await api.get(url);
                    const data = response.data;
                    
                    if (data.routes && data.routes.length > 0) {
                        distanceInKm = Math.ceil(data.routes[0].distance / 1000);
                        durationInMins = distanceInKm * 2; // GLOBAL RULE override
                        
                        if (currentCategory !== 'rental') {
                            const targetCategory = distanceInKm > 50 ? 'outstation' : 'local';
                            setCurrentCategory(targetCategory);
                            generateVehicleCards(distanceInKm, durationInMins, targetCategory);
                            return;
                        }
                    } else {
                        throw new Error('No route found');
                    }
                }
                
                generateVehicleCards(distanceInKm, durationInMins);
            }
        } catch (err) {
            console.log(err);
            alert('Could not calculate route. Please re-select your locations.');
        } finally {
            setCalculating(false);
        }
    };

    const generateVehicleCards = (distance, duration, overrideCategory) => {
        if (!tariffs) return alert('Tariffs not loaded yet.');
        
        const start = date;
        const end = returnDate;
        let tripDays = 1;
        if (end > start) {
            const diffTime = Math.abs(end - start);
            tripDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }

        const allTripTypes = [
            { id: 'local', category: 'local' },
            { id: 'oneway', category: 'outstation' },
            { id: 'round', category: 'outstation' },
            { id: 'rental', category: 'rental' }
        ];

        const cat = overrideCategory || currentCategory;
        const tripTypes = allTripTypes.filter(t => t.category === cat);
        let generatedCards = [];
        
        const vehicleOrder = ['bike', 'auto', 'hatchback', 'sedan', 'suv', '8plus1', 'van24'];
        const sortedVehicleTypes = Object.keys(tariffs).sort((a, b) => vehicleOrder.indexOf(a) - vehicleOrder.indexOf(b));
        
        // Find special charge
        let specialSurchargePct = 0;
        let specialDisplayName = '';
        if (specialPlaceType) {
            const found = specialLocationCharges.find(c => c.place_type === specialPlaceType);
            if (found) {
                specialSurchargePct = parseFloat(found.surcharge_percentage) || 0;
                specialDisplayName = found.display_name;
            }
        }

        tripTypes.forEach(tType => {
            sortedVehicleTypes.forEach(vType => {
                if (!allowedVehicleTypes.includes(vType)) return;
                const info = getTransformedType(tariffs, vType);
                if (!info) return;

                if (tType.id === 'local' && (vType === 'van24' || vType === '8plus1')) return;
                if (tType.id !== 'local' && (vType === 'bike' || vType === 'auto')) return;
                if (allowedTripTypes.includes(tType.id) && !getTripPricing(info, tType.id)) return;

                let totalFare = 0;
                let displayDistance = `${distance} KM`;
                let detailLabel = '';
                
                const timeStr = bookingType === 'now' ? `${new Date().getHours()}:${new Date().getMinutes()}` : `${time.getHours()}:${time.getMinutes()}`;
                const peakMult = currentCategory === 'local' ? getPeakSurcharge(timeStr, peakRules) : 0;
                const extraDropsCount = extraDrops.filter(d => d?.coords).length;

                // --- Fare Logic matching app.js precisely ---
                if (tType.id === 'local') {
                    const config = info.local;
                    const minKm = typeof config.minKm === 'number' ? config.minKm : 0;
                    const billableDist = Math.max(distance, minKm);
                    const baseKmFare = calculateLocalSlabFare(billableDist, config);
                    const peakCharge = baseKmFare * peakMult;
                    const specialCharge = Math.round(baseKmFare * specialSurchargePct / 100);
                    const extraDropsCharge = extraDropsCount * 50;
                    totalFare = (baseKmFare + peakCharge + specialCharge + extraDropsCharge) + 5;
                } else if (tType.id === 'oneway') {
                    const config = info.oneway;
                    const minKm = config.minKm || 130;
                    const billableDist = Math.max(distance, minKm);
                    const distanceFare = billableDist * config.perKm;
                    const baseKmFare = Math.max(config.base || 0, distanceFare);
                    const driverAllowance = billableDist > 250 ? 600 : 400;
                    const specialCharge = Math.round(baseKmFare * specialSurchargePct / 100);
                    const extraDropsCharge = extraDropsCount * 50;
                    totalFare = (baseKmFare + (vType === 'bike' ? 0 : driverAllowance) + specialCharge + extraDropsCharge) + 5;
                } else if (tType.id === 'round') {
                    const config = info.round;
                    const minKmForTrip = config.minKmPerDay || 250;
                    const actualTwoWayDist = distance * 2;
                    const billableDist = Math.max(actualTwoWayDist, minKmForTrip * tripDays);
                    const distanceFare = billableDist * config.perKm;
                    const baseKmFare = Math.max(config.base || 0, distanceFare);
                    const driverAllowance = billableDist > 250 ? 600 : 400;
                    const specialCharge = Math.round(baseKmFare * specialSurchargePct / 100);
                    totalFare = (baseKmFare + (vType === 'bike' ? 0 : driverAllowance * tripDays) + specialCharge) + 5;
                    displayDistance = `${distance} x 2 (${billableDist} KM Billable)`;
                } else if (tType.id === 'rental') {
                    if (!info.rental) return;
                    const [pMaxHrs, pMaxKm] = rentalPackage.split('-').map(Number);
                    const config = getRentalConfig(info.rental, rentalPackage);
                    if (!config) return;
                    const extraKm = Math.max(0, distance - pMaxKm);
                    const baseFare = config.base + (extraKm * config.extraKm);
                    const specialCharge = Math.round(baseFare * specialSurchargePct / 100);
                    totalFare = baseFare + specialCharge + 5;
                    displayDistance = distance > 0 ? `${distance} KM` : 'Fixed Base';
                }

                totalFare = Math.ceil(totalFare);
                const isDisabled = parseInt(passengers) > info.maxPassengers;
                
                let etaText = 'Choose';
                if (duration > 0) {
                    if (duration >= 60) {
                        const hrs = Math.floor(duration / 60);
                        const mins = duration % 60;
                        etaText = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
                    } else {
                        etaText = `${duration}m`;
                    }
                } else if (tType.id === 'rental') {
                    const [pMaxHrs] = rentalPackage.split('-').map(Number);
                    etaText = `${pMaxHrs}h package`;
                }
                
                // Build Breakdown
                const gst = 5;
                const driverAllowanceAmt = (tType.id === 'oneway' || tType.id === 'round') && vType !== 'bike' ? (distance > 250 ? 600 : 400) : 0;
                const peakSurchargeAmt = tType.id === 'local' ? Math.round(getPeakSurcharge(timeStr, peakRules) * (Math.max(distance, info.local?.minKm || 0) * (info.local?.perKm || 0))) : 0;
                const extraDropsChargeAmt = tType.id === 'local' ? (extraDropsCount * 50) : (tType.id === 'oneway' ? (extraDropsCount * 50) : 0);
                
                let specialLocationChargeAmt = 0;
                if (specialSurchargePct > 0) {
                    const tripConfig = getTripPricing(info, tType.id);
                    if (tType.id === 'local') {
                        const config = info.local;
                        const minKm = typeof config.minKm === 'number' ? config.minKm : 0;
                        const billableDist = Math.max(distance, minKm);
                        const baseKmFare = Math.max(config.base || 0, billableDist * config.perKm);
                        specialLocationChargeAmt = Math.round(baseKmFare * specialSurchargePct / 100);
                    } else if (tripConfig) {
                        const minKm = tripConfig.minKm || tripConfig.minKmPerDay || 0;
                        const billableDist = Math.max(distance, minKm);
                        const baseKmFare = Math.max(tripConfig.base || 0, billableDist * (tripConfig.perKm || 0));
                        specialLocationChargeAmt = Math.round(baseKmFare * specialSurchargePct / 100);
                    }
                }

                generatedCards.push({
                    vType,
                    vehicleName: info.name,
                    tripType: tType.id,
                    fare: totalFare,
                    distanceKm: distance,
                    displayDistance,
                    durationText: etaText,
                    specialPlaceType,
                    capacity: info.capacity,
                    isDisabled,
                    breakdown: {
                        vehicleName: info.name,
                        distanceKm: distance,
                        durationText: etaText,
                        perKm: tType.id === 'local' ? (info.local?.perKm || 0) : (getTripPricing(info, tType.id)?.perKm || 0),
                        baseFare: getTripPricing(info, tType.id)?.base || 0,
                        driverAllowance: driverAllowanceAmt,
                        peakCharge: peakSurchargeAmt,
                        extraDropsCount,
                        extraDropsCharge: extraDropsChargeAmt,
                        specialLocationCharge: specialLocationChargeAmt,
                        specialLocationName: specialDisplayName,
                        specialSurchargePct,
                        gst,
                        total: totalFare
                    }
                });
            });
        });
        
        setVehicles(generatedCards);
        
        // Auto-select first available
        const firstValid = generatedCards.find(v => !v.isDisabled);
        if (firstValid) setSelectedVehicle(firstValid);
        
        setShowVehicles(true);
    };

    const getBookingPayload = () => {
        if (!selectedVehicle) return null;
        
        const validExtras = extraDrops.filter(d => d?.coords);
        
        let dateStr = date.toISOString().split('T')[0];
        let timeStr = `${time.getHours()}:${time.getMinutes()}`;
        
        if (currentCategory === 'local' && bookingType === 'now') {
            const now = new Date();
            dateStr = now.toISOString().split('T')[0];
            timeStr = `${now.getHours()}:${now.getMinutes()}`;
        }
        
        return {
            pickup: pickup?.address,
            pickupCoords: pickup?.coords,
            drop: drop?.address,
            dropCoords: drop?.coords,
            extraDrops: validExtras.length > 0 ? validExtras : null,
            date: dateStr,
            time: timeStr,
            passengers: parseInt(passengers),
            vehicle: selectedVehicle.vType,
            tripType: selectedVehicle.tripType,
            returnDate: selectedVehicle.tripType === 'round' ? returnDate.toISOString().split('T')[0] : null,
            rentalPackage: selectedVehicle.tripType === 'rental' ? rentalPackage : null,
            fare: `₹${selectedVehicle.fare}`,
            distance: selectedVehicle.displayDistance,
            estimatedDuration: selectedVehicle.durationText,
            specialPlaceType: selectedVehicle.specialPlaceType || null,
            vehicleName: selectedVehicle.vehicleName // Extra for display
        };
    };

    const handleBookingSuccess = () => {
        setShowConfirm(false);
        navigation.replace('CustomerDashboard');
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Book Your <Text style={styles.headerAccent}>Premium Ride</Text></Text>
                <Text style={styles.headerSub}>Local • Outstation • Rental</Text>
            </View>
            
            <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.widget}>
                    <ServiceTypeSelector currentCategory={currentCategory} onSelectCategory={(cat) => {
                        setCurrentCategory(cat);
                        setSelectedVehicle(null);
                    }} />

                    <LocationInput 
                        label="Pickup Location" 
                        placeholder="Enter pickup address" 
                        value={pickup} 
                        onSelect={setPickup} 
                        showLiveBtn={true} 
                        onLiveLocation={handleFetchLiveLocation} 
                        loadingLive={fetchingLiveLoc}
                    />
                    
                    {currentCategory !== 'rental' && (
                        <LocationInput 
                            label="Destination" 
                            placeholder="Enter destination" 
                            value={drop} 
                            onSelect={setDrop} 
                        />
                    )}

                    {(currentCategory === 'local' || currentCategory === 'outstation') && (
                        <View style={styles.extraDropsContainer}>
                            {extraDrops.map((d, index) => (
                                <View key={index} style={styles.extraDropRow}>
                                    <View style={{ flex: 1 }}>
                                        <LocationInput 
                                            label={`Stop #${index + 1}`} 
                                            placeholder="Enter stop address" 
                                            value={d} 
                                            onSelect={(val) => updateExtraDrop(index, val)} 
                                        />
                                    </View>
                                    <TouchableOpacity style={styles.removeStopBtn} onPress={() => removeExtraDrop(index)}>
                                        <Text style={styles.removeStopText}>×</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {extraDrops.length < 3 && (
                                <TouchableOpacity style={styles.addStopBtn} onPress={addExtraDrop}>
                                    <Text style={styles.addStopBtnText}>+ Add Stop</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {currentCategory === 'local' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>BOOKING OPTION</Text>
                            <View style={styles.pickerWrap}>
                                <Picker
                                    selectedValue={bookingType}
                                    onValueChange={(v) => setBookingType(v)}
                                    style={styles.picker}
                                    dropdownIconColor="#8b90a0"
                                >
                                    <Picker.Item label="Ride Now" value="now" color="#fff" />
                                    <Picker.Item label="Ride Later (Advance Booking)" value="later" color="#fff" />
                                </Picker>
                            </View>
                        </View>
                    )}

                    {currentCategory === 'rental' && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>RENTAL PACKAGE</Text>
                            <View style={styles.pickerWrap}>
                                <Picker
                                    selectedValue={rentalPackage}
                                    onValueChange={(v) => setRentalPackage(v)}
                                    style={styles.picker}
                                    dropdownIconColor="#8b90a0"
                                >
                                    <Picker.Item label="2 Hours | 20 KM" value="2-20" color="#fff" />
                                    <Picker.Item label="4 Hours | 40 KM" value="4-40" color="#fff" />
                                    <Picker.Item label="8 Hours | 80 KM" value="8-80" color="#fff" />
                                    <Picker.Item label="12 Hours | 120 KM" value="12-120" color="#fff" />
                                </Picker>
                            </View>
                        </View>
                    )}

                    {(currentCategory !== 'local' || bookingType === 'later') && (
                        <View style={styles.rowInputs}>
                            <TouchableOpacity style={[styles.inputGroup, { flex: 1, marginRight: 10 }]} onPress={() => setShowDatePicker(true)}>
                                <Text style={styles.label}>DEPARTURE DATE</Text>
                                <View style={[styles.pickerWrap, { paddingVertical: 14, paddingHorizontal: 10 }]}>
                                    <Text style={{color: '#fff'}}>{date.toDateString()}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.inputGroup, { flex: 1 }]} onPress={() => setShowTimePicker(true)}>
                                <Text style={styles.label}>TIME</Text>
                                <View style={[styles.pickerWrap, { paddingVertical: 14, paddingHorizontal: 10 }]}>
                                    <Text style={{color: '#fff'}}>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    )}
                    
                    {/* Simplified Pickers for Demo - In real RN use DateTimePicker properly based on platform */}
                    {showDatePicker && (
                        <DateTimePicker
                            value={date}
                            mode="date"
                            display="default"
                            onChange={(e, d) => { setShowDatePicker(false); if(d) setDate(d); }}
                        />
                    )}
                    {showTimePicker && (
                        <DateTimePicker
                            value={time}
                            mode="time"
                            display="default"
                            onChange={(e, t) => { setShowTimePicker(false); if(t) setTime(t); }}
                        />
                    )}

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>PASSENGERS</Text>
                        <View style={styles.pickerWrap}>
                            <Picker
                                selectedValue={passengers}
                                onValueChange={(v) => setPassengers(v)}
                                style={styles.picker}
                                dropdownIconColor="#8b90a0"
                            >
                                {[1,2,3,4,5,6,7,8].map(num => (
                                    <Picker.Item key={num} label={`${num} Passenger${num>1?'s':''}`} value={num.toString()} color="#fff" />
                                ))}
                            </Picker>
                        </View>
                    </View>

                    {specialLocationCharges.length > 0 && (
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>🏛️ DESTINATION TYPE (SURCHARGE)</Text>
                            <View style={styles.pickerWrap}>
                                <Picker
                                    selectedValue={specialPlaceType}
                                    onValueChange={(v) => setSpecialPlaceType(v)}
                                    style={styles.picker}
                                    dropdownIconColor="#8b90a0"
                                >
                                    <Picker.Item label="None (No special surcharge)" value="" color="#fff" />
                                    {specialLocationCharges.map(c => (
                                        <Picker.Item key={c.place_type} label={`${c.display_name} (+${c.surcharge_percentage}%)`} value={c.place_type} color="#fff" />
                                    ))}
                                </Picker>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity style={styles.searchBtn} onPress={handleSearchVehicles} disabled={calculating}>
                        {calculating ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.searchBtnText}>🔍 Search Available Vehicles</Text>
                        )}
                    </TouchableOpacity>

                    {selectedVehicle && (
                        <FareSummaryStrip 
                            vehicle={selectedVehicle} 
                            onViewFareBreakdown={() => setShowFareBreakdown(true)}
                            onBookPress={() => setShowConfirm(true)}
                        />
                    )}

                </View>
            </ScrollView>

            <VehicleSelectionModal 
                visible={showVehicles}
                onClose={() => setShowVehicles(false)}
                vehicles={vehicles}
                routeText={currentCategory === 'rental' ? `Rental from ${pickup?.address}` : `${pickup?.address} → ${drop?.address}`}
                selectedVehicle={selectedVehicle}
                onSelectVehicle={setSelectedVehicle}
            />

            <FareBreakdownModal 
                visible={showFareBreakdown}
                onClose={() => setShowFareBreakdown(false)}
                breakdown={selectedVehicle?.breakdown}
            />

            <BookingConfirmationModal 
                visible={showConfirm}
                onClose={() => setShowConfirm(false)}
                bookingDetails={getBookingPayload()}
                onBookingSuccess={handleBookingSuccess}
            />

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#0a0c12' },
    header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, alignItems: 'center' },
    headerTitle: { fontSize: 24, fontWeight: '800', color: '#f0f2f8' },
    headerAccent: { color: '#e53935' },
    headerSub: { fontSize: 13, color: '#8b90a0', marginTop: 4 },
    container: { padding: 20 },
    widget: { backgroundColor: '#181c28', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20 },
    inputGroup: { marginBottom: 16 },
    rowInputs: { flexDirection: 'row' },
    label: { fontSize: 11, fontWeight: '700', color: '#8b90a0', marginBottom: 6, letterSpacing: 0.8 },
    pickerWrap: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    picker: { color: '#fff' },
    searchBtn: { backgroundColor: '#B71C1C', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 10, shadowColor: '#B71C1C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5 },
    searchBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
    extraDropsContainer: { marginBottom: 10 },
    extraDropRow: { flexDirection: 'row', alignItems: 'center' },
    removeStopBtn: { backgroundColor: 'rgba(255,82,82,0.1)', padding: 12, borderRadius: 10, marginLeft: 10, marginBottom: 16 },
    removeStopText: { color: '#ff5252', fontSize: 20, fontWeight: 'bold' },
    addStopBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
    addStopBtnText: { color: '#fff', fontSize: 13 }
});
