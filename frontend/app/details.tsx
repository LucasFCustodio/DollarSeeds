import { View, Text, StyleSheet, ScrollView } from 'react-native';
import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import Button from '../components/ui/Button';

// The interface connects to the expenses variable
interface Expense {
    id: number
    title: string;
    amount: number;
    day: number;
    category: string;
    month: string;
}

export default function DetailsScreen() {
    const router = useRouter();
    // This hook grabs the parameters we injected into the URL
    const { category, month } = useLocalSearchParams(); 
    
    const [expenses, setExpenses] = useState<Expense[]>([]);

    useEffect(() => {
        fetchDetailedExpenses();
    }, []);

    const fetchDetailedExpenses = async () => {
        try {
            // Point this to your PC's IP address!
            //The month and category are being grabbed from the params that come with the routing
            const SERVER_URL_PHONE = `http://10.0.0.13:8000/expenses/details/?month=${month}&category=${category}`;
            const response = await axios.get(SERVER_URL_PHONE);
            
            setExpenses(response.data.data);
        } catch (error) {
            console.error("Error fetching detailed expenses:", error);
        }
    };

    const deleteExpense = async (id: number) => {
        try {
            const SERVER_URL_PHONE = `http://10.0.0.13:8000/expenses/delete/${id}`
            const response = await axios.delete(SERVER_URL_PHONE);

            setExpenses(currentExpenses => currentExpenses.filter(expense => expense.id !== id));
        } catch (error) {
            console.error("Error fetching detailed expenses:", error);
        }
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Button 
                    label="Back to Dashboard"
                    rgbaColor="#6c757d"
                    width="100%"
                    padding="10"
                    font="15"
                    onPress={() => router.back()}
                />
                <Text style={styles.title}>{month} {category} Breakdown</Text>
            </View>

            <View style={styles.listContainer}>
                {expenses.length === 0 ? (
                    <Text style={styles.emptyText}>No expenses logged yet.</Text>
                ) : (
                    expenses.map((item, index) => (
                        <View key={index} style={styles.expenseItem}>
                            <View>
                                <Text style={styles.expenseTitle}>{item.title}</Text>
                                <Text style={styles.expenseDate}>Day {item.day}</Text>
                            </View>
                            <Text style={styles.expenseAmount}>${item.amount.toFixed(2)}</Text>
                            <Button 
                                label="🗑️"
                                rgbaColor="rgba(241, 21, 21, 0.7)"
                                width="15%"
                                padding="10"
                                font="20"
                                onPress={() => deleteExpense(item.id)}
                            />
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        padding: 20,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingTop: 60, // Gives space for the phone's top notch
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 15,
        color: '#212529',
    },
    listContainer: {
        padding: 20,
    },
    expenseItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#eee',
    },
    expenseTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#343a40',
    },
    expenseDate: {
        fontSize: 12,
        color: '#adb5bd',
        marginTop: 4,
    },
    expenseAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#212529',
    },
    emptyText: {
        textAlign: 'center',
        color: '#adb5bd',
        marginTop: 20,
    }
});