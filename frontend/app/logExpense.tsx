/**
 * logExpense — the expense form as its own screen, opened from the home's + buttons
 * and the tracking nudge. An optional `category` param ('needs' | 'wants') preselects
 * the category. After a successful save it returns to the home.
 */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import ExpenseContainer from '../components/expense/ExpenseContainer';
import { useReturnHome } from '../hooks/useReturnHome';

export default function LogExpenseScreen() {
    const { theme } = useTheme();
    const { category } = useLocalSearchParams<{ category?: string }>();
    const onSaved = useReturnHome();
    return (
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
            <ExpenseContainer initialCategory={category === 'wants' ? 'wants' : 'needs'} onSaved={onSaved} />
        </View>
    );
}
