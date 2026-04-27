import { View, Text, StyleSheet, ScrollView } from 'react-native';
import React, { useState, useEffect } from 'react';
import axios from "axios"
import Button from "../../components/ui/Button"
import { useRouter } from 'expo-router';

export default function DashboardScreen() {
    const router = useRouter();
    const [currentMonth, setCurrentMonth] = useState("April")
    const [monthIndex, setMonthIndex] = useState(3)
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    const [dashboardData, setDashboardData] = useState({
      total_income: 0,
      budgets: {
        needs: 0,
        wants: 0,
        goals: 0
      },
      expenses: {
        needs: 0,
        wants: 0,
        goals: 0
      }
    })

    useEffect(() => {
      fetchDashboardData();
    }, [currentMonth]);

    const decreaseMonth = () => {
        // If we are on January (0), loop back to December (11). Otherwise, subtract 1.
        const newIndex = monthIndex === 0 ? 11 : monthIndex - 1;
        
        setMonthIndex(newIndex);
        setCurrentMonth(months[newIndex]);
    }

    const increaseMonth = () => {
        // If we are on December (11), loop back to January (0). Otherwise, add 1.
        const newIndex = monthIndex === 11 ? 0 : monthIndex + 1;
        
        setMonthIndex(newIndex);
        setCurrentMonth(months[newIndex]);
    }

    const fetchDashboardData = async () => {
      try {
        const SERVER_URL=`http://127.0.0.1:8000/dashboard/${currentMonth}`;
        const SERVER_URL_PHONE=`http://10.0.0.13:8000/dashboard/${currentMonth}`
        const response = await axios.get(SERVER_URL_PHONE);

        setDashboardData(response.data);
      } catch (error) {
        if (error instanceof Error) {
            console.error("Error fetching dashboard data:", error.message);
        } else {
            console.error("An unexpected error occurred:", error);
        }
      }
    };

    return (
        <ScrollView style={styles.container}>
            {/* Top Header Section */}
            <View style={styles.header}>
                <View style={styles.monthContainer}>
                    <Button 
                        label="<"
                        rgbaColor="rgba(28, 168, 235, 0.8)"
                        width={45}
                        padding="10"
                        font="20"
                        onPress={decreaseMonth}
                    />
                    <Text style={styles.headerTitle}>{currentMonth} Overview</Text>
                    <Button 
                        label=">"
                        rgbaColor="rgba(28, 168, 235, 0.8)"
                        width={45}
                        padding="10"
                        font="20"
                        onPress={increaseMonth}
                    />
                </View>
                {/* We will eventually fetch this number from the backend */}
                <Text style={styles.totalAmount}>${dashboardData.total_income}</Text>
                <Text style={styles.subText}>Total Income Available</Text>
            </View>

            {/* 50/30/20 Breakdown Cards */}
            <View style={styles.cardsContainer}>
                
                {/* 50% Needs */}
                <View style={[styles.card, { borderTopColor: '#FF6B6B' }]}>
                    <Text style={styles.cardTitle}>50% Needs</Text>
                    <Text style={styles.cardAmount}>${dashboardData.expenses.needs} / ${dashboardData.budgets.needs}</Text>
                    <Text style={styles.cardSubText}>Budgeted</Text>
                    <Button 
                        label="View Need Expenses"
                        rgbaColor="#FF6B6B"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: "Needs", month: currentMonth }
                        })}
                    />
                </View>

                {/* 30% Wants */}
                <View style={[styles.card, { borderTopColor: '#4ECDC4' }]}>
                    <Text style={styles.cardTitle}>30% Wants</Text>
                    <Text style={styles.cardAmount}>${dashboardData.expenses.wants} / ${dashboardData.budgets.wants}</Text>
                    <Text style={styles.cardSubText}>Budgeted</Text>
                    <Button 
                        label="View Want Expenses"
                        rgbaColor="#4ECDC4"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: "Wants", month: currentMonth }
                        })}
                    />
                </View>

                {/* 20% Goals (Savings & Debt) */}
                <View style={[styles.card, { borderTopColor: '#FFE66D' }]}>
                    <Text style={styles.cardTitle}>20% Goals</Text>
                    <Text style={styles.cardAmount}>${dashboardData.expenses.goals} / ${dashboardData.budgets.goals}</Text>
                    <Text style={styles.cardSubText}>Budgeted</Text>
                    <Button 
                        label="View Goal Expenses"
                        rgbaColor="#FFE66D"
                        width="90%"
                        padding="10"
                        font="15"
                        onPress={() => router.push({
                            pathname: "/details",
                            params: { category: "Goals", month: currentMonth }
                        })}
                    />
                </View>

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
        backgroundColor: '#ffffff',
        padding: 30,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginTop: 20,
        marginBottom: 20,
    },
    monthContainer: {
        flexDirection: 'row',
        justifyContent: "space-around",
        alignItems: 'center',
        width: "100%"
    },
    headerTitle: {
        fontSize: 16,
        color: '#6c757d',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    totalAmount: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#212529',
        marginVertical: 10,
    },
    subText: {
        fontSize: 14,
        color: '#6c757d',
    },
    cardsContainer: {
        paddingHorizontal: 20,
        gap: 15,
        paddingBottom: 30,
    },
    card: {
        backgroundColor: '#ffffff',
        padding: 20,
        borderRadius: 12,
        borderTopWidth: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#343a40',
        marginBottom: 8,
    },
    cardAmount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#212529',
    },
    cardSubText: {
        fontSize: 12,
        color: '#adb5bd',
        marginTop: 4,
    }
});