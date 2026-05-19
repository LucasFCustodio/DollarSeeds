import { StyleSheet, View, Text, Alert } from 'react-native';
import Button from '../ui/Button';
import Dropdown from '../ui/Dropdown';
import InputField from '../ui/InputField';
import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const BASE = 'http://10.0.0.13:8000';

export default function SavingsContainer({ transactionType, currentBalance, onSuccess, goals = [] }) {
    const [amount, setAmount] = useState('');
    const [day, setDay] = useState(null);
    const [month, setMonth] = useState(null);
    const [selectedGoalTitle, setSelectedGoalTitle] = useState(null);

    const { user } = useAuth();
    const { theme } = useTheme();

    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const isDeposit = transactionType === 'deposit';
    const goalTitles = goals.map(g => g.title);
    const selectedGoal = goals.find(g => g.title === selectedGoalTitle);

    const reset = () => { setAmount(''); setDay(null); setMonth(null); setSelectedGoalTitle(null); };

    const doSubmit = async () => {
        try {
            await axios.post(`${BASE}/savings/transaction/`, {
                user_id: user?.id,
                title: selectedGoal?.title ?? (isDeposit ? 'Deposit' : 'Withdrawal'),
                amount: parseFloat(amount),
                type: transactionType,
                day: parseInt(day),
                month,
                goal_id: selectedGoal?.id ?? null,
            }, { headers: { 'ngrok-skip-browser-warning': 'true' } });

            if (!isDeposit && selectedGoal) {
                await axios.patch(`${BASE}/savings/goal/${selectedGoal.id}/complete?user_id=${user?.id}`);
            }
            reset();
            onSuccess?.();
        } catch (error) {
            console.error('Error saving transaction:', error.message);
        }
    };

    const submit = () => {
        if (!amount || !day || !month) return;
        if (goals.length > 0 && !selectedGoalTitle) {
            Alert.alert(
                'Select a goal',
                isDeposit
                    ? 'Please choose which savings goal this money is going towards.'
                    : 'Please choose which goal you completed.'
            );
            return;
        }
        const parsed = parseFloat(amount);
        if (!isDeposit && parsed > currentBalance) {
            Alert.alert(
                'Heads up!',
                `You only have $${currentBalance.toFixed(2)} saved, but you're about to withdraw $${parsed.toFixed(2)}. Your balance will go negative.\n\nAre you sure?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Go On', style: 'destructive', onPress: doSubmit },
                ]
            );
        } else {
            doSubmit();
        }
    };

    const accentColor = isDeposit ? theme.goals : theme.danger;

    return (
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border, borderLeftColor: accentColor }]}>
            <Text style={[styles.heading, { color: theme.text }]}>
                {isDeposit ? '🐷 Set Money Aside' : '🛍️ I Bought It'}
            </Text>

            {goals.length > 0 && (
                <Dropdown
                    label={isDeposit ? 'Which goal is this for?' : 'Which goal did you complete?'}
                    options={goalTitles}
                    selectedValue={selectedGoalTitle}
                    onSelect={setSelectedGoalTitle}
                />
            )}

            <InputField label="Amount" icon="$" placeholder="50.00" isNumeric value={amount} onChangeText={setAmount} maxLength={9} />
            <Dropdown label="Day" options={days} selectedValue={day} onSelect={setDay} />
            <Dropdown label="Month" options={months} selectedValue={month} onSelect={setMonth} />

            <View style={styles.btnRow}>
                <Button
                    label={isDeposit ? 'Add to Piggy Bank' : 'Withdraw from Piggy Bank'}
                    variant={isDeposit ? 'success' : 'danger'}
                    size="lg"
                    fullWidth
                    onPress={submit}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderRadius: 12,
        padding: 18,
        gap: 4,
    },
    heading: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    btnRow: {
        marginTop: 8,
    },
});
