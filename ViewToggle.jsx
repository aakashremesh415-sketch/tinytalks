import { useNavigate } from 'react-router-dom';

// A sliding pill switch between the normal chat view and the admin
// dashboard — replaces what used to be two separate, differently-labeled
// links (a "Admin view" chip in Chat's header, a "Normal view" link in
// Admin's sidebar) with one consistent control that visually shows which
// side you're currently on. Only ever rendered for admin accounts — see
// Chat.jsx and AdminLayout.jsx, both gated the same way the old links were.
export default function ViewToggle({ active }) {
  const navigate = useNavigate();
  const isAdmin = active === 'admin';

  return (
    <button
      type="button"
      onClick={() => navigate(isAdmin ? '/chat' : '/admin')}
      className="relative inline-flex items-center h-8 w-36 shrink-0 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-0.5"
      role="switch"
      aria-checked={isAdmin}
      aria-label={isAdmin ? 'Switch to chat view' : 'Switch to admin view'}
      title={isAdmin ? 'Switch to chat view' : 'Switch to admin view'}
    >
      <span
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-brand-gradient transition-transform duration-200 ease-out ${
          isAdmin ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      <span className={`relative z-10 flex-1 text-center text-xs font-medium transition-colors ${!isAdmin ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>
        Chat
      </span>
      <span className={`relative z-10 flex-1 text-center text-xs font-medium transition-colors ${isAdmin ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>
        Admin
      </span>
    </button>
  );
}
