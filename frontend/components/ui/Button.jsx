import { StyleSheet, Pressable, Text } from 'react-native'

export default function Button({ label, rgbaColor="", width, padding, font, onPress}) {
    const buttonBackground = {
        backgroundColor: rgbaColor,
        width: width,
        padding: padding,
        marginTop: 10,
        borderRadius: 40,
        alignItems: 'center'
    }

    const text = {
        fontSize: font,
        color: "black"
    }
    return(
        <Pressable style={buttonBackground} onPress={onPress}>
            <Text style={text}>{label}</Text>
        </Pressable>
    )
}