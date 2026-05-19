import { View, Text, StyleSheet, ScrollView } from 'react-native';
import InputField from '../ui/InputField';
import Dropdown from '../ui/Dropdown';
import React, { useState } from 'react';
import Button from '../ui/Button';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const jobTypes = ['Primary Income', 'Side Income'];
const days = Array.from({ length: 31 }, (_, i) => i + 1);
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function IncomeContainer() {
    const [jobTitle, setJobTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [jobType, setJobType] = useState(null);
    const [day, setDay] = useState(null);
    const [month, setMonth] = useState(null);
    const [submitted, setSubmitted] = useState(false);

    const { user } = useAuth();
    const { theme } = useTheme();

    const submitIncome = async () => {
        if (!jobTitle || !amount || !jobType || !day || !month) return;
        try {
            await axios.post('http://10.0.0.13:8000/income/', {
                jobTitle, amount: parseFloat(amount),
                jobType, day: parseInt(day), month,
                user_id: user?.id,
            }, { headers: { 'ngrok-skip-browser-warning': 'true' } });

            setJobTitle(''); setAmount(''); setJobType(null); setDay(null); setMonth(null);
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
            <Text style={[styles.screenTitle, { color: theme.text }]}>Add Income</Text>
            <Text style={[styles.screenSubtitle, { color: theme.textMuted }]}>Every dollar is a seed planted</Text>

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <InputField label="Job Title" icon="🏢" placeholder="Barbecue for James" value={jobTitle} onChangeText={setJobTitle} maxLength={20} />
                <InputField label="Amount Received" icon="💵" placeholder="2000" isNumeric value={amount} onChangeText={setAmount} maxLength={9} />
                <Dropdown label="Job Type" options={jobTypes} selectedValue={jobType} onSelect={setJobType} />
                <Dropdown label="Payment Day" options={days} selectedValue={day} onSelect={setDay} />
                <Dropdown label="Payment Month" options={months} selectedValue={month} onSelect={setMonth} />
            </View>

            <View style={styles.buttonRow}>
                <Button
                    label={submitted ? '✓ Logged!' : 'Add Income'}
                    variant={submitted ? 'success' : 'primary'}
                    size="lg"
                    fullWidth
                    onPress={submitIncome}
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
    buttonRow: {
        gap: 10,
    },
});
