import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProjects } from '../../context/ProjectContext';
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
import type { Status, Priority, Task } from '../../types';
import './Board.css';

const COLUMNS: { id: Status; title: string }[] = [
    { id: 'todo', title: 'To Do' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done' },
];

export const Board: React.FC = () => {
    const { projects, activeProjectId, setActiveProject, updateTaskStatus, addTask, updateTask, deleteTask, reorderTasks } = useProjects();
    const project = projects.find((p) => p.id === activeProjectId);
    const [isAdding, setIsAdding] = useState(false);

    // Task Edit Modal State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editUrl2, setEditUrl2] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editPriority, setEditPriority] = useState<Priority>('medium');
    const [priorityConfirmed, setPriorityConfirmed] = useState(false);
    const [newPriorityConfirmed, setNewPriorityConfirmed] = useState(false);

    // Modal-specific undo/redo history
    interface ModalState {
        title: string;
        desc: string;
        url: string;
        url2: string;
        startDate: string;
        dueDate: string;
        priority: Priority;
    }
    const [modalHistory, setModalHistory] = useState<ModalState[]>([]);
    const [modalHistoryIndex, setModalHistoryIndex] = useState(-1);

    const saveModalState = useCallback(() => {
        const currentState: ModalState = {
            title: editTitle,
            desc: editDesc,
            url: editUrl,
            url2: editUrl2,
            startDate: editStartDate,
            dueDate: editDueDate,
            priority: editPriority,
        };
        setModalHistory(prev => {
            const newHistory = prev.slice(0, modalHistoryIndex + 1);
            newHistory.push(currentState);
            return newHistory.slice(-20); // Keep last 20 states
        });
        setModalHistoryIndex(prev => Math.min(prev + 1, 19));
    }, [editTitle, editDesc, editUrl, editUrl2, editStartDate, editDueDate, editPriority, modalHistoryIndex]);

    const modalUndo = useCallback(() => {
        if (modalHistoryIndex > 0) {
            const prevState = modalHistory[modalHistoryIndex - 1];
            setEditTitle(prevState.title);
            setEditDesc(prevState.desc);
            setEditUrl(prevState.url);
            setEditUrl2(prevState.url2);
            setEditStartDate(prevState.startDate);
            setEditDueDate(prevState.dueDate);
            setEditPriority(prevState.priority);
            setModalHistoryIndex(prev => prev - 1);
        }
    }, [modalHistory, modalHistoryIndex]);

    const modalRedo = useCallback(() => {
        if (modalHistoryIndex < modalHistory.length - 1) {
            const nextState = modalHistory[modalHistoryIndex + 1];
            setEditTitle(nextState.title);
            setEditDesc(nextState.desc);
            setEditUrl(nextState.url);
            setEditUrl2(nextState.url2);
            setEditStartDate(nextState.startDate);
            setEditDueDate(nextState.dueDate);
            setEditPriority(nextState.priority);
            setModalHistoryIndex(prev => prev + 1);
        }
    }, [modalHistory, modalHistoryIndex]);

    // Handle modal-specific undo/redo
    useEffect(() => {
        const handleModalUndoRedo = (e: KeyboardEvent) => {
            if ((editingTask || isAdding) && (e.metaKey || e.ctrlKey)) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    modalUndo();
                } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                    e.preventDefault();
                    e.stopPropagation();
                    modalRedo();
                }
            }
        };
        window.addEventListener('keydown', handleModalUndoRedo, true);
        return () => window.removeEventListener('keydown', handleModalUndoRedo, true);
    }, [editingTask, isAdding, modalUndo, modalRedo]);

    // Modal interaction refs
    const mouseDownInsideModal = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const newTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    const autoResizeTextarea = useCallback((ref: React.RefObject<HTMLTextAreaElement | null>) => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = `${Math.max(80, ref.current.scrollHeight)}px`;
        }
    }, []);

    // DxND State
    const [activeId, setActiveId] = useState<string | null>(null);

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
        setEditDueDate('');
        setEditPriority('medium');
        setNewPriorityConfirmed(false);
        setModalHistory([]);
        setModalHistoryIndex(-1);
        setIsAdding(true);
    };

    const handleSaveNewTask = () => {
        if (!editTitle.trim()) return;
        addTask(project.id, {
            title: editTitle,
            description: editDesc,
            status: 'todo',
            priority: editPriority,
            url: editUrl,
            url2: editUrl2,
            startDate: editStartDate,
            dueDate: editDueDate,
        });
        setIsAdding(false);
    };

    const openTaskModal = (task: Task) => {
        setEditingTask(task);
        setEditTitle(task.title);
        setEditDesc(task.description);
        setEditUrl(task.url || '');
        setEditUrl2(task.url2 || '');
        setEditStartDate(task.startDate || '');
        setEditDueDate(task.dueDate || '');
        setEditPriority(task.priority);
        setPriorityConfirmed(true); // Already selected for existing task
        // Initialize modal history with the original state
        const initialState: ModalState = {
            title: task.title,
            desc: task.description,
            url: task.url || '',
            url2: task.url2 || '',
            startDate: task.startDate || '',
            dueDate: task.dueDate || '',
            priority: task.priority,
        };
        setModalHistory([initialState]);
        setModalHistoryIndex(0);
    };

    const closeTaskModal = () => {
        setEditingTask(null);
        setPriorityConfirmed(false);
    };

    const handleSaveTask = () => {
        if (!editingTask || !editTitle.trim()) return;
        updateTask(project.id, editingTask.id, {
            title: editTitle,
            description: editDesc,
            url: editUrl,
            url2: editUrl2,
            startDate: editStartDate,
            dueDate: editDueDate,
            priority: editPriority,
        });
        closeTaskModal();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Don't save if IME is composing (e.g., Japanese input)
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveTask();
        }
    };

    // For description textarea: Shift+Enter = newline, Enter = save
    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveTask();
        }
        // Shift+Enter allows normal newline behavior (default)
    };

    // For date and priority fields: Enter = save
    const handleFieldKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveTask();
        }
    };

    // For priority buttons: Arrow keys to navigate, first Enter confirms, second Enter saves
    const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
    const handlePriorityKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const currentIndex = PRIORITIES.indexOf(editPriority);
            let newIndex: number;
            if (e.key === 'ArrowLeft') {
                newIndex = currentIndex > 0 ? currentIndex - 1 : PRIORITIES.length - 1;
            } else {
                newIndex = currentIndex < PRIORITIES.length - 1 ? currentIndex + 1 : 0;
            }
            setEditPriority(PRIORITIES[newIndex]);
            setPriorityConfirmed(false);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!priorityConfirmed) {
                setPriorityConfirmed(true);
            } else {
                handleSaveTask();
            }
        }
    };

    const handleKeyDownNew = (e: React.KeyboardEvent) => {
        // Don't save if IME is composing (e.g., Japanese input)
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveNewTask();
        }
    };

    // For new task description textarea
    const handleNewTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveNewTask();
        }
    };

    // For new task date/priority fields
    const handleNewFieldKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveNewTask();
        }
    };

    // For new task priority buttons with confirmation and arrow key navigation
    const handleNewPriorityKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const currentIndex = PRIORITIES.indexOf(editPriority);
            let newIndex: number;
            if (e.key === 'ArrowLeft') {
                newIndex = currentIndex > 0 ? currentIndex - 1 : PRIORITIES.length - 1;
            } else {
                newIndex = currentIndex < PRIORITIES.length - 1 ? currentIndex + 1 : 0;
            }
            setEditPriority(PRIORITIES[newIndex]);
            setNewPriorityConfirmed(false);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!newPriorityConfirmed) {
                setNewPriorityConfirmed(true);
            } else {
                handleSaveNewTask();
            }
        }
    };

    const handleDeleteTask = () => {
        if (!editingTask || !confirm('Delete this task?')) return;
        deleteTask(project.id, editingTask.id);
        closeTaskModal();
    };

    // Handle Escape key to close modals
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editingTask) {
                    closeTaskModal();
                }
                if (isAdding) {
                    setIsAdding(false);
                }
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [editingTask, isAdding]);

    const getPriorityColor = (p: Priority) => {
        switch (p) {
            case 'high': return 'var(--color-priority-high)';
            case 'medium': return 'var(--color-priority-medium)';
            case 'low': return 'var(--color-priority-low)';
        }
    };

    const getFormattedUrl = (url?: string) => {
        if (!url) return '';
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    // DxND Handlers
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find the tasks
        const activeTask = project.tasks.find(t => t.id === activeId);
        const overTask = project.tasks.find(t => t.id === overId);

        if (!activeTask) return;

        // Moving between columns
        const isOverColumn = COLUMNS.some(c => c.id === overId);

        if (activeTask && isOverColumn) {
            const overColumnId = overId as Status;
            if (activeTask.status !== overColumnId) {
                // We are dragging over an empty column or container
                // Update status immediately for visual feedback
                updateTaskStatus(project.id, activeId, overColumnId);
            }
        } else if (activeTask && overTask && activeTask.status !== overTask.status) {
            // Dragging over a task in a different column
            // Change status of active task to match over task
            updateTaskStatus(project.id, activeId, overTask.status);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        if (activeId !== overId) {
            // Reordering within same list (status update handled in DragOver)
            // We need to reorder the whole project.tasks array
            const oldIndex = project.tasks.findIndex(t => t.id === activeId);
            const newIndex = project.tasks.findIndex(t => t.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newTasks = arrayMove(project.tasks, oldIndex, newIndex);
                reorderTasks(project.id, newTasks);
            }
        }
    };

    const activeTask = activeId ? project.tasks.find(t => t.id === activeId) : null;
    const [viewMode, setViewMode] = useState<'board' | 'calendar' | 'timeline'>('board');

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="board-container">
                <header className="board-header">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center">
                            <button onClick={() => setActiveProject(null)} className="back-btn">
                                ← Back
                            </button>
                            <h1 className="text-xl">{project.name}</h1>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewMode('board')}
                                className={`btn ${viewMode === 'board' ? 'btn-primary' : 'text-muted hover:text-white bg-white/5'}`}
                            >
                                Board
                            </button>
                            <button
                                onClick={() => setViewMode('calendar')}
                                className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'text-muted hover:text-white bg-white/5'}`}
                            >
                                Calendar
                            </button>
                            <button
                                onClick={() => setViewMode('timeline')}
                                className={`btn ${viewMode === 'timeline' ? 'btn-primary' : 'text-muted hover:text-white bg-white/5'}`}
                            >
                                Timeline
                            </button>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={openNewTaskModal}>+ New Task</button>
                </header>

                {/* Task Edit Modal */}
                {editingTask && (
                    <div
                        className="modal-overlay"
                        onMouseDown={() => { mouseDownInsideModal.current = false; }}
                        onMouseUp={() => {
                            if (!mouseDownInsideModal.current) {
                                closeTaskModal();
                            }
                            mouseDownInsideModal.current = false;
                        }}
                    >
                        <div
                            className="card modal-content"
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                mouseDownInsideModal.current = true;
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '42rem', // md:max-w-2xl equivalent
                                maxHeight: '90vh',
                                display: 'flex',
                                flexDirection: 'column',
                                padding: 0, // Override card padding
                                overflow: 'hidden'
                            }}
                        >
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                                <h2 className="text-xl m-0">Edit Task</h2>
                            </div>

                            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                                <div className="flex flex-col gap-3">
                                    <div className="form-group">
                                        <label className="form-label">Title</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        {/* Fallback grid style since sm:grid-cols-2 might fail if no media query support in utility classes */}
                                        <div className="form-group">
                                            <label className="form-label">Start Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={editStartDate}
                                                onChange={(e) => setEditStartDate(e.target.value)}
                                                onKeyDown={handleFieldKeyDown}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Due Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={editDueDate}
                                                onChange={(e) => setEditDueDate(e.target.value)}
                                                onKeyDown={handleFieldKeyDown}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">URL 1</label>
                                        <input
                                            type="url"
                                            className="form-input text-blue-400 underline"
                                            value={editUrl}
                                            onChange={(e) => setEditUrl(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="https://example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">URL 2</label>
                                        <input
                                            type="url"
                                            className="form-input text-blue-400 underline"
                                            value={editUrl2}
                                            onChange={(e) => setEditUrl2(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder="https://example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea
                                            ref={textareaRef}
                                            className="form-input resize-none"
                                            style={{ minHeight: '80px', overflow: 'hidden' }}
                                            value={editDesc}
                                            onChange={(e) => {
                                                setEditDesc(e.target.value);
                                                autoResizeTextarea(textareaRef);
                                            }}
                                            onKeyDown={handleTextareaKeyDown}
                                            placeholder="Add details... (Shift+Enter for new line)"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Priority
                                            {priorityConfirmed && <span style={{ marginLeft: '8px', color: '#86efac', fontSize: '0.75rem' }}>✓ Confirmed</span>}
                                        </label>
                                        <div className="flex gap-2">
                                            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => {
                                                        setEditPriority(p);
                                                        setPriorityConfirmed(true);
                                                        saveModalState();
                                                    }}
                                                    onKeyDown={handlePriorityKeyDown}
                                                    className={`btn text-xs uppercase tracking-wider ${editPriority === p ? 'border-white' : 'border-transparent'} `}
                                                    style={{
                                                        borderWidth: '2px',
                                                        backgroundColor: getPriorityColor(p),
                                                        color: '#1e293b',
                                                        opacity: editPriority === p ? 1 : 0.5
                                                    }}
                                                    tabIndex={editPriority === p ? 0 : -1}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-muted text-xs mt-1">← → で選択、Enter で確定</p>
                                    </div>
                                    <div className="modal-actions">
                                        <button className="btn text-red-500 hover:bg-white/10 mr-auto" onClick={handleDeleteTask}>Delete</button>
                                        <button className="btn text-muted hover:text-white" onClick={closeTaskModal}>Cancel</button>
                                        <button className="btn btn-primary" onClick={handleSaveTask}>Save</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* New Task Modal */}
                {isAdding && (
                    <div
                        className="modal-overlay"
                        onMouseDown={() => { mouseDownInsideModal.current = false; }}
                        onMouseUp={() => {
                            if (!mouseDownInsideModal.current) {
                                setIsAdding(false);
                            }
                            mouseDownInsideModal.current = false;
                        }}
                    >
                        <div
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
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                                <h2 className="text-xl m-0">New Task</h2>
                            </div>

                            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                                <div className="flex flex-col gap-3">
                                    <div className="form-group">
                                        <label className="form-label">Title</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onKeyDown={handleKeyDownNew}
                                            autoFocus
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Start Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={editStartDate}
                                                onChange={(e) => setEditStartDate(e.target.value)}
                                                onKeyDown={handleNewFieldKeyDown}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Due Date</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={editDueDate}
                                                onChange={(e) => setEditDueDate(e.target.value)}
                                                onKeyDown={handleNewFieldKeyDown}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">URL 1</label>
                                        <input
                                            type="url"
                                            className="form-input text-blue-400 underline"
                                            value={editUrl}
                                            onChange={(e) => setEditUrl(e.target.value)}
                                            onKeyDown={handleKeyDownNew}
                                            placeholder="https://example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">URL 2</label>
                                        <input
                                            type="url"
                                            className="form-input text-blue-400 underline"
                                            value={editUrl2}
                                            onChange={(e) => setEditUrl2(e.target.value)}
                                            onKeyDown={handleKeyDownNew}
                                            placeholder="https://example.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Description</label>
                                        <textarea
                                            ref={newTextareaRef}
                                            className="form-input resize-none"
                                            style={{ minHeight: '80px', overflow: 'hidden' }}
                                            value={editDesc}
                                            onChange={(e) => {
                                                setEditDesc(e.target.value);
                                                autoResizeTextarea(newTextareaRef);
                                            }}
                                            onKeyDown={handleNewTextareaKeyDown}
                                            placeholder="Add details... (Shift+Enter for new line)"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            Priority
                                            {newPriorityConfirmed && <span style={{ marginLeft: '8px', color: '#86efac', fontSize: '0.75rem' }}>✓ Confirmed</span>}
                                        </label>
                                        <div className="flex gap-2">
                                            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => {
                                                        setEditPriority(p);
                                                        setNewPriorityConfirmed(true);
                                                    }}
                                                    onKeyDown={handleNewPriorityKeyDown}
                                                    className={`btn text-xs uppercase tracking-wider ${editPriority === p ? 'border-white' : 'border-transparent'} `}
                                                    style={{
                                                        borderWidth: '2px',
                                                        backgroundColor: getPriorityColor(p),
                                                        color: '#1e293b',
                                                        opacity: editPriority === p ? 1 : 0.5
                                                    }}
                                                    tabIndex={editPriority === p ? 0 : -1}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-muted text-xs mt-1">← → で選択、Enter で確定</p>
                                    </div>
                                    <div className="modal-actions">
                                        <button className="btn text-muted hover:text-white" onClick={() => setIsAdding(false)}>Cancel</button>
                                        <button className="btn btn-primary" onClick={handleSaveNewTask}>Create Task</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'calendar' && (
                    <div className="mt-4 h-[calc(100vh-140px)]">
                        <CalendarView
                            tasks={project.tasks}
                            themeColor={project.theme}
                            onTaskClick={openTaskModal}
                            onTaskUpdate={(taskId, updates) => {
                                updateTask(project.id, taskId, updates);
                            }}
                            onTasksReorder={(newTasks) => {
                                reorderTasks(project.id, newTasks);
                            }}
                        />
                    </div>
                )}


                {viewMode === 'timeline' && (
                    <div className="mt-4 h-[calc(100vh-140px)]">
                        <TimelineView
                            tasks={project.tasks}
                            onTaskClick={openTaskModal}
                            onTaskUpdate={(taskId, updates) => {
                                updateTask(project.id, taskId, updates);
                            }}
                            onTasksReorder={(newTasks) => {
                                reorderTasks(project.id, newTasks);
                            }}
                        />
                    </div>
                )}

                {viewMode === 'board' && (
                    <div className="board-columns">
                        {COLUMNS.map((col) => {
                            const tasks = project.tasks.filter((t) => t.status === col.id);
                            return (
                                <Droppable key={col.id} id={col.id} className="board-column">
                                    <SortableContext
                                        id={col.id}
                                        items={tasks.map(t => t.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <h3 className="column-title">
                                            {col.title} <span className="task-count">({tasks.length})</span>
                                        </h3>
                                        <div className="task-list">
                                            {tasks.map((task) => (
                                                <SortableItem key={task.id} id={task.id}>
                                                    <div className="card task-card" onClick={() => openTaskModal(task)}>
                                                        <div className="task-header">
                                                            <span className="font-medium">{task.title}</span>
                                                            <div className="priority-dot" style={{ backgroundColor: getPriorityColor(task.priority) }} />
                                                        </div>
                                                        {task.dueDate && (
                                                            <div className="text-[10px] text-yellow-400 mb-1 font-mono">
                                                                Due: {task.dueDate}
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
                                                    </div>
                                                </SortableItem>
                                            ))}
                                        </div>
                                    </SortableContext>
                                </Droppable>
                            );
                        })}
                    </div>
                )}

                <DragOverlay>
                    {activeTask ? (
                        <div className="card task-card" style={{ cursor: 'grabbing', opacity: 0.9 }}>
                            <div className="task-header">
                                <span className="font-medium">{activeTask.title}</span>
                                <div className="priority-dot" style={{ backgroundColor: getPriorityColor(activeTask.priority) }} />
                            </div>
                            {activeTask.dueDate && (
                                <div className="text-[10px] text-yellow-400 mb-1 font-mono">
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
                        </div>
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};
