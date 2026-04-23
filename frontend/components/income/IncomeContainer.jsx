import { View, Text, StyleSheet } from 'react-native'
import InputField from "../ui/InputField"
import Dropdown from "../ui/Dropdown"
import React, { useState } from "react"

export default function IncomeContainer() {
    const [jobType, setJobType] = useState(null)
    const [day, setDay] = useState(null)
    const [month, setMonth] = useState(null)

    const jobTypes = ["Main Job", "Side Job"]
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    return(
        <View>
            <InputField 
                label="Job Title"
                icon="🏢"
                placeholder="Barbecue for James"
            />
            <InputField 
                label="Amount Received"
                icon="💵"
                placeholder="2000"
            />
            <Dropdown 
                label="Job Type"
                options={jobTypes}
                selectedValue={jobType}
                onSelect={setJobType}
            />
            <Dropdown 
                label="Payment Day"
                options={days}
                selectedValue={day}
                onSelect={setDay}
            />
            <Dropdown 
                label="Payment Month"
                options={months}
                selectedValue={month}
                onSelect={setMonth}
            />

        </View>
    )
}