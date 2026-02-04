import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Project, Task, Status } from '../types';
import { useLocalStorageWithHistory } from '../hooks/useLocalStorageWithHistory';

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
    setActiveProject: (id: string | null) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [projects, setProjects, { undo, redo, canUndo, canRedo }] = useLocalStorageWithHistory<Project[]>('ppm-projects', []);
    const [activeProjectId, setActiveProjectId] = React.useState<string | null>(() => {
        try {
            const item = window.localStorage.getItem('ppm-active-project');
            return item ? JSON.parse(item) : null;
        } catch {
            return null;
        }
    });

    // Save activeProjectId to localStorage
    useEffect(() => {
        try {
            window.localStorage.setItem('ppm-active-project', JSON.stringify(activeProjectId));
        } catch (error) {
            console.error(error);
        }
    }, [activeProjectId]);

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

    const addProject = (name: string, theme: string, startDate?: string, deadline?: string) => {
        const newProject: Project = {
            id: crypto.randomUUID(),
            name,
            theme,
            startDate,
            deadline,
            tasks: [],
            createdAt: Date.now(),
        };
        setProjects((prev) => [...prev, newProject]);
    };

    const updateProject = (id: string, updates: { name: string; theme: string; startDate?: string; deadline?: string }) => {
        setProjects((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
        );
    };

    const addTask = (projectId: string, taskData: Omit<Task, 'id' | 'createdAt'>) => {
        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== projectId) return p;
                const newTask: Task = {
                    ...taskData,
                    id: crypto.randomUUID(),
                    createdAt: Date.now(),
                };
                return { ...p, tasks: [...p.tasks, newTask] };
            })
        );
    };

    const updateTaskStatus = (projectId: string, taskId: string, newStatus: Status) => {
        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== projectId) return p;
                return {
                    ...p,
                    tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
                };
            })
        );
    };

    const updateTask = (projectId: string, taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== projectId) return p;
                return {
                    ...p,
                    tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
                };
            })
        );
    };

    const deleteProject = (id: string) => {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (activeProjectId === id) setActiveProjectId(null);
    };

    const deleteTask = (projectId: string, taskId: string) => {
        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== projectId) return p;
                return {
                    ...p,
                    tasks: p.tasks.filter((t) => t.id !== taskId),
                };
            })
        );
    };

    const reorderProjects = (newOrder: Project[]) => {
        setProjects(newOrder);
    };

    const reorderTasks = (projectId: string, newTasks: Task[]) => {
        setProjects((prev) =>
            prev.map((p) => {
                if (p.id !== projectId) return p;
                return { ...p, tasks: newTasks };
            })
        );
    };

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
                setActiveProject: setActiveProjectId,
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
