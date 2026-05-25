import { View, StyleSheet } from 'react-native';
import IncomeContainer from '../../components/income/IncomeContainer';
import { useTheme } from '../../context/ThemeContext';

export default function AddIncomeScreen() {
    const { theme } = useTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            <IncomeContainer />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
});
