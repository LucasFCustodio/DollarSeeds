/**
 * logIncome — the income form as its own screen, opened from the home's + beside the
 * hero. After a successful save it returns to the home.
 */
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import IncomeContainer from '../components/income/IncomeContainer';
import { useReturnHome } from '../hooks/useReturnHome';

export default function LogIncomeScreen() {
    const { theme } = useTheme();
    const onSaved = useReturnHome();
    return (
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
            <IncomeContainer onSaved={onSaved} />
        </View>
    );
}
