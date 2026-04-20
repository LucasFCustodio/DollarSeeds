import { StyleSheet, View, Text } from 'react-native';
import InputField from '../ui/InputField';
import Button from '../ui/Button';
import Dropdown from '../ui/Dropdown'
import React, { useState } from 'react';

export default function ExpenseContainer() {
    const [category, setCategory] = useState(null);
    const expenseCategories = ["Need", "Want", "Savings", "Debt"];
    return (
        <View style={styles.expenseContainer}>
            <InputField 
                label="Expense Title"
                placeholder="Dinner at Chipotle"
            />
            <InputField 
                label="Amount"
                icon="$"
                placeholder="9.50"
            />
            <Dropdown 
                label="Category"
                options={expenseCategories}
                selectedValue={category}
                onSelect={(selectedItem) => setCategory(selectedItem)} 
            />
            <InputField 
                label="Date"
                icon="🗓️"
                placeholder="10/02/2026"
            />
            <Button
                label="Add Expense +"
                rgbaColor="rgba(28, 168, 235, 0.8)"
                width="60%"
                padding="15"
            />
        </View>
    )
}

const styles = StyleSheet.create({
    expenseContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 1)',
        height: '100%',
        width: '100%',
        paddingVertical: 20,
        paddingHorizontal: 40
    }
})