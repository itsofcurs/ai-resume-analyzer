import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout, ProtectedRoute } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { VerifyEmail } from './pages/VerifyEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { AuthSuccess } from './pages/AuthSuccess';
import { SecuritySettings } from './pages/SecuritySettings';
import { MFASettings } from './pages/MFASettings';
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
import { OnboardingWizard } from './pages/OnboardingWizard';
import { BillingCenter } from './pages/BillingCenter';
import { CustomerSuccess } from './pages/CustomerSuccess';
import { AdminPortal } from './pages/AdminPortal';
import { ReportsCenter } from './pages/ReportsCenter';
import { FinOpsCenter } from './pages/FinOpsCenter';
import { KnowledgeBase } from './pages/KnowledgeBase';
import SecurityCenter from './pages/SecurityCenter';
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
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth-success" element={<AuthSuccess />} />
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
          <Route path="/onboarding-wizard" element={
            <ProtectedRoute>
              <DashboardLayout><OnboardingWizard /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/billing-center" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><BillingCenter /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
          <Route path="/customer-success" element={
            <ProtectedRoute>
              <DashboardLayout><CustomerSuccess /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin-portal" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><AdminPortal /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
          <Route path="/reports-center" element={
            <ProtectedRoute>
              <DashboardLayout><ReportsCenter /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/finops-center" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['executive', 'admin']}>
                <DashboardLayout><FinOpsCenter /></DashboardLayout>
              </RoleRoute>
            </ProtectedRoute>
          } />
          <Route path="/knowledge-base" element={
            <ProtectedRoute>
              <DashboardLayout><KnowledgeBase /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/security" element={
            <ProtectedRoute>
              <DashboardLayout><SecuritySettings /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/mfa-setup" element={
            <ProtectedRoute>
              <DashboardLayout><MFASettings /></DashboardLayout>
            </ProtectedRoute>
          } />
          <Route path="/security-center" element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'executive', 'admin']}>
                <DashboardLayout><SecurityCenter /></DashboardLayout>
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
