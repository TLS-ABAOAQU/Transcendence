import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjects } from '../../context/ProjectContext';
import { useKeyboardStore } from '../../store/keyboardStore';
import {
    DndContext,
    pointerWithin,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from '../../components/SortableItem';
import { Droppable } from '../../components/Droppable';
import { CalendarView } from './CalendarView';
import { TimelineView } from './TimelineView';
import { HistoryTimeline } from '../history/HistoryTimeline';
import { DateWheelPicker, TimeWheelPicker } from '../../components/WheelPicker';
import type { Status, Priority, Task, ChecklistItem } from '../../types';
import './Board.css';

const COLUMNS: { id: Status; title: string }[] = [
    { id: 'todo', title: 'To Do' },
    { id: 'standby', title: 'Standby' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done' },
];

interface BoardProps {
    commandRef?: React.MutableRefObject<((cmd: string, task?: Task) => void) | null>;
    commandPaletteOpen?: boolean;
    onViewModeChange?: (mode: 'board' | 'calendar' | 'timeline') => void;
}

export const Board: React.FC<BoardProps> = ({ commandRef, commandPaletteOpen, onViewModeChange }) => {
    const { projects, activeProjectId, setActiveProject, addTask, updateTask, deleteTask, reorderTasks, updateViewSettings, canUndo, canRedo } = useProjects();
    const project = projects.find((p) => p.id === activeProjectId);
    const [isAdding, setIsAdding] = useState(false);

    // Task Edit Modal State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editUrl2, setEditUrl2] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editStartTime, setEditStartTime] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editDueTime, setEditDueTime] = useState('');
    const [editPriority, setEditPriority] = useState<Priority>('medium');
    const [editStarred, setEditStarred] = useState(false);
    const [editTags, setEditTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([]);
    const [checklistInput, setChecklistInput] = useState('');

    // Wheel Picker visibility states
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showDueDatePicker, setShowDueDatePicker] = useState(false);
    const [showDueTimePicker, setShowDueTimePicker] = useState(false);

    // Toast notification state
    const [toastMessage, setToastMessage] = useState('');
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastMessage(''), 1500);
    }, []);

    // Track the last modified task ID (for yellow border highlight)
    // This is NOT stored in Zustand to avoid creating history entries
    const [lastModifiedTaskId, setLastModifiedTaskId] = useState<string | null>(null);

    // Modal-specific undo/redo history
    interface ModalState {
        title: string;
        desc: string;
        url: string;
        url2: string;
        startDate: string;
        startTime: string;
        dueDate: string;
        dueTime: string;
        priority: Priority;
        starred: boolean;
        tags: string[];
        checklist: ChecklistItem[];
    }
    const modalHistoryRef = useRef<ModalState[]>([]);
    const modalHistoryIndexRef = useRef(-1);
    // Force re-render is not needed since undo/redo restore state directly

    const getCurrentModalState = useCallback((): ModalState => ({
        title: editTitle,
        desc: editDesc,
        url: editUrl,
        url2: editUrl2,
        startDate: editStartDate,
        startTime: editStartTime,
        dueDate: editDueDate,
        dueTime: editDueTime,
        priority: editPriority,
        starred: editStarred,
        tags: [...editTags],
        checklist: editChecklist.map(item => ({ ...item })),
    }), [editTitle, editDesc, editUrl, editUrl2, editStartDate, editStartTime, editDueDate, editDueTime, editPriority, editStarred, editTags, editChecklist]);

    const saveModalState = useCallback((overrides?: Partial<ModalState>) => {
        const currentState = getCurrentModalState();
        const stateToSave = overrides ? { ...currentState, ...overrides } : currentState;

        // Deduplicate: don't save if identical to last entry
        const idx = modalHistoryIndexRef.current;
        if (idx >= 0 && idx < modalHistoryRef.current.length) {
            const last = modalHistoryRef.current[idx];
            if (JSON.stringify(last) === JSON.stringify(stateToSave)) return;
        }

        const newHistory = modalHistoryRef.current.slice(0, idx + 1);
        newHistory.push(stateToSave);
        modalHistoryRef.current = newHistory.slice(-20);
        modalHistoryIndexRef.current = Math.min(idx + 1, 19);
    }, [getCurrentModalState]);

    const restoreModalState = useCallback((state: ModalState) => {
        setEditTitle(state.title);
        setEditDesc(state.desc);
        setEditUrl(state.url);
        setEditUrl2(state.url2);
        setEditStartDate(state.startDate);
        setEditStartTime(state.startTime);
        setEditDueDate(state.dueDate);
        setEditDueTime(state.dueTime);
        setEditPriority(state.priority);
        setEditStarred(state.starred);
        setEditTags([...state.tags]);
        setEditChecklist(state.checklist.map(item => ({ ...item })));
    }, []);

    const modalUndo = useCallback(() => {
        // First, save current state if it differs from head (auto-save unsaved changes)
        const current = getCurrentModalState();
        const idx = modalHistoryIndexRef.current;
        const history = modalHistoryRef.current;
        if (idx >= 0 && idx < history.length) {
            if (JSON.stringify(current) !== JSON.stringify(history[idx])) {
                // Current state differs from last saved — save it first
                const newHistory = history.slice(0, idx + 1);
                newHistory.push(current);
                modalHistoryRef.current = newHistory.slice(-20);
                modalHistoryIndexRef.current = Math.min(idx + 1, 19);
            }
        }

        const newIdx = modalHistoryIndexRef.current;
        if (newIdx > 0) {
            const prevState = modalHistoryRef.current[newIdx - 1];
            restoreModalState(prevState);
            modalHistoryIndexRef.current = newIdx - 1;
            showToast('Undo');
        }
    }, [getCurrentModalState, restoreModalState, showToast]);

    const modalRedo = useCallback(() => {
        const idx = modalHistoryIndexRef.current;
        const history = modalHistoryRef.current;
        if (idx < history.length - 1) {
            const nextState = history[idx + 1];
            restoreModalState(nextState);
            modalHistoryIndexRef.current = idx + 1;
            showToast('Redo');
        }
    }, [restoreModalState, showToast]);

    // Refs to always read latest state in event handlers (avoids stale closures)
    const canUndoRef = useRef(canUndo);
    const canRedoRef = useRef(canRedo);
    canUndoRef.current = canUndo;
    canRedoRef.current = canRedo;
    const editingTaskRef = useRef(editingTask);
    const isAddingRef = useRef(isAdding);
    const commandPaletteOpenRef = useRef(commandPaletteOpen);
    editingTaskRef.current = editingTask;
    isAddingRef.current = isAdding;
    commandPaletteOpenRef.current = commandPaletteOpen;
    const modalUndoRef = useRef(modalUndo);
    modalUndoRef.current = modalUndo;
    const modalRedoRef = useRef(modalRedo);
    modalRedoRef.current = modalRedo;

    // Handle modal-specific undo/redo
    // Uses refs only — stable listener, never re-registered
    useEffect(() => {
        const handleModalUndoRedo = (e: KeyboardEvent) => {
            // Priority check: パレット/履歴開なら無視
            const priority = useKeyboardStore.getState().getTopPriority();
            if (priority === 'palette' || priority === 'history') return;

            if ((editingTaskRef.current || isAddingRef.current) && (e.metaKey || e.ctrlKey)) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    modalUndoRef.current();
                } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    modalRedoRef.current();
                }
            }
        };
        window.addEventListener('keydown', handleModalUndoRedo);
        return () => window.removeEventListener('keydown', handleModalUndoRedo);
    }, []);

    // Board-level undo/redo toast — uses refs for stable listener

    useEffect(() => {
        const handleBoardUndoRedoToast = (e: KeyboardEvent) => {
            // Priority check: パレット/ピッカー開なら無視
            const priority = useKeyboardStore.getState().getTopPriority();
            if (priority === 'palette' || priority === 'picker') return;

            if (editingTaskRef.current || isAddingRef.current) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                if (canUndoRef.current) showToast('Undo');
            } else if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
                if (canRedoRef.current) showToast('Redo');
            }
        };
        window.addEventListener('keydown', handleBoardUndoRedoToast);
        return () => window.removeEventListener('keydown', handleBoardUndoRedoToast);
    }, [showToast]);

    // ESC / Backspace → navigate back to dashboard
    // Uses getTopPriority() for consistent priority handling
    useEffect(() => {
        const handleBackNavigation = (e: KeyboardEvent) => {
            // Skip if modifier keys are held
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            const priority = useKeyboardStore.getState().getTopPriority();

            if (e.key === 'Escape') {
                // パレット/履歴は自身でESCを処理
                if (priority === 'palette' || priority === 'history') return;

                // ピッカーを閉じる（一つずつ）
                if (priority === 'picker') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (showStartDatePickerRef.current) { setShowStartDatePicker(false); return; }
                    if (showStartTimePickerRef.current) { setShowStartTimePicker(false); return; }
                    if (showDueDatePickerRef.current) { setShowDueDatePicker(false); return; }
                    if (showDueTimePickerRef.current) { setShowDueTimePicker(false); return; }
                    return;
                }

                // モーダルは自身でESCを処理
                if (priority === 'modal') return;

                // 何も開いていない → ダッシュボードに戻る
                e.preventDefault();
                setActiveProject(null);
            }

            if (e.key === 'Backspace') {
                // 何か開いているなら無視
                if (priority !== 'none') return;
                // 入力欄にフォーカスしていたら無視
                const active = document.activeElement;
                const isEditable = active instanceof HTMLInputElement ||
                    active instanceof HTMLTextAreaElement ||
                    (active instanceof HTMLElement && active.isContentEditable);
                if (isEditable) return;
                e.preventDefault();
                setActiveProject(null);
            }
        };
        window.addEventListener('keydown', handleBackNavigation);
        return () => window.removeEventListener('keydown', handleBackNavigation);
    }, [setActiveProject]);

    // Modal interaction refs
    const mouseDownInsideModal = useRef(false);

    // Focus restoration ref
    const lastEditedTaskIdRef = useRef<string | null>(null);

    // Focus management refs
    const titleRef = useRef<HTMLInputElement>(null);
    const startDateRef = useRef<HTMLInputElement>(null);
    const startTimeRef = useRef<HTMLInputElement>(null);
    const dueDateRef = useRef<HTMLInputElement>(null);
    const dueTimeRef = useRef<HTMLInputElement>(null);
    const todayBtnRef = useRef<HTMLButtonElement>(null);
    const resetDateRef = useRef<HTMLButtonElement>(null);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    const tagsInputRef = useRef<HTMLInputElement>(null);
    const checklistInputRef = useRef<HTMLInputElement>(null);
    const urlRef = useRef<HTMLInputElement>(null);
    const url2Ref = useRef<HTMLInputElement>(null);
    const deleteBtnRef = useRef<HTMLButtonElement>(null);
    const cancelBtnRef = useRef<HTMLButtonElement>(null);
    const saveBtnRef = useRef<HTMLButtonElement>(null);
    const modalContentRef = useRef<HTMLDivElement>(null);

    // Date input segment tracking (0=year, 1=month, 2=day)
    const startDateSegmentRef = useRef(0);
    const dueDateSegmentRef = useRef(0);

    // Time input segment tracking (0=hour, 1=minute)
    const startTimeSegmentRef = useRef(0);
    const dueTimeSegmentRef = useRef(0);

    // Computed project-wide tags
    const projectTags = useMemo(() => {
        if (!project) return [];
        const allTags = new Set<string>();
        project.tasks.forEach(task => task.tags?.forEach(tag => allTags.add(tag)));
        return Array.from(allTags).sort();
    }, [project]);

    // DxND State
    const [activeId, setActiveId] = useState<string | null>(null);

    // Date confirmation modal state (for drag-and-drop)
    const [dateConfirmModal, setDateConfirmModal] = useState<{
        taskId: string;
        type: 'startDate' | 'dueDate' | 'resetStartDate';
        oldDate: string;
        targetStatus: Status;
    } | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    if (!project) return <div>Project not found</div>;

    const openNewTaskModal = () => {
        setEditingTask(null);
        setEditTitle('');
        setEditDesc('');
        setEditUrl('');
        setEditUrl2('');
        setEditStartDate('');
        setEditStartTime('');
        setEditDueDate('');
        setEditDueTime('');
        setEditPriority('medium');
        setEditStarred(false);
        setEditTags([]);
        setEditChecklist([]);
        setTagInput('');
        setChecklistInput('');
        setShowTagSuggestions(false);
        const initialState: ModalState = {
            title: '', desc: '', url: '', url2: '',
            startDate: '', startTime: '', dueDate: '', dueTime: '', priority: 'medium',
            starred: false, tags: [], checklist: [],
        };
        modalHistoryRef.current = [initialState];
        modalHistoryIndexRef.current = 0;
        setIsAdding(true);
    };

    const handleSaveNewTask = () => {
        if (!editTitle.trim()) return;
        // Validate: Due Date must be >= Start Date
        if (editStartDate && editDueDate && editDueDate < editStartDate) {
            alert('Due Date は Start Date と同じか、それより後の日付にしてください。');
            return;
        }
        addTask(project.id, {
            title: editTitle,
            description: editDesc,
            status: 'todo',
            priority: editPriority,
            url: editUrl,
            url2: editUrl2,
            startDate: editStartDate,
            startTime: editStartTime,
            dueDate: editDueDate,
            dueTime: editDueTime,
            starred: editStarred,
            tags: editTags,
            checklist: editChecklist,
        });
        setIsAdding(false);
    };

    const openTaskModal = (task: Task) => {
        lastEditedTaskIdRef.current = task.id;
        setEditingTask(task);
        setEditTitle(task.title);
        setEditDesc(task.description);
        setEditUrl(task.url || '');
        setEditUrl2(task.url2 || '');
        setEditStartDate(task.startDate || '');
        setEditStartTime(task.startTime || '');
        setEditDueDate(task.dueDate || '');
        setEditDueTime(task.dueTime || '');
        setEditPriority(task.priority);
        setEditStarred(task.starred || false);
        setEditTags(task.tags || []);
        setEditChecklist(task.checklist ? task.checklist.map(item => ({ ...item })) : []);
        setTagInput('');
        setChecklistInput('');
        setShowTagSuggestions(false);
        const initialState: ModalState = {
            title: task.title,
            desc: task.description,
            url: task.url || '',
            url2: task.url2 || '',
            startDate: task.startDate || '',
            startTime: task.startTime || '',
            dueDate: task.dueDate || '',
            dueTime: task.dueTime || '',
            priority: task.priority,
            starred: task.starred || false,
            tags: task.tags || [],
            checklist: task.checklist ? task.checklist.map(item => ({ ...item })) : [],
        };
        modalHistoryRef.current = [initialState];
        modalHistoryIndexRef.current = 0;
    };

    // Restore focus to the last edited task card
    const restoreFocusToTaskCard = () => {
        if (lastEditedTaskIdRef.current) {
            requestAnimationFrame(() => {
                const taskCard = document.querySelector(`[data-task-id="${lastEditedTaskIdRef.current}"]`) as HTMLElement;
                if (taskCard) {
                    taskCard.focus();
                }
            });
        }
    };

    // Arrow key navigation between task cards
    const handleArrowKeyNavigation = (key: string, currentColumnId: Status, currentIndex: number) => {
        const columnOrder: Status[] = ['todo', 'standby', 'in-progress', 'done'];
        const currentColIdx = columnOrder.indexOf(currentColumnId);

        if (key === 'ArrowUp' || key === 'ArrowDown') {
            // Move within the same column
            const newIndex = key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
            const targetCard = document.querySelector(`[data-column-id="${currentColumnId}"][data-task-index="${newIndex}"]`) as HTMLElement;
            if (targetCard) {
                targetCard.focus();
            }
        } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
            // Move to adjacent column
            const newColIdx = key === 'ArrowLeft' ? currentColIdx - 1 : currentColIdx + 1;
            if (newColIdx >= 0 && newColIdx < columnOrder.length) {
                const targetColumnId = columnOrder[newColIdx];
                // Try to focus the same index, or the last card if index is too high, or the first card
                let targetCard = document.querySelector(`[data-column-id="${targetColumnId}"][data-task-index="${currentIndex}"]`) as HTMLElement;
                if (!targetCard) {
                    // Try to find the last card in the target column
                    const allCardsInColumn = document.querySelectorAll(`[data-column-id="${targetColumnId}"]`);
                    if (allCardsInColumn.length > 0) {
                        targetCard = allCardsInColumn[Math.min(currentIndex, allCardsInColumn.length - 1)] as HTMLElement;
                    }
                }
                if (targetCard) {
                    targetCard.focus();
                }
            }
        }
    };

    // Check if there are unsaved changes
    const hasUnsavedChanges = (): boolean => {
        if (!editingTask) return false;
        return (
            editTitle !== editingTask.title ||
            editDesc !== editingTask.description ||
            editUrl !== (editingTask.url || '') ||
            editUrl2 !== (editingTask.url2 || '') ||
            editStartDate !== (editingTask.startDate || '') ||
            editStartTime !== (editingTask.startTime || '') ||
            editDueDate !== (editingTask.dueDate || '') ||
            editDueTime !== (editingTask.dueTime || '') ||
            editPriority !== editingTask.priority ||
            editStarred !== (editingTask.starred || false) ||
            JSON.stringify(editTags) !== JSON.stringify(editingTask.tags || []) ||
            JSON.stringify(editChecklist) !== JSON.stringify(editingTask.checklist || [])
        );
    };

    // Close without saving (discard changes)
    const closeTaskModal = () => {
        setEditingTask(null);
        restoreFocusToTaskCard();
    };

    // Close with unsaved changes confirmation
    const closeTaskModalWithConfirm = () => {
        if (hasUnsavedChanges()) {
            if (!confirm('未保存の変更があります。破棄しますか？')) {
                return; // User cancelled, don't close
            }
        }
        closeTaskModal();
    };

    // Cancel: discard changes and close (same as closeTaskModal now)
    const cancelTaskModal = () => {
        closeTaskModalWithConfirm();
    };

    const handleSaveTask = () => {
        if (!editingTask || !editTitle.trim()) return;
        // Validate: Due Date must be >= Start Date
        if (editStartDate && editDueDate && editDueDate < editStartDate) {
            alert('Due Date は Start Date と同じか、それより後の日付にしてください。');
            return;
        }
        updateTask(project.id, editingTask.id, {
            title: editTitle,
            description: editDesc,
            url: editUrl,
            url2: editUrl2,
            startDate: editStartDate,
            startTime: editStartTime,
            dueDate: editDueDate,
            dueTime: editDueTime,
            priority: editPriority,
            starred: editStarred,
            tags: editTags,
            checklist: editChecklist,
        });
        // Mark this task as the last modified (for yellow border)
        setLastModifiedTaskId(editingTask.id);
        setEditingTask(null);
        restoreFocusToTaskCard();
    };

    const handleDeleteTask = () => {
        if (!editingTask || !confirm('Delete this task?')) return;
        deleteTask(project.id, editingTask.id);
        lastEditedTaskIdRef.current = null; // Don't try to focus deleted task
        setEditingTask(null);
    };

    // Checklist helpers
    const addChecklistItem = (text: string) => {
        if (!text.trim()) return;
        const newItem: ChecklistItem = {
            id: crypto.randomUUID(),
            text: text.trim(),
            checked: false,
        };
        const newChecklist = [...editChecklist, newItem];
        setEditChecklist(newChecklist);
        setChecklistInput('');
        saveModalState({ checklist: newChecklist });
    };

    const toggleChecklistItem = (id: string) => {
        const toggled = editChecklist.map(item => {
            if (item.id !== id) return item;
            const nowChecked = !item.checked;
            return { ...item, checked: nowChecked, checkedAt: nowChecked ? Date.now() : undefined };
        });
        // Sort: checked items first (earlier checkedAt = higher), then unchecked in original order
        const checked = toggled.filter(i => i.checked).sort((a, b) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0));
        const unchecked = toggled.filter(i => !i.checked);
        const newChecklist = [...checked, ...unchecked];
        setEditChecklist(newChecklist);
        saveModalState({ checklist: newChecklist });
    };

    const removeChecklistItem = (id: string) => {
        const newChecklist = editChecklist.filter(item => item.id !== id);
        setEditChecklist(newChecklist);
        saveModalState({ checklist: newChecklist });
    };

    const updateChecklistItemText = (id: string, text: string) => {
        setEditChecklist(prev =>
            prev.map(item => item.id === id ? { ...item, text } : item)
        );
    };

    // === Cursor Position Helpers ===

    const isCursorAtStart = (el: HTMLInputElement | HTMLTextAreaElement): boolean => {
        return el.selectionStart === 0 && el.selectionEnd === 0;
    };

    const isCursorAtEnd = (el: HTMLInputElement | HTMLTextAreaElement): boolean => {
        const len = el.value.length;
        return el.selectionStart === len && el.selectionEnd === len;
    };

    const isCursorOnFirstLine = (el: HTMLTextAreaElement): boolean => {
        if (el.selectionStart !== el.selectionEnd) return false;
        const textBefore = el.value.substring(0, el.selectionStart ?? 0);
        return !textBefore.includes('\n');
    };

    const isCursorOnLastLine = (el: HTMLTextAreaElement): boolean => {
        if (el.selectionStart !== el.selectionEnd) return false;
        const textAfter = el.value.substring(el.selectionEnd ?? 0);
        return !textAfter.includes('\n');
    };

    const getDateSegmentFromSelection = (el: HTMLInputElement): number => {
        try {
            const pos = el.selectionStart;
            if (pos === null) return 0;
            if (pos <= 4) return 0;  // year
            if (pos <= 7) return 1;  // month
            return 2;                // day
        } catch {
            return 0;
        }
    };

    const getTimeSegmentFromSelection = (el: HTMLInputElement): number => {
        try {
            const pos = el.selectionStart;
            if (pos === null) return 0;
            if (pos <= 2) return 0;  // hour
            return 1;                // minute
        } catch {
            return 0;
        }
    };

    // === Focus Navigation ===

    const getFocusOrder = useCallback((): React.RefObject<HTMLElement | null>[] => {
        const order: React.RefObject<HTMLElement | null>[] = [
            titleRef, tagsInputRef, descriptionRef, checklistInputRef,
            todayBtnRef, startDateRef, startTimeRef, dueDateRef, dueTimeRef, resetDateRef,
            urlRef, url2Ref,
        ];
        if (editingTask) order.push(deleteBtnRef);
        order.push(cancelBtnRef, saveBtnRef);
        return order;
    }, [editingTask]);

    const focusNext = useCallback((currentRef: React.RefObject<HTMLElement | null>) => {
        const order = getFocusOrder();
        const idx = order.indexOf(currentRef);
        if (idx === -1) return;
        const nextIdx = (idx + 1) % order.length;
        order[nextIdx]?.current?.focus();
    }, [getFocusOrder]);

    const focusPrev = useCallback((currentRef: React.RefObject<HTMLElement | null>) => {
        const order = getFocusOrder();
        const idx = order.indexOf(currentRef);
        if (idx === -1) return;
        const prevIdx = (idx - 1 + order.length) % order.length;
        order[prevIdx]?.current?.focus();
    }, [getFocusOrder]);

    const makeButtonKeyDown = (ref: React.RefObject<HTMLElement | null>) => {
        return (e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                focusNext(ref);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                focusPrev(ref);
            }
        };
    };

    // === Unified Keyboard Navigation ===

    // Use refs to avoid stale closures in the global keydown handler
    const handleSaveTaskRef = useRef(handleSaveTask);
    handleSaveTaskRef.current = handleSaveTask;
    const handleSaveNewTaskRef = useRef(handleSaveNewTask);
    handleSaveNewTaskRef.current = handleSaveNewTask;
    const closeTaskModalRef = useRef(closeTaskModal);
    closeTaskModalRef.current = closeTaskModal;
    const closeTaskModalWithConfirmRef = useRef(closeTaskModalWithConfirm);
    closeTaskModalWithConfirmRef.current = closeTaskModalWithConfirm;
    const openNewTaskModalRef = useRef(openNewTaskModal);
    openNewTaskModalRef.current = openNewTaskModal;
    const handleDeleteTaskRef = useRef(handleDeleteTask);
    handleDeleteTaskRef.current = handleDeleteTask;

    // Global modal keyboard handler: Cmd+Enter to save, Escape to close, Cmd+Backspace/Delete to delete
    useEffect(() => {
        if (!editingTask && !isAdding) return;

        const handleGlobalModalKeyDown = (e: KeyboardEvent) => {
            const priority = useKeyboardStore.getState().getTopPriority();

            // Cmd+Enter / Ctrl+Enter / Cmd+S / Ctrl+S = Save
            // パレット/履歴/ピッカー開なら無視
            if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) {
                if (priority === 'palette' || priority === 'history' || priority === 'picker') return;
                e.preventDefault();
                if (editingTask) {
                    handleSaveTaskRef.current();
                } else if (isAdding) {
                    handleSaveNewTaskRef.current();
                }
                return;
            }
            // Escape = Close with confirmation if unsaved changes
            // パレット/履歴/ピッカーは自身で処理するのでここでは無視
            if (e.key === 'Escape') {
                if (priority === 'palette' || priority === 'history' || priority === 'picker') return;
                // モーダルを閉じる
                e.preventDefault();
                e.stopPropagation();
                if (editingTask) closeTaskModalWithConfirmRef.current();
                if (isAdding) setIsAdding(false);
                return;
            }
            // Cmd+Backspace (Mac) or Delete (Windows) = Delete task (edit mode only)
            // パレット/履歴/ピッカー開なら無視
            if ((e.metaKey && e.key === 'Backspace') || e.key === 'Delete') {
                if (priority === 'palette' || priority === 'history' || priority === 'picker') return;
                const active = document.activeElement;
                const isEditable = active instanceof HTMLInputElement ||
                    active instanceof HTMLTextAreaElement ||
                    (active instanceof HTMLElement && active.isContentEditable);
                // 入力欄がフォーカスされていても、空なら削除を実行
                if (isEditable) {
                    const value = (active as HTMLInputElement | HTMLTextAreaElement).value || '';
                    if (value.length > 0) return; // 入力があれば通常の削除操作
                }
                if (editingTask) {
                    e.preventDefault();
                    handleDeleteTaskRef.current();
                }
                return;
            }
        };

        window.addEventListener('keydown', handleGlobalModalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalModalKeyDown);
    }, [editingTask, isAdding]);

    // Focus trap: Tab/Shift+Tab wraps within modal
    useEffect(() => {
        if (!editingTask && !isAdding) return;

        const handleFocusTrap = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            // Priority check: パレット/履歴/ピッカー開なら無視（通常のTab動作）
            const priority = useKeyboardStore.getState().getTopPriority();
            if (priority === 'palette' || priority === 'history' || priority === 'picker') return;

            if (!modalContentRef.current) return;

            const focusables = Array.from(modalContentRef.current.querySelectorAll<HTMLElement>(
                'input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]'
            ));
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', handleFocusTrap);
        return () => window.removeEventListener('keydown', handleFocusTrap);
    }, [editingTask, isAdding]);

    // Auto-resize description textarea on modal open and content changes
    useEffect(() => {
        if ((editingTask || isAdding) && descriptionRef.current) {
            const el = descriptionRef.current;
            el.style.height = 'auto';
            el.style.height = `${Math.max(80, el.scrollHeight)}px`;
        }
    }, [editingTask, isAdding, editDesc]);

    // Title field: boundary-based arrow navigation
    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            focusNext(titleRef);
        } else if (e.key === 'ArrowRight' && isCursorAtEnd(el)) {
            e.preventDefault();
            focusNext(titleRef);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusPrev(titleRef);
        } else if (e.key === 'ArrowLeft' && isCursorAtStart(el)) {
            e.preventDefault();
            focusPrev(titleRef);
        }
    };

    // Today button: arrow navigation (Down → URL1, Up → checklist, Left/Right → focusPrev/focusNext)
    const handleTodayBtnKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            urlRef.current?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            checklistInputRef.current?.focus();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusNext(todayBtnRef);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusPrev(todayBtnRef);
        }
    };

    // Start Date: ArrowLeft/Right for segment navigation, ArrowUp/Down native
    const handleStartDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                focusPrev(startDateRef);
            } else {
                startTimeRef.current?.focus();
                startTimeSegmentRef.current = 0;
            }
        } else if (e.key === 'ArrowLeft') {
            if (startDateSegmentRef.current === 0) {
                e.preventDefault();
                focusPrev(startDateRef);
            } else {
                startDateSegmentRef.current--;
            }
        } else if (e.key === 'ArrowRight') {
            if (startDateSegmentRef.current === 2) {
                e.preventDefault();
                startTimeRef.current?.focus();
                startTimeSegmentRef.current = 0;
            } else {
                startDateSegmentRef.current++;
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            startTimeRef.current?.focus();
            startTimeSegmentRef.current = 0;
        }
        // ArrowUp/ArrowDown: native date behavior (no interception)
    };

    // Start Time: Tab and Arrow navigation with segment tracking
    const handleStartTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                startDateRef.current?.focus();
                startDateSegmentRef.current = 0;
            } else {
                dueDateRef.current?.focus();
                dueDateSegmentRef.current = 0;
            }
        } else if (e.key === 'ArrowLeft') {
            if (startTimeSegmentRef.current === 0) {
                e.preventDefault();
                startDateRef.current?.focus();
                startDateSegmentRef.current = 0;
            } else {
                startTimeSegmentRef.current--;
            }
        } else if (e.key === 'ArrowRight') {
            if (startTimeSegmentRef.current === 1) {
                e.preventDefault();
                dueDateRef.current?.focus();
                dueDateSegmentRef.current = 0;
            } else {
                startTimeSegmentRef.current++;
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            dueDateRef.current?.focus();
            dueDateSegmentRef.current = 0;
        }
    };

    // Due Date: Arrow navigation with segment tracking
    const handleDueDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                startTimeRef.current?.focus();
                startTimeSegmentRef.current = 0;
            } else {
                dueTimeRef.current?.focus();
                dueTimeSegmentRef.current = 0;
            }
        } else if (e.key === 'ArrowLeft') {
            if (dueDateSegmentRef.current === 0) {
                e.preventDefault();
                startTimeRef.current?.focus();
                startTimeSegmentRef.current = 0;
            } else {
                dueDateSegmentRef.current--;
            }
        } else if (e.key === 'ArrowRight') {
            if (dueDateSegmentRef.current === 2) {
                e.preventDefault();
                dueTimeRef.current?.focus();
                dueTimeSegmentRef.current = 0;
            } else {
                dueDateSegmentRef.current++;
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            dueTimeRef.current?.focus();
            dueTimeSegmentRef.current = 0;
        }
        // ArrowUp/ArrowDown: native date behavior (no interception)
    };

    // Due Time: Tab and Arrow navigation with segment tracking
    const handleDueTimeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                dueDateRef.current?.focus();
                dueDateSegmentRef.current = 0;
            } else {
                focusNext(dueTimeRef);
            }
        } else if (e.key === 'ArrowLeft') {
            if (dueTimeSegmentRef.current === 0) {
                e.preventDefault();
                dueDateRef.current?.focus();
                dueDateSegmentRef.current = 0;
            } else {
                dueTimeSegmentRef.current--;
            }
        } else if (e.key === 'ArrowRight') {
            if (dueTimeSegmentRef.current === 1) {
                e.preventDefault();
                focusNext(dueTimeRef);
            } else {
                dueTimeSegmentRef.current++;
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            focusNext(dueTimeRef);
        }
    };

    // Reset button: arrow navigation (Up → checklist, Left → prev, Down/Right → next)
    const handleResetKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                dueTimeRef.current?.focus();
                dueTimeSegmentRef.current = 0;
            } else {
                focusNext(resetDateRef);
            }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            focusNext(resetDateRef);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            checklistInputRef.current?.focus();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            dueTimeRef.current?.focus();
            dueTimeSegmentRef.current = 0;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            setEditStartDate('');
            setEditStartTime('');
            setEditDueDate('');
            setEditDueTime('');
            saveModalState({ startDate: '', startTime: '', dueDate: '', dueTime: '' });
        }
    };

    // Description: boundary-based arrow navigation + Enter → next field
    const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            focusNext(descriptionRef);
        } else if (e.key === 'ArrowUp' && isCursorOnFirstLine(el)) {
            e.preventDefault();
            focusPrev(descriptionRef);
        } else if (e.key === 'ArrowDown' && isCursorOnLastLine(el)) {
            e.preventDefault();
            focusNext(descriptionRef);
        } else if (e.key === 'ArrowLeft' && isCursorAtStart(el)) {
            e.preventDefault();
            focusPrev(descriptionRef);
        } else if (e.key === 'ArrowRight' && isCursorAtEnd(el)) {
            e.preventDefault();
            focusNext(descriptionRef);
        }
        // Shift+Enter allows normal newline behavior (default)
    };

    // URL1: boundary-based arrow navigation
    const handleUrl1KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            focusNext(urlRef);
        } else if (e.key === 'ArrowRight' && isCursorAtEnd(el)) {
            e.preventDefault();
            focusNext(urlRef);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusPrev(urlRef);
        } else if (e.key === 'ArrowLeft' && isCursorAtStart(el)) {
            e.preventDefault();
            focusPrev(urlRef);
        }
    };

    // URL2: boundary-based arrow navigation
    const handleUrl2KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        if (e.key === 'Enter') {
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusNext(url2Ref);
        } else if (e.key === 'ArrowRight' && isCursorAtEnd(el)) {
            e.preventDefault();
            focusNext(url2Ref);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusPrev(url2Ref);
        } else if (e.key === 'ArrowLeft' && isCursorAtStart(el)) {
            e.preventDefault();
            focusPrev(url2Ref);
        }
    };

    // Interpolate between two RGB colors: t=0 returns from, t=1 returns to
    const lerpColor = (from: [number, number, number], to: [number, number, number], t: number): string => {
        const r = Math.round(from[0] + (to[0] - from[0]) * t);
        const g = Math.round(from[1] + (to[1] - from[1]) * t);
        const b = Math.round(from[2] + (to[2] - from[2]) * t);
        return `rgb(${r}, ${g}, ${b})`;
    };

    // Column-specific color ranges
    const COL_COLORS: Record<Status, { starred: string; range: [number, number, number][] }> = {
        'todo':        { starred: '#FBBF24', range: [[150, 190, 40], [28, 160, 76]] },             // yellowish green -> green (darkened)
        'standby':     { starred: '#EF4444', range: [[249, 115, 22], [234, 179, 8], [130, 190, 42]] }, // orange -> yellow -> yellow-green (darkened)
        'in-progress': { starred: '#EF4444', range: [[239, 68, 68], [234, 179, 8]] },             // red -> yellow
        'done':        { starred: '#3B82F6', range: [[59, 130, 246]] },                            // blue (uniform)
    };

    const getPositionColor = (index: number, total: number, colId: Status) => {
        const cfg = COL_COLORS[colId];
        const { range } = cfg;
        if (range.length === 1 || total <= 1) return `rgb(${range[0].join(', ')})`;
        const t = index / (total - 1);
        if (range.length === 2) {
            return lerpColor(range[0], range[1], t);
        }
        // 3-stop gradient: first half = range[0]->range[1], second half = range[1]->range[2]
        if (t <= 0.5) {
            return lerpColor(range[0], range[1], t * 2);
        } else {
            return lerpColor(range[1], range[2], (t - 0.5) * 2);
        }
    };

    // Pre-compute color and priority maps for each task (used by TimelineView/CalendarView)
    // Priority rank: lower = higher priority. Cross-column: TODO top > STANDBY bottom etc.
    const { taskColorMap, taskBoardIndexMap } = useMemo(() => {
        const colorMap: Record<string, string> = {};
        const indexMap: Record<string, number> = {};
        if (!project) return { taskColorMap: colorMap, taskBoardIndexMap: indexMap };
        let globalRank = 0;
        // Process columns in priority order: todo first (highest priority), then standby, in-progress, done
        (['todo', 'standby', 'in-progress', 'done'] as Status[]).forEach(colId => {
            const colTasks = project.tasks.filter(t => t.status === colId);
            const starred = colTasks.filter(t => t.starred);
            const unstarred = colTasks.filter(t => !t.starred);
            const sorted = [...starred, ...unstarred];
            sorted.forEach((task, idx) => {
                colorMap[task.id] = task.starred
                    ? COL_COLORS[colId].starred
                    : getPositionColor(idx, sorted.length, colId);
                indexMap[task.id] = globalRank++;
            });
        });
        return { taskColorMap: colorMap, taskBoardIndexMap: indexMap };
    }, [project?.tasks]);

    const getFormattedUrl = (url?: string) => {
        if (!url) return '';
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    // Track original status at drag start for proper undo
    const dragStartState = useRef<{ taskId: string; originalStatus: Status } | null>(null);

    // DxND Handlers
    const handleDragStart = (event: DragStartEvent) => {
        const taskId = event.active.id as string;
        const task = project.tasks.find(t => t.id === taskId);
        if (task) {
            dragStartState.current = { taskId, originalStatus: task.status };
        }
        setActiveId(taskId);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        const activeTask = project.tasks.find(t => t.id === activeId);
        const overTask = project.tasks.find(t => t.id === overId);
        const isOverColumn = COLUMNS.some(c => c.id === overId);

        if (!activeTask) return;

        let targetStatus: Status | null = null;
        if (isOverColumn) {
            targetStatus = overId as Status;
        } else if (overTask) {
            targetStatus = overTask.status;
        }

        // Update status without history for visual preview
        if (targetStatus && activeTask.status !== targetStatus) {
            updateTask(project.id, activeId, { status: targetStatus });
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        const originalState = dragStartState.current;
        dragStartState.current = null;
        setActiveId(null);

        if (!over) {
            // Cancelled - restore original status
            if (originalState) {
                updateTask(project.id, originalState.taskId, { status: originalState.originalStatus });
            }
            return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;

        const activeTask = project.tasks.find(t => t.id === activeId);
        const overTask = project.tasks.find(t => t.id === overId);
        const isOverColumn = COLUMNS.some(c => c.id === overId);

        if (!activeTask || !originalState) return;

        // Determine final target status
        let targetStatus: Status | null = null;
        if (isOverColumn) {
            targetStatus = overId as Status;
        } else if (overTask) {
            targetStatus = overTask.status;
        }

        // If targetStatus is null, restore to original status
        if (!targetStatus) {
            if (activeTask.status !== originalState.originalStatus) {
                updateTask(project.id, activeId, { status: originalState.originalStatus });
            }
            return;
        }

        // 判斷狀態是否真的改變（使用 originalState.originalStatus）
        if (originalState.originalStatus !== targetStatus) {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const currentTime = now.toTimeString().slice(0, 5);

            // 構建完整的 updates 對象
            const updates: Partial<Omit<Task, 'id' | 'createdAt'>> = { status: targetStatus };

            // 獲取原始任務數據（拖曳前的狀態）
            // 注意：這裡的 activeTask 可能已經被 handleDragOver 更新了，但 startDate/dueDate 沒有被更新
            const originalTask = activeTask;

            // 判斷是否需要顯示日期確認 Modal
            let needDateConfirm = false;
            let confirmType: 'startDate' | 'dueDate' | 'resetStartDate' = 'startDate';
            let oldDateValue = '';

            // Standby: 開始日の設定機能を削除（何もしない）

            // Todo に戻る場合：開始日をリセットするか確認（開始時間は変更しない）
            if (targetStatus === 'todo') {
                if (originalTask?.startDate) {
                    // 開始日がある → リセットするか確認
                    needDateConfirm = true;
                    confirmType = 'resetStartDate';
                    oldDateValue = originalTask.startDate;
                }
            }

            // 處理 startDate（進入 in-progress）- 開始時間は変更しない
            if (targetStatus === 'in-progress') {
                // 開始日の処理
                if (originalTask?.startDate === today) {
                    // 開始日が今日 → 何もしない
                } else if (!originalTask?.startDate) {
                    // 開始日がない → 今日に設定
                    updates.startDate = today;
                } else {
                    // 開始日があり今日ではない → 確認を求める
                    needDateConfirm = true;
                    confirmType = 'startDate';
                    oldDateValue = originalTask.startDate;
                }
                // 開始時間は一切変更しない
            }

            // 處理 dueDate 和 dueTime（進入 done）
            if (targetStatus === 'done') {
                if (originalTask?.dueDate === today) {
                    // 期限日が今日
                    if (!originalTask?.dueTime) {
                        // 期限時間がない → 確認なしで期限時間を設定
                        updates.dueTime = currentTime;
                    }
                    // 期限時間がある場合は何もしない
                } else if (!originalTask?.dueDate) {
                    // 期限日がない → 期限日と期限時間を自動設定
                    updates.dueDate = today;
                    updates.dueTime = currentTime;
                } else {
                    // 期限日があり今日ではない → 確認を求める
                    needDateConfirm = true;
                    confirmType = 'dueDate';
                    oldDateValue = originalTask.dueDate;
                }
            }

            // 拖曳狀態變更不產生履歷
            updateTask(project.id, activeId, updates);

            // Mark this task as the last modified (for yellow border)
            setLastModifiedTaskId(activeId);

            // 如果需要確認日期，顯示 Modal
            if (needDateConfirm) {
                setDateConfirmModal({
                    taskId: activeId,
                    type: confirmType,
                    oldDate: oldDateValue,
                    targetStatus: targetStatus,
                });
            }
        }

        // Reordering: only within the same column (when status doesn't change)
        // 重排任務不產生履歷
        if (!isOverColumn && activeId !== overId && overTask
            && originalState.originalStatus === overTask.status) {
            const oldIndex = project.tasks.findIndex(t => t.id === activeId);
            const newIndex = project.tasks.findIndex(t => t.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newTasks = arrayMove(project.tasks, oldIndex, newIndex);
                reorderTasks(project.id, newTasks);
            }
        }
    };

    // Handle date confirmation modal response
    const handleDateConfirm = (confirmed: boolean) => {
        if (!dateConfirmModal) return;

        if (confirmed) {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const currentTime = now.toTimeString().slice(0, 5);

            const updates: Partial<Omit<Task, 'id' | 'createdAt'>> = {};

            if (dateConfirmModal.type === 'startDate') {
                updates.startDate = today;
                // 開始時間は一切変更しない
            } else if (dateConfirmModal.type === 'dueDate') {
                updates.dueDate = today;
                updates.dueTime = currentTime;
            } else if (dateConfirmModal.type === 'resetStartDate') {
                // Reset start date when returning to todo（開始時間は変更しない）
                updates.startDate = '';
            }

            // Use mergeHistory to avoid creating a new undo entry
            updateTask(project.id, dateConfirmModal.taskId, updates);
        }

        setDateConfirmModal(null);
    };

    const activeTask = activeId ? project.tasks.find(t => t.id === activeId) : null;
    const [viewMode, setViewMode] = useState<'board' | 'calendar' | 'timeline'>('board');
    const [compactMode, setCompactMode] = useState(false);

    // Refs for sub-view commands
    const calendarCommandRef = useRef<((cmd: string) => void) | null>(null);
    const timelineCommandRef = useRef<((cmd: string) => void) | null>(null);
    const [historyExpanded, setHistoryExpanded] = useState(false);
    const historyExpandedRef = useRef(historyExpanded);
    historyExpandedRef.current = historyExpanded;

    // Sync state to KeyboardStore for centralized shortcut handling
    const { setModalOpen, setPickerOpen, setHistoryExpanded: setKbHistoryExpanded, setActiveScreen } = useKeyboardStore();

    useEffect(() => {
        setActiveScreen('board');
    }, [setActiveScreen]);

    useEffect(() => {
        setModalOpen(!!editingTask || isAdding);
    }, [editingTask, isAdding, setModalOpen]);

    useEffect(() => {
        setPickerOpen(showStartDatePicker || showStartTimePicker || showDueDatePicker || showDueTimePicker);
    }, [showStartDatePicker, showStartTimePicker, showDueDatePicker, showDueTimePicker, setPickerOpen]);

    useEffect(() => {
        setKbHistoryExpanded(historyExpanded);
    }, [historyExpanded, setKbHistoryExpanded]);

    // Additional refs for Cmd+Enter keyboard handler (to avoid stale closure)
    // Note: editingTaskRef, isAddingRef, commandPaletteOpenRef are already defined above
    const dateConfirmModalRef = useRef(dateConfirmModal);
    const showStartDatePickerRef = useRef(showStartDatePicker);
    const showStartTimePickerRef = useRef(showStartTimePicker);
    const showDueDatePickerRef = useRef(showDueDatePicker);
    const showDueTimePickerRef = useRef(showDueTimePicker);

    dateConfirmModalRef.current = dateConfirmModal;
    showStartDatePickerRef.current = showStartDatePicker;
    showStartTimePickerRef.current = showStartTimePicker;
    showDueDatePickerRef.current = showDueDatePicker;
    showDueTimePickerRef.current = showDueTimePicker;

    // Command palette handler
    useEffect(() => {
        if (commandRef) {
            commandRef.current = (cmd: string, task?: Task) => {
                switch (cmd) {
                    case 'new':
                        openNewTaskModal();
                        break;
                    case 'board':
                        setViewMode('board');
                        onViewModeChange?.('board');
                        break;
                    case 'calendar':
                        setViewMode('calendar');
                        onViewModeChange?.('calendar');
                        break;
                    case 'timeline':
                        setViewMode('timeline');
                        onViewModeChange?.('timeline');
                        break;
                    case 'compact':
                        setCompactMode(prev => !prev);
                        break;
                    case 'openTask':
                        if (task) {
                            openTaskModal(task);
                        }
                        break;
                    // Calendar/Timeline commands - route to sub-views
                    case 'hide-done':
                    case 'go-today':
                    case 'prev':
                    case 'next':
                        if (viewMode === 'calendar' && calendarCommandRef.current) {
                            calendarCommandRef.current(cmd);
                        } else if (viewMode === 'timeline' && timelineCommandRef.current) {
                            timelineCommandRef.current(cmd);
                        }
                        break;
                    // Timeline-only commands
                    case 'view-':
                    case 'view0':
                    case 'view+':
                        if (viewMode === 'timeline' && timelineCommandRef.current) {
                            timelineCommandRef.current(cmd);
                        }
                        break;
                    // History commands (undo/redo handled by App.tsx)
                    case 'history':
                        setHistoryExpanded(prev => !prev);
                        break;
                }
            };
        }
        return () => {
            if (commandRef) {
                commandRef.current = null;
            }
        };
    }, [commandRef, viewMode]);

    // Cmd+N to open new task modal (only when nothing is open)
    // Uses KeyboardStore for priority check
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!((e.metaKey || e.ctrlKey) && e.key === 'n')) return;

            const priority = useKeyboardStore.getState().getTopPriority();
            // Only execute when nothing is open
            if (priority !== 'none') return;

            // Also check dateConfirmModal (not tracked in store)
            if (dateConfirmModalRef.current) return;

            e.preventDefault();
            openNewTaskModal();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="board-container" style={{ overflow: 'hidden' }}>
                <header className="board-header">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center">
                            <button onClick={() => setActiveProject(null)} className="back-btn">
                                ← Back ⌫
                            </button>
                            <h1 className="text-lg">{project.name}</h1>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setViewMode('board'); onViewModeChange?.('board'); }}
                                className={`btn ${viewMode === 'board' ? 'btn-primary' : 'text-muted hover:text-white bg-white/5'}`}
                            >
                                Board
                            </button>
                            <button
                                onClick={() => { setViewMode('calendar'); onViewModeChange?.('calendar'); }}
                                className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'text-muted hover:text-white bg-white/5'}`}
                            >
                                Calendar
                            </button>
                            <button
                                onClick={() => { setViewMode('timeline'); onViewModeChange?.('timeline'); }}
                                className={`btn ${viewMode === 'timeline' ? 'btn-primary' : 'text-muted hover:text-white bg-white/5'}`}
                            >
                                Timeline
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {viewMode === 'board' && (
                            <button
                                className={`compact-text-toggle ${compactMode ? 'active' : ''}`}
                                onClick={() => setCompactMode(!compactMode)}
                            >
                                Compact
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={openNewTaskModal}>+ New Task</button>
                    </div>
                </header>

                {/* Date Confirmation Modal (for drag-and-drop) */}
                {dateConfirmModal && (
                    <div className="modal-overlay" onClick={() => handleDateConfirm(false)}>
                        <div
                            className="card"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                padding: '1.5rem',
                                maxWidth: '400px',
                                textAlign: 'center',
                            }}
                        >
                            <h3 style={{ marginBottom: '1rem' }}>
                                {dateConfirmModal.type === 'startDate' && '開始日を更新しますか？'}
                                {dateConfirmModal.type === 'dueDate' && '終了日を更新しますか？'}
                                {dateConfirmModal.type === 'resetStartDate' && '開始日をリセットしますか？'}
                            </h3>
                            <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)' }}>
                                {dateConfirmModal.type === 'resetStartDate'
                                    ? `現在の開始日: ${dateConfirmModal.oldDate || '(時間のみ設定)'}`
                                    : `現在の${dateConfirmModal.type === 'startDate' ? '開始日' : '終了日'}: ${dateConfirmModal.oldDate}`
                                }
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                <button
                                    className="btn"
                                    onClick={() => handleDateConfirm(false)}
                                    style={{ minWidth: '100px' }}
                                >
                                    {dateConfirmModal.type === 'resetStartDate' ? '保持' : '保持原日期'}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => handleDateConfirm(true)}
                                    style={{ minWidth: '100px' }}
                                >
                                    {dateConfirmModal.type === 'resetStartDate' ? 'リセット' : '更新為今天'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Task Modal (shared for Edit and New) */}
                {(editingTask || isAdding) && (
                    <div
                        className="modal-overlay"
                        onMouseDown={() => { mouseDownInsideModal.current = false; }}
                        onMouseUp={() => {
                            if (!mouseDownInsideModal.current) {
                                if (editingTask) closeTaskModalWithConfirmRef.current();
                                if (isAdding) setIsAdding(false);
                            }
                            mouseDownInsideModal.current = false;
                        }}
                    >
                        <div
                            ref={modalContentRef}
                            className="card modal-content"
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                mouseDownInsideModal.current = true;
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '42rem',
                                maxHeight: '90vh',
                                display: 'flex',
                                flexDirection: 'column',
                                padding: 0,
                                overflow: 'hidden'
                            }}
                        >
                            {/* Header */}
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 className="text-xl m-0">{editingTask ? 'Edit Task' : 'New Task'}</h2>
                                <button
                                    onClick={() => { const newVal = !editStarred; setEditStarred(newVal); saveModalState({ starred: newVal }); }}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        fontSize: '24px', lineHeight: 1, padding: '4px',
                                        color: editStarred ? '#FBBF24' : '#6B7280',
                                        transition: 'color 0.15s ease',
                                    }}
                                    title={editStarred ? 'Unstar' : 'Star'}
                                    tabIndex={-1}
                                >
                                    {editStarred ? '\u2605' : '\u2606'}
                                </button>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                                <div className="flex flex-col gap-3">
                                    {/* Row 1: Title (full width) */}
                                    <div className="form-group">
                                        <label className="form-label">Title</label>
                                        <input
                                            ref={titleRef}
                                            type="text"
                                            className="form-input"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onKeyDown={handleTitleKeyDown}
                                            autoFocus
                                        />
                                    </div>

                                    {/* Row 2: Tags */}
                                    <div className="form-group">
                                        <label className="form-label">Tags</label>
                                        {editTags.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                                {editTags.map((tag, idx) => (
                                                    <span key={idx} className="tag-chip">
                                                        {tag}
                                                        <button
                                                            onClick={() => {
                                                                const newTags = editTags.filter((_, i) => i !== idx);
                                                                setEditTags(newTags);
                                                                saveModalState({ tags: newTags });
                                                            }}
                                                            tabIndex={-1}
                                                        >
                                                            &times;
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                ref={tagsInputRef}
                                                type="text"
                                                className="form-input"
                                                value={tagInput}
                                                onChange={(e) => {
                                                    setTagInput(e.target.value);
                                                    setShowTagSuggestions(true);
                                                }}
                                                onFocus={() => setShowTagSuggestions(true)}
                                                onBlur={() => {
                                                    setTimeout(() => setShowTagSuggestions(false), 150);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.nativeEvent.isComposing) return;
                                                    const el = e.currentTarget;
                                                    if (e.key === 'Enter' && tagInput.trim()) {
                                                        e.preventDefault();
                                                        const newTag = tagInput.trim();
                                                        if (!editTags.includes(newTag)) {
                                                            const newTags = [...editTags, newTag];
                                                            setEditTags(newTags);
                                                            saveModalState({ tags: newTags });
                                                        }
                                                        setTagInput('');
                                                        setShowTagSuggestions(false);
                                                    } else if (e.key === 'Enter' && !tagInput.trim()) {
                                                        e.preventDefault();
                                                        focusNext(tagsInputRef);
                                                    } else if (e.key === 'Backspace' && !tagInput && editTags.length > 0) {
                                                        const newTags = editTags.slice(0, -1);
                                                        setEditTags(newTags);
                                                        saveModalState({ tags: newTags });
                                                    } else if ((e.key === 'ArrowLeft' && isCursorAtStart(el)) || (e.key === 'ArrowUp' && isCursorAtStart(el))) {
                                                        e.preventDefault();
                                                        focusPrev(tagsInputRef);
                                                    } else if ((e.key === 'ArrowRight' && isCursorAtEnd(el)) || (e.key === 'ArrowDown' && isCursorAtEnd(el))) {
                                                        e.preventDefault();
                                                        focusNext(tagsInputRef);
                                                    }
                                                }}
                                                placeholder="Type to add or search tags..."
                                            />
                                            {showTagSuggestions && tagInput.trim() && (() => {
                                                const filtered = projectTags.filter(
                                                    t => t.toLowerCase().includes(tagInput.toLowerCase()) && !editTags.includes(t)
                                                );
                                                if (filtered.length === 0) return null;
                                                return (
                                                    <div className="tag-suggestions">
                                                        {filtered.map(tag => (
                                                            <div
                                                                key={tag}
                                                                className="tag-suggestion-item"
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    const newTags = [...editTags, tag];
                                                                    setEditTags(newTags);
                                                                    setTagInput('');
                                                                    setShowTagSuggestions(false);
                                                                    saveModalState({ tags: newTags });
                                                                }}
                                                            >
                                                                {tag}
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Row 3: Description */}
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea
                                            ref={descriptionRef}
                                            className="form-input resize-none"
                                            style={{ minHeight: '80px', overflow: 'hidden' }}
                                            value={editDesc}
                                            onChange={(e) => {
                                                setEditDesc(e.target.value);
                                                if (descriptionRef.current) {
                                                    descriptionRef.current.style.height = 'auto';
                                                    descriptionRef.current.style.height = `${Math.max(80, descriptionRef.current.scrollHeight)}px`;
                                                }
                                            }}
                                            onKeyDown={handleDescriptionKeyDown}
                                            placeholder="Add details... (Shift+Enter for new line)"
                                        />
                                    </div>

                                    {/* Row 4: Checklist */}
                                    <div className="form-group">
                                        <label className="form-label">
                                            Checklist
                                            {editChecklist.length > 0 && (
                                                <span style={{ marginLeft: '8px', fontSize: '0.80rem', color: 'var(--color-text-muted)' }}>
                                                    {editChecklist.filter(i => i.checked).length}/{editChecklist.length}
                                                </span>
                                            )}
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {editChecklist.map((item) => (
                                                <div key={item.id} className={`checklist-item ${item.checked ? 'checked' : ''}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={item.checked}
                                                        onChange={() => toggleChecklistItem(item.id)}
                                                        style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                                                        tabIndex={-1}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={item.text}
                                                        onChange={(e) => updateChecklistItemText(item.id, e.target.value)}
                                                        onBlur={() => saveModalState({ checklist: editChecklist.map(item => ({ ...item })) })}
                                                        className="checklist-item-text"
                                                        tabIndex={-1}
                                                    />
                                                    <button
                                                        onClick={() => removeChecklistItem(item.id)}
                                                        className="checklist-item-remove"
                                                        tabIndex={-1}
                                                        title="Remove item"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                            ))}
                                            <input
                                                ref={checklistInputRef}
                                                type="text"
                                                className="form-input"
                                                value={checklistInput}
                                                onChange={(e) => setChecklistInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.nativeEvent.isComposing) return;
                                                    const el = e.currentTarget;
                                                    if (e.key === 'Enter' && checklistInput.trim()) {
                                                        e.preventDefault();
                                                        addChecklistItem(checklistInput);
                                                    } else if (e.key === 'Enter' && !checklistInput.trim()) {
                                                        e.preventDefault();
                                                        focusNext(checklistInputRef);
                                                    } else if ((e.key === 'ArrowLeft' && isCursorAtStart(el)) || (e.key === 'ArrowUp' && isCursorAtStart(el))) {
                                                        e.preventDefault();
                                                        focusPrev(checklistInputRef);
                                                    } else if ((e.key === 'ArrowRight' && isCursorAtEnd(el)) || (e.key === 'ArrowDown' && isCursorAtEnd(el))) {
                                                        e.preventDefault();
                                                        focusNext(checklistInputRef);
                                                    }
                                                }}
                                                placeholder="Add checklist item..."
                                            />
                                        </div>
                                    </div>

                                    {/* Row 5.5: Today | Start Date | Due Date | Reset */}
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                        <button
                                            ref={todayBtnRef}
                                            type="button"
                                            className="btn"
                                            style={{
                                                flexShrink: 0, padding: '0.5rem 1rem',
                                                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                                color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)',
                                                borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 500,
                                                marginBottom: '1rem',
                                            }}
                                            onClick={() => {
                                                const now = new Date();
                                                const today = now.toISOString().split('T')[0];
                                                setEditStartDate(today);
                                                saveModalState({ startDate: today });
                                            }}
                                            onKeyDown={handleTodayBtnKeyDown}
                                            title="Set today as start date"
                                            tabIndex={0}
                                        >
                                            Today
                                        </button>
                                        <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                                            <label className="form-label">Start Date</label>
                                            <div className="picker-input-wrapper">
                                                <input
                                                    ref={startDateRef}
                                                    type="date"
                                                    className="form-input"
                                                    value={editStartDate}
                                                    onChange={(e) => setEditStartDate(e.target.value)}
                                                    onKeyDown={handleStartDateKeyDown}
                                                    onClick={() => {
                                                        if (startDateRef.current) {
                                                            startDateSegmentRef.current = getDateSegmentFromSelection(startDateRef.current);
                                                        }
                                                    }}
                                                    min="0000-01-01"
                                                    max="9999-12-31"
                                                    style={{ colorScheme: 'dark' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="picker-trigger-btn"
                                                    onClick={() => setShowStartDatePicker(true)}
                                                    aria-label="日付を選択"
                                                >
                                                    📅
                                                </button>
                                            </div>
                                            {showStartDatePicker && (
                                                <DateWheelPicker
                                                    value={editStartDate}
                                                    onChange={(date) => {
                                                        setEditStartDate(date);
                                                        setShowStartDatePicker(false);
                                                        saveModalState({ startDate: date });
                                                    }}
                                                    onCancel={() => setShowStartDatePicker(false)}
                                                />
                                            )}
                                        </div>
                                        <div className="form-group" style={{ minWidth: '120px' }}>
                                            <label className="form-label">Start Time</label>
                                            <div className="picker-input-wrapper">
                                                <input
                                                    ref={startTimeRef}
                                                    type="time"
                                                    className="form-input"
                                                    value={editStartTime}
                                                    onChange={(e) => setEditStartTime(e.target.value)}
                                                    onKeyDown={handleStartTimeKeyDown}
                                                    onClick={() => {
                                                        if (startTimeRef.current) {
                                                            startTimeSegmentRef.current = getTimeSegmentFromSelection(startTimeRef.current);
                                                        }
                                                    }}
                                                    style={{ colorScheme: 'dark' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="picker-trigger-btn"
                                                    onClick={() => setShowStartTimePicker(true)}
                                                    aria-label="時間を選択"
                                                >
                                                    🕐
                                                </button>
                                            </div>
                                            {showStartTimePicker && (
                                                <TimeWheelPicker
                                                    value={editStartTime}
                                                    onChange={(time) => {
                                                        setEditStartTime(time);
                                                        setShowStartTimePicker(false);
                                                        saveModalState({ startTime: time });
                                                    }}
                                                    onCancel={() => setShowStartTimePicker(false)}
                                                />
                                            )}
                                        </div>
                                        <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                                            <label className="form-label">Due Date</label>
                                            <div className="picker-input-wrapper">
                                                <input
                                                    ref={dueDateRef}
                                                    type="date"
                                                    className="form-input"
                                                    value={editDueDate}
                                                    onChange={(e) => setEditDueDate(e.target.value)}
                                                    onKeyDown={handleDueDateKeyDown}
                                                    onClick={() => {
                                                        if (dueDateRef.current) {
                                                            dueDateSegmentRef.current = getDateSegmentFromSelection(dueDateRef.current);
                                                        }
                                                    }}
                                                    min="0000-01-01"
                                                    max="9999-12-31"
                                                    style={{ colorScheme: 'dark' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="picker-trigger-btn"
                                                    onClick={() => setShowDueDatePicker(true)}
                                                    aria-label="日付を選択"
                                                >
                                                    📅
                                                </button>
                                            </div>
                                            {showDueDatePicker && (
                                                <DateWheelPicker
                                                    value={editDueDate}
                                                    onChange={(date) => {
                                                        setEditDueDate(date);
                                                        setShowDueDatePicker(false);
                                                        saveModalState({ dueDate: date });
                                                    }}
                                                    onCancel={() => setShowDueDatePicker(false)}
                                                />
                                            )}
                                        </div>
                                        <div className="form-group" style={{ minWidth: '120px' }}>
                                            <label className="form-label">Due Time</label>
                                            <div className="picker-input-wrapper">
                                                <input
                                                    ref={dueTimeRef}
                                                    type="time"
                                                    className="form-input"
                                                    value={editDueTime}
                                                    onChange={(e) => setEditDueTime(e.target.value)}
                                                    onKeyDown={handleDueTimeKeyDown}
                                                    onClick={() => {
                                                        if (dueTimeRef.current) {
                                                            dueTimeSegmentRef.current = getTimeSegmentFromSelection(dueTimeRef.current);
                                                        }
                                                    }}
                                                    style={{ colorScheme: 'dark' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="picker-trigger-btn"
                                                    onClick={() => setShowDueTimePicker(true)}
                                                    aria-label="時間を選択"
                                                >
                                                    🕐
                                                </button>
                                            </div>
                                            {showDueTimePicker && (
                                                <TimeWheelPicker
                                                    value={editDueTime}
                                                    onChange={(time) => {
                                                        setEditDueTime(time);
                                                        setShowDueTimePicker(false);
                                                        saveModalState({ dueTime: time });
                                                    }}
                                                    onCancel={() => setShowDueTimePicker(false)}
                                                />
                                            )}
                                        </div>
                                        <button
                                            ref={resetDateRef}
                                            type="button"
                                            className="btn"
                                            style={{
                                                flexShrink: 0, padding: '0.5rem 1rem',
                                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                                color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                borderRadius: '0.5rem', fontSize: '0.8rem', fontWeight: 500,
                                                marginBottom: '1rem',
                                            }}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                setEditStartDate('');
                                                setEditStartTime('');
                                                setEditDueDate('');
                                                setEditDueTime('');
                                                saveModalState({ startDate: '', startTime: '', dueDate: '', dueTime: '' });
                                            }}
                                            onKeyDown={handleResetKeyDown}
                                            title="Clear dates"
                                            tabIndex={0}
                                        >
                                            Reset
                                        </button>
                                    </div>

                                    {/* Row 6: URLs */}
                                    <div className="form-group">
                                        <label className="form-label">Links</label>
                                        <div className="flex flex-col gap-2">
                                            <input
                                                ref={urlRef}
                                                type="url"
                                                className="form-input text-blue-400 underline"
                                                value={editUrl}
                                                onChange={(e) => setEditUrl(e.target.value)}
                                                onKeyDown={handleUrl1KeyDown}
                                                placeholder="https://example.com"
                                            />
                                            <input
                                                ref={url2Ref}
                                                type="url"
                                                className="form-input text-blue-400 underline"
                                                value={editUrl2}
                                                onChange={(e) => setEditUrl2(e.target.value)}
                                                onKeyDown={handleUrl2KeyDown}
                                                placeholder="https://example.com"
                                            />
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="modal-actions">
                                        {editingTask && (
                                            <button ref={deleteBtnRef} className="btn text-red-500 hover:bg-white/10 mr-auto" onClick={handleDeleteTask} onKeyDown={makeButtonKeyDown(deleteBtnRef)}>Delete</button>
                                        )}
                                        <button ref={cancelBtnRef} className="btn text-muted hover:text-white" onClick={() => {
                                            if (editingTask) cancelTaskModal();
                                            else setIsAdding(false);
                                        }} onKeyDown={(e) => {
                                            if (e.key === 'ArrowUp') { e.preventDefault(); url2Ref.current?.focus(); }
                                            else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusNext(cancelBtnRef); }
                                            else if (e.key === 'ArrowLeft') { e.preventDefault(); focusPrev(cancelBtnRef); }
                                        }}>Cancel (Esc)</button>
                                        <button ref={saveBtnRef} className="btn btn-primary" onClick={() => {
                                            if (editingTask) handleSaveTask();
                                            else handleSaveNewTask();
                                        }} onKeyDown={(e) => {
                                            if (e.key === 'ArrowUp') { e.preventDefault(); url2Ref.current?.focus(); }
                                            else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusNext(saveBtnRef); }
                                            else if (e.key === 'ArrowLeft') { e.preventDefault(); focusPrev(saveBtnRef); }
                                        }}>
                                            {editingTask ? 'Save (⌘S)' : 'Create Task (⌘S)'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'calendar' && (
                    <div style={{ height: 'calc(100vh - 124px)' }}>
                        <CalendarView
                            tasks={project.tasks}
                            themeColor={project.theme}
                            onTaskClick={openTaskModal}
                            onTaskUpdate={(taskId, updates) => {
                                // Calendar 拖曳不產生履歷
                                updateTask(project.id, taskId, updates);
                            }}
                            onTasksReorder={(newTasks) => {
                                // Calendar 重排不產生履歷
                                reorderTasks(project.id, newTasks);
                            }}
                            taskColorMap={taskColorMap}
                            initialHideDone={project.viewSettings?.calendarHideDone ?? true}
                            onHideDoneChange={(hideDone) => {
                                updateViewSettings(project.id, { calendarHideDone: hideDone });
                            }}
                            commandRef={calendarCommandRef}
                        />
                    </div>
                )}


                {viewMode === 'timeline' && (
                    <div style={{ height: 'calc(100vh - 124px)' }}>
                        <TimelineView
                            tasks={project.tasks}
                            onTaskClick={openTaskModal}
                            onTaskUpdate={(taskId, updates) => {
                                // Timeline 拖曳不產生履歷
                                updateTask(project.id, taskId, updates);
                            }}
                            taskColorMap={taskColorMap}
                            taskBoardIndexMap={taskBoardIndexMap}
                            initialHideDone={project.viewSettings?.timelineHideDone ?? true}
                            onHideDoneChange={(hideDone) => {
                                updateViewSettings(project.id, { timelineHideDone: hideDone });
                            }}
                            initialViewRange={project.viewSettings?.timelineViewRange ?? 'month'}
                            onViewRangeChange={(range) => {
                                updateViewSettings(project.id, { timelineViewRange: range });
                            }}
                            commandRef={timelineCommandRef}
                        />
                    </div>
                )}

                {viewMode === 'board' && (
                    <div className="board-columns" style={{ height: 'calc(100vh - 124px)' }}>
                        {COLUMNS.map((col) => {
                            const colTasks = project.tasks.filter((t) => t.status === col.id);
                            // Sort: starred tasks pinned to top, rest keep drag order
                            const starredTasks = colTasks.filter(t => t.starred);
                            const unstarredTasks = colTasks.filter(t => !t.starred);
                            const sortedTasks = [...starredTasks, ...unstarredTasks];
                            return (
                                <Droppable key={col.id} id={col.id} className="board-column">
                                    <SortableContext
                                        id={col.id}
                                        items={sortedTasks.map(t => t.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <h3 className="column-title">
                                            {col.title} <span className="task-count">({sortedTasks.length})</span>
                                        </h3>
                                        <div className="task-list">
                                            {sortedTasks.map((task, idx) => {
                                                const posColor = task.starred
                                                    ? COL_COLORS[col.id].starred
                                                    : getPositionColor(idx, sortedTasks.length, col.id);
                                                const hasDetails = !compactMode && (
                                                    col.id === 'in-progress' || col.id === 'standby' ||
                                                    (col.id === 'done' ? (task.tags && task.tags.length > 0) :
                                                    (task.startDate || task.url || task.url2 || task.description ||
                                                    (task.tags && task.tags.length > 0) || (task.checklist && task.checklist.length > 0)))
                                                );
                                                const isLastModified = task.id === lastModifiedTaskId;
                                                return (
                                                <SortableItem key={task.id} id={task.id}>
                                                    <div
                                                        className={`card task-card ${compactMode ? 'task-card-compact' : ''} ${!compactMode && !hasDetails ? 'task-card-title-only' : ''} ${isLastModified ? 'task-card-last-modified' : ''}`}
                                                        data-task-id={task.id}
                                                        data-column-id={col.id}
                                                        data-task-index={idx}
                                                        onClick={() => openTaskModal(task)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                openTaskModal(task);
                                                            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                                                                e.preventDefault();
                                                                handleArrowKeyNavigation(e.key, col.id, idx);
                                                            }
                                                        }}
                                                        tabIndex={0}
                                                        style={{ position: 'relative', overflow: 'hidden' }}
                                                    >
                                                        {/* Left priority bar */}
                                                        <div className="priority-bar" style={{ backgroundColor: posColor }} />
                                                        <div className="task-card-content">
                                                            <div className="task-header">
                                                                <span className={`font-medium ${compactMode || !hasDetails ? 'task-title-compact' : ''}`}>{task.title}</span>
                                                                <button
                                                                    className="star-toggle"
                                                                    tabIndex={-1}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // 切換星標不產生履歷
                                                                        updateTask(project.id, task.id, { starred: !task.starred });
                                                                    }}
                                                                    title={task.starred ? 'Unstar' : 'Star'}
                                                                >
                                                                    {task.starred ? '\u2605' : '\u2606'}
                                                                </button>
                                                            </div>
                                                            {!compactMode && (
                                                                <>
                                                                    {/* DONE: tags only */}
                                                                    {col.id === 'done' && task.tags && task.tags.length > 0 && (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                                                            {task.tags.map((tag, i) => (
                                                                                <span key={i} className="tag-chip-sm">{tag}</span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {/* Non-DONE columns: date + details */}
                                                                    {col.id !== 'done' && (
                                                                        <>
                                                                            {col.id === 'in-progress' && (
                                                                                <>
                                                                                    <div style={{ fontSize: '0.80rem', color: 'var(--color-card-date-text)', marginBottom: '2px', fontFamily: 'monospace' }}>
                                                                                        Start: {task.startDate || '未定'}
                                                                                    </div>
                                                                                    <div style={{ fontSize: '0.80rem', color: 'var(--color-card-date-text)', marginBottom: '2px', fontFamily: 'monospace' }}>
                                                                                        Due: {task.dueDate || '未定'}
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                            {col.id === 'standby' && (
                                                                                <div style={{ fontSize: '0.80rem', color: 'var(--color-card-date-text)', marginBottom: '2px', fontFamily: 'monospace' }}>
                                                                                    Start: {task.startDate || '未定'}
                                                                                </div>
                                                                            )}
                                                                            {col.id === 'todo' && task.startDate && (
                                                                                <div style={{ fontSize: '0.80rem', color: 'var(--color-card-date-text)', marginBottom: '2px', fontFamily: 'monospace' }}>
                                                                                    Start: {task.startDate}
                                                                                </div>
                                                                            )}
                                                                            {task.url && (
                                                                                <a
                                                                                    href={task.url}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="text-xs text-blue-400 hover:underline"
                                                                                    style={{ display: 'block', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                >
                                                                                    🔗 {getFormattedUrl(task.url)}
                                                                                </a>
                                                                            )}
                                                                            {task.url2 && (
                                                                                <a
                                                                                    href={task.url2}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="text-xs text-blue-400 hover:underline"
                                                                                    style={{ display: 'block', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                >
                                                                                    🔗 {getFormattedUrl(task.url2)}
                                                                                </a>
                                                                            )}
                                                                            {task.description && <div className="task-description">{task.description}</div>}
                                                                            {task.tags && task.tags.length > 0 && (
                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                                                                    {task.tags.map((tag, i) => (
                                                                                        <span key={i} className="tag-chip-sm">{tag}</span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                            {task.checklist && task.checklist.length > 0 && (
                                                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                                                                    Checklist: {task.checklist.filter(i => i.checked).length}/{task.checklist.length}
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </SortableItem>
                                                );
                                            })}
                                        </div>
                                    </SortableContext>
                                </Droppable>
                            );
                        })}
                    </div>
                )}

                <DragOverlay>
                    {activeTask ? (() => {
                        const dragColor = activeTask.starred ? '#EF4444' : '#F59E0B';
                        const dragHasDetails = !compactMode && (
                            activeTask.dueDate || activeTask.startDate || activeTask.url || activeTask.url2 || activeTask.description ||
                            (activeTask.tags && activeTask.tags.length > 0) || (activeTask.checklist && activeTask.checklist.length > 0)
                        );
                        return (
                        <div
                            className={`card task-card ${compactMode ? 'task-card-compact' : ''} ${!compactMode && !dragHasDetails ? 'task-card-title-only' : ''}`}
                            style={{ cursor: 'grabbing', opacity: 0.9, position: 'relative', overflow: 'hidden' }}
                        >
                            <div className="priority-bar" style={{ backgroundColor: dragColor }} />
                            <div className="task-card-content">
                                <div className="task-header">
                                    <span className={`font-medium ${compactMode ? 'task-title-compact' : ''}`}>{activeTask.title}</span>
                                    <span className="star-toggle" style={{ color: activeTask.starred ? '#FBBF24' : '#6B7280' }}>
                                        {activeTask.starred ? '\u2605' : '\u2606'}
                                    </span>
                                </div>
                                {!compactMode && (
                                    <>
                                        {activeTask.dueDate && (
                                            <div style={{ fontSize: '10px' }} className="text-yellow-400 mb-1 font-mono">
                                                Due: {activeTask.dueDate}
                                            </div>
                                        )}
                                        {activeTask.url && (
                                            <a
                                                href={activeTask.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-400 block mb-1 truncate hover:underline"
                                            >
                                                🔗 {getFormattedUrl(activeTask.url)}
                                            </a>
                                        )}
                                        {activeTask.url2 && (
                                            <a
                                                href={activeTask.url2}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-400 block mb-1 truncate hover:underline"
                                            >
                                                🔗 {getFormattedUrl(activeTask.url2)}
                                            </a>
                                        )}
                                        {activeTask.description && <div className="task-description">{activeTask.description}</div>}
                                        {activeTask.tags && activeTask.tags.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                                {activeTask.tags.map((tag, i) => (
                                                    <span key={i} className="tag-chip-sm">{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                        {activeTask.checklist && activeTask.checklist.length > 0 && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                                Checklist: {activeTask.checklist.filter(i => i.checked).length}/{activeTask.checklist.length}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        );
                    })() : null}
                </DragOverlay>
            </div>
            {toastMessage && (
                <div style={{
                    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(30, 30, 40, 0.92)', color: 'rgba(255, 255, 255, 0.85)',
                    padding: '8px 20px', borderRadius: '8px', fontSize: '0.85rem',
                    fontWeight: 500, zIndex: 9999, pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
                    animation: 'toast-fade-in 0.15s ease',
                }}>
                    {toastMessage}
                </div>
            )}
            <HistoryTimeline
                expanded={historyExpanded}
                onExpandedChange={setHistoryExpanded}
            />
        </DndContext>
    );
};
