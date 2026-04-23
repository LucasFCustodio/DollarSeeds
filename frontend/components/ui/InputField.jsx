import { StyleSheet, View, Text, TextInput } from 'react-native';

//For each input there is:
//1 Label to describe the type of input
//1 optional icon to visually describe to input
//A transparent placeholder to show an example iof what the user can input
export default function InputField({ label, icon, placeholder, isNumeric, value, onChangeText }) {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            {icon && (
                <Text style={styles.icon}>{icon}</Text>
            )}
            <TextInput 
                placeholder={placeholder}
                style={styles.input}
                keyboardType={isNumeric ? "numeric" : "default"}
                value={value}
                onChangeText={onChangeText}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    label: {
        fontSize: 26,
        color: 'black',
        paddingLeft: 8,
        marginBottom: 5
    },
    icon: {
        fontSize: 20,
        fontStyle: 'bold',
        paddingLeft: 8
    },
    input: {
        fontSize: 20,
        color: 'gray',
        backgroundColor: 'rgba(233, 248, 255, 0.5)',
        padding: 8,
        borderRadius: 10
    },
    container: {
        marginVertical: 10
    }
})