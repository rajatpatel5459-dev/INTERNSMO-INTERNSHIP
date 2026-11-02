import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AudioLines,
  Compass,
  Headphones,
  Home,
  Library,
  Menu,
  Search,
  Settings,
  Shield,
  BarChart3,
  X,
  Plus,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

const primaryLinks = [
  { to: '/app/home', label: 'Home', icon: Home, end: true },
  { to: '/app/search', label: 'Search', icon: Search },
  { to: '/app/discover', label: 'Discover', icon: Compass },
  { to: '/app/library', label: 'Your library', icon: Library },
];

const workspaceLinks = [
  { to: '/app/lounges', label: 'DJ Lounges', icon: Headphones },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { lounges } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const canCreateLounge = user?.role === 'host' || user?.role === 'admin';

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function handleSearch(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    navigate(`/app/search?q=${encodeURIComponent(formData.get('q') || '')}`);
  }

  async function handleLogout() {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      window.alert(`Could not complete server logout: ${error.message}`);
      navigate('/');
    }
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeSidebar} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <Link className="brand-lockup" to="/app/home" onClick={closeSidebar}>
          <span className="brand-mark"><AudioLines size={21} strokeWidth={2.2} /></span>
          <span>AI DJ<span className="brand-light"> Engine</span></span>
        </Link>
        <div className="sidebar-label">Workspace</div>
        <nav className="side-nav" aria-label="Main navigation">
          {primaryLinks.map((item) => <SideLink key={item.to} {...item} onClick={closeSidebar} />)}
        </nav>
        <div className="sidebar-label sidebar-label-spaced">Your space</div>
        <nav className="side-nav" aria-label="Your space">
          {workspaceLinks.map((item) => <SideLink key={item.to} {...item} onClick={closeSidebar} />)}
        </nav>
        <div className="sidebar-section-head">
          <span className="sidebar-label">Your lounges</span>
          {canCreateLounge && <Link to="/app/lounges/create" className="icon-button subtle-icon" aria-label="Create lounge" onClick={closeSidebar}><Plus size={16} /></Link>}
        </div>
        <div className="sidebar-lounges">
          {lounges.slice(0, 4).map((lounge) => (
            <Link to={`/app/lounge/${lounge.id}`} onClick={closeSidebar} key={lounge.id}>
              <span className={lounge.status === 'live' ? 'live-dot' : 'lounge-dot lounge-dot-blue'} />
              {lounge.name}
            </Link>
          ))}
          {!lounges.length && <span className="sidebar-label">No lounges yet</span>}
        </div>
        {user?.role === 'admin' && (
          <>
            <div className="sidebar-label sidebar-label-spaced">Admin</div>
            <nav className="side-nav">
              <SideLink to="/admin/acoustic-data" label="Acoustic data" icon={Shield} onClick={closeSidebar} />
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <div className="promo-icon"><AudioLines size={18} /></div>
            <strong>Sound in sync.</strong>
            <p>Your room, your rules. Let the AI find the flow.</p>
            {canCreateLounge && <Link to="/app/lounges/create" onClick={closeSidebar}>Create a lounge <span>↗</span></Link>}
          </div>
          <div className="sidebar-user">
            <span className="avatar avatar-small">{user?.avatar || user?.displayName?.slice(0, 2).toUpperCase()}</span>
            <div className="sidebar-user-copy">
              <strong>{user?.displayName}</strong>
              <span>{formatRole(user?.role)}</span>
            </div>
            <button className="icon-button subtle-icon" aria-label="Open settings" onClick={() => navigate('/app/settings')}><Settings size={17} /></button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <form className="topbar-search" onSubmit={handleSearch}>
            <Search size={17} />
            <input name="q" aria-label="Search tracks and lounges" placeholder="Search tracks, artists, lounges..." />
            <kbd>⌘ K</kbd>
          </form>
          <div className="topbar-actions">
            <div className="profile-menu-wrap">
              <button className="topbar-profile" onClick={() => setProfileOpen((current) => !current)} aria-expanded={profileOpen}>
                <span className="avatar avatar-small">{user?.avatar || user?.displayName?.slice(0, 2).toUpperCase()}</span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-user"><strong>{user?.displayName}</strong><span>{user?.email}</span></div>
                  <Link to="/app/profile" onClick={() => setProfileOpen(false)}>Your profile</Link>
                  <Link to="/app/settings" onClick={() => setProfileOpen(false)}>Settings</Link>
                  <button onClick={handleLogout}> <LogOut size={15} /> Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-content" key={location.pathname}>
          <Outlet />
        </main>
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          <SideLink to="/app/home" label="Home" icon={Home} end />
          <SideLink to="/app/search" label="Search" icon={Search} />
          <SideLink to="/app/lounges" label="Lounges" icon={Headphones} />
          <SideLink to="/app/library" label="Library" icon={Library} />
        </nav>
      </div>
    </div>
  );
}

function SideLink({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`} onClick={onClick}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </NavLink>
  );
}

function formatRole(role = 'listener') {
  return role.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
