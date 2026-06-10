import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout, ProtectedRoute } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Candidates } from './pages/Candidates';
import { Jobs } from './pages/Jobs';
import { InterviewPrep } from './pages/InterviewPrep';
import { AgentsPipeline } from './pages/AgentsPipeline';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { HiringCommandCenter } from './pages/HiringCommandCenter';
import { AdaptiveSimulator } from './pages/AdaptiveSimulator';
import { PipelineBoard } from './pages/PipelineBoard';
import { PipelineAnalytics } from './pages/PipelineAnalytics';
import { CandidateComparisonWorkspace } from './pages/CandidateComparisonWorkspace';
import { ExecutiveDashboard } from './pages/ExecutiveDashboard';
import { AuditCenter } from './pages/AuditCenter';
import { AICostCenter } from './pages/AICostCenter';
import { BillingDashboard } from './pages/BillingDashboard';
import { LaunchCertificationCenter } from './pages/LaunchCertificationCenter';
import { useSelector } from 'react-redux';
import type { RootState } from './store';

const RoleRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
  const role = useSelector((state: RootState) => state.auth.role);
  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

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
        <Route 
          path="/command-center" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <HiringCommandCenter />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/adaptive-interview" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AdaptiveSimulator />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/pipeline" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PipelineBoard />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/pipeline-analytics" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PipelineAnalytics />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/compare" 
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <CandidateComparisonWorkspace />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/executive" 
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout>
                  <ExecutiveDashboard />
                </DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } 
        />
        <Route path="/audit" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><AuditCenter /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
          <Route path="/cost" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><AICostCenter /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
          <Route path="/billing" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><BillingDashboard /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
          <Route path="/launch-certification" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><LaunchCertificationCenter /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
