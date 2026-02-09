import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjects } from './context/ProjectContext';
import { useKeyboardStore } from './store/keyboardStore';
import { Dashboard } from './features/dashboard/Dashboard';
import { Board } from './features/board/Board';
import { CommandPalette } from './components/CommandPalette';
import type { Task } from './types';

function App() {
  const { projects, activeProjectId, setActiveProject, undo, redo, canUndo, canRedo } = useProjects();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'calendar' | 'timeline'>('board');

  // Sync commandPaletteOpen to KeyboardStore
  const { setCommandPaletteOpen: setKbPaletteOpen } = useKeyboardStore();
  useEffect(() => {
    setKbPaletteOpen(commandPaletteOpen);
  }, [commandPaletteOpen, setKbPaletteOpen]);

  // Refs to pass commands to child components
  const boardCommandRef = useRef<((cmd: string, task?: Task) => void) | null>(null);
  const dashboardCommandRef = useRef<((cmd: string) => void) | null>(null);

  // Global keyboard listener for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCommand = useCallback((command: string) => {
    switch (command) {
      case 'home':
        setActiveProject(null);
        break;
      case 'new':
      case 'board':
      case 'calendar':
      case 'timeline':
      case 'compact':
      // Calendar/Timeline commands
      case 'hide-done':
      case 'go-today':
      case 'prev':
      case 'next':
      // Timeline view range
      case 'view-':
      case 'view0':
      case 'view+':
      // Other
      case 'starred':
        if (activeProjectId && boardCommandRef.current) {
          boardCommandRef.current(command);
        }
        break;
      // History panel commands - works on both dashboard and board
      case 'history':
        if (activeProjectId && boardCommandRef.current) {
          boardCommandRef.current(command);
        } else if (!activeProjectId && dashboardCommandRef.current) {
          dashboardCommandRef.current(command);
        }
        break;
      // History commands - handle directly (works on dashboard too)
      case 'undo':
        if (canUndo) undo();
        break;
      case 'redo':
        if (canRedo) redo();
        break;
      case 'new-project':
        if (!activeProjectId && dashboardCommandRef.current) {
          dashboardCommandRef.current('new');
        }
        break;
    }
  }, [activeProjectId, setActiveProject, canUndo, canRedo, undo, redo]);

  const handleTaskClick = useCallback((projectId: string, task: Task) => {
    // If not in the project, navigate first
    if (activeProjectId !== projectId) {
      setActiveProject(projectId);
      // Use timeout to wait for Board to mount
      setTimeout(() => {
        if (boardCommandRef.current) {
          boardCommandRef.current('openTask', task);
        }
      }, 100);
    } else if (boardCommandRef.current) {
      boardCommandRef.current('openTask', task);
    }
  }, [activeProjectId, setActiveProject]);

  const handleProjectClick = useCallback((projectId: string) => {
    setActiveProject(projectId);
  }, [setActiveProject]);

  const handleViewModeChange = useCallback((mode: 'board' | 'calendar' | 'timeline') => {
    setViewMode(mode);
  }, []);

  return (
    <div style={{ minHeight: '100vh' }}>
      <main className="container">
        {activeProjectId ? (
          <Board
            commandRef={boardCommandRef}
            commandPaletteOpen={commandPaletteOpen}
            onViewModeChange={handleViewModeChange}
          />
        ) : (
          <Dashboard
            commandRef={dashboardCommandRef}
            commandPaletteOpen={commandPaletteOpen}
          />
        )}
      </main>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        viewMode={activeProjectId ? viewMode : null}
        onTaskClick={handleTaskClick}
        onProjectClick={handleProjectClick}
        onCommand={handleCommand}
      />

    </div>
  );
}

export default App;
