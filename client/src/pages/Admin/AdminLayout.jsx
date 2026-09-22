import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import ThemeToggle from '../../components/ThemeToggle.jsx';
import ViewToggle from '../../components/ViewToggle.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useSeo } from '../../lib/seo.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/verifications', label: 'Gender verifications' },
  { to: '/admin/reports', label: 'Reports & tickets' },
  { to: '/admin/users', label: 'Users & bans' },
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useSeo({ title: 'Admin — tinytalks.live', noindex: true, path: '/admin' });

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-slate-200 dark:border-white/5 p-6 flex-col">
        {/* Stacked, not a justify-between row — the wordmark logo and the
            theme+view toggle group together run wider than this 256px
            sidebar's ~208px content width (p-6 padding on both sides), so
            side by side they'd overflow/clip. Each fits comfortably on its
            own line. */}
        <div className="space-y-3">
          <Logo size={30} />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ViewToggle active="admin" />
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-violet-500/15 text-violet-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="mt-3 text-sm text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-left"
        >
          Log out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden border-b border-slate-200 dark:border-white/5 p-4">
        <div className="flex items-center justify-between">
          <Logo size={26} />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ViewToggle active="admin" />
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'bg-violet-500/15 text-violet-300' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
