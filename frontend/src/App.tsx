
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout, ProtectedRoute } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Candidates } from './pages/Candidates';
import { Jobs } from './pages/Jobs';
import { InterviewPrep } from './pages/InterviewPrep';
import { AgentsPipeline } from './pages/AgentsPipeline';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/candidates" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Candidates />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/jobs" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Jobs />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/interview-prep" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <InterviewPrep />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/agents-pipeline" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AgentsPipeline />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/analytics" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AnalyticsDashboard />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
