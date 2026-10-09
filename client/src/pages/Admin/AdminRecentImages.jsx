import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

export default function AdminRecentImages() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRecentImages() {
      try {
        const { data } = await api.get('/admin/images/recent');
        if (!cancelled) {
          setImages(data.images || []);
          setError('');
        }
      } catch (err) {
        console.error('[admin] recent-images load failed:', err);
        if (!cancelled) {
          setError('Could not load recent chat images.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRecentImages();
    return () => { cancelled = true; };
  }, []);

  async function previewImage(imageId) {
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const { data } = await api.get(`/admin/images/${imageId}`, { responseType: 'arraybuffer' });
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      setPreviewId(imageId);
      setPreviewUrl(url);
    } catch (err) {
      console.error('[admin] preview failed:', err);
      setPreviewId(null);
      setPreviewUrl('');
      window.alert('This image is no longer available in the 2-day admin review window.');
    }
  }

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Recent chat images</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">Images shared in chat during the last 2 days. Older uploads are automatically cleared from the admin review window.</p>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading recent uploads…</p>}
      {!loading && error && <p className="mt-6 text-sm text-coral-500">{error}</p>}

      {!loading && !error && images.length === 0 && (
        <div className="card mt-6 p-6 text-sm text-slate-500 dark:text-slate-400">
          No chat images were shared in the last 2 days.
        </div>
      )}

      {!loading && !error && images.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {images.map((image) => (
            <div key={image.id} className="card p-4">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{new Date(image.uploadedAt).toLocaleString()}</span>
                <span className="chip border-violet-500/20 bg-violet-500/10 text-violet-300">{image.viewMode === 'ONE_TIME' ? 'One-time' : '10s'}</span>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                <p><span className="text-slate-500 dark:text-slate-400">Sender:</span> {image.sender?.displayName || image.sender?.email || 'Unknown'}</p>
                <p><span className="text-slate-500 dark:text-slate-400">Chat partner:</span> {image.partner?.displayName || image.partner?.email || 'Unknown'}</p>
              </div>

              <button
                type="button"
                onClick={() => previewImage(image.id)}
                className="btn-secondary mt-4 w-full"
              >
                {previewId === image.id && previewUrl ? 'Refresh preview' : 'Preview image'}
              </button>
            </div>
          ))}
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
          <div className="card max-w-3xl w-full p-3">
            <div className="flex justify-end mb-2">
              <button type="button" onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(''); setPreviewId(null); }} className="btn-secondary !py-1.5 !px-3 text-xs">
                Close
              </button>
            </div>
            <img src={previewUrl} alt="Recent chat image preview" className="max-h-[80vh] w-full object-contain rounded-lg bg-slate-900" />
          </div>
        </div>
      )}
    </div>
  );
}
