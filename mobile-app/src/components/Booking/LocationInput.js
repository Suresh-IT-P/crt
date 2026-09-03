import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import api from '../../services/api';

const LocationInput = ({ label, placeholder, value, onSelect, onLiveLocation, showLiveBtn = false, loadingLive = false }) => {
    const [query, setQuery] = useState(value?.address || '');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const timeoutRef = useRef(null);

    // Sync external value changes (e.g. from live location fetch)
    useEffect(() => {
        if (value && value.address !== query) {
            setQuery(value.address);
        }
    }, [value]);

    const handleInput = (text) => {
        setQuery(text);
        setShowSuggestions(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (text.length < 3) {
            setSuggestions([]);
            return;
        }

        timeoutRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                // Same API call as index.html
                const res = await api.get(`/proxy/geocode?q=${encodeURIComponent(text)}&limit=5&lang=en&lon=80.2707&lat=13.0827`);
                if (res.data && res.data.features) {
                    const formattedSuggestions = res.data.features.map(feature => {
                        const p = feature.properties;
                        const c = feature.geometry.coordinates; // [lng, lat]
                        const label = [p.name, p.street, p.city, p.state].filter(Boolean).join(', ');
                        return { label, coords: `${c[0]},${c[1]}` };
                    });
                    setSuggestions(formattedSuggestions);
                } else {
                    setSuggestions([]);
                }
            } catch (err) {
                console.log('Geocode error', err);
                setSuggestions([]);
            } finally {
                setLoading(false);
            }
        }, 400);
    };

    const handleSelect = (item) => {
        setQuery(item.label);
        setShowSuggestions(false);
        onSelect({ address: item.label, coords: item.coords });
    };

    return (
        <View style={styles.container}>
            <View style={styles.labelRow}>
                <Text style={styles.label}>{label}</Text>
                {showLiveBtn && (
                    <TouchableOpacity style={styles.liveBtn} onPress={onLiveLocation} disabled={loadingLive}>
                        {loadingLive ? (
                            <ActivityIndicator size="small" color="#B71C1C" />
                        ) : (
                            <Text style={styles.liveBtnText}>📍 Live</Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.inputWrap}>
                <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    placeholderTextColor="#8b90a0"
                    value={query}
                    onChangeText={handleInput}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                />
                
                {loading && <ActivityIndicator style={styles.loader} size="small" color="#B71C1C" />}

                {showSuggestions && suggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                        <FlatList
                            data={suggestions}
                            keyExtractor={(item, index) => index.toString()}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.suggestionItem} onPress={() => handleSelect(item)}>
                                    <Text style={styles.suggestionText}>{item.label}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
        position: 'relative',
        zIndex: 1, // Needed for Android to show dropdown over other elements sometimes
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: '#8b90a0',
    },
    liveBtn: {
        backgroundColor: 'rgba(26,115,232,0.08)',
        borderColor: 'rgba(26,115,232,0.3)',
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 20,
    },
    liveBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#1a73e8',
    },
    inputWrap: {
        position: 'relative',
        zIndex: 2,
    },
    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        color: '#f0f2f8',
        fontSize: 14,
    },
    loader: {
        position: 'absolute',
        right: 12,
        top: 12,
    },
    suggestionsContainer: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        backgroundColor: '#181c28',
        borderColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderRadius: 10,
        maxHeight: 200,
        zIndex: 999, // Ensure suggestions pop over everything
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
    },
    suggestionItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    suggestionText: {
        fontSize: 14,
        color: '#f0f2f8',
    },
});

export default LocationInput;
