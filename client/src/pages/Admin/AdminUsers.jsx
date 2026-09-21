import { useState } from 'react';
import { api } from '../../lib/api.js';

export default function AdminUsers() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [searched, setSearched] = useState(false);

  async function search(e) {
    e.preventDefault();
    const { data } = await api.get('/admin/users', { params: { query } });
    setUsers(data.users);
    setSearched(true);
  }

  async function ban(userId) {
    setBusyId(userId);
    try {
      await api.post(`/admin/users/${userId}/ban`, { reason: reason || 'Policy violation' });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: true, banReason: reason || 'Policy violation' } : u)));
    } finally {
      setBusyId(null);
    }
  }

  async function unban(userId) {
    setBusyId(userId);
    try {
      await api.post(`/admin/users/${userId}/unban`);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, banned: false, banReason: null } : u)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Users &amp; bans</h1>
      <p className="text-slate-400 mt-1">
        Banning writes a permanent hashed-identifier record, so a banned guest can't just re-verify a
        fresh ephemeral account with the same email after their old one is purged.
      </p>

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

      <div className="mt-6 space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{u.displayName || '(no name)'} <span className="text-slate-500 text-sm">{u.email}</span></p>
              <p className="text-xs text-slate-500 mt-0.5">
                {u.accountType} · gender: {u.genderVerification} · joined {new Date(u.createdAt).toLocaleDateString()}
              </p>
              {u.banned && <span className="chip mt-1 bg-coral-500/10 border-coral-500/30 text-coral-400">Banned: {u.banReason}</span>}
            </div>
            <button
              className={`btn-secondary !py-1.5 !px-3 text-sm ${u.banned ? '' : 'border-coral-500/40 text-coral-400'}`}
              disabled={busyId === u.id}
              onClick={() => (u.banned ? unban(u.id) : ban(u.id))}
            >
              {u.banned ? 'Unban' : 'Ban'}
            </button>
          </div>
        ))}
        {searched && users.length === 0 && <p className="text-slate-500 text-sm">No users match that search.</p>}
      </div>
    </div>
  );
}
