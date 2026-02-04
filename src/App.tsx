import { useProjects } from './context/ProjectContext';
import { Dashboard } from './features/dashboard/Dashboard';
import { Board } from './features/board/Board';

function App() {
  const { activeProjectId } = useProjects();

  return (
    <div className="min-h-screen">
      <main className="container mx-auto py-8">
        {activeProjectId ? <Board /> : <Dashboard />}
      </main>
    </div>
  );
}

export default App;
