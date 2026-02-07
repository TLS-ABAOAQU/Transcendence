import React, { useState, useMemo } from 'react';
import { WheelPicker, WheelColumn } from './WheelPicker';

interface TimeWheelPickerProps {
    value: string; // HH:MM format
    onChange: (value: string) => void;
    onCancel: () => void;
}

export const TimeWheelPicker: React.FC<TimeWheelPickerProps> = ({
    value,
    onChange,
    onCancel,
}) => {
    // Parse initial value
    const parseTime = (timeStr: string) => {
        if (!timeStr) {
            return { hour: 12, minute: 0 };
        }
        const [hour, minute] = timeStr.split(':').map(Number);
        return { hour: hour || 0, minute: minute || 0 };
    };

    const initial = parseTime(value);
    const [selectedHour, setSelectedHour] = useState(initial.hour);
    const [selectedMinute, setSelectedMinute] = useState(initial.minute);

    // Generate hour items (0-23)
    const hourItems = useMemo(() => {
        return Array.from({ length: 24 }, (_, i) => ({
            value: i,
            label: i.toString().padStart(2, '0'),
        }));
    }, []);

    // Generate minute items (0-59)
    const minuteItems = useMemo(() => {
        return Array.from({ length: 60 }, (_, i) => ({
            value: i,
            label: i.toString().padStart(2, '0'),
        }));
    }, []);

    // Handle confirm
    const handleConfirm = () => {
        const formattedTime = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
        onChange(formattedTime);
    };

    return (
        <WheelPicker
            onConfirm={handleConfirm}
            onCancel={onCancel}
            title="時間を選択"
        >
            <WheelColumn
                items={hourItems}
                selectedValue={selectedHour}
                onChange={(val) => setSelectedHour(val)}
                label="時"
            />
            <WheelColumn
                items={minuteItems}
                selectedValue={selectedMinute}
                onChange={(val) => setSelectedMinute(val)}
                label="分"
            />
        </WheelPicker>
    );
};
