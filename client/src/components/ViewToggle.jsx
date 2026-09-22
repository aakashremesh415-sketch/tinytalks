import { useNavigate } from 'react-router-dom';

// A labeled switch between the normal chat view and the admin dashboard —
// same visual language as ThemeToggle's dark-mode switch (a small pill
// track with a sliding knob), just with a text label instead of an icon,
// since "on"/"off" alone wouldn't say which view is which. Replaces what
// used to be two separate, differently-labeled links (an "Admin view"
// chip in Chat's header, a "Normal view" link in Admin's sidebar) with one
// consistent control. Only ever rendered for admin accounts — see
// Chat.jsx and AdminLayout.jsx, both gated the same way the old links were.
export default function ViewToggle({ active }) {
  const navigate = useNavigate();
  const isAdmin = active === 'admin';

  return (
    <button
      type="button"
      onClick={() => navigate(isAdmin ? '/chat' : '/admin')}
      className="inline-flex items-center gap-2 shrink-0"
      role="switch"
      aria-checked={isAdmin}
      aria-label={isAdmin ? 'Switch to chat view' : 'Switch to admin view'}
      title={isAdmin ? 'Switch to chat view' : 'Switch to admin view'}
    >
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
        Admin view
      </span>
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isAdmin ? 'bg-violet-600' : 'bg-slate-300 dark:bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
            isAdmin ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}
