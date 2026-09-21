import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function AdminVerifications() {
  const [users, setUsers] = useState([]);
  const [photos, setPhotos] = useState({}); // userId -> object URL
  const [busyId, setBusyId] = useState(null);

  async function load() {
    const { data } = await api.get('/admin/verifications/pending');
    setUsers(data.users);

    for (const u of data.users) {
      try {
        const res = await api.get(`/admin/verifications/${u.id}/photo`, { responseType: 'blob' });
        setPhotos((prev) => ({ ...prev, [u.id]: URL.createObjectURL(res.data) }));
      } catch { /* no photo on file */ }
    }
  }

  useEffect(() => {
    load();
    return () => Object.values(photos).forEach((url) => URL.revokeObjectURL(url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(userId, decision) {
    setBusyId(userId);
    try {
      await api.post(`/admin/verifications/${userId}/decision`, { decision });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Gender verifications</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">Review the submitted photo against the claimed gender.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {users.map((u) => (
          <div key={u.id} className="card overflow-hidden">
            {photos[u.id] ? (
              <img src={photos[u.id]} alt="Verification submission" className="w-full h-56 object-cover bg-black" />
            ) : (
              <div className="w-full h-56 bg-black/40 flex items-center justify-center text-slate-600 text-sm">Loading…</div>
            )}
            <div className="p-4">
              <p className="font-medium">{u.displayName || u.email}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Claimed: {u.genderClaimed}</p>
              <div className="flex gap-2 mt-3">
                <button
                  className="btn-secondary flex-1 !py-1.5 text-sm"
                  disabled={busyId === u.id}
                  onClick={() => decide(u.id, 'REJECTED')}
                >
                  Reject
                </button>
                <button
                  className="btn-primary flex-1 !py-1.5 text-sm"
                  disabled={busyId === u.id}
                  onClick={() => decide(u.id, 'APPROVED')}
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-slate-500 text-sm">Nothing pending. 🎉</p>}
      </div>
    </div>
  );
}
