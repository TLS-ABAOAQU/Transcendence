export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'standby' | 'in-progress' | 'done';

export interface ChecklistItem {
    id: string;
    text: string;
    checked: boolean;
    checkedAt?: number;
}

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
    starred?: boolean;
    tags?: string[];
    checklist?: ChecklistItem[];
    createdAt: number;
}

export interface Column {
    id: Status;
    title: string;
}

export interface ViewSettings {
    calendarHideDone?: boolean;
    timelineHideDone?: boolean;
    timelineViewRange?: 'week' | 'month' | '3months';
}

export interface Project {
    id: string;
    name: string;
    theme: string;
    tasks: Task[];
    createdAt: number;
    startDate?: string;
    deadline?: string;
    viewSettings?: ViewSettings;
}

export interface AppState {
    projects: Project[];
    activeProjectId: string | null;
}
