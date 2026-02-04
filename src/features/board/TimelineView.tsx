import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { format, addDays, addMonths, subMonths, differenceInDays, startOfDay, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';

interface TimelineViewProps {
    tasks: Task[];
    onTaskClick: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    onTasksReorder?: (tasks: Task[]) => void;
}

type ViewRange = 'week' | 'month' | '3months';

// Sortable task row component
interface SortableTaskRowProps {
    task: Task & { taskStart: Date | null; taskEnd: Date | null };
    position: { left: number; width: number } | null;
    theme: {
        bg: string;
        surface: string;
        text: string;
        textMuted: string;
        border: string;
        primary: string;
        taskBg: string;
    };
    dayWidth: number;
    days: Date[];
    resizing: {
        taskId: string;
        edge: 'left' | 'right' | 'move';
        initialX: number;
        initialStart: Date;
        initialEnd: Date;
    } | null;
    onTaskClick: (task: Task) => void;
    onTaskUpdate?: (taskId: string, updates: { startDate?: string; dueDate?: string }) => void;
    handleResizeStart: (e: React.MouseEvent, task: Task & { taskStart: Date | null; taskEnd: Date | null }, edge: 'left' | 'right' | 'move') => void;
    justFinishedResizing: React.MutableRefObject<boolean>;
    getStatusColor: (status: string) => string;
    getPriorityColor: (priority: string) => string;
}

const SortableTaskRow: React.FC<SortableTaskRowProps> = ({
    task,
    position,
    theme,
    dayWidth,
    days,
    resizing,
    onTaskClick,
    onTaskUpdate,
    handleResizeStart,
    justFinishedResizing,
    getStatusColor,
    getPriorityColor,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                display: 'flex',
                borderBottom: `1px solid ${theme.border}`,
                minHeight: '50px',
            }}
        >
            {/* Task Name with drag handle */}
            <div
                style={{
                    width: '200px',
                    minWidth: '200px',
                    padding: '12px',
                    borderRight: `1px solid ${theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    position: 'sticky',
                    left: 0,
                    backgroundColor: theme.bg,
                    zIndex: 5,
                }}
            >
                {/* Drag handle */}
                <div
                    {...attributes}
                    {...listeners}
                    style={{
                        cursor: 'grab',
                        padding: '4px',
                        marginLeft: '-4px',
                        display: 'flex',
                        alignItems: 'center',
                        color: theme.textMuted,
                    }}
                    title="Drag to reorder"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="2" />
                        <circle cx="15" cy="6" r="2" />
                        <circle cx="9" cy="12" r="2" />
                        <circle cx="15" cy="12" r="2" />
                        <circle cx="9" cy="18" r="2" />
                        <circle cx="15" cy="18" r="2" />
                    </svg>
                </div>
                <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(task.status),
                    flexShrink: 0,
                }} />
                <span
                    style={{
                        color: theme.text,
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        flex: 1,
                    }}
                    onClick={() => onTaskClick(task)}
                >
                    {task.title}
                    {!task.taskStart && !task.taskEnd && (
                        <span style={{ color: theme.textMuted, fontSize: '11px', marginLeft: '6px' }}>
                            (No dates set)
                        </span>
                    )}
                </span>
            </div>

            {/* Timeline Bar Area */}
            <div style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
            }}>
                {/* Day grid lines */}
                <div style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0 }}>
                    {days.map((day, index) => {
                        const hasNoDate = !task.taskStart && !task.taskEnd;
                        return (
                            <div
                                key={index}
                                onClick={hasNoDate && onTaskUpdate ? () => {
                                    onTaskUpdate(task.id, {
                                        startDate: format(day, 'yyyy-MM-dd'),
                                        dueDate: format(day, 'yyyy-MM-dd'),
                                    });
                                } : undefined}
                                style={{
                                    width: `${dayWidth}px`,
                                    borderRight: `1px solid ${theme.border}`,
                                    backgroundColor: isSameDay(day, new Date()) ? `${theme.primary}10` : 'transparent',
                                    cursor: hasNoDate ? 'pointer' : 'default',
                                }}
                                title={hasNoDate ? `Set start date to ${format(day, 'yyyy-MM-dd')}` : undefined}
                            />
                        );
                    })}
                </div>

                {/* Task Bar */}
                {position ? (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${position.left + 2}px`,
                            width: `${position.width}px`,
                            height: '28px',
                            backgroundColor: getPriorityColor(task.priority),
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'visible',
                            boxShadow: resizing?.taskId === task.id
                                ? '0 2px 8px rgba(0,0,0,0.3)'
                                : '0 1px 3px rgba(0,0,0,0.2)',
                            transition: resizing ? 'none' : 'transform 0.1s ease, box-shadow 0.1s ease',
                            transform: resizing?.taskId === task.id ? 'scale(1.02)' : 'scale(1)',
                        }}
                    >
                        {/* Left resize handle */}
                        <div
                            onMouseDown={(e) => handleResizeStart(e, task, 'left')}
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '8px',
                                cursor: 'ew-resize',
                                borderRadius: '6px 0 0 6px',
                                backgroundColor: 'transparent',
                                zIndex: 2,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        />

                        {/* Center drag handle (for moving entire task) */}
                        <div
                            onMouseDown={(e) => handleResizeStart(e, task, 'move')}
                            onClick={() => !resizing && !justFinishedResizing.current && onTaskClick(task)}
                            style={{
                                position: 'absolute',
                                left: '8px',
                                right: '8px',
                                top: 0,
                                bottom: 0,
                                cursor: resizing?.edge === 'move' ? 'grabbing' : 'grab',
                                display: 'flex',
                                alignItems: 'center',
                                zIndex: 1,
                            }}
                        >
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 500,
                                color: '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                padding: '0 4px',
                                pointerEvents: 'none',
                            }}>
                                {task.title}
                            </span>
                        </div>

                        {/* Right resize handle */}
                        <div
                            onMouseDown={(e) => handleResizeStart(e, task, 'right')}
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                bottom: 0,
                                width: '8px',
                                cursor: 'ew-resize',
                                borderRadius: '0 6px 6px 0',
                                backgroundColor: 'transparent',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export const TimelineView: React.FC<TimelineViewProps> = ({ tasks, onTaskClick, onTaskUpdate, onTasksReorder }) => {
    const [isDarkMode] = useState(true);
    const [viewRange, setViewRange] = useState<ViewRange>('month');

    // DnD state for vertical reordering
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const dndSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveTaskId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTaskId(null);

        if (over && active.id !== over.id && onTasksReorder) {
            const oldIndex = tasks.findIndex(t => t.id === active.id);
            const newIndex = tasks.findIndex(t => t.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newTasks = arrayMove(tasks, oldIndex, newIndex);
                onTasksReorder(newTasks);
            }
        }
    };

    const activeTask = activeTaskId ? tasks.find(t => t.id === activeTaskId) : null;

    const theme = useMemo(() => ({
        bg: isDarkMode ? '#0f172a' : '#ffffff',
        surface: isDarkMode ? '#1e293b' : '#f8fafc',
        text: isDarkMode ? '#f8fafc' : '#0f172a',
        textMuted: isDarkMode ? '#94a3b8' : '#64748b',
        border: isDarkMode ? '#334155' : '#e2e8f0',
        primary: '#8b5cf6',
        taskBg: isDarkMode ? '#334155' : '#e2e8f0',
    }), [isDarkMode]);

    // Calculate date range based on tasks and view mode
    const dateRange = useMemo(() => {
        const today = startOfDay(new Date());

        // Find earliest start date and latest due date from tasks
        let earliestStart: Date | null = null;
        let latestEnd: Date | null = null;

        tasks.forEach(task => {
            if (task.startDate) {
                const start = parseISO(task.startDate);
                if (!earliestStart || start < earliestStart) {
                    earliestStart = start;
                }
            }
            if (task.dueDate) {
                const end = parseISO(task.dueDate);
                if (!latestEnd || end > latestEnd) {
                    latestEnd = end;
                }
            }
        });

        // Default to today if no task dates
        const baseStart = earliestStart || today;
        const baseEnd = latestEnd || today;

        // Calculate padding based on view mode
        let paddingMonths: number;
        if (viewRange === 'week') {
            paddingMonths = 1;
        } else if (viewRange === 'month') {
            paddingMonths = 3;
        } else {
            paddingMonths = 12; // 1 year for 3months view
        }

        return {
            start: subMonths(baseStart, paddingMonths),
            end: addMonths(baseEnd, paddingMonths),
        };
    }, [tasks, viewRange]);

    // Generate days array from date range
    const days = useMemo(() => {
        return eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    }, [dateRange]);

    const startDate = dateRange.start;

    // Configuration
    const dayWidth = viewRange === 'week' ? 120 : viewRange === 'month' ? 40 : 20;

    // Resize/drag state
    const [resizing, setResizing] = useState<{
        taskId: string;
        edge: 'left' | 'right' | 'move';
        initialX: number;
        initialStart: Date;
        initialEnd: Date;
    } | null>(null);

    // Track if we just finished resizing/dragging (to prevent click from opening modal)
    const justFinishedResizing = useRef(false);

    // Scroll container ref
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Scroll to today on initial load or when view changes
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const today = startOfDay(new Date());
        const daysFromStart = differenceInDays(today, dateRange.start);
        const scrollPosition = Math.max(0, (daysFromStart - 3) * dayWidth);

        container.scrollLeft = scrollPosition;
    }, [dateRange, dayWidth]);

    // Process all tasks - those with dates get bars, those without just show in the list
    const timelineTasks = useMemo(() => {
        return tasks.map(task => {
            const taskStart = task.startDate ? parseISO(task.startDate) : null;
            const taskEnd = task.dueDate ? parseISO(task.dueDate) : taskStart;
            return { ...task, taskStart, taskEnd };
        });
    }, [tasks]);

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'var(--color-priority-high)';
            case 'medium': return 'var(--color-priority-medium)';
            case 'low': return 'var(--color-priority-low)';
            default: return theme.primary;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'done': return '#22c55e';
            case 'in-progress': return '#3b82f6';
            default: return theme.textMuted;
        }
    };

    // Navigate by scrolling
    const navigate = (direction: 'prev' | 'next') => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollAmount = viewRange === 'week' ? 7 * dayWidth : viewRange === 'month' ? 30 * dayWidth : 90 * dayWidth;
        const newScrollLeft = container.scrollLeft + (direction === 'next' ? scrollAmount : -scrollAmount);
        container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    };

    // Go to today
    const goToToday = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const today = startOfDay(new Date());
        const daysFromStart = differenceInDays(today, dateRange.start);
        const scrollPosition = Math.max(0, (daysFromStart - 3) * dayWidth);

        container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    };

    const totalDays = days.length;

    const getTaskPosition = (task: { taskStart: Date | null; taskEnd: Date | null }) => {
        if (!task.taskStart || !task.taskEnd) return null;

        const startOffset = differenceInDays(task.taskStart, startDate);
        const duration = differenceInDays(task.taskEnd, task.taskStart) + 1;

        // Skip if task is completely outside the visible range
        if (startOffset + duration < 0 || startOffset > totalDays) return null;

        const left = Math.max(0, startOffset) * dayWidth;
        const width = Math.min(duration, totalDays - Math.max(0, startOffset)) * dayWidth - 4;

        return { left, width: Math.max(width, dayWidth - 4) };
    };



    // Calculate new date based on mouse position
    const calculateDateFromX = useCallback((clientX: number, containerRect: DOMRect, scrollLeft: number): Date => {
        const relativeX = clientX - containerRect.left - 200 + scrollLeft; // 200 is task name column width
        const dayIndex = Math.round(relativeX / dayWidth);
        const clampedIndex = Math.max(0, Math.min(dayIndex, totalDays - 1));
        return addDays(startDate, clampedIndex);
    }, [dayWidth, totalDays, startDate]);

    // Handle resize/drag start
    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        task: Task & { taskStart: Date | null; taskEnd: Date | null },
        edge: 'left' | 'right' | 'move'
    ) => {
        e.stopPropagation();
        e.preventDefault();
        if (!task.taskStart || !task.taskEnd) return;

        setResizing({
            taskId: task.id,
            edge,
            initialX: e.clientX,
            initialStart: task.taskStart,
            initialEnd: task.taskEnd,
        });
    }, []);

    // Handle mouse move for resizing/dragging
    useEffect(() => {
        if (!resizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!scrollContainerRef.current || !resizing) return;

            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            const scrollLeft = scrollContainerRef.current.scrollLeft;
            const newDate = calculateDateFromX(e.clientX, containerRect, scrollLeft);

            let newStart: Date;
            let newEnd: Date;

            if (resizing.edge === 'move') {
                // Moving the entire task bar - preserve duration
                const initialStartDate = calculateDateFromX(resizing.initialX, containerRect, scrollLeft);
                const daysDiff = differenceInDays(newDate, initialStartDate);

                newStart = addDays(resizing.initialStart, daysDiff);
                newEnd = addDays(resizing.initialEnd, daysDiff);
            } else {
                // Find the current task to get its current dates
                const currentTask = timelineTasks.find(t => t.id === resizing.taskId);
                if (!currentTask || !currentTask.taskStart || !currentTask.taskEnd) return;

                // Calculate new start and end based on edge being resized
                newStart = currentTask.taskStart;
                newEnd = currentTask.taskEnd;

                if (resizing.edge === 'left') {
                    // Moving start date - ensure it doesn't go past end date
                    if (newDate <= currentTask.taskEnd) {
                        newStart = newDate;
                    }
                } else {
                    // Moving end date - ensure it doesn't go before start date
                    if (newDate >= currentTask.taskStart) {
                        newEnd = newDate;
                    }
                }
            }

            // Update task via prop callback
            if (onTaskUpdate) {
                onTaskUpdate(resizing.taskId, {
                    startDate: format(newStart, 'yyyy-MM-dd'),
                    dueDate: format(newEnd, 'yyyy-MM-dd'),
                });
            }
        };

        const handleMouseUp = () => {
            justFinishedResizing.current = true;
            setResizing(null);
            // Reset the flag after a short delay to allow click event to be ignored
            setTimeout(() => {
                justFinishedResizing.current = false;
            }, 100);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing, calculateDateFromX, onTaskUpdate, timelineTasks]);

    return (
        <div style={{
            backgroundColor: theme.bg,
            borderRadius: '12px',
            padding: '20px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ margin: 0, color: theme.text, fontSize: '20px' }}>Timeline</h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* View Range Toggle */}
                    <div style={{
                        display: 'flex',
                        backgroundColor: theme.surface,
                        borderRadius: '20px',
                        padding: '4px',
                    }}>
                        {(['week', 'month', '3months'] as ViewRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setViewRange(range)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '16px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    backgroundColor: viewRange === range ? theme.primary : 'transparent',
                                    color: viewRange === range ? '#fff' : theme.textMuted,
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {range === '3months' ? '3M' : range.charAt(0).toUpperCase() + range.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Navigation */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            onClick={() => navigate('prev')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${theme.border}`,
                                backgroundColor: 'transparent',
                                color: theme.text,
                                cursor: 'pointer',
                            }}
                        >
                            ←
                        </button>
                        <button
                            onClick={goToToday}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${theme.border}`,
                                backgroundColor: 'transparent',
                                color: theme.text,
                                cursor: 'pointer',
                            }}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => navigate('next')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${theme.border}`,
                                backgroundColor: 'transparent',
                                color: theme.text,
                                cursor: 'pointer',
                            }}
                        >
                            →
                        </button>
                    </div>
                </div>
            </div>

            {/* Timeline Grid */}
            <div
                ref={scrollContainerRef}
                style={{
                    flex: 1,
                    overflow: 'auto',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: resizing ? 'ew-resize' : 'default',
                }}
            >
                <div style={{ minWidth: `${totalDays * dayWidth + 200}px` }}>
                    {/* Date Headers */}
                    <div style={{
                        display: 'flex',
                        borderBottom: `1px solid ${theme.border}`,
                        position: 'sticky',
                        top: 0,
                        backgroundColor: theme.surface,
                        zIndex: 10,
                    }}>
                        {/* Task Name Column Header */}
                        <div style={{
                            width: '200px',
                            minWidth: '200px',
                            padding: '12px',
                            borderRight: `1px solid ${theme.border}`,
                            fontWeight: 600,
                            color: theme.text,
                            position: 'sticky',
                            left: 0,
                            backgroundColor: theme.surface,
                            zIndex: 11,
                        }}>
                            Task
                        </div>

                        {/* Date Headers */}
                        <div style={{ display: 'flex' }}>
                            {days.map((day, index) => {
                                const isToday = isSameDay(day, new Date());
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                const isFirstOfMonth = day.getDate() === 1;
                                const prevDay = index > 0 ? days[index - 1] : null;
                                const isNewMonth = prevDay && day.getMonth() !== prevDay.getMonth();
                                const showMonthYear = index === 0 || isFirstOfMonth || isNewMonth;

                                // Day of week abbreviations in Japanese
                                const dayOfWeekJP = ['日', '月', '火', '水', '木', '金', '土'][day.getDay()];

                                return (
                                    <div
                                        key={index}
                                        style={{
                                            width: `${dayWidth}px`,
                                            minWidth: `${dayWidth}px`,
                                            padding: '4px 2px',
                                            textAlign: 'center',
                                            fontSize: viewRange === 'week' ? '11px' : '9px',
                                            color: isToday ? theme.primary : isWeekend ? theme.textMuted : theme.text,
                                            fontWeight: isToday ? 700 : 400,
                                            borderRight: `1px solid ${theme.border}`,
                                            backgroundColor: isToday ? `${theme.primary}20` : 'transparent',
                                        }}
                                    >
                                        {/* Show year when month changes */}
                                        {showMonthYear && (
                                            <div style={{
                                                fontSize: viewRange === 'week' ? '10px' : viewRange === 'month' ? '8px' : '7px',
                                                color: theme.primary,
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                            }}>
                                                {viewRange === '3months' ? format(day, 'yy') : format(day, 'yyyy')}
                                            </div>
                                        )}
                                        {/* Show month for all days */}
                                        <div style={{
                                            fontSize: viewRange === 'week' ? '9px' : viewRange === 'month' ? '7px' : '6px',
                                            color: theme.textMuted,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {format(day, 'M')}月
                                        </div>
                                        {/* Day number */}
                                        <div style={{ fontWeight: isToday ? 700 : 500 }}>
                                            {format(day, 'd')}
                                        </div>
                                        {/* Day of week */}
                                        <div style={{
                                            fontSize: viewRange === 'week' ? '10px' : '8px',
                                            color: day.getDay() === 0 ? '#ef4444' : day.getDay() === 6 ? '#3b82f6' : theme.textMuted,
                                        }}>
                                            {viewRange === 'week' ? format(day, 'EEE') : dayOfWeekJP}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Task Rows */}
                    {timelineTasks.length === 0 ? (
                        <div style={{
                            padding: '40px',
                            textAlign: 'center',
                            color: theme.textMuted,
                        }}>
                            No tasks to display. Create a new task to see it on the timeline.
                        </div>
                    ) : (
                        <DndContext
                            sensors={dndSensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={timelineTasks.map(t => t.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {timelineTasks.map((task) => {
                                    const position = getTaskPosition(task);
                                    return (
                                        <SortableTaskRow
                                            key={task.id}
                                            task={task}
                                            position={position}
                                            theme={theme}
                                            dayWidth={dayWidth}
                                            days={days}
                                            resizing={resizing}
                                            onTaskClick={onTaskClick}
                                            onTaskUpdate={onTaskUpdate}
                                            handleResizeStart={handleResizeStart}
                                            justFinishedResizing={justFinishedResizing}
                                            getStatusColor={getStatusColor}
                                            getPriorityColor={getPriorityColor}
                                        />
                                    );
                                })}
                            </SortableContext>
                            <DragOverlay>
                                {activeTask ? (
                                    <div
                                        style={{
                                            display: 'flex',
                                            borderBottom: `1px solid ${theme.border}`,
                                            minHeight: '50px',
                                            backgroundColor: theme.bg,
                                            opacity: 0.9,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '200px',
                                                minWidth: '200px',
                                                padding: '12px',
                                                borderRight: `1px solid ${theme.border}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                backgroundColor: theme.bg,
                                            }}
                                        >
                                            <div style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                backgroundColor: getStatusColor(activeTask.status),
                                                flexShrink: 0,
                                            }} />
                                            <span style={{
                                                color: theme.text,
                                                fontSize: '13px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {activeTask.title}
                                            </span>
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>
            </div>
        </div>
    );
};
