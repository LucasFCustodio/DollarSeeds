import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const SIZE = {
    sm: { paddingVertical: 8,  paddingHorizontal: 16, fontSize: 13, borderRadius: 8  },
    md: { paddingVertical: 12, paddingHorizontal: 20, fontSize: 15, borderRadius: 10 },
    lg: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 16, borderRadius: 12 },
};

export default function Button({
    label,
    onPress,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    color,       // optional override for border/text on outline/ghost
    disabled = false,
}) {
    const { theme } = useTheme();
    const s = SIZE[size] ?? SIZE.md;

    const getBg = () => {
        if (disabled) return theme.border;
        switch (variant) {
            case 'primary':   return theme.action;
            case 'secondary': return theme.actionSoft;
            case 'danger':    return theme.danger;
            case 'dangerSoft':return theme.dangerSoft;
            case 'success':   return theme.success;
            case 'outline':   return 'transparent';
            case 'ghost':     return 'transparent';
            default:          return theme.action;
        }
    };

    const getTextColor = () => {
        if (disabled) return theme.textMuted;
        switch (variant) {
            case 'primary':   return theme.actionText;
            case 'secondary': return theme.action;
            case 'danger':    return '#FFFFFF';
            case 'dangerSoft':return theme.danger;
            case 'success':   return '#FFFFFF';
            case 'outline':   return color ?? theme.action;
            case 'ghost':     return color ?? theme.action;
            default:          return theme.actionText;
        }
    };

    const getBorder = () => {
        switch (variant) {
            case 'outline': return { borderWidth: 1.5, borderColor: color ?? theme.action };
            default:        return {};
        }
    };

    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            style={({ pressed }) => [
                styles.base,
                {
                    backgroundColor: getBg(),
                    paddingVertical: s.paddingVertical,
                    paddingHorizontal: s.paddingHorizontal,
                    borderRadius: s.borderRadius,
                    alignSelf: fullWidth ? 'stretch' : 'center',
                    opacity: pressed || disabled ? 0.75 : 1,
                },
                getBorder(),
            ]}
        >
            <Text style={[styles.label, { fontSize: s.fontSize, color: getTextColor() }]}>
                {label}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontWeight: '600',
    },
});
