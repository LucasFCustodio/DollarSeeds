import { View, StyleSheet } from 'react-native';
import ExpenseContainer from '../../components/expense/ExpenseContainer';

export default function AddExpenseScreen() {
    return (
        <View style={styles.container}>
            <ExpenseContainer />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    }
});