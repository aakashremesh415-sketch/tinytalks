import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // matches server's ACTIVITY_THROTTLE_MS — see middleware/auth.js

function isActive(lastSeenAt) {
  return Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt).getTime() < ACTIVE_WINDOW_MS;
}

function formatSeen(lastSeenAt) {
  if (!lastSeenAt) return 'Never seen';
  return isActive(lastSeenAt) ? 'Active now' : `Last seen ${new Date(lastSeenAt).toLocaleString()}`;
}

export default function AdminUsers() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  // "Browse all" — a separate, paginated directory of every account,
  // newest first, distinct from the search box above which only ever shows
  // matches for a typed query. Doubles as an activity view since each row
  // carries its own last-seen state.
  const [directory, setDirectory] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [activeUsers, setActiveUsers] = useState(null);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  const [ipLogFor, setIpLogFor] = useState(null); // user object currently showing its IP log
  const [ipLog, setIpLog] = useState([]);
  const [ipLogLoading, setIpLogLoading] = useState(false);

  useEffect(() => {
    loadDirectory(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function loadDirectory(p) {
    setLoadingDirectory(true);
    try {
      const { data } = await api.get('/admin/users/list', { params: { page: p, pageSize } });
      setDirectory(data.users);
      setTotal(data.total);
      setActiveUsers(data.activeUsers);
    } finally {
      setLoadingDirectory(false);
    }
  }

  async function search(e) {
    e.preventDefault();
    const { data } = await api.get('/admin/users', { params: { query } });
    setSearchResults(data.users);
    setSearched(true);
  }

  async function ban(userId, list) {
    setBusyId(userId);
    try {
      await api.post(`/admin/users/${userId}/ban`, { reason: reason || 'Policy violation' });
      list((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: true, banReason: reason || 'Policy violation' } : u)));
    } finally {
      setBusyId(null);
    }
  }

  async function unban(userId, list) {
    setBusyId(userId);
    try {
      await api.post(`/admin/users/${userId}/unban`);
      list((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: false, banReason: null } : u)));
    } finally {
      setBusyId(null);
    }
  }

  async function viewIpLog(user) {
    setIpLogFor(user);
    setIpLogLoading(true);
    try {
      const { data } = await api.get(`/admin/users/${user.id}/ip-log`);
      setIpLog(data.logs);
    } finally {
      setIpLogLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Users &amp; bans</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">
        Banning writes a permanent hashed-identifier record, so a banned guest can't just re-verify a
        fresh ephemeral account with the same email after their old one is purged. IP addresses and
        last-seen times below are visible to admins only.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mt-6 max-w-lg">
        <div className="card p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Total users</p>
          <p className="font-display text-2xl font-bold mt-1">{total ?? '–'}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Active (last 5 min)</p>
          <p className="font-display text-2xl font-bold mt-1">{activeUsers ?? '–'}</p>
        </div>
      </div>

      <form onSubmit={search} className="flex gap-2 mt-6 max-w-lg">
        <input className="input" placeholder="Search by email or display name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn-secondary shrink-0">Search</button>
      </form>

      <input
        className="input max-w-lg mt-3"
        placeholder="Ban reason (used if you ban someone below)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {searched && (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Search results</p>
          <div className="space-y-2">
            {searchResults.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                busy={busyId === u.id}
                onBan={() => ban(u.id, setSearchResults)}
                onUnban={() => unban(u.id, setSearchResults)}
                onViewIpLog={() => viewIpLog(u)}
              />
            ))}
            {searchResults.length === 0 && <p className="text-slate-500 text-sm">No users match that search.</p>}
          </div>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
            All users {loadingDirectory ? '· loading…' : `· page ${page} of ${totalPages}`}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary !py-1 !px-3 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <button className="btn-secondary !py-1 !px-3 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {directory.map((u) => (
            <UserRow
              key={u.id}
              u={u}
              busy={busyId === u.id}
              onBan={() => ban(u.id, setDirectory)}
              onUnban={() => unban(u.id, setDirectory)}
              onViewIpLog={() => viewIpLog(u)}
            />
          ))}
          {!loadingDirectory && directory.length === 0 && <p className="text-slate-500 text-sm">No users yet.</p>}
        </div>
      </div>

      {ipLogFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50" onClick={() => setIpLogFor(null)}>
          <div className="card p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-display font-semibold">
                IP history — {ipLogFor.displayName || ipLogFor.email || 'Anonymous'}
              </p>
              <button onClick={() => setIpLogFor(null)} className="text-slate-400 hover:text-coral-500 text-lg leading-none px-1">✕</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              One entry per distinct IP change, newest first — not a log of every request.
            </p>
            <div className="mt-4 space-y-1.5">
              {ipLogLoading && <p className="text-sm text-slate-500">Loading…</p>}
              {!ipLogLoading && ipLog.length === 0 && <p className="text-sm text-slate-500">No IP history recorded yet.</p>}
              {!ipLogLoading && ipLog.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-slate-100 dark:bg-white/5 text-sm">
                  <span className="font-mono">{l.ip}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({ u, busy, onBan, onUnban, onViewIpLog }) {
  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium truncate">
          {u.displayName || '(no name)'} <span className="text-slate-500 text-sm">{u.email}</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {u.accountType} · gender: {u.genderVerification} · joined {new Date(u.createdAt).toLocaleDateString()}
        </p>
        <p className="text-xs mt-0.5 flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isActive(u.lastSeenAt) ? 'bg-mint-500' : 'bg-slate-400 dark:bg-slate-500'}`} />
          <span className="text-slate-500 dark:text-slate-400">{formatSeen(u.lastSeenAt)}</span>
          {u.lastIp && <span className="text-slate-400 dark:text-slate-500 font-mono">· {u.lastIp}</span>}
        </p>
        {u.banned && <span className="chip mt-1 bg-coral-500/10 border-coral-500/30 text-coral-400">Banned: {u.banReason}</span>}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        <button className="btn-secondary !py-1.5 !px-3 text-xs" onClick={onViewIpLog}>IP history</button>
        <button
          className={`btn-secondary !py-1.5 !px-3 text-sm ${u.banned ? '' : 'border-coral-500/40 text-coral-400'}`}
          disabled={busy}
          onClick={u.banned ? onUnban : onBan}
        >
          {u.banned ? 'Unban' : 'Ban'}
        </button>
      </div>
    </div>
  );
}
