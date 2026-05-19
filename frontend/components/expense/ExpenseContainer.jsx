import { StyleSheet, View, Text, ScrollView } from 'react-native';
import InputField from '../ui/InputField';
import Button from '../ui/Button';
import Dropdown from '../ui/Dropdown';
import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const expenseCategories = ['Need', 'Want', 'Debt'];
const days = Array.from({ length: 31 }, (_, i) => i + 1);
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function ExpenseContainer() {
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState(null);
    const [day, setDay] = useState(null);
    const [month, setMonth] = useState(null);
    const [submitted, setSubmitted] = useState(false);

    const { user } = useAuth();
    const { theme } = useTheme();

    const submitExpense = async () => {
        if (!title || !amount || !category || !day || !month) return;
        try {
            await axios.post('http://10.0.0.13:8000/expenses/', {
                title,
                amount: parseFloat(amount),
                category,
                day: parseInt(day),
                month,
                user_id: user?.id,
            }, { headers: { 'ngrok-skip-browser-warning': 'true' } });

            setTitle(''); setAmount(''); setCategory(null); setDay(null); setMonth(null);
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 2000);
        } catch (error) {
            console.error('Error sending data:', error.message);
        }
    };

    return (
        <ScrollView
            style={{ backgroundColor: theme.background }}
            contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={[styles.screenTitle, { color: theme.text }]}>Add Expense</Text>
            <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>Track where your money goes</Text>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <InputField label="Expense Title" placeholder="Dinner at Chipotle" value={title} onChangeText={setTitle} maxLength={20} />
                <InputField label="Amount" icon="$" placeholder="9.50" isNumeric value={amount} onChangeText={setAmount} maxLength={9} />
                <Dropdown label="Category" options={expenseCategories} selectedValue={category} onSelect={setCategory} />

                {category === 'Want' && (
                    <View style={[styles.nudgeBanner, { backgroundColor: theme.wantsSoft, borderColor: theme.wants }]}>
                        <Text style={[styles.nudgeText, { color: theme.wants }]}>
                            Is this truly a want? Take a moment before logging.
                        </Text>
                    </View>
                )}

                <Dropdown label="Day of Expense" options={days} selectedValue={day} onSelect={setDay} />
                <Dropdown label="Month of Expense" options={months} selectedValue={month} onSelect={setMonth} />
            </View>

            <View style={styles.buttonRow}>
                <Button
                    label={submitted ? '✓ Added!' : 'Add Expense'}
                    variant={submitted ? 'success' : 'primary'}
                    size="lg"
                    fullWidth
                    onPress={submitExpense}
                />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 56,
        paddingBottom: 32,
    },
    screenTitle: {
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 4,
    },
    screenSubtitle: {
        fontSize: 14,
        marginBottom: 20,
    },
    card: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 20,
        gap: 4,
        marginBottom: 20,
    },
    nudgeBanner: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 4,
    },
    nudgeText: {
        fontSize: 13,
        fontStyle: 'italic',
    },
    buttonRow: {
        gap: 10,
    },
});
