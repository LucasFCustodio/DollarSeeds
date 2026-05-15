import { StyleSheet, View, Text, Alert } from 'react-native';
import Button from '../ui/Button';
import Dropdown from '../ui/Dropdown';
import InputField from '../ui/InputField';
import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const BASE = 'http://10.0.0.13:8000';

export default function SavingsContainer({ transactionType, currentBalance, onSuccess, goals = [] }) {
    const [amount, setAmount] = useState('');
    const [day, setDay] = useState(null);
    const [month, setMonth] = useState(null);
    const [selectedGoalTitle, setSelectedGoalTitle] = useState(null);

    const { user } = useAuth();

    const days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31];
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const isDeposit = transactionType === 'deposit';
    const goalTitles = goals.map(g => g.title);
    const selectedGoal = goals.find(g => g.title === selectedGoalTitle);

    const reset = () => {
        setAmount('');
        setDay(null);
        setMonth(null);
        setSelectedGoalTitle(null);
    };

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

            // Completing a goal is triggered by any withdrawal with a goal selected
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
        if (!amount || !day || !month) {
            console.log('Please fill out all fields');
            return;
        }
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
                `You only have $${currentBalance.toFixed(2)} saved, but you're about to withdraw $${parsed.toFixed(2)}. Your balance will go negative.\n\nAre you sure you want to continue?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Go On', style: 'destructive', onPress: doSubmit },
                ]
            );
        } else {
            doSubmit();
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.heading}>
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
            <InputField
                label="Amount"
                icon="$"
                placeholder="50.00"
                isNumeric={true}
                value={amount}
                onChangeText={setAmount}
                maxLength={9}
            />
            <Dropdown label="Day" options={days} selectedValue={day} onSelect={setDay} />
            <Dropdown label="Month" options={months} selectedValue={month} onSelect={setMonth} />
            <Button
                label={isDeposit ? 'Add to Piggy Bank' : 'Withdraw from Piggy Bank'}
                rgbaColor={isDeposit ? 'rgba(80, 200, 120, 0.85)' : 'rgba(255, 100, 100, 0.85)'}
                width="80%"
                padding="13"
                onPress={submit}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderRadius: 12,
        gap: 4,
    },
    heading: {
        fontSize: 17,
        fontWeight: '600',
        color: '#343a40',
        marginBottom: 8,
    },
});
