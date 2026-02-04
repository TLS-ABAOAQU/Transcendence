import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
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
    addDays,
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
    startCol: number;
    endCol: number;
    isStart: boolean;
    isEnd: boolean;
    lane: number;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onTaskClick, onTaskUpdate }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('month');

    // Dragging task (for HTML5 drag and drop - move to any cell)
    const [draggingTask, setDraggingTask] = useState<Task | TaskWithDates | null>(null);

    // Resize state (for edge dragging only)
    const [resizeState, setResizeState] = useState<{
        taskId: string;
        mode: 'resize-start' | 'resize-end';
        initialX: number;
        initialStart: Date;
        initialEnd: Date;
        currentDaysDelta: number;
    } | null>(null);

    const calendarGridRef = useRef<HTMLDivElement>(null);

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

    // Calculate task segments for each week
    const getTaskSegmentsForWeek = useCallback((week: Date[]): TaskSegment[] => {
        const weekStart = week[0];
        const weekEnd = week[6];
        const segments: TaskSegment[] = [];

        tasksWithDates.forEach(task => {
            if (task.taskEnd < weekStart || task.taskStart > weekEnd) {
                return;
            }

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
                lane: 0,
            });
        });

        // Sort by start date (earlier first), then by end date (earlier first)
        segments.sort((a, b) => {
            // First, compare by actual task start date
            const startDiff = a.task.taskStart.getTime() - b.task.taskStart.getTime();
            if (startDiff !== 0) return startDiff;
            // If start dates are the same, earlier end date comes first
            return a.task.taskEnd.getTime() - b.task.taskEnd.getTime();
        });

        // Assign lanes
        const lanes: number[][] = [];
        segments.forEach(segment => {
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
    }, [tasksWithDates, tasks]);

    // Color palette for tasks
    const taskColors = [
        '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
        '#EF4444', '#EC4899', '#06B6D4', '#F97316',
    ];

    const getTaskColor = (taskId: string) => {
        let hash = 0;
        for (let i = 0; i < taskId.length; i++) {
            hash = taskId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return taskColors[Math.abs(hash) % taskColors.length];
    };

    const headerTitle = viewMode === 'month'
        ? format(currentDate, 'yyyy年M月')
        : `${format(currentWeek[0], 'yyyy年M月d日')} 〜 ${format(currentWeek[6], 'M月d日')}`;

    // Handle drag start for task bar (HTML5 drag for moving)
    const handleTaskBarDragStart = useCallback((
        e: React.DragEvent,
        task: TaskWithDates
    ) => {
        setDraggingTask(task);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.setData('application/task-duration', String(differenceInDays(task.taskEnd, task.taskStart)));

        // Create a custom drag image (optional, improves UX)
        const dragImage = document.createElement('div');
        dragImage.textContent = task.title;
        dragImage.style.cssText = 'position: absolute; top: -1000px; padding: 4px 8px; background: #3B82F6; color: white; border-radius: 4px; font-size: 12px;';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        setTimeout(() => document.body.removeChild(dragImage), 0);
    }, []);

    // Handle resize start (mouse drag for edges)
    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        task: TaskWithDates,
        mode: 'resize-start' | 'resize-end'
    ) => {
        e.preventDefault();
        e.stopPropagation();
        setResizeState({
            taskId: task.id,
            mode,
            initialX: e.clientX,
            initialStart: task.taskStart,
            initialEnd: task.taskEnd,
            currentDaysDelta: 0,
        });
    }, []);

    // Calculate target date from mouse position
    const getDateFromMousePosition = useCallback((e: MouseEvent): Date | null => {
        if (!calendarGridRef.current) return null;

        const gridRect = calendarGridRef.current.getBoundingClientRect();

        if (viewMode === 'month') {
            // Month view: need to account for week number column (40px) and calculate row
            const gridLeft = gridRect.left + 40; // Skip week number column
            const gridWidth = gridRect.width - 40;
            const dayWidth = gridWidth / 7;

            // Find the week rows container
            const weekRowsContainer = calendarGridRef.current.querySelector('div[style*="overflow: auto"]');
            if (!weekRowsContainer) return null;

            const containerRect = weekRowsContainer.getBoundingClientRect();
            const scrollTop = (weekRowsContainer as HTMLElement).scrollTop;
            const relativeY = e.clientY - containerRect.top + scrollTop;

            // Find which week row we're in by checking accumulated heights
            const weekRows = weekRowsContainer.querySelectorAll(':scope > div');
            let accumulatedHeight = 0;
            let weekIndex = 0;

            for (let i = 0; i < weekRows.length; i++) {
                const rowHeight = (weekRows[i] as HTMLElement).offsetHeight;
                if (relativeY < accumulatedHeight + rowHeight) {
                    weekIndex = i;
                    break;
                }
                accumulatedHeight += rowHeight;
                weekIndex = i;
            }

            // Calculate day index within the week
            const relativeX = e.clientX - gridLeft;
            const dayIndex = Math.floor(relativeX / dayWidth);
            const clampedDayIndex = Math.max(0, Math.min(6, dayIndex));
            const clampedWeekIndex = Math.max(0, Math.min(weeks.length - 1, weekIndex));

            if (weeks[clampedWeekIndex]) {
                return weeks[clampedWeekIndex][clampedDayIndex];
            }
        } else {
            // Week view: simpler calculation
            const dayWidth = gridRect.width / 7;
            const relativeX = e.clientX - gridRect.left;
            const dayIndex = Math.floor(relativeX / dayWidth);
            const clampedDayIndex = Math.max(0, Math.min(6, dayIndex));
            return currentWeek[clampedDayIndex];
        }

        return null;
    }, [viewMode, weeks, currentWeek]);

    // Handle mouse move for resizing
    useEffect(() => {
        if (!resizeState || !calendarGridRef.current) return;

        const handleMouseMove = (e: MouseEvent) => {
            const targetDate = getDateFromMousePosition(e);
            if (!targetDate) return;

            let daysDelta: number;
            if (resizeState.mode === 'resize-start') {
                daysDelta = differenceInDays(targetDate, resizeState.initialStart);
            } else {
                daysDelta = differenceInDays(targetDate, resizeState.initialEnd);
            }

            if (daysDelta !== resizeState.currentDaysDelta) {
                setResizeState(prev => prev ? { ...prev, currentDaysDelta: daysDelta } : null);
            }
        };

        const handleMouseUp = () => {
            if (resizeState.currentDaysDelta !== 0 && onTaskUpdate) {
                let newStart = resizeState.initialStart;
                let newEnd = resizeState.initialEnd;

                if (resizeState.mode === 'resize-start') {
                    newStart = addDays(resizeState.initialStart, resizeState.currentDaysDelta);
                    if (newStart > resizeState.initialEnd) {
                        newStart = resizeState.initialEnd;
                    }
                } else if (resizeState.mode === 'resize-end') {
                    newEnd = addDays(resizeState.initialEnd, resizeState.currentDaysDelta);
                    if (newEnd < resizeState.initialStart) {
                        newEnd = resizeState.initialStart;
                    }
                }

                onTaskUpdate(resizeState.taskId, {
                    startDate: format(newStart, 'yyyy-MM-dd'),
                    dueDate: format(newEnd, 'yyyy-MM-dd'),
                });
            }
            setResizeState(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizeState, onTaskUpdate, getDateFromMousePosition]);

    // Handle drop on calendar cell
    const handleDropOnCell = useCallback((e: React.DragEvent, targetDate: Date) => {
        e.preventDefault();
        if (!draggingTask || !onTaskUpdate) return;

        const durationStr = e.dataTransfer.getData('application/task-duration');
        const duration = durationStr ? parseInt(durationStr, 10) : 0;

        const newStartDate = format(targetDate, 'yyyy-MM-dd');
        const newEndDate = duration > 0 ? format(addDays(targetDate, duration), 'yyyy-MM-dd') : newStartDate;

        onTaskUpdate(draggingTask.id, {
            startDate: newStartDate,
            dueDate: newEndDate,
        });
        setDraggingTask(null);
    }, [draggingTask, onTaskUpdate]);

    // Handle drop on undated area (remove dates)
    const handleDropOnUndated = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!draggingTask || !onTaskUpdate) return;

        onTaskUpdate(draggingTask.id, {
            startDate: undefined,
            dueDate: undefined,
        });
        setDraggingTask(null);
    }, [draggingTask, onTaskUpdate]);


    // Render task bar segment
    const renderTaskSegment = (segment: TaskSegment, weekIndex: number, isWeekView: boolean = false) => {
        const { task, startCol, endCol, isStart, isEnd, lane } = segment;
        const taskColor = getTaskColor(task.id);

        const isResizing = resizeState?.taskId === task.id;
        const daysDelta = isResizing ? resizeState.currentDaysDelta : 0;
        const isDraggingThis = draggingTask?.id === task.id;

        // Calculate adjusted positions based on resize
        let adjustedStartCol = startCol;
        let adjustedEndCol = endCol;

        if (isResizing) {
            if (resizeState.mode === 'resize-start') {
                adjustedStartCol = Math.min(startCol + daysDelta, endCol);
            } else if (resizeState.mode === 'resize-end') {
                adjustedEndCol = Math.max(endCol + daysDelta, startCol);
            }
        }

        const spanWidth = adjustedEndCol - adjustedStartCol + 1;
        const leftPercent = (adjustedStartCol / 7) * 100;
        const widthPercent = (spanWidth / 7) * 100;

        const topOffset = isWeekView ? 60 : 44;
        const laneHeight = isWeekView ? 32 : 26;
        const barHeight = isWeekView ? 28 : 22;

        return (
            <div
                key={`${task.id}-${weekIndex}`}
                draggable={!isResizing}
                onDragStart={(e) => handleTaskBarDragStart(e, task)}
                onDragEnd={() => setDraggingTask(null)}
                style={{
                    position: 'absolute',
                    left: `calc(${leftPercent}% + 4px)`,
                    width: `calc(${widthPercent}% - 8px)`,
                    top: `${topOffset + lane * laneHeight}px`,
                    height: `${barHeight}px`,
                    backgroundColor: taskColor,
                    borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: isResizing ? 'ew-resize' : 'grab',
                    opacity: isDraggingThis ? 0.5 : 1,
                    zIndex: isResizing || isDraggingThis ? 100 : 10,
                    boxShadow: isResizing ? '0 4px 12px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.2)',
                    transition: isResizing ? 'none' : 'box-shadow 0.15s ease',
                    overflow: 'hidden',
                }}
                title={task.title}
                onClick={(e) => {
                    if (!isResizing && !isDraggingThis) {
                        e.stopPropagation();
                        onTaskClick?.(task);
                    }
                }}
            >
                {/* Left resize handle */}
                {isStart && (
                    <div
                        onMouseDown={(e) => handleResizeStart(e, task, 'resize-start')}
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '10px',
                            cursor: 'ew-resize',
                            zIndex: 2,
                        }}
                    />
                )}

                {/* Center content */}
                <div
                    style={{
                        position: 'absolute',
                        left: isStart ? '10px' : '0',
                        right: isEnd ? '10px' : '0',
                        top: 0,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: isStart ? '4px' : '8px',
                        paddingRight: isEnd ? '4px' : '8px',
                        pointerEvents: 'none',
                        overflow: 'hidden',
                    }}
                >
                    {isStart && (
                        <span
                            style={{
                                fontSize: isWeekView ? '12px' : '11px',
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

                {/* Right resize handle */}
                {isEnd && (
                    <div
                        onMouseDown={(e) => handleResizeStart(e, task, 'resize-end')}
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            bottom: 0,
                            width: '10px',
                            cursor: 'ew-resize',
                            zIndex: 2,
                        }}
                    />
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

                {/* Undated Tasks Section - horizontally scrollable, also drop target */}
                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.backgroundColor = isDarkMode ? '#4B5563' : '#D1D5DB';
                    }}
                    onDragLeave={(e) => {
                        e.currentTarget.style.backgroundColor = theme.buttonBg;
                    }}
                    onDrop={(e) => {
                        e.currentTarget.style.backgroundColor = theme.buttonBg;
                        handleDropOnUndated(e);
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        backgroundColor: theme.buttonBg,
                        borderRadius: '22px',
                        height: '44px',
                        padding: '0 4px',
                        transition: 'background-color 0.15s ease',
                    }}
                >
                    {undatedTasks.length > 0 ? (
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                overflowX: 'auto',
                                padding: '4px 8px',
                                scrollbarWidth: 'thin',
                                scrollbarColor: `${theme.borderStrong} transparent`,
                            }}
                        >
                            {undatedTasks.map(task => {
                                const taskColor = getTaskColor(task.id);
                                const isDraggingThis = draggingTask?.id === task.id;
                                return (
                                    <div
                                        key={task.id}
                                        draggable
                                        onDragStart={(e) => {
                                            setDraggingTask(task);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', task.id);
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
                                            opacity: isDraggingThis ? 0.5 : 1,
                                        }}
                                        title={`${task.title} - ドラッグしてカレンダーにドロップ`}
                                    >
                                        {task.title}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div
                            style={{
                                padding: '4px 12px',
                                fontSize: '12px',
                                color: theme.textMuted,
                            }}
                        >
                            ここにドロップで日付解除
                        </div>
                    )}
                </div>

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
            <div ref={calendarGridRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Weekday Headers */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: viewMode === 'month' ? '40px repeat(7, 1fr)' : 'repeat(7, 1fr)',
                        borderBottom: `1px solid ${theme.borderStrong}`,
                        backgroundColor: theme.headerBg,
                    }}
                >
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

                                    {/* Days Grid */}
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
                                                    e.currentTarget.style.backgroundColor = isCurrentMonth ? theme.cardBg : theme.bg;
                                                    handleDropOnCell(e, day);
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'flex-start',
                                                    alignItems: 'stretch',
                                                    padding: '8px',
                                                    borderRight: dayIndex < 6 ? `1px solid ${theme.border}` : 'none',
                                                    backgroundColor: isCurrentMonth ? theme.cardBg : theme.bg,
                                                    transition: 'background-color 0.15s ease',
                                                    minHeight: '100%',
                                                }}
                                            >
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-start',
                                                    alignItems: 'center',
                                                    height: '36px',
                                                    flexShrink: 0,
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

                                    {/* Task Bars */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: '40px',
                                            right: 0,
                                            bottom: 0,
                                            pointerEvents: 'auto',
                                        }}
                                        onDragOver={(e) => {
                                            // Allow drop events to pass through to cells
                                            if (draggingTask) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onDrop={(e) => {
                                            // Calculate which day was dropped on based on mouse position
                                            if (!draggingTask || !onTaskUpdate) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const dayWidth = rect.width / 7;
                                            const dayIndex = Math.floor(x / dayWidth);
                                            const targetDay = week[Math.max(0, Math.min(6, dayIndex))];

                                            const durationStr = e.dataTransfer.getData('application/task-duration');
                                            const duration = durationStr ? parseInt(durationStr, 10) : 0;

                                            const newStartDate = format(targetDay, 'yyyy-MM-dd');
                                            const newEndDate = duration > 0 ? format(addDays(targetDay, duration), 'yyyy-MM-dd') : newStartDate;

                                            onTaskUpdate(draggingTask.id, {
                                                startDate: newStartDate,
                                                dueDate: newEndDate,
                                            });
                                            setDraggingTask(null);
                                        }}
                                    >
                                        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                                            {segments.map(segment => renderTaskSegment(segment, weekIndex, false))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Week View */}
                {viewMode === 'week' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {(() => {
                            const segments = getTaskSegmentsForWeek(currentWeek);
                            const maxLane = segments.length > 0 ? Math.max(...segments.map(s => s.lane)) : -1;
                            const contentHeight = Math.max(300, 70 + (maxLane + 1) * 32);

                            return (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(7, 1fr)',
                                        flex: 1,
                                        position: 'relative',
                                        minHeight: `${contentHeight}px`,
                                    }}
                                >
                                    {currentWeek.map((day, dayIndex) => {
                                        const isToday = isSameDay(day, new Date());
                                        const dayNum = format(day, 'd');
                                        const dayLabel = `${dayNum}日`;

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
                                                    e.currentTarget.style.backgroundColor = theme.cardBg;
                                                    handleDropOnCell(e, day);
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    justifyContent: 'flex-start',
                                                    alignItems: 'stretch',
                                                    padding: '12px',
                                                    borderRight: dayIndex < 6 ? `1px solid ${theme.border}` : 'none',
                                                    backgroundColor: theme.cardBg,
                                                    transition: 'background-color 0.15s ease',
                                                    minHeight: '100%',
                                                }}
                                            >
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-start',
                                                    alignItems: 'center',
                                                    height: '44px',
                                                    marginBottom: '8px',
                                                    flexShrink: 0,
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
                                            </div>
                                        );
                                    })}

                                    {/* Task Bars for Week View */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            pointerEvents: 'auto',
                                        }}
                                        onDragOver={(e) => {
                                            if (draggingTask) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onDrop={(e) => {
                                            if (!draggingTask || !onTaskUpdate) return;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = e.clientX - rect.left;
                                            const dayWidth = rect.width / 7;
                                            const dayIndex = Math.floor(x / dayWidth);
                                            const targetDay = currentWeek[Math.max(0, Math.min(6, dayIndex))];

                                            const durationStr = e.dataTransfer.getData('application/task-duration');
                                            const duration = durationStr ? parseInt(durationStr, 10) : 0;

                                            const newStartDate = format(targetDay, 'yyyy-MM-dd');
                                            const newEndDate = duration > 0 ? format(addDays(targetDay, duration), 'yyyy-MM-dd') : newStartDate;

                                            onTaskUpdate(draggingTask.id, {
                                                startDate: newStartDate,
                                                dueDate: newEndDate,
                                            });
                                            setDraggingTask(null);
                                        }}
                                    >
                                        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                                            {segments.map(segment => renderTaskSegment(segment, 0, true))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
};
