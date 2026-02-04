export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'in-progress' | 'done';

export interface Task {
    id: string;
    title: string;
    description: string;
    status: Status;
    priority: Priority;
    url?: string;
    url2?: string;
    startDate?: string;
    dueDate?: string;
    createdAt: number;
}

export interface Column {
    id: Status;
    title: string;
}

export interface Project {
    id: string;
    name: string;
    theme: string;
    tasks: Task[];
    createdAt: number;
    startDate?: string;
    deadline?: string;
}

export interface AppState {
    projects: Project[];
    activeProjectId: string | null;
}
