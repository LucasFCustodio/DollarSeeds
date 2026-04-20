import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

export default function Dropdown({ label, options, selectedValue, onSelect }) {
    // This state controls whether the list of options is visible or hidden
    const [isOpen, setIsOpen] = useState(false);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            
            {/* The main input box that the user taps to open the menu */}
            <TouchableOpacity 
                style={styles.input} 
                onPress={() => setIsOpen(!isOpen)}
            >
                <Text style={selectedValue ? styles.inputText : styles.placeholderText}>
                    {selectedValue ? selectedValue : "Select an option..."}
                </Text>
            </TouchableOpacity>

            {/* The conditional menu that maps through your array of options */}
            {isOpen && (
                <View style={styles.dropdownMenu}>
                    {options.map((option, index) => (
                        <TouchableOpacity 
                            key={index} 
                            style={styles.menuItem}
                            onPress={() => {
                                onSelect(option);
                                setIsOpen(false); // Close menu after selection
                            }}
                        >
                            <Text style={styles.menuItemText}>{option}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: 10
    },
    label: {
        fontSize: 26,
        color: 'black'
    },
    input: {
        backgroundColor: 'rgba(233, 248, 255, 0.5)',
        padding: 10,
        borderRadius: 5,
        marginTop: 5,
    },
    inputText: {
        fontSize: 16,
        color: 'black',
    },
    placeholderText: {
        fontSize: 16,
        color: 'gray',
    },
    dropdownMenu: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        marginTop: 2,
    },
    menuItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    menuItemText: {
        fontSize: 16,
        color: 'black',
    }
});