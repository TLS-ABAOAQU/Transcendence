import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Project, Task, Status, ViewSettings } from '../types';
import { useProjectStore, useTemporalStore } from '../store/projectStore';
import { useKeyboardStore } from '../store/keyboardStore';

interface ProjectContextType {
    projects: Project[];
    activeProjectId: string | null;
    addProject: (name: string, theme: string, startDate?: string, deadline?: string) => void;
    addTask: (projectId: string, task: Omit<Task, 'id' | 'createdAt'>) => void;
    updateTaskStatus: (projectId: string, taskId: string, newStatus: Status) => void;
    updateProject: (id: string, updates: { name: string; theme: string; startDate?: string; deadline?: string }) => void;
    updateTask: (projectId: string, taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
    deleteProject: (id: string) => void;
    deleteTask: (projectId: string, taskId: string) => void;
    reorderProjects: (newOrder: Project[]) => void;
    reorderTasks: (projectId: string, newTasks: Task[]) => void;
    updateViewSettings: (projectId: string, settings: Partial<ViewSettings>) => void;
    setActiveProject: (id: string | null) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Get state and actions from Zustand store
    const {
        projects,
        activeProjectId,
        addProject,
        updateProject,
        addTask,
        updateTaskStatus,
        updateTask,
        deleteProject,
        deleteTask,
        reorderProjects,
        reorderTasks,
        updateViewSettings,
        setActiveProject,
    } = useProjectStore();

    // Get temporal (undo/redo) functionality
    const temporalStore = useTemporalStore();
    const { undo, redo, pastStates, futureStates } = temporalStore.getState();

    // Subscribe to temporal store changes for canUndo/canRedo
    const [canUndo, setCanUndo] = React.useState(pastStates.length > 0);
    const [canRedo, setCanRedo] = React.useState(futureStates.length > 0);

    useEffect(() => {
        const unsubscribe = temporalStore.subscribe((state) => {
            setCanUndo(state.pastStates.length > 0);
            setCanRedo(state.futureStates.length > 0);
        });
        return unsubscribe;
    }, [temporalStore]);

    // Keyboard shortcuts for undo/redo
    // Priority check: ignore when palette or picker is open, modal has its own handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const priority = useKeyboardStore.getState().getTopPriority();

            // Cmd+Z / Cmd+Shift+Z / Cmd+Y
            if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'y')) {
                // According to shortcut table:
                // - palette: ignore
                // - history: global undo/redo
                // - picker: ignore
                // - modal: modal handles its own (skip here)
                // - none: global undo/redo
                if (priority === 'palette' || priority === 'picker' || priority === 'modal') {
                    return; // Don't handle here
                }

                e.preventDefault();
                if (e.key === 'z' && e.shiftKey) {
                    redo();
                } else if (e.key === 'z' && !e.shiftKey) {
                    undo();
                } else if (e.key === 'y') {
                    redo();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    return (
        <ProjectContext.Provider
            value={{
                projects,
                activeProjectId,
                addProject,
                updateProject,
                addTask,
                updateTaskStatus,
                updateTask,
                deleteProject,
                deleteTask,
                reorderProjects,
                reorderTasks,
                updateViewSettings,
                setActiveProject,
                undo,
                redo,
                canUndo,
                canRedo,
            }}
        >
            {children}
        </ProjectContext.Provider>
    );
};

export const useProjects = () => {
    const context = useContext(ProjectContext);
    if (!context) throw new Error('useProjects must be used within a ProjectProvider');
    return context;
};
