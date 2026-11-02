import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { AuthPage, ForgotPasswordPage } from './pages/AuthPages.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { DiscoveryPage, TrackDetailsPage } from './pages/DiscoveryPage.jsx';
import { CreateLoungePage, JoinLoungePage, LoungesPage } from './pages/LoungesPages.jsx';
import { LoungeRoomPage } from './pages/LoungeRoomPage.jsx';
import { AnalyticsPage, LibraryPage } from './pages/LibraryAnalyticsPages.jsx';
import { ProfilePage, SettingsPage, AdminAcousticPage } from './pages/ProfileSettingsAdminPages.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<DashboardPage />} />
        <Route path="search" element={<DiscoveryPage mode="search" />} />
        <Route path="discover" element={<DiscoveryPage mode="discover" />} />
        <Route path="track/:trackId" element={<TrackDetailsPage />} />
        <Route path="lounges" element={<LoungesPage />} />
        <Route path="lounges/create" element={<CreateLoungePage />} />
        <Route path="lounges/join" element={<JoinLoungePage />} />
        <Route path="lounge/:loungeId" element={<LoungeRoomPage />} />
        <Route path="lounge/:loungeId/soundclash" element={<LoungeRoomPage soundclashOnly />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/admin/acoustic-data" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<AdminAcousticPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}