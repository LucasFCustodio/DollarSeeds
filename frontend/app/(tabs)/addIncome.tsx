import { View, StyleSheet } from 'react-native';
import IncomeContainer from '../../components/income/IncomeContainer'; 

export default function AddIncomeScreen() {
    return (
        <View style={styles.container}>
            {/* The route simply renders your income container */}
            <IncomeContainer /> 
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    }
});