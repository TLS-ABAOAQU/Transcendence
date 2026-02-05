import { useProjects } from './context/ProjectContext';
import { Dashboard } from './features/dashboard/Dashboard';
import { Board } from './features/board/Board';

function App() {
  const { activeProjectId } = useProjects();

  return (
    <div style={{ minHeight: '100vh' }}>
      <main className="container">
        {activeProjectId ? <Board /> : <Dashboard />}
      </main>
    </div>
  );
}

export default App;
