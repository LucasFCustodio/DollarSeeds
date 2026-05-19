import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/context/ThemeContext';

export default function TabLayout() {
    const { theme } = useTheme();

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: theme.tabActive,
                tabBarInactiveTintColor: theme.tabInactive,
                tabBarStyle: {
                    backgroundColor: theme.tabBar,
                    borderTopColor: theme.tabBarBorder,
                    borderTopWidth: 1,
                },
                tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                headerShown: false,
                tabBarButton: HapticTab,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
                }}
            />
            <Tabs.Screen
                name="add"
                options={{
                    title: 'Expense',
                    tabBarIcon: ({ color }) => <IconSymbol size={26} name="minus.circle.fill" color={color} />,
                }}
            />
            <Tabs.Screen
                name="addIncome"
                options={{
                    title: 'Income',
                    tabBarIcon: ({ color }) => <IconSymbol size={26} name="plus.circle.fill" color={color} />,
                }}
            />
            <Tabs.Screen
                name="piggyBank"
                options={{
                    title: 'Savings',
                    tabBarIcon: ({ color }) => <IconSymbol size={26} name="banknote.fill" color={color} />,
                }}
            />
        </Tabs>
    );
}
