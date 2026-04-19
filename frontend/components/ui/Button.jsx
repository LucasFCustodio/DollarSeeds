import { StyleSheet, Pressable, Text } from 'react-native'

export default function Button({ label, rgbaColor="", width, padding}) {
    const buttonBackground = {
        backgroundColor: rgbaColor,
        width: width,
        padding: padding,
        marginTop: 10,
        borderRadius: 40
    }
    return(
        <Pressable style={buttonBackground}>
            <Text style={styles.text}>{label}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    text: {
        fontSize: 18,
        color: "black"
    }
})