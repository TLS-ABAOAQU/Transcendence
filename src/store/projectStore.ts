import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import type { Project, Task, Status, ViewSettings } from '../types';

interface ProjectState {
    projects: Project[];
    activeProjectId: string | null;
}

interface ProjectActions {
    // Project actions
    addProject: (name: string, theme: string, startDate?: string, deadline?: string) => void;
    updateProject: (id: string, updates: { name: string; theme: string; startDate?: string; deadline?: string }) => void;
    deleteProject: (id: string) => void;
    reorderProjects: (newOrder: Project[]) => void;

    // Task actions
    addTask: (projectId: string, task: Omit<Task, 'id' | 'createdAt'>) => void;
    updateTask: (projectId: string, taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
    updateTaskStatus: (projectId: string, taskId: string, newStatus: Status) => void;
    deleteTask: (projectId: string, taskId: string) => void;
    reorderTasks: (projectId: string, newTasks: Task[]) => void;

    // View settings
    updateViewSettings: (projectId: string, settings: Partial<ViewSettings>) => void;

    // Active project
    setActiveProject: (id: string | null) => void;
}

type ProjectStore = ProjectState & ProjectActions;

// Create the base store without temporal middleware first
const createProjectStore = (
    set: (fn: (state: ProjectState) => Partial<ProjectState>) => void,
    get: () => ProjectStore
): ProjectStore => ({
    projects: [],
    activeProjectId: null,

    addProject: (name, theme, startDate, deadline) => {
        const today = new Date().toISOString().split('T')[0];
        const newProject: Project = {
            id: crypto.randomUUID(),
            name,
            theme,
            startDate: startDate || today,
            deadline,
            tasks: [],
            createdAt: Date.now(),
        };
        set((state) => ({ projects: [...state.projects, newProject] }));
    },

    updateProject: (id, updates) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === id ? { ...p, ...updates } : p
            ),
        }));
    },

    deleteProject: (id) => {
        const currentActiveId = get().activeProjectId;
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            activeProjectId: currentActiveId === id ? null : state.activeProjectId,
        }));
    },

    reorderProjects: (newOrder) => {
        set(() => ({ projects: newOrder }));
    },

    addTask: (projectId, taskData) => {
        const newTask: Task = {
            ...taskData,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
        };
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p
            ),
        }));
    },

    updateTask: (projectId, taskId, updates) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === projectId
                    ? {
                          ...p,
                          tasks: p.tasks.map((t) =>
                              t.id === taskId ? { ...t, ...updates } : t
                          ),
                      }
                    : p
            ),
        }));
    },

    updateTaskStatus: (projectId, taskId, newStatus) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === projectId
                    ? {
                          ...p,
                          tasks: p.tasks.map((t) =>
                              t.id === taskId ? { ...t, status: newStatus } : t
                          ),
                      }
                    : p
            ),
        }));
    },

    deleteTask: (projectId, taskId) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === projectId
                    ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
                    : p
            ),
        }));
    },

    reorderTasks: (projectId, newTasks) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === projectId ? { ...p, tasks: newTasks } : p
            ),
        }));
    },

    updateViewSettings: (projectId, settings) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === projectId
                    ? { ...p, viewSettings: { ...p.viewSettings, ...settings } }
                    : p
            ),
        }));
    },

    setActiveProject: (id) => {
        set(() => ({ activeProjectId: id }));
    },
});

// Helper to check and migrate old localStorage data
const getInitialState = (): ProjectState => {
    // First try new storage key
    const newStorage = localStorage.getItem('ppm-storage');
    if (newStorage) {
        try {
            const parsed = JSON.parse(newStorage);
            if (parsed.state) {
                return {
                    projects: parsed.state.projects || [],
                    activeProjectId: parsed.state.activeProjectId || null,
                };
            }
        } catch {
            // Continue to check old keys
        }
    }

    // Try old storage keys (migration)
    const oldProjects = localStorage.getItem('ppm-projects');
    const oldActiveProject = localStorage.getItem('ppm-active-project');

    if (oldProjects) {
        try {
            const projects = JSON.parse(oldProjects);
            const activeProjectId = oldActiveProject ? JSON.parse(oldActiveProject) : null;
            return { projects, activeProjectId };
        } catch {
            // Return empty state if parsing fails
        }
    }

    return { projects: [], activeProjectId: null };
};

// Create the store with temporal (undo/redo) and persist middleware
export const useProjectStore = create<ProjectStore>()(
    temporal(
        persist(
            (set, get) => {
                const initialState = getInitialState();
                return {
                    ...createProjectStore(set, get),
                    projects: initialState.projects,
                    activeProjectId: initialState.activeProjectId,
                };
            },
            {
                name: 'ppm-storage',
                version: 1,
                partialize: (state) => ({
                    projects: state.projects,
                    activeProjectId: state.activeProjectId,
                }),
            }
        ),
        {
            limit: 20, // Keep up to 20 history states
            equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
            // Only track project data changes, not navigation state
            // activeProjectId is excluded - navigation doesn't create history
            partialize: (state) => ({
                projects: state.projects,
            } as ProjectStore),
        }
    )
);

// Export temporal store for undo/redo functionality
export const useTemporalStore = () => useProjectStore.temporal;
