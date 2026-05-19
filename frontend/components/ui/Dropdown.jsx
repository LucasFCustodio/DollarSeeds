import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function Dropdown({ label, options, selectedValue, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>

            <Pressable
                style={[
                    styles.trigger,
                    {
                        backgroundColor: theme.inputBg,
                        borderColor: isOpen ? theme.action : theme.inputBorder,
                    },
                ]}
                onPress={() => setIsOpen(!isOpen)}
            >
                <Text style={[
                    styles.triggerText,
                    { color: selectedValue ? theme.inputText : theme.inputPlaceholder }
                ]}>
                    {selectedValue != null ? String(selectedValue) : 'Select an option…'}
                </Text>
                <Text style={[styles.chevron, { color: theme.textMuted }]}>
                    {isOpen ? '▲' : '▼'}
                </Text>
            </Pressable>

            {isOpen && (
                <View style={[styles.menu, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                    <ScrollView nestedScrollEnabled>
                        {options.map((option, index) => (
                            <Pressable
                                key={index}
                                style={({ pressed }) => [
                                    styles.menuItem,
                                    { borderBottomColor: theme.borderSubtle },
                                    pressed && { backgroundColor: theme.actionSoft },
                                    String(option) === String(selectedValue) && { backgroundColor: theme.actionSoft },
                                ]}
                                onPress={() => { onSelect(option); setIsOpen(false); }}
                            >
                                <Text style={[
                                    styles.menuItemText,
                                    { color: theme.text },
                                    String(option) === String(selectedValue) && { color: theme.action, fontWeight: '600' },
                                ]}>
                                    {String(option)}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginVertical: 8 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    trigger: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
    },
    triggerText: { fontSize: 16, flex: 1 },
    chevron: { fontSize: 10, marginLeft: 8 },
    menu: {
        borderWidth: 1,
        borderRadius: 10,
        marginTop: 4,
        maxHeight: 180,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 6,
    },
    menuItem: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    menuItemText: { fontSize: 15 },
});
