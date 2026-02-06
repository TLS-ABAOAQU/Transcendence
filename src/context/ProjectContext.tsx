import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Project, Task, Status, ViewSettings } from '../types';
import { useProjectStore, useTemporalStore } from '../store/projectStore';

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
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
            // Also support Ctrl+Y / Cmd+Y for redo
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                redo();
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
