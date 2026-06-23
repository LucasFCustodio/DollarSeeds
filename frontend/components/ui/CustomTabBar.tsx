/**
 * CustomTabBar — floating pill tab bar.
 *
 * Active tab icon container animates into a brand-filled rounded pill.
 * Spring transition (damping 12, stiffness 200) via Reanimated.
 * Floats 16px from edges, 14px from bottom, above the safe-area inset.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, shadow } from '../../context/ThemeContext';
import {
    IconHome,
    IconTransactions,
    IconSavings,
    IconLessons,
} from '../icons';

// Map route name → icon component
const TAB_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; accent?: string; filled?: boolean }>> = {
    index: IconHome,
    transactions: IconTransactions,
    piggyBank: IconSavings,
    lessons: IconLessons,
};

const TAB_LABELS: Record<string, string> = {
    index: 'Home',
    transactions: 'Transactions',
    piggyBank: 'Savings',
    lessons: 'Lessons',
};

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View
            style={[
                styles.container,
                {
                    bottom: Math.max(insets.bottom, 14),
                    backgroundColor: theme.surface,
                    ...(shadow(6) as object),
                },
            ]}
        >
            {state.routes.map((route, index) => {
                const isFocused = state.index === index;
                const IconComp = TAB_ICONS[route.name] ?? IconHome;
                const label = TAB_LABELS[route.name] ?? route.name;

                const onPress = () => {
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!isFocused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };

                return (
                    <TabItem
                        key={route.key}
                        isFocused={isFocused}
                        onPress={onPress}
                        IconComp={IconComp}
                        label={label}
                        brandColor={theme.brand}
                        brandSoft={theme.brandSoft}
                        inkColor={theme.ink3}
                        accent={theme.brand2}
                    />
                );
            })}
        </View>
    );
}

// ── Individual tab item with spring animation ─────────────────────────────────
interface TabItemProps {
    isFocused: boolean;
    onPress: () => void;
    IconComp: React.ComponentType<{ size?: number; color?: string; accent?: string; filled?: boolean }>;
    label: string;
    brandColor: string;
    brandSoft: string;
    inkColor: string;
    accent: string;
}

function TabItem({ isFocused, onPress, IconComp, label, brandColor, brandSoft, inkColor, accent }: TabItemProps) {
    const progress = useSharedValue(isFocused ? 1 : 0);

    React.useEffect(() => {
        progress.value = withSpring(isFocused ? 1 : 0, { damping: 12, stiffness: 200 });
    }, [isFocused]);

    const iconContainerStyle = useAnimatedStyle(() => ({
        backgroundColor: progress.value > 0.1 ? brandSoft : 'transparent',
        paddingHorizontal: 12 + progress.value * 4,
        paddingVertical: 6,
        borderRadius: 999,
    }));

    const iconColor = isFocused ? brandColor : inkColor;
    const labelColor = isFocused ? brandColor : inkColor;

    return (
        <Pressable onPress={onPress} style={styles.tabItem}>
            <Animated.View style={iconContainerStyle}>
                <IconComp
                    size={22}
                    color={iconColor}
                    accent={isFocused ? accent : inkColor}
                    filled={isFocused}
                />
            </Animated.View>
            <Text
                style={[
                    styles.tabLabel,
                    { color: labelColor, fontFamily: 'Geist-SemiBold' },
                ]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        borderRadius: 24,
        paddingVertical: 8,
        paddingHorizontal: 4,
        alignItems: 'center',
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    tabLabel: {
        fontSize: 10,
        letterSpacing: 0.2,
    },
});
