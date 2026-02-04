import React, { useMemo, useState, useCallback } from 'react';
import type { Task } from '../../types';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    addWeeks,
    subWeeks,
    parseISO,
    isValid,
    differenceInDays,
    getWeek,
    max,
    min,
} from 'date-fns';

interface CalendarViewProps {
    tasks: Task[];
    themeColor?: string;
    onTaskClick?: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    onTasksReorder?: (tasks: Task[]) => void;
}

type ViewMode = 'month' | 'week';

interface TaskWithDates extends Task {
    taskStart: Date;
    taskEnd: Date;
}

interface TaskSegment {
    task: TaskWithDates;
    startCol: number; // 0-6 for day of week
    endCol: number;   // 0-6 for day of week
    isStart: boolean; // Is this the start of the task?
    isEnd: boolean;   // Is this the end of the task?
    lane: number;     // Vertical position (row within the task area)
}

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onTaskClick, onTaskUpdate, onTasksReorder }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [draggingTask, setDraggingTask] = useState<Task | null>(null);
    const [dragOverInfo, setDragOverInfo] = useState<{ taskId: string; position: 'before' | 'after' } | null>(null);

    // Navigation
    const next = () => {
        if (viewMode === 'month') {
            setCurrentDate(addMonths(currentDate, 1));
        } else {
            setCurrentDate(addWeeks(currentDate, 1));
        }
    };
    const prev = () => {
        if (viewMode === 'month') {
            setCurrentDate(subMonths(currentDate, 1));
        } else {
            setCurrentDate(subWeeks(currentDate, 1));
        }
    };
    const goToToday = () => setCurrentDate(new Date());

    // Theme colors
    const theme = {
        bg: isDarkMode ? '#1F2937' : '#FAFAFA',
        cardBg: isDarkMode ? '#111827' : '#FFFFFF',
        headerBg: isDarkMode ? '#1F2937' : '#FAFAFA',
        text: isDarkMode ? '#F9FAFB' : '#1F2937',
        textMuted: isDarkMode ? '#9CA3AF' : '#6B7280',
        textFaded: isDarkMode ? '#6B7280' : '#D1D5DB',
        border: isDarkMode ? '#374151' : '#F3F4F6',
        borderStrong: isDarkMode ? '#4B5563' : '#E5E7EB',
        buttonBg: isDarkMode ? '#374151' : '#E5E7EB',
        buttonActiveBg: isDarkMode ? '#4B5563' : '#FFFFFF',
        sunday: '#EF4444',
        saturday: '#3B82F6',
        today: '#EF4444',
    };

    // Grid Generation for Month View
    const { weeks } = useMemo(() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const calendarStart = startOfWeek(monthStart);
        const calendarEnd = endOfWeek(monthEnd);

        const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

        // Group days into weeks
        const weeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
        }

        return { days, weeks };
    }, [currentDate]);

    // Current Week for Week View
    const currentWeek = useMemo(() => {
        const weekStart = startOfWeek(currentDate);
        const weekEnd = endOfWeek(currentDate);
        return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }, [currentDate]);

    // Check if today is in the current view
    const isShowingToday = useMemo(() => {
        const today = new Date();
        if (viewMode === 'month') {
            return isSameMonth(currentDate, today);
        } else {
            return currentWeek.some(day => isSameDay(day, today));
        }
    }, [currentDate, viewMode, currentWeek]);

    // Weekday Headers
    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

    // Tasks with valid dates
    const tasksWithDates = useMemo((): TaskWithDates[] => {
        return tasks
            .filter(task => task.startDate)
            .map(task => {
                const start = parseISO(task.startDate!);
                const end = task.dueDate ? parseISO(task.dueDate) : start;
                if (!isValid(start)) return null;
                return {
                    ...task,
                    taskStart: start,
                    taskEnd: isValid(end) ? end : start,
                };
            })
            .filter((t): t is TaskWithDates => t !== null);
    }, [tasks]);

    // Tasks without dates
    const undatedTasks = useMemo(() => {
        return tasks.filter(task => !task.startDate);
    }, [tasks]);

    // Calculate task segments for each week (for spanning bars)
    const getTaskSegmentsForWeek = useCallback((week: Date[]): TaskSegment[] => {
        const weekStart = week[0];
        const weekEnd = week[6];
        const segments: TaskSegment[] = [];

        tasksWithDates.forEach(task => {
            // Check if task overlaps with this week
            if (task.taskEnd < weekStart || task.taskStart > weekEnd) {
                return; // No overlap
            }

            // Calculate the visible portion of the task in this week
            const visibleStart = max([task.taskStart, weekStart]);
            const visibleEnd = min([task.taskEnd, weekEnd]);

            const startCol = differenceInDays(visibleStart, weekStart);
            const endCol = differenceInDays(visibleEnd, weekStart);

            segments.push({
                task,
                startCol,
                endCol,
                isStart: isSameDay(task.taskStart, visibleStart),
                isEnd: isSameDay(task.taskEnd, visibleEnd),
                lane: 0, // Will be calculated
            });
        });

        // Sort by start date, then by duration (longer first)
        segments.sort((a, b) => {
            if (a.startCol !== b.startCol) return a.startCol - b.startCol;
            const aDuration = a.endCol - a.startCol;
            const bDuration = b.endCol - b.startCol;
            return bDuration - aDuration;
        });

        // Assign lanes (greedy algorithm)
        const lanes: number[][] = []; // lanes[lane] = array of endCols occupied
        segments.forEach(segment => {
            // Find first lane where this segment fits
            let assignedLane = 0;
            for (let lane = 0; lane < lanes.length; lane++) {
                const conflicts = lanes[lane].some(endCol => segment.startCol <= endCol);
                if (!conflicts) {
                    assignedLane = lane;
                    break;
                }
                assignedLane = lane + 1;
            }
            segment.lane = assignedLane;
            if (!lanes[assignedLane]) lanes[assignedLane] = [];
            lanes[assignedLane].push(segment.endCol);
        });

        return segments;
    }, [tasksWithDates]);

    // Color palette for tasks
    const taskColors = [
        '#8B5CF6', // Purple
        '#3B82F6', // Blue
        '#10B981', // Green
        '#F59E0B', // Amber
        '#EF4444', // Red
        '#EC4899', // Pink
        '#06B6D4', // Cyan
        '#F97316', // Orange
    ];

    // Get consistent color for a task based on its ID
    const getTaskColor = (taskId: string) => {
        let hash = 0;
        for (let i = 0; i < taskId.length; i++) {
            hash = taskId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return taskColors[Math.abs(hash) % taskColors.length];
    };

    // Header title based on view mode
    const headerTitle = viewMode === 'month'
        ? format(currentDate, 'yyyy年M月')
        : `${format(currentWeek[0], 'yyyy年M月d日')} 〜 ${format(currentWeek[6], 'M月d日')}`;

    // Handle task reorder via drag
    const handleTaskDragStart = (e: React.DragEvent, task: Task) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        setDraggingTask(task);
    };

    const handleTaskDragOver = (e: React.DragEvent, task: Task, position: 'before' | 'after') => {
        e.preventDefault();
        e.stopPropagation();
        if (draggingTask && draggingTask.id !== task.id) {
            setDragOverInfo({ taskId: task.id, position });
        }
    };

    const handleTaskDrop = (e: React.DragEvent, targetTask: Task, position: 'before' | 'after') => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggingTask || draggingTask.id === targetTask.id || !onTasksReorder) {
            setDraggingTask(null);
            setDragOverInfo(null);
            return;
        }

        const newTasks = [...tasks];
        const dragIndex = newTasks.findIndex(t => t.id === draggingTask.id);
        const targetIndex = newTasks.findIndex(t => t.id === targetTask.id);

        if (dragIndex === -1 || targetIndex === -1) {
            setDraggingTask(null);
            setDragOverInfo(null);
            return;
        }

        // Remove dragged task
        const [removed] = newTasks.splice(dragIndex, 1);

        // Calculate new index
        let insertIndex = targetIndex;
        if (dragIndex < targetIndex) {
            insertIndex = position === 'after' ? targetIndex : targetIndex - 1;
        } else {
            insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
        }

        newTasks.splice(insertIndex, 0, removed);
        onTasksReorder(newTasks);

        setDraggingTask(null);
        setDragOverInfo(null);
    };

    const handleDragEnd = () => {
        setDraggingTask(null);
        setDragOverInfo(null);
    };

    // Render a task bar segment
    const renderTaskSegment = (segment: TaskSegment, weekIndex: number) => {
        const { task, startCol, endCol, isStart, isEnd, lane } = segment;
        const taskColor = getTaskColor(task.id);
        const spanWidth = endCol - startCol + 1;

        // Calculate position (percentage based)
        const leftPercent = (startCol / 7) * 100;
        const widthPercent = (spanWidth / 7) * 100;

        const isDraggingThis = draggingTask?.id === task.id;
        const showDropBefore = dragOverInfo?.taskId === task.id && dragOverInfo.position === 'before';
        const showDropAfter = dragOverInfo?.taskId === task.id && dragOverInfo.position === 'after';

        return (
            <div
                key={`${task.id}-${weekIndex}`}
                draggable
                onDragStart={(e) => handleTaskDragStart(e, task)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    handleTaskDragOver(e, task, e.clientY < midY ? 'before' : 'after');
                }}
                onDragLeave={() => setDragOverInfo(null)}
                onDrop={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    handleTaskDrop(e, task, e.clientY < midY ? 'before' : 'after');
                }}
                onClick={() => onTaskClick?.(task)}
                style={{
                    position: 'absolute',
                    left: `calc(${leftPercent}% + 4px)`,
                    width: `calc(${widthPercent}% - 8px)`,
                    top: `${44 + lane * 26}px`,
                    height: '22px',
                    backgroundColor: taskColor,
                    borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: isStart ? '8px' : '4px',
                    paddingRight: isEnd ? '8px' : '4px',
                    cursor: 'grab',
                    opacity: isDraggingThis ? 0.5 : 1,
                    zIndex: 10,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    transition: 'opacity 0.15s ease',
                    borderTop: showDropBefore ? '2px solid #fff' : 'none',
                    borderBottom: showDropAfter ? '2px solid #fff' : 'none',
                    marginTop: showDropBefore ? '-2px' : '0',
                }}
                title={task.title}
            >
                {isStart && (
                    <span
                        style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            color: '#1e293b',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {task.title}
                    </span>
                )}
            </div>
        );
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: theme.bg,
                borderRadius: '16px',
                overflow: 'hidden',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: isDarkMode ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.08)',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '24px 32px',
                    backgroundColor: theme.headerBg,
                    gap: '16px',
                }}
            >
                <h2
                    style={{
                        margin: 0,
                        fontSize: '28px',
                        fontWeight: '700',
                        color: theme.text,
                        letterSpacing: '-0.5px',
                        flexShrink: 0,
                    }}
                >
                    {headerTitle}
                </h2>

                {/* Undated Tasks Section */}
                {undatedTasks.length > 0 && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flex: 1,
                            overflow: 'hidden',
                            padding: '4px 12px',
                            backgroundColor: theme.buttonBg,
                            borderRadius: '22px',
                            height: '44px',
                        }}
                    >
                        {undatedTasks.map(task => {
                            const taskColor = getTaskColor(task.id);
                            return (
                                <div
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => {
                                        setDraggingTask(task);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragEnd={() => setDraggingTask(null)}
                                    onClick={() => onTaskClick?.(task)}
                                    style={{
                                        fontSize: '12px',
                                        padding: '6px 12px',
                                        backgroundColor: isDarkMode ? `${taskColor}30` : `${taskColor}20`,
                                        color: taskColor,
                                        borderRadius: '14px',
                                        whiteSpace: 'nowrap',
                                        cursor: 'grab',
                                        fontWeight: '500',
                                        flexShrink: 0,
                                    }}
                                    title={`${task.title} - ドラッグしてカレンダーにドロップ`}
                                >
                                    {task.title}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {/* View Mode Toggle */}
                    <div
                        onClick={() => setViewMode(viewMode === 'month' ? 'week' : 'month')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: theme.buttonBg,
                            borderRadius: '22px',
                            padding: '4px',
                            cursor: 'pointer',
                            height: '44px',
                        }}
                    >
                        <div
                            style={{
                                padding: '8px 16px',
                                backgroundColor: viewMode === 'week' ? theme.buttonActiveBg : 'transparent',
                                borderRadius: '18px',
                                color: viewMode === 'week' ? theme.text : theme.textMuted,
                                fontSize: '14px',
                                fontWeight: '500',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            週
                        </div>
                        <div
                            style={{
                                padding: '8px 16px',
                                backgroundColor: viewMode === 'month' ? theme.buttonActiveBg : 'transparent',
                                borderRadius: '18px',
                                color: viewMode === 'month' ? theme.text : theme.textMuted,
                                fontSize: '14px',
                                fontWeight: '500',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            月
                        </div>
                    </div>

                    {/* Dark Mode Toggle */}
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        style={{
                            width: '44px',
                            height: '44px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.buttonBg,
                            border: 'none',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            fontSize: '18px',
                        }}
                        title={isDarkMode ? 'ライトモード' : 'ダークモード'}
                    >
                        {isDarkMode ? '☀️' : '🌙'}
                    </button>

                    {/* Navigation */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: theme.buttonBg,
                            borderRadius: '22px',
                            padding: '4px 8px',
                            height: '44px',
                        }}
                    >
                        <button
                            onClick={prev}
                            style={{
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'transparent',
                                border: `1px solid ${theme.borderStrong}`,
                                borderRadius: '18px',
                                cursor: 'pointer',
                                color: theme.textMuted,
                                fontSize: '18px',
                            }}
                        >
                            ‹
                        </button>
                        <button
                            onClick={goToToday}
                            style={{
                                padding: '8px 20px',
                                height: '36px',
                                backgroundColor: isShowingToday ? theme.buttonActiveBg : 'transparent',
                                border: `1px solid ${theme.borderStrong}`,
                                borderRadius: '18px',
                                cursor: 'pointer',
                                color: isShowingToday ? theme.text : theme.textMuted,
                                fontSize: '14px',
                                fontWeight: '500',
                            }}
                        >
                            今日
                        </button>
                        <button
                            onClick={next}
                            style={{
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'transparent',
                                border: `1px solid ${theme.borderStrong}`,
                                borderRadius: '18px',
                                cursor: 'pointer',
                                color: theme.textMuted,
                                fontSize: '18px',
                            }}
                        >
                            ›
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Weekday Headers */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: viewMode === 'month' ? '40px repeat(7, 1fr)' : 'repeat(7, 1fr)',
                        borderBottom: `1px solid ${theme.borderStrong}`,
                        backgroundColor: theme.headerBg,
                    }}
                >
                    {/* Empty cell for week number column (month view only) */}
                    {viewMode === 'month' && <div style={{ padding: '12px 8px' }}></div>}
                    {weekDays.map((day, i) => (
                        <div
                            key={i}
                            style={{
                                padding: '12px 8px',
                                textAlign: 'center',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: i === 0 ? theme.sunday : i === 6 ? theme.saturday : theme.text,
                            }}
                        >
                            {day}
                        </div>
                    ))}
                </div>

                {/* Month View */}
                {viewMode === 'month' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                        {weeks.map((week, weekIndex) => {
                            const weekNum = getWeek(week[0]);
                            const segments = getTaskSegmentsForWeek(week);
                            const maxLane = segments.length > 0 ? Math.max(...segments.map(s => s.lane)) : -1;
                            const rowHeight = Math.max(140, 50 + (maxLane + 1) * 26);

                            return (
                                <div
                                    key={weekIndex}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '40px repeat(7, 1fr)',
                                        minHeight: `${rowHeight}px`,
                                        borderBottom: `1px solid ${theme.border}`,
                                        position: 'relative',
                                    }}
                                >
                                    {/* Week Number */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'center',
                                            paddingTop: '12px',
                                            fontSize: '12px',
                                            color: theme.textFaded,
                                            fontWeight: '500',
                                        }}
                                    >
                                        {weekNum}
                                    </div>

                                    {/* Days Grid (for backgrounds and dates) */}
                                    {week.map((day, dayIndex) => {
                                        const isCurrentMonth = isSameMonth(day, currentDate);
                                        const isToday = isSameDay(day, new Date());
                                        const dayNum = format(day, 'd');
                                        const dayLabel = dayNum === '1' ? format(day, 'M月d日') : `${dayNum}日`;

                                        let textColor = theme.text;
                                        if (dayIndex === 0) textColor = theme.sunday;
                                        if (dayIndex === 6) textColor = theme.saturday;
                                        if (!isCurrentMonth) textColor = theme.textFaded;

                                        return (
                                            <div
                                                key={day.toISOString()}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.currentTarget.style.backgroundColor = isDarkMode ? '#374151' : '#E5E7EB';
                                                }}
                                                onDragLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = isCurrentMonth ? theme.cardBg : theme.bg;
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.currentTarget.style.backgroundColor = isCurrentMonth ? theme.cardBg : theme.bg;
                                                    if (draggingTask && !draggingTask.startDate && onTaskUpdate) {
                                                        // Only set date for undated tasks dropped on cells
                                                        onTaskUpdate(draggingTask.id, { startDate: format(day, 'yyyy-MM-dd') });
                                                    }
                                                    setDraggingTask(null);
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    padding: '8px',
                                                    borderRight: dayIndex < 6 ? `1px solid ${theme.border}` : 'none',
                                                    backgroundColor: isCurrentMonth ? theme.cardBg : theme.bg,
                                                    transition: 'background-color 0.15s ease',
                                                }}
                                            >
                                                {/* Date Label */}
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-start',
                                                    alignItems: 'center',
                                                    height: '36px',
                                                }}>
                                                    {isToday ? (
                                                        <span
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                minWidth: '36px',
                                                                height: '36px',
                                                                padding: '0 8px',
                                                                backgroundColor: theme.today,
                                                                borderRadius: '18px',
                                                                color: '#FFFFFF',
                                                                fontSize: '18px',
                                                                fontWeight: '600',
                                                            }}
                                                        >
                                                            {dayLabel}
                                                        </span>
                                                    ) : (
                                                        <span
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                height: '36px',
                                                                color: textColor,
                                                                fontSize: '18px',
                                                                fontWeight: '600',
                                                            }}
                                                        >
                                                            {dayLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Task Bars (positioned absolutely over the days) */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: '40px',
                                            right: 0,
                                            bottom: 0,
                                            pointerEvents: 'none',
                                        }}
                                    >
                                        <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'auto' }}>
                                            {segments.map(segment => renderTaskSegment(segment, weekIndex))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Week View */}
                {viewMode === 'week' && (
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(7, 1fr)',
                                flex: 1,
                            }}
                        >
                            {currentWeek.map((day, dayIndex) => {
                                const isToday = isSameDay(day, new Date());
                                const dayNum = format(day, 'd');
                                const dayLabel = `${dayNum}日`;

                                // Get tasks for this day
                                const dayTasks = tasksWithDates.filter(task => {
                                    return day >= task.taskStart && day <= task.taskEnd;
                                });

                                let textColor = theme.text;
                                if (dayIndex === 0) textColor = theme.sunday;
                                if (dayIndex === 6) textColor = theme.saturday;

                                return (
                                    <div
                                        key={day.toISOString()}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.style.backgroundColor = isDarkMode ? '#374151' : '#E5E7EB';
                                        }}
                                        onDragLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = theme.cardBg;
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.style.backgroundColor = theme.cardBg;
                                            if (draggingTask && !draggingTask.startDate && onTaskUpdate) {
                                                onTaskUpdate(draggingTask.id, { startDate: format(day, 'yyyy-MM-dd') });
                                            }
                                            setDraggingTask(null);
                                        }}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            padding: '12px',
                                            borderRight: dayIndex < 6 ? `1px solid ${theme.border}` : 'none',
                                            backgroundColor: theme.cardBg,
                                            overflow: 'auto',
                                            minHeight: '300px',
                                            transition: 'background-color 0.15s ease',
                                        }}
                                    >
                                        {/* Date Header */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'flex-start',
                                            alignItems: 'center',
                                            height: '44px',
                                            marginBottom: '12px',
                                        }}>
                                            {isToday ? (
                                                <span
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        minWidth: '44px',
                                                        height: '44px',
                                                        padding: '0 12px',
                                                        backgroundColor: theme.today,
                                                        borderRadius: '22px',
                                                        color: '#FFFFFF',
                                                        fontSize: '22px',
                                                        fontWeight: '700',
                                                    }}
                                                >
                                                    {dayLabel}
                                                </span>
                                            ) : (
                                                <span
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        height: '44px',
                                                        color: textColor,
                                                        fontSize: '22px',
                                                        fontWeight: '700',
                                                    }}
                                                >
                                                    {dayLabel}
                                                </span>
                                            )}
                                        </div>

                                        {/* Tasks */}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {dayTasks.map(task => {
                                                const taskColor = getTaskColor(task.id);
                                                const isDraggingThis = draggingTask?.id === task.id;
                                                const showDropBefore = dragOverInfo?.taskId === task.id && dragOverInfo.position === 'before';
                                                const showDropAfter = dragOverInfo?.taskId === task.id && dragOverInfo.position === 'after';

                                                return (
                                                    <div
                                                        key={task.id}
                                                        draggable
                                                        onDragStart={(e) => handleTaskDragStart(e, task)}
                                                        onDragEnd={handleDragEnd}
                                                        onDragOver={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const midY = rect.top + rect.height / 2;
                                                            handleTaskDragOver(e, task, e.clientY < midY ? 'before' : 'after');
                                                        }}
                                                        onDragLeave={() => setDragOverInfo(null)}
                                                        onDrop={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            const midY = rect.top + rect.height / 2;
                                                            handleTaskDrop(e, task, e.clientY < midY ? 'before' : 'after');
                                                        }}
                                                        onClick={() => onTaskClick?.(task)}
                                                        style={{
                                                            fontSize: '13px',
                                                            padding: '8px 12px',
                                                            backgroundColor: taskColor,
                                                            color: '#1e293b',
                                                            borderRadius: '12px',
                                                            cursor: 'grab',
                                                            fontWeight: '500',
                                                            opacity: isDraggingThis ? 0.5 : 1,
                                                            borderTop: showDropBefore ? '2px solid #fff' : 'none',
                                                            borderBottom: showDropAfter ? '2px solid #fff' : 'none',
                                                        }}
                                                        title={task.title}
                                                    >
                                                        {task.title}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
