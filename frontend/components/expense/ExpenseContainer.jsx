import { StyleSheet, View, Text } from 'react-native';
import InputField from '../ui/InputField';
import Button from '../ui/Button';
import Dropdown from '../ui/Dropdown'
import React, { useState } from 'react';
import axios from "axios"

export default function ExpenseContainer() {
    const [title, setTitle] = useState()
    const [amount, setAmount] = useState()
    const [category, setCategory] = useState(null);
    const [date, setDate] = useState()

    const expenseCategories = ["Need", "Want", "Savings", "Debt"];

    const submitExpense = async () => {
        if (!title || !amount || !category || !date) {
            console.log("Please fill out all the fields")
            return;
        }
        try {
            const SERVER_URL="https://micropaleontological-complicitly-socorro.ngrok-free.dev/expense/"

            const payload = {
                title: title,
                amount: amount,
                category: category,
                date: date
            }

            const response = await axios.post(SERVER_URL, payload);
            console.log(`Sent with status code ${response.status}, and with response ${response.data}`)

            setTitle("")
            setAmount("")
            setCategory("")
            setDate("")
        } catch (error) {
            console.error("Error sending data:", error.message);
        }
    }

    return (
        <View style={styles.expenseContainer}>
            <InputField 
                label="Expense Title"
                placeholder="Dinner at Chipotle"
                value={title}
                onChangeText={setTitle}
            />
            <InputField 
                label="Amount"
                icon="$"
                placeholder="9.50"
                isNumeric={true}
                value={amount}
                onChangeText={setAmount}
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
                value={date}
                onChangeText={setDate}
            />
            <Button
                label="Add Expense +"
                rgbaColor="rgba(28, 168, 235, 0.8)"
                width="60%"
                padding="15"
                onPress={submitExpense}
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