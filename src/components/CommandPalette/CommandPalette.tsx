import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Project, Task } from '../../types';
import './CommandPalette.css';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    activeProjectId: string | null;
    viewMode: 'board' | 'calendar' | 'timeline' | null; // null = dashboard
    onTaskClick: (projectId: string, task: Task) => void;
    onProjectClick: (projectId: string) => void;
    onCommand: (command: string) => void;
}

interface Command {
    id: string;
    title: string;
    shortcut?: string;
    icon: string;
    category: 'navigate' | 'create' | 'view';
}

type ResultItem =
    | { type: 'task'; task: Task; projectId: string; projectName: string }
    | { type: 'project'; project: Project }
    | { type: 'command'; command: Command }
    | { type: 'keyword'; keyword: string; label: string; icon: string };

const ALL_COMMANDS: Command[] = [
    // Create
    { id: 'new', title: 'New Task', icon: '➕', category: 'create' },
    { id: 'new-project', title: 'New Project', icon: '📁', category: 'create' },
    // Navigate
    { id: 'board', title: 'Board', icon: '📋', category: 'navigate' },
    { id: 'calendar', title: 'Calendar', icon: '📅', category: 'navigate' },
    { id: 'timeline', title: 'Timeline', icon: '📊', category: 'navigate' },
    { id: 'home', title: 'Dashboard', icon: '🏠', category: 'navigate' },
    // View
    { id: 'compact', title: 'Compact', icon: '📐', category: 'view' },
    // Calendar/Timeline Navigation
    { id: 'hide-done', title: 'Hide Done', icon: '👁️', category: 'view' },
    { id: 'go-today', title: 'Go Today', icon: '📍', category: 'navigate' },
    { id: 'prev', title: 'Previous', icon: '◀️', category: 'navigate' },
    { id: 'next', title: 'Next', icon: '▶️', category: 'navigate' },
    // Timeline View Range
    { id: 'view-', title: 'View -', icon: '🔍', category: 'view' },
    { id: 'view0', title: 'View 0', icon: '🔍', category: 'view' },
    { id: 'view+', title: 'View +', icon: '🔍', category: 'view' },
    // History
    { id: 'history', title: 'History', icon: '📜', category: 'view' },
    { id: 'clear-history', title: 'Clear History', icon: '🗑️', category: 'view' },
    // Other
    { id: 'starred', title: 'Starred', icon: '⭐', category: 'view' },
];

// Search keywords for suggestions
const SEARCH_KEYWORDS = [
    { keyword: 'today', label: "Today's tasks", icon: '📅' },
    { keyword: 'yesterday', label: "Yesterday's tasks", icon: '📅' },
    { keyword: 'tomorrow', label: "Tomorrow's tasks", icon: '📅' },
    { keyword: 'overdue', label: 'Overdue tasks', icon: '⚠️' },
    { keyword: 'undated', label: 'Undated tasks', icon: '📅' },
    { keyword: 'todo', label: 'TODO status', icon: '📋' },
    { keyword: 'standby', label: 'STANDBY status', icon: '⏸️' },
    { keyword: 'in-progress', label: 'IN PROGRESS status', icon: '🔄' },
    { keyword: 'done', label: 'DONE status', icon: '✅' },
];

// Generate date suggestions based on query
const generateDateSuggestions = (q: string, maxCount: number = 10): { keyword: string; label: string; icon: string }[] => {
    const today = new Date();
    const year = today.getFullYear();

    // 2桁: 月指定 (01-12) または 年の先頭 (20, 19, 21...)
    if (/^\d{2}$/.test(q)) {
        const num = parseInt(q, 10);

        // 年の先頭 (20xx, 19xx, 21xx...)
        if (num >= 19 && num <= 21) {
            const years: { keyword: string; label: string; icon: string }[] = [];
            for (let y = num * 100; y < (num + 1) * 100 && y >= 2020 && y <= 2030; y++) {
                years.push({
                    keyword: String(y),
                    label: `${y}年`,
                    icon: '📅'
                });
            }
            // 今日に近い順にソート
            years.sort((a, b) => Math.abs(parseInt(a.keyword) - year) - Math.abs(parseInt(b.keyword) - year));
            return years.slice(0, maxCount);
        }

        // 月指定 (01-12)
        const month = num;
        if (month < 1 || month > 12) return [];

        const dates: Date[] = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            dates.push(new Date(year, month - 1, day));
        }

        // 今日に近い順にソート
        dates.sort((a, b) => Math.abs(a.getTime() - today.getTime()) - Math.abs(b.getTime() - today.getTime()));

        return dates.slice(0, maxCount).map(d => {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return {
                keyword: `${mm}${dd}`,
                label: `${d.getMonth() + 1}月${d.getDate()}日`,
                icon: '📅'
            };
        });
    }

    // 3桁: 月+日の先頭
    if (/^\d{3}$/.test(q)) {
        const month = parseInt(q.slice(0, 2), 10);
        const dayPrefix = q.slice(2);
        if (month < 1 || month > 12) return [];

        const dates: { keyword: string; label: string; icon: string }[] = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = String(day).padStart(2, '0');
            if (dayStr.startsWith(dayPrefix)) {
                dates.push({
                    keyword: `${String(month).padStart(2, '0')}${dayStr}`,
                    label: `${month}月${day}日`,
                    icon: '📅'
                });
            }
        }

        return dates.slice(0, maxCount);
    }

    // 4桁: MMDD (日付) または YYYY (年)
    if (/^\d{4}$/.test(q)) {
        const num = parseInt(q, 10);

        // YYYY年 (2020-2030)
        if (num >= 2020 && num <= 2030) {
            const months: { keyword: string; label: string; icon: string }[] = [];
            for (let m = 1; m <= 12; m++) {
                months.push({
                    keyword: `${q}${String(m).padStart(2, '0')}`,
                    label: `${num}年${m}月`,
                    icon: '📅'
                });
            }
            // 今日に近い順にソート
            const todayMonth = today.getMonth() + 1;
            months.sort((a, b) => {
                const mA = parseInt(a.keyword.slice(4, 6));
                const mB = parseInt(b.keyword.slice(4, 6));
                return Math.abs(mA - todayMonth) - Math.abs(mB - todayMonth);
            });
            return months.slice(0, maxCount);
        }

        // MMDD (日付)
        const month = parseInt(q.slice(0, 2), 10);
        const day = parseInt(q.slice(2, 4), 10);
        if (month < 1 || month > 12) return [];
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day < 1 || day > daysInMonth) return [];

        return [{
            keyword: q,
            label: `${month}月${day}日`,
            icon: '📅'
        }];
    }

    // 5桁: YYYYM
    if (/^\d{5}$/.test(q)) {
        const yearPart = parseInt(q.slice(0, 4), 10);
        const monthPrefix = q.slice(4);
        if (yearPart < 2020 || yearPart > 2030) return [];

        const months: { keyword: string; label: string; icon: string }[] = [];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            if (mStr.startsWith(monthPrefix)) {
                months.push({
                    keyword: `${yearPart}${mStr}`,
                    label: `${yearPart}年${m}月`,
                    icon: '📅'
                });
            }
        }
        return months.slice(0, maxCount);
    }

    // 6桁: YYYYMM
    if (/^\d{6}$/.test(q)) {
        const yearPart = parseInt(q.slice(0, 4), 10);
        const monthPart = parseInt(q.slice(4, 6), 10);
        if (yearPart < 2020 || yearPart > 2030) return [];
        if (monthPart < 1 || monthPart > 12) return [];

        const daysInMonth = new Date(yearPart, monthPart, 0).getDate();
        const dates: { keyword: string; label: string; icon: string }[] = [];

        for (let day = 1; day <= daysInMonth; day++) {
            dates.push({
                keyword: `${q}${String(day).padStart(2, '0')}`,
                label: `${yearPart}年${monthPart}月${day}日`,
                icon: '📅'
            });
        }

        // 今日に近い順にソート
        dates.sort((a, b) => {
            const dayA = parseInt(a.keyword.slice(6, 8));
            const dayB = parseInt(b.keyword.slice(6, 8));
            return Math.abs(dayA - today.getDate()) - Math.abs(dayB - today.getDate());
        });

        return dates.slice(0, maxCount);
    }

    // 7桁: YYYYMMD
    if (/^\d{7}$/.test(q)) {
        const yearPart = parseInt(q.slice(0, 4), 10);
        const monthPart = parseInt(q.slice(4, 6), 10);
        const dayPrefix = q.slice(6);
        if (yearPart < 2020 || yearPart > 2030) return [];
        if (monthPart < 1 || monthPart > 12) return [];

        const daysInMonth = new Date(yearPart, monthPart, 0).getDate();
        const dates: { keyword: string; label: string; icon: string }[] = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = String(day).padStart(2, '0');
            if (dayStr.startsWith(dayPrefix)) {
                dates.push({
                    keyword: `${q.slice(0, 6)}${dayStr}`,
                    label: `${yearPart}年${monthPart}月${day}日`,
                    icon: '📅'
                });
            }
        }
        return dates.slice(0, maxCount);
    }

    // 8桁: YYYYMMDD (完全な日付)
    if (/^\d{8}$/.test(q)) {
        const yearPart = parseInt(q.slice(0, 4), 10);
        const monthPart = parseInt(q.slice(4, 6), 10);
        const dayPart = parseInt(q.slice(6, 8), 10);
        if (yearPart < 2020 || yearPart > 2030) return [];
        if (monthPart < 1 || monthPart > 12) return [];
        const daysInMonth = new Date(yearPart, monthPart, 0).getDate();
        if (dayPart < 1 || dayPart > daysInMonth) return [];

        return [{
            keyword: q,
            label: `${yearPart}年${monthPart}月${dayPart}日`,
            icon: '📅'
        }];
    }

    return [];
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    projects,
    activeProjectId,
    viewMode,
    onTaskClick,
    onProjectClick,
    onCommand,
}) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Filter commands based on current context
    const availableCommands = useMemo(() => {
        return ALL_COMMANDS.filter(cmd => {
            // History commands - always available
            if (['history', 'clear-history'].includes(cmd.id)) {
                return true;
            }

            // Dashboard (no active project)
            if (!activeProjectId) {
                // Only show new-project and history on dashboard
                return cmd.id === 'new-project';
            }

            // In a project
            // Hide new-project when in a project
            if (cmd.id === 'new-project') {
                return false;
            }

            // Board-only commands
            if (cmd.id === 'compact' && viewMode !== 'board') {
                return false;
            }

            // Calendar/Timeline only commands
            const calendarTimelineCommands = ['hide-done', 'go-today', 'prev', 'next'];
            if (calendarTimelineCommands.includes(cmd.id) && viewMode !== 'calendar' && viewMode !== 'timeline') {
                return false;
            }

            // Timeline only commands
            const timelineOnlyCommands = ['view-', 'view0', 'view+'];
            if (timelineOnlyCommands.includes(cmd.id) && viewMode !== 'timeline') {
                return false;
            }

            // Starred - only in project views
            if (cmd.id === 'starred' && !activeProjectId) {
                return false;
            }

            // Hide current view's switch command
            if (cmd.id === 'board' && viewMode === 'board') {
                return false;
            }
            if (cmd.id === 'calendar' && viewMode === 'calendar') {
                return false;
            }
            if (cmd.id === 'timeline' && viewMode === 'timeline') {
                return false;
            }
            return true;
        });
    }, [activeProjectId, viewMode]);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);

    // Filter results based on query
    const results = useMemo((): ResultItem[] => {
        const q = query.toLowerCase().trim();
        const items: ResultItem[] = [];

        if (q.length > 0) {
            // Search commands by keyword match
            availableCommands.forEach(cmd => {
                if (cmd.id.includes(q) || cmd.title.toLowerCase().includes(q)) {
                    items.push({ type: 'command', command: cmd });
                }
            });
            // Date helpers
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            // Keyword suggestions (prefix match)
            SEARCH_KEYWORDS.forEach(kw => {
                if (kw.keyword.startsWith(q)) {
                    items.push({ type: 'keyword', ...kw });
                }
            });

            // Date suggestions (2+ digit numbers)
            if (/^\d{2,8}$/.test(q)) {
                const dateSuggestions = generateDateSuggestions(q, 20);
                dateSuggestions.forEach(ds => {
                    items.push({ type: 'keyword', ...ds });
                });
            }

            // Parse date query (8-digit: YYYYMMDD, 4-digit: MMDD for current year)
            const parseDateQuery = (query: string): string | null => {
                if (/^\d{8}$/.test(query)) {
                    const year = query.slice(0, 4);
                    const month = query.slice(4, 6);
                    const day = query.slice(6, 8);
                    return `${year}-${month}-${day}`;
                }
                if (/^\d{4}$/.test(query)) {
                    const num = parseInt(query, 10);
                    // Skip if it looks like a year (2020-2030)
                    if (num >= 2020 && num <= 2030) return null;
                    const year = today.getFullYear();
                    const month = query.slice(0, 2);
                    const day = query.slice(2, 4);
                    return `${year}-${month}-${day}`;
                }
                return null;
            };

            // Status keywords (exact match for task search)
            const statusKeywords: Record<string, string> = {
                'todo': 'todo',
                'standby': 'standby',
                'in-progress': 'in-progress',
                'inprogress': 'in-progress',
                'done': 'done',
            };
            const isStatusSearch = statusKeywords[q];

            // Date keyword searches (exact match for task search)
            const isTodaySearch = q === 'today' || q === '今日';
            const isYesterdaySearch = q === 'yesterday' || q === '昨日';
            const isTomorrowSearch = q === 'tomorrow' || q === '明日';
            const isOverdueSearch = q === 'overdue' || q === '期限切れ';
            const isUndatedSearch = q === 'undated' || q === 'noduedate' || q === '日付未設定';

            // Numeric date search
            const dateQuery = parseDateQuery(q);

            // Determine if this is a special keyword search
            const isSpecialSearch = isStatusSearch || isTodaySearch || isYesterdaySearch || isTomorrowSearch || isOverdueSearch || isUndatedSearch || dateQuery;

            // Search projects (only for text queries, not special keywords)
            if (!isSpecialSearch && !/^\d+$/.test(q)) {
                projects.forEach(project => {
                    if (project.name.toLowerCase().includes(q)) {
                        items.push({ type: 'project', project });
                    }
                });
            }

            // Search tasks only for exact keyword matches
            if (isSpecialSearch) {
                projects.forEach(project => {
                    project.tasks.forEach(task => {
                        let match = false;

                        if (isStatusSearch) {
                            match = task.status === isStatusSearch;
                        } else if (isTodaySearch) {
                            match = task.startDate === todayStr || task.dueDate === todayStr;
                        } else if (isYesterdaySearch) {
                            match = task.startDate === yesterdayStr || task.dueDate === yesterdayStr;
                        } else if (isTomorrowSearch) {
                            match = task.startDate === tomorrowStr || task.dueDate === tomorrowStr;
                        } else if (isOverdueSearch) {
                            match = task.dueDate ? task.dueDate < todayStr && task.status !== 'done' : false;
                        } else if (isUndatedSearch) {
                            match = !task.startDate && !task.dueDate;
                        } else if (dateQuery) {
                            match = task.startDate === dateQuery || task.dueDate === dateQuery;
                        }

                        if (match) {
                            items.push({
                                type: 'task',
                                task,
                                projectId: project.id,
                                projectName: project.name,
                            });
                        }
                    });
                });
            } else if (!/^\d+$/.test(q)) {
                // Normal text search (not numeric)
                projects.forEach(project => {
                    project.tasks.forEach(task => {
                        const titleMatch = task.title.toLowerCase().includes(q);
                        const tagMatch = task.tags?.some(tag => tag.toLowerCase().includes(q));
                        const descMatch = task.description?.toLowerCase().includes(q);

                        if (titleMatch || tagMatch || descMatch) {
                            items.push({
                                type: 'task',
                                task,
                                projectId: project.id,
                                projectName: project.name,
                            });
                        }
                    });
                });
            }
        } else {
            // Show commands when empty
            availableCommands.forEach(cmd => {
                items.push({ type: 'command', command: cmd });
            });

            // Pinned: Show all projects
            projects.forEach(project => {
                items.push({ type: 'project', project });
            });
        }

        return items.slice(0, 20); // Limit results
    }, [query, projects, activeProjectId, availableCommands]);

    // Reset selected index when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [results.length]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    const executeItem = useCallback((item: ResultItem) => {
        if (item.type === 'keyword') {
            // Set query to keyword and search
            setQuery(item.keyword);
            return; // Don't close modal
        }
        if (item.type === 'command') {
            onCommand(item.command.id);
        } else if (item.type === 'project') {
            onProjectClick(item.project.id);
        } else if (item.type === 'task') {
            onTaskClick(item.projectId, item.task);
        }
        onClose();
    }, [onCommand, onProjectClick, onTaskClick, onClose]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // IME変換中は無視（日本語入力の確定用Enter）
        if (e.nativeEvent.isComposing) {
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (results[selectedIndex]) {
                executeItem(results[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    }, [results, selectedIndex, executeItem, onClose]);

    if (!isOpen) return null;

    return (
        <div className="command-palette-overlay" onClick={onClose}>
            <div
                className="command-palette"
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="command-palette-input-wrapper">
                    <span className="command-palette-icon">🔍</span>
                    <input
                        ref={inputRef}
                        type="text"
                        className="command-palette-input"
                        placeholder="Search..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    <kbd className="command-palette-kbd">esc</kbd>
                </div>

                {results.length > 0 && (
                    <div className="command-palette-results" ref={listRef}>
                        {results.map((item, index) => (
                            <div
                                key={
                                    item.type === 'task'
                                        ? `task-${item.task.id}`
                                        : item.type === 'project'
                                        ? `project-${item.project.id}`
                                        : item.type === 'keyword'
                                        ? `kw-${item.keyword}`
                                        : `cmd-${item.command.id}`
                                }
                                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => executeItem(item)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                {item.type === 'keyword' ? (
                                    <>
                                        <span className="command-palette-item-icon">{item.icon}</span>
                                        <span className="command-palette-item-title">{item.keyword}</span>
                                        <span className="command-palette-item-meta">{item.label}</span>
                                    </>
                                ) : item.type === 'command' ? (
                                    <>
                                        <span className="command-palette-item-icon">{item.command.icon}</span>
                                        <span className="command-palette-item-title">{item.command.title}</span>
                                    </>
                                ) : item.type === 'project' ? (
                                    <>
                                        <span className="command-palette-item-icon">📁</span>
                                        <div className="command-palette-item-content">
                                            <span className="command-palette-item-title">{item.project.name}</span>
                                            <span className="command-palette-item-meta">
                                                {item.project.tasks.length} tasks
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="command-palette-item-icon">
                                            {item.task.starred ? '⭐' : '📝'}
                                        </span>
                                        <div className="command-palette-item-content">
                                            <span className="command-palette-item-title">{item.task.title}</span>
                                            <span className="command-palette-item-meta">
                                                {item.projectName}
                                                {item.task.tags && item.task.tags.length > 0 && (
                                                    <> · {item.task.tags.slice(0, 2).join(', ')}</>
                                                )}
                                            </span>
                                        </div>
                                        <span className={`command-palette-item-status status-${item.task.status}`}>
                                            {item.task.status}
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {results.length === 0 && query.length > 0 && (
                    <div className="command-palette-empty">
                        No results found
                    </div>
                )}
            </div>
        </div>
    );
};
