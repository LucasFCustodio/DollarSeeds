import { View, StyleSheet } from 'react-native';
import ExpenseContainer from '../../components/expense/ExpenseContainer';
import { useTheme } from '../../context/ThemeContext';

export default function AddExpenseScreen() {
    const { theme } = useTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            <ExpenseContainer />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
});
