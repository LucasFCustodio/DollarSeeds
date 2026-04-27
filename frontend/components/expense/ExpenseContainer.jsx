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
    const [day, setDay] = useState(null)
    const [month, setMonth] = useState(null)

    const expenseCategories = ["Need", "Want", "Savings", "Debt"];
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    const submitExpense = async () => {
        if (!title || !amount || !category || !day || !month) {
            console.log("Please fill out all the fields")
            return;
        }
        try {
            const SERVER_URL="http://127.0.0.1:8000/expenses/"
            const SERVER_URL_PHONE="http://10.0.0.13:8000/expenses/"

            const payload = {
                title: title,
                amount: parseFloat(amount),
                category: category,
                day: parseInt(day),
                month: month
            }

            const response = await axios.post(SERVER_URL_PHONE, payload, {
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                }
            });
            console.log(`Sent with status code ${response.status}, and with response ${response.data}`)

            setTitle("")
            setAmount("")
            setCategory(null)
            setDay(null)
            setMonth(null)
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
            <Dropdown 
                label="Day of the Expense"
                options={days}
                selectedValue={day}
                onSelect={setDay}
            />
            <Dropdown 
                label="Month of the Expense"
                options={months}
                selectedValue={month}
                onSelect={setMonth}
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