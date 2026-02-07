import React, { useState, useMemo, useEffect } from 'react';
import { WheelPicker, WheelColumn } from './WheelPicker';

interface DateWheelPickerProps {
    value: string; // YYYY-MM-DD format
    onChange: (value: string) => void;
    onCancel: () => void;
}

export const DateWheelPicker: React.FC<DateWheelPickerProps> = ({
    value,
    onChange,
    onCancel,
}) => {
    // Parse initial value
    const parseDate = (dateStr: string) => {
        if (!dateStr) {
            const now = new Date();
            return {
                year: now.getFullYear(),
                month: now.getMonth() + 1,
                day: now.getDate(),
            };
        }
        const [year, month, day] = dateStr.split('-').map(Number);
        return { year: year || new Date().getFullYear(), month: month || 1, day: day || 1 };
    };

    const initial = parseDate(value);
    const [selectedYear, setSelectedYear] = useState(initial.year);
    const [selectedMonth, setSelectedMonth] = useState(initial.month);
    const [selectedDay, setSelectedDay] = useState(initial.day);

    // Generate year items (±10 years from current year)
    const yearItems = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 21 }, (_, i) => {
            const year = currentYear - 10 + i;
            return { value: year, label: `${year}` };
        });
    }, []);

    // Generate month items (1-12)
    const monthItems = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => ({
            value: i + 1,
            label: `${(i + 1).toString().padStart(2, '0')}`,
        }));
    }, []);

    // Generate day items based on selected year and month
    const dayItems = useMemo(() => {
        const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => ({
            value: i + 1,
            label: `${(i + 1).toString().padStart(2, '0')}`,
        }));
    }, [selectedYear, selectedMonth]);

    // Adjust day if it exceeds the days in the new month
    useEffect(() => {
        const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
        if (selectedDay > daysInMonth) {
            setSelectedDay(daysInMonth);
        }
    }, [selectedYear, selectedMonth, selectedDay]);

    // Handle confirm
    const handleConfirm = () => {
        const formattedDate = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${selectedDay.toString().padStart(2, '0')}`;
        onChange(formattedDate);
    };

    return (
        <WheelPicker
            onConfirm={handleConfirm}
            onCancel={onCancel}
            title="日付を選択"
        >
            <WheelColumn
                items={yearItems}
                selectedValue={selectedYear}
                onChange={(val) => setSelectedYear(val)}
                label="年"
            />
            <WheelColumn
                items={monthItems}
                selectedValue={selectedMonth}
                onChange={(val) => setSelectedMonth(val)}
                label="月"
            />
            <WheelColumn
                items={dayItems}
                selectedValue={selectedDay}
                onChange={(val) => setSelectedDay(val)}
                label="日"
            />
        </WheelPicker>
    );
};
