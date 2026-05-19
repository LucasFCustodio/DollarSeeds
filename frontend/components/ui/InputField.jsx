import { StyleSheet, View, Text, TextInput } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function InputField({ label, icon, placeholder, isNumeric, value, onChangeText, maxLength }) {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
            <View style={[styles.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                {icon && <Text style={styles.icon}>{icon}</Text>}
                <TextInput
                    placeholder={placeholder}
                    placeholderTextColor={theme.inputPlaceholder}
                    style={[styles.input, { color: theme.inputText }]}
                    keyboardType={isNumeric ? 'numeric' : 'default'}
                    value={value}
                    onChangeText={onChangeText}
                    maxLength={maxLength}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { marginVertical: 8 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
        gap: 8,
    },
    icon: {
        fontSize: 16,
    },
    input: {
        flex: 1,
        fontSize: 16,
    },
});
