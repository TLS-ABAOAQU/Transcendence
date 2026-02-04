import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjects } from '../../context/ProjectContext';
import { THEMES } from '../../constants';
import type { Project } from '../../types';
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
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { SortableItem } from '../../components/SortableItem';
import './Dashboard.css';

// Marquee component for long project names
const MarqueeProjectName: React.FC<{ name: string }> = ({ name }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLHeadingElement>(null);
    const [needsMarquee, setNeedsMarquee] = useState(false);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const textWidth = textRef.current.scrollWidth;
                setNeedsMarquee(textWidth > containerWidth);
            }
        };
        // Small delay to ensure DOM is ready
        const timer = setTimeout(checkOverflow, 50);
        window.addEventListener('resize', checkOverflow);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', checkOverflow);
        };
    }, [name]);

    // Calculate animation duration based on name length
    // Minimum speed: ~3 characters per second (comfortable reading speed)
    const animationDuration = Math.max(8, name.length * 0.3);

    return (
        <div className="project-name-wrapper" ref={containerRef}>
            {needsMarquee ? (
                <div className="project-name-container">
                    <div className="marquee-content" style={{ animationDuration: `${animationDuration}s` }}>
                        <h3 className="project-name text-slate-900 font-bold">{name}</h3>
                        <h3 className="project-name text-slate-900 font-bold">{name}</h3>
                    </div>
                </div>
            ) : (
                <h3 ref={textRef} className="project-name text-slate-900 font-bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                </h3>
            )}
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const { projects, addProject, updateProject, deleteProject, setActiveProject, reorderProjects } = useProjects();
    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [selectedTheme, setSelectedTheme] = useState(THEMES[0].value);
    const [startDate, setStartDate] = useState('');
    const [deadline, setDeadline] = useState('');
    const [colorConfirmed, setColorConfirmed] = useState(false);

    // Modal interaction ref to prevent closing when dragging from inside to outside
    const mouseDownInsideModal = useRef(false);

    // DnD State
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // ESC key to close modal
    useEffect(() => {
        const handleEscKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && modalMode) {
                closeModal();
            }
        };
        window.addEventListener('keydown', handleEscKey);
        return () => window.removeEventListener('keydown', handleEscKey);
    }, [modalMode]);

    // Arrow key navigation for color selection
    const handleColorKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const currentIndex = THEMES.findIndex(t => t.value === selectedTheme);
            let newIndex: number;
            if (e.key === 'ArrowLeft') {
                newIndex = currentIndex > 0 ? currentIndex - 1 : THEMES.length - 1;
            } else {
                newIndex = currentIndex < THEMES.length - 1 ? currentIndex + 1 : 0;
            }
            setSelectedTheme(THEMES[newIndex].value);
            setColorConfirmed(false);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (!colorConfirmed) {
                setColorConfirmed(true);
            } else {
                // Submit form
                handleSubmitFromKeyboard();
            }
        }
    }, [selectedTheme, colorConfirmed]);

    const handleSubmitFromKeyboard = () => {
        if (!name.trim()) return;
        if (modalMode === 'create') {
            addProject(name, selectedTheme, startDate, deadline);
        } else if (modalMode === 'edit' && editingId) {
            updateProject(editingId, { name, theme: selectedTheme, startDate, deadline });
        }
        closeModal();
    };

    const openCreateModal = () => {
        setModalMode('create');
        setName('');
        setSelectedTheme(THEMES[0].value);
        setStartDate('');
        setDeadline('');
        setColorConfirmed(false);
        setEditingId(null);
    };

    const openEditModal = (e: React.MouseEvent, project: Project) => {
        e.stopPropagation(); // Prevent navigating to board
        setModalMode('edit');
        setName(project.name);
        setSelectedTheme(project.theme);
        setStartDate(project.startDate || '');
        setDeadline(project.deadline || '');
        setColorConfirmed(true); // Color is already selected for existing project
        setEditingId(project.id);
    };

    const closeModal = () => {
        setModalMode(null);
        setEditingId(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (modalMode === 'create') {
            addProject(name, selectedTheme, startDate, deadline);
        } else if (modalMode === 'edit' && editingId) {
            updateProject(editingId, { name, theme: selectedTheme, startDate, deadline });
        }
        closeModal();
    };

    const handleDelete = () => {
        if (editingId && confirm('Are you sure you want to delete this project? All tasks will be lost.')) {
            deleteProject(editingId);
            closeModal();
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (active.id !== over?.id) {
            const oldIndex = projects.findIndex((p) => p.id === active.id);
            const newIndex = projects.findIndex((p) => p.id === over?.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                reorderProjects(arrayMove(projects, oldIndex, newIndex));
            }
        }
    };

    const activeProject = activeId ? projects.find(p => p.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div>
                <header className="dashboard-header">
                    <div>
                        <h1 className="dashboard-title">Projects</h1>
                        <p className="text-muted">Manage your personal goals and tasks</p>
                    </div>
                    <button className="btn btn-primary" onClick={openCreateModal}>
                        + New Project
                    </button>
                </header>

                {modalMode && (
                    <div
                        className="modal-overlay"
                        onMouseDown={() => { mouseDownInsideModal.current = false; }}
                        onMouseUp={() => {
                            if (!mouseDownInsideModal.current) {
                                closeModal();
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
                                maxWidth: '28rem',
                                maxHeight: '70vh',
                                display: 'flex',
                                flexDirection: 'column',
                                padding: 0,
                                overflow: 'hidden'
                            }}
                        >
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
                                <h2 className="text-xl m-0">{modalMode === 'create' ? 'Create New Project' : 'Edit Project'}</h2>
                            </div>
                            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
                                <form onSubmit={handleSubmit}>
                                    <div className="form-group">
                                        <label className="form-label">Project Name</label>
                                        <input
                                            autoFocus
                                            type="text"
                                            className="form-input"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">
                                            Theme Color
                                            {colorConfirmed && <span style={{ marginLeft: '8px', color: '#86efac', fontSize: '0.75rem' }}>✓ Confirmed</span>}
                                        </label>
                                        <div className="theme-selector">
                                            {THEMES.map((t) => (
                                                <button
                                                    key={t.value}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTheme(t.value);
                                                        setColorConfirmed(true);
                                                    }}
                                                    onKeyDown={handleColorKeyDown}
                                                    className={`theme-btn ${selectedTheme === t.value ? 'selected' : ''}`}
                                                    style={{ backgroundColor: t.value }}
                                                    title={`${t.name} (Use ← → to navigate, Enter to confirm)`}
                                                    tabIndex={selectedTheme === t.value ? 0 : -1}
                                                />
                                            ))}
                                        </div>
                                        <p className="text-muted text-xs mt-1">← → で色を選択、Enter で確定</p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Start Date (Optional)</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Deadline (Optional)</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={deadline}
                                                onChange={(e) => setDeadline(e.target.value)}
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="modal-actions">
                                        {modalMode === 'edit' && (
                                            <button type="button" className="btn text-red-500 hover:bg-white/10 mr-auto" onClick={handleDelete}>
                                                Delete
                                            </button>
                                        )}
                                        <button type="button" className="btn text-muted hover:text-white" onClick={closeModal}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary">
                                            {modalMode === 'create' ? 'Create Project' : 'Save Changes'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {projects.length === 0 ? (
                    <div className="empty-state">
                        <p className="mb-4">No projects yet.</p>
                        <button className="text-primary hover:underline" onClick={openCreateModal}>Create your first project</button>
                    </div>
                ) : (
                    <SortableContext
                        items={projects.map(p => p.id)}
                        strategy={rectSortingStrategy}
                    >
                        <div className="project-grid">
                            {projects.map((project) => (
                                <SortableItem key={project.id} id={project.id}>
                                    <div
                                        onClick={() => setActiveProject(project.id)}
                                        className="card project-card group"
                                        style={{ backgroundColor: project.theme, border: 'none', color: '#1e293b' }}
                                    >
                                        <div className="project-header">
                                            <div className="flex-1" style={{ overflow: 'hidden' }}>
                                                <MarqueeProjectName name={project.name} />
                                                {project.deadline && (
                                                    <div className="text-xs text-slate-700 mt-1 flex items-center gap-1 opacity-80">
                                                        <span>📅 Due: {project.deadline}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => openEditModal(e, project)}
                                            className="hover:bg-white/50 transition-all"
                                            style={{
                                                position: 'absolute',
                                                top: '0.75rem',
                                                right: '0.75rem',
                                                backgroundColor: 'rgba(255,255,255,0.4)',
                                                borderRadius: '50%',
                                                width: '2rem',
                                                height: '2rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.875rem',
                                                border: 'none',
                                                cursor: 'pointer'
                                            }}
                                            title="Edit Project"
                                        >
                                            ✏️
                                        </button>
                                        <div className="project-stats" style={{ color: '#334155' }}>
                                            <span>{project.tasks.length} tasks</span>
                                            <span>{project.tasks.filter(t => t.status === 'done').length} completed</span>
                                        </div>
                                    </div>
                                </SortableItem>
                            ))}
                        </div>
                    </SortableContext>
                )}

                <DragOverlay>
                    {activeProject ? (
                        <div
                            className="card project-card"
                            style={{ backgroundColor: activeProject.theme, border: 'none', cursor: 'grabbing', opacity: 0.9, color: '#1e293b' }}
                        >
                            <div className="project-header">
                                <div style={{ overflow: 'hidden', flex: 1 }}>
                                    <MarqueeProjectName name={activeProject.name} />
                                    {activeProject.deadline && (
                                        <div className="text-xs text-slate-700 mt-1 flex items-center gap-1 opacity-80">
                                            <span>📅 Due: {activeProject.deadline}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="project-stats" style={{ color: '#334155' }}>
                                <span>{activeProject.tasks.length} tasks</span>
                                <span>{activeProject.tasks.filter(t => t.status === 'done').length} completed</span>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};
