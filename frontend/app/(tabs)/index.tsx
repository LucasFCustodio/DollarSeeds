import { View, Text, StyleSheet, ScrollView } from 'react-native';
import React from 'react';

export default function DashboardScreen() {
    return (
        <ScrollView style={styles.container}>
            {/* Top Header Section */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Monthly Overview</Text>
                {/* We will eventually fetch this number from the backend */}
                <Text style={styles.totalAmount}>$0.00</Text>
                <Text style={styles.subText}>Total Income Available</Text>
            </View>

            {/* 50/30/20 Breakdown Cards */}
            <View style={styles.cardsContainer}>
                
                {/* 50% Needs */}
                <View style={[styles.card, { borderTopColor: '#FF6B6B' }]}>
                    <Text style={styles.cardTitle}>50% Needs</Text>
                    <Text style={styles.cardAmount}>$0.00 / $0.00</Text>
                    <Text style={styles.cardSubText}>Remaining</Text>
                </View>

                {/* 30% Wants */}
                <View style={[styles.card, { borderTopColor: '#4ECDC4' }]}>
                    <Text style={styles.cardTitle}>30% Wants</Text>
                    <Text style={styles.cardAmount}>$0.00 / $0.00</Text>
                    <Text style={styles.cardSubText}>Remaining</Text>
                </View>

                {/* 20% Goals (Savings & Debt) */}
                <View style={[styles.card, { borderTopColor: '#FFE66D' }]}>
                    <Text style={styles.cardTitle}>20% Goals</Text>
                    <Text style={styles.cardAmount}>$0.00 / $0.00</Text>
                    <Text style={styles.cardSubText}>Remaining</Text>
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
        marginBottom: 20,
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