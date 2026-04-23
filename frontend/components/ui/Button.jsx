import { StyleSheet, Pressable, Text } from 'react-native'

export default function Button({ label, rgbaColor="", width, padding, onPress}) {
    const buttonBackground = {
        backgroundColor: rgbaColor,
        width: width,
        padding: padding,
        marginTop: 10,
        borderRadius: 40,
        alignItems: 'center'
    }
    return(
        <Pressable style={buttonBackground} onPress={onPress}>
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