import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import SavingsContainer from '../../components/savings/SavingsContainer';

const BASE = 'http://10.0.0.13:8000';

type SavingsTransaction = {
    id: number;
    title: string;
    amount: number;
    type: 'deposit' | 'withdrawal';
    day: number;
    month: string;
};

export default function PiggyBankScreen() {
    const { user } = useAuth();
    const [balance, setBalance] = useState(0);
    const [history, setHistory] = useState<SavingsTransaction[]>([]);
    const [activeForm, setActiveForm] = useState<'deposit' | 'withdrawal' | null>(null);

    const fetchData = async () => {
        try {
            const [balRes, histRes] = await Promise.all([
                axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`),
                axios.get(`${BASE}/savings/history/?user_id=${user?.id}`),
            ]);
            setBalance(balRes.data.balance);
            setHistory(histRes.data.data);
        } catch (error) {
            console.error('Error fetching savings data:', error);
        }
    };

    useFocusEffect(useCallback(() => { fetchData(); }, []));

    const deleteTransaction = async (id: number) => {
        try {
            await axios.delete(`${BASE}/savings/transaction/${id}?user_id=${user?.id}`);
            setHistory(prev => prev.filter(t => t.id !== id));
            const balRes = await axios.get(`${BASE}/savings/balance/?user_id=${user?.id}`);
            setBalance(balRes.data.balance);
        } catch (error) {
            console.error('Error deleting transaction:', error);
        }
    };

    const handleFormSuccess = () => {
        setActiveForm(null);
        fetchData();
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Balance hero */}
            <View style={styles.hero}>
                <Text style={styles.piggyIcon}>🐷</Text>
                <Text style={styles.balanceLabel}>Your Piggy Bank</Text>
                <Text style={styles.balance}>${balance.toFixed(2)}</Text>
                <Text style={styles.balanceSub}>Saved so far — keep it up!</Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.depositBtn, activeForm === 'deposit' && styles.activeBtnBorder]}
                    onPress={() => setActiveForm(activeForm === 'deposit' ? null : 'deposit')}
                >
                    <Text style={styles.actionBtnText}>+ Set aside money</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.withdrawBtn, activeForm === 'withdrawal' && styles.activeBtnBorder]}
                    onPress={() => setActiveForm(activeForm === 'withdrawal' ? null : 'withdrawal')}
                >
                    <Text style={styles.actionBtnText}>- I bought it</Text>
                </TouchableOpacity>
            </View>

            {/* Inline form */}
            {activeForm && (
                <SavingsContainer
                    transactionType={activeForm}
                    currentBalance={balance}
                    onSuccess={handleFormSuccess}
                />
            )}

            {/* Transaction history */}
            <Text style={styles.historyTitle}>History</Text>
            {history.length === 0 && (
                <Text style={styles.emptyText}>No transactions yet. Start saving!</Text>
            )}
            {history.map(tx => (
                <View key={tx.id} style={styles.txRow}>
                    <View style={styles.txLeft}>
                        <Text style={styles.txTitle}>{tx.title}</Text>
                        <Text style={styles.txDate}>{tx.month} {tx.day}</Text>
                    </View>
                    <View style={styles.txRight}>
                        <Text style={[styles.txAmount, tx.type === 'deposit' ? styles.depositText : styles.withdrawText]}>
                            {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                        </Text>
                        <TouchableOpacity onPress={() => deleteTransaction(tx.id)}>
                            <Text style={styles.deleteBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    content: { paddingBottom: 40 },
    hero: {
        backgroundColor: '#fff',
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginBottom: 16,
    },
    piggyIcon: { fontSize: 56, marginBottom: 8 },
    balanceLabel: { fontSize: 14, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 1 },
    balance: { fontSize: 48, fontWeight: 'bold', color: '#212529', marginVertical: 6 },
    balanceSub: { fontSize: 13, color: '#adb5bd', fontStyle: 'italic' },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    depositBtn: { backgroundColor: 'rgba(80, 200, 120, 0.2)' },
    withdrawBtn: { backgroundColor: 'rgba(255, 100, 100, 0.15)' },
    activeBtnBorder: { borderColor: '#343a40' },
    actionBtnText: { fontWeight: '600', color: '#343a40', fontSize: 14 },
    historyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#343a40',
        paddingHorizontal: 20,
        marginTop: 8,
        marginBottom: 10,
    },
    emptyText: { textAlign: 'center', color: '#adb5bd', marginTop: 20, fontSize: 14 },
    txRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 8,
        padding: 14,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    txLeft: { flex: 1 },
    txTitle: { fontSize: 15, fontWeight: '500', color: '#212529' },
    txDate: { fontSize: 12, color: '#adb5bd', marginTop: 2 },
    txRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    txAmount: { fontSize: 16, fontWeight: '700' },
    depositText: { color: '#28a745' },
    withdrawText: { color: '#dc3545' },
    deleteBtn: { color: '#adb5bd', fontSize: 16, padding: 4 },
});
