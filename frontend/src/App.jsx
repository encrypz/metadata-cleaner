import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { zipSync } from 'fflate';
import './App.css';
import encrypzLogo from './assets/logo.png';

// In dev, Vite proxies /api to the FastAPI server (see vite.config.js), so the
// same relative URL works from a desktop browser or a phone on the LAN.
const API_BASE = '';
const CONCURRENCY = 3;
const ACCEPTED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const PLATFORMS = ['Instagram', 'Facebook', 'Threads', 'TikTok', 'X / Twitter', 'LinkedIn', 'Pinterest', 'WhatsApp'];

const formatBytes = (b) => {
  if (b === undefined || b === null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const randomName = () => {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return 'IMG_' + Array.from(arr, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
};

const splitName = (name) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i + 1).toLowerCase()] : [name, ''];
};

let idCounter = 0;

/* ---------- Icons ---------- */
const Icon = {
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  Download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12m0 0-5-5m5 5 5-5" /><path d="M4 20h16" /></svg>
  ),
  Share: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13m0-13L7.5 7.5M12 3l4.5 4.5" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></svg>
  ),
  Zip: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10z" /><path d="M10 3v2m0 2v2m0 2v2m2-8v2m0 2v2m0 2v2" /><rect x="9" y="14" width="4" height="4" rx="1" /></svg>
  ),
  Pdf: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" /></svg>
  ),
  Pin: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  Bolt: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>
  ),
  Tag: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
  ),
  Camera: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  File: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 4v16" /></svg>
  ),
};

/* ---------- File row ---------- */
function FileRow({ item, onRemove, onDownload }) {
  const aiCount = item.report?.filter((r) => r.kind === 'ai').length || 0;
  const saved = item.cleanedSize !== undefined ? item.size - item.cleanedSize : 0;

  return (
    <li className={`file-row status-${item.status}`}>
      <div className="file-thumb">
        {item.preview ? <img src={item.preview} alt="" /> : <Icon.Pdf />}
        {item.status === 'done' && <span className="thumb-badge"><Icon.Check /></span>}
      </div>

      <div className="file-info">
        <div className="file-title">
          <span className="file-name" title={item.name}>{item.outName || item.name}</span>
          {item.outName && item.outName !== item.name && (
            <span className="file-renamed" title={`Original: ${item.name}`}>renamed</span>
          )}
        </div>
        <div className="file-meta">
          {item.status === 'queued' && <span>Queued · {formatBytes(item.size)}</span>}
          {item.status === 'processing' && <span className="shimmer-text">Scrubbing metadata…</span>}
          {item.status === 'error' && <span className="err-text">{item.error}</span>}
          {item.status === 'done' && (
            <span>
              {formatBytes(item.size)} → {formatBytes(item.cleanedSize)}
              {saved > 0 && <em> · {formatBytes(saved)} of hidden data removed</em>}
            </span>
          )}
        </div>
        {item.status === 'done' && (
          <div className="chips">
            {item.report.length === 0 && <span className="chip chip-clean">Already clean</span>}
            {item.report.slice(0, 6).map((r) => (
              <span key={r.label} className={`chip chip-${r.kind}`}>{r.label}</span>
            ))}
            {item.report.length > 6 && <span className="chip chip-more">+{item.report.length - 6} more</span>}
          </div>
        )}
        {item.status === 'processing' && <div className="row-progress"><span /></div>}
      </div>

      <div className="file-actions">
        {aiCount > 0 && item.status === 'done' && (
          <span className="ai-stamp" title="AI labels removed"><Icon.Sparkle /><span className="ai-stamp-text"> AI tags removed</span></span>
        )}
        {item.status === 'done' && (
          <button className="icon-btn" onClick={() => onDownload(item)} title="Download" aria-label={`Download ${item.outName}`}>
            <Icon.Download />
          </button>
        )}
        <button className="icon-btn subtle" onClick={() => onRemove(item.id)} title="Remove" aria-label={`Remove ${item.name}`}>
          <Icon.X />
        </button>
      </div>
    </li>
  );
}

/* ---------- App ---------- */
function App() {
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [randomize, setRandomize] = useState(true);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const itemsRef = useRef(items);
  const randomizeRef = useRef(randomize);
  const active = useRef(0);

  // Touch devices get tap-oriented copy and the native share sheet.
  const [isTouch] = useState(() => {
    try {
      return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    } catch {
      return false;
    }
  });

  const [canShareFiles] = useState(() => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
        const testFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
        return Boolean(navigator.canShare({ files: [testFile] }));
      }
      return false;
    } catch {
      return false;
    }
  });
  const [sharing, setSharing] = useState(false);
  const [activeSection, setActiveSection] = useState('cleaner');

  useEffect(() => {
    const sectionIds = ['ai-labels', 'what-we-remove', 'privacy'];
    const handleScroll = () => {
      const scrollPos = window.scrollY + 180;
      let current = '';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollPos) {
          current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { randomizeRef.current = randomize; }, [randomize]);
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);

  const update = (id, patch) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processItem = useCallback(async (item) => {
    update(item.id, { status: 'processing' });
    const fd = new FormData();
    fd.append('file', item.file);
    try {
      const res = await fetch(`${API_BASE}/api/clean`, { method: 'POST', body: fd });
      if (!res.ok) {
        let detail = 'Failed to process file';
        try { detail = (await res.json()).detail || detail; } catch { /* non-JSON */ }
        throw new Error(detail);
      }
      const blob = await res.blob();
      let report = [];
      try { report = JSON.parse(res.headers.get('X-Clean-Report') || '[]'); } catch { /* ignore */ }
      const [base] = splitName(item.name);
      const ext = EXT_BY_MIME[blob.type] || splitName(item.name)[1];
      const outName = `${randomizeRef.current ? randomName() : base}.${ext}`;
      update(item.id, { status: 'done', blob, report, cleanedSize: blob.size, outName });
    } catch (err) {
      const msg = err instanceof TypeError ? 'Cannot reach the cleaning server' : err.message;
      update(item.id, { status: 'error', error: msg });
    }
  }, []);

  // Simple concurrency-limited queue runner. When a slot frees up we bump
  // `tick`, which re-runs the effect below and starts the next queued file.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const queued = items.filter((i) => i.status === 'queued' && !i._started);
    while (active.current < CONCURRENCY && queued.length) {
      const next = queued.shift();
      next._started = true;
      active.current += 1;
      processItem(next).finally(() => {
        active.current -= 1;
        setTick((t) => t + 1);
      });
    }
  }, [items, tick, processItem]);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList).map((file) => {
      const [, ext] = splitName(file.name);
      const ok = ACCEPTED_EXT.includes(ext) || Object.keys(EXT_BY_MIME).includes(file.type);
      const isImage = file.type.startsWith('image/');
      return {
        id: ++idCounter,
        file,
        name: file.name,
        size: file.size,
        preview: ok && isImage ? URL.createObjectURL(file) : null,
        status: ok ? 'queued' : 'error',
        error: ok ? null : 'Unsupported format (use JPEG, PNG, WebP or PDF)',
      };
    });
    setItems((prev) => [...prev, ...incoming]);
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    setItems((prev) => prev.filter((p) => p.status === 'processing'));
  };

  const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const done = items.filter((i) => i.status === 'done');
  const busy = items.some((i) => i.status === 'queued' || i.status === 'processing');

  const downloadZip = async () => {
    if (!done.length) return;
    if (done.length === 1) return saveBlob(done[0].blob, done[0].outName);
    setZipping(true);
    try {
      const files = {};
      const used = new Set();
      for (const it of done) {
        let name = it.outName;
        const [b, e] = splitName(name);
        let n = 1;
        while (used.has(name)) name = `${b}_${n++}.${e}`;
        used.add(name);
        // Stored (no compression): images are already compressed; fixed date leaks nothing.
        files[name] = [new Uint8Array(await it.blob.arrayBuffer()), { level: 0, mtime: new Date(1980, 0, 1) }];
      }
      const zipped = zipSync(files);
      saveBlob(new Blob([zipped], { type: 'application/zip' }), `encrypz-clean-${done.length}-files.zip`);
    } finally {
      setZipping(false);
    }
  };

  // Native share sheet: lets phone users "Save to Photos" or post straight to
  // Instagram/WhatsApp/etc. without dealing with ZIP files.
  const shareFiles = async () => {
    const files = done.map((it) => new File([it.blob], it.outName, { type: it.blob.type }));
    if (!files.length || !navigator.canShare?.({ files })) return downloadZip();
    setSharing(true);
    try {
      await navigator.share({ files });
    } catch (err) {
      if (err?.name !== 'AbortError') downloadZip();
    } finally {
      setSharing(false);
    }
  };

  const showShare = isTouch && canShareFiles;

  const stats = useMemo(() => {
    const removed = done.reduce((s, i) => s + i.report.length, 0);
    const ai = done.reduce((s, i) => s + i.report.filter((r) => r.kind === 'ai').length, 0);
    const privacy = done.reduce((s, i) => s + i.report.filter((r) => r.kind === 'privacy').length, 0);
    return { removed, ai, privacy };
  }, [done]);

  const progress = items.length ? Math.round(((done.length + items.filter((i) => i.status === 'error').length) / items.length) * 100) : 0;

  /* Drag & drop */
  const onDragEnter = (e) => { e.preventDefault(); dragDepth.current += 1; setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) setIsDragging(false); };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };
  const openPicker = () => fileInputRef.current?.click();
  const onSelect = (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="page">
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      <div className="navbar-wrapper">
        <nav className="navbar" aria-label="Main Navigation">
          <a className="nav-brand" href="#top">
            <span className="logo-wrap"><img src={encrypzLogo} alt="Encrypz logo" /></span>
            Encrypz <span className="brand-accent">Cleaner</span>
          </a>
          <div className="nav-capsule">
            <a href="#ai-labels" className={`nav-tab ${activeSection === 'ai-labels' ? 'active' : ''}`}>AI Labels</a>
            <a href="#what-we-remove" className={`nav-tab ${activeSection === 'what-we-remove' ? 'active' : ''}`}>What We Remove</a>
            <a href="#privacy" className={`nav-tab ${activeSection === 'privacy' ? 'active' : ''}`}>Privacy</a>
          </div>
          <a href="https://encrypz.com" className="nav-cta" id="nav-back-btn" target="_blank" rel="noopener noreferrer">
            Back to Encrypz ↗
          </a>
        </nav>
      </div>

      <div className="hero" id="top">
        <header className="hero-copy">
          <h1 className="hero-title">
            Post your photos.<br />
            <span className="gradient-text">Not your metadata.</span>
          </h1>
          <p className="hero-sub">
            Strip GPS, camera details, C2PA Content Credentials and AI-generator tags
            from your images before you share them — in bulk, losslessly, in seconds.
          </p>

          <ul className="hero-points desktop-only">
            <li><span className="point-icon ai"><Icon.Sparkle /></span><span>Removes the metadata that triggers <strong>“AI info” / “Made with AI”</strong> labels</span></li>
            <li><span className="point-icon privacy"><Icon.Pin /></span><span>Wipes GPS location, device model, serials &amp; timestamps</span></li>
            <li><span className="point-icon meta"><Icon.Bolt /></span><span>Lossless — not a single pixel is re-encoded</span></li>
          </ul>

          <div className="platforms desktop-only">
            <span className="platforms-label">Ready for</span>
            <div className="platform-marquee">
              <div className="platform-track">
                {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                  <span key={i} className="platform-pill">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="cleaner-card" aria-label="Metadata cleaner">
          <div className="card-border" aria-hidden="true" />

          <div
            id="drop-zone"
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${items.length ? 'compact' : ''}`}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
          >
            <input
              id="file-input"
              type="file"
              ref={fileInputRef}
              onChange={onSelect}
              accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              multiple
              hidden
            />
            <div className="drop-icon"><Icon.Upload /></div>
            <div className="drop-text">
              <h2>
                {isDragging
                  ? 'Release to clean'
                  : items.length
                    ? (isTouch ? 'Add more photos' : 'Add more files')
                    : (isTouch ? 'Tap to choose photos' : 'Drop photos or click to browse')}
              </h2>
              <p>Supports <strong>JPEG</strong>, <strong>PNG</strong>, <strong>WebP</strong> & <strong>PDF</strong></p>
              <div className="drop-badges">
                <span>Lossless</span>
                <span>Zero RAM persistence</span>
                <span>Bulk ZIP</span>
              </div>
            </div>
            {!items.length && (
              <button 
                type="button" 
                className="btn btn-primary btn-browse" 
                id="browse-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
              >
                <Icon.Upload />
                {isTouch ? 'Select Photos from Device' : 'Browse Files on Computer'}
              </button>
            )}
          </div>

          <div className="options-row">
            <label className="toggle" htmlFor="randomize-toggle">
              <input id="randomize-toggle" type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
              <span className="toggle-label">
                Randomize filenames
                <small>Hides names like “ChatGPT Image…” or “Gemini_Generated…”</small>
              </span>
            </label>
          </div>

          {items.length > 0 && (
            <>
              <div className="queue-head">
                <div>
                  <strong>{done.length}</strong> of {items.length} cleaned
                  {busy && <span className="busy-dot" />}
                </div>
                <button className="link-btn" onClick={clearAll} id="clear-btn">Clear all</button>
              </div>
              <div className="overall-progress"><span style={{ width: `${progress}%` }} /></div>

              <ul className="file-list">
                {items.map((it) => (
                  <FileRow key={it.id} item={it} onRemove={removeItem} onDownload={(i) => saveBlob(i.blob, i.outName)} />
                ))}
              </ul>

              <div className="summary-bar">
                <div className="stat-pills">
                  <span className="stat-pill"><b>{stats.removed}</b> removed</span>
                  <span className="stat-pill ai"><b>{stats.ai}</b> AI tags</span>
                  <span className="stat-pill privacy"><b>{stats.privacy}</b> privacy leaks</span>
                </div>
                <div className="summary-actions">
                  {showShare && (
                    <button
                      id="share-btn"
                      className="btn btn-primary btn-lg"
                      disabled={!done.length || sharing}
                      onClick={shareFiles}
                    >
                      <Icon.Share />
                      {sharing ? 'Opening…' : `Save / Share${done.length > 1 ? ` (${done.length})` : ''}`}
                    </button>
                  )}
                  <button
                    id="download-zip-btn"
                    className={`btn btn-lg ${showShare ? 'btn-ghost' : 'btn-primary'}`}
                    disabled={!done.length || zipping}
                    onClick={downloadZip}
                  >
                    {done.length > 1 ? <Icon.Zip /> : <Icon.Download />}
                    {zipping
                      ? 'Packing…'
                      : done.length > 1
                        ? (showShare ? 'ZIP' : `Download ZIP (${done.length})`)
                        : (showShare ? 'Download' : 'Download file')}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        <div className="hero-extras mobile-only">
          <ul className="hero-points">
            <li><span className="point-icon ai"><Icon.Sparkle /></span><span>Removes the metadata that triggers <strong>“AI info” / “Made with AI”</strong> labels</span></li>
            <li><span className="point-icon privacy"><Icon.Pin /></span><span>Wipes GPS location, device model, serials &amp; timestamps</span></li>
            <li><span className="point-icon meta"><Icon.Bolt /></span><span>Lossless — not a single pixel is re-encoded</span></li>
          </ul>

          <div className="platforms">
            <span className="platforms-label">Ready for</span>
            <div className="platform-marquee">
              <div className="platform-track">
                {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
                  <span key={i} className="platform-pill">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- AI labels explainer ---------- */}
      <section className="section" id="ai-labels">
        <div className="section-head">
          <span className="section-kicker">Why posts get labelled</span>
          <h2>How social platforms spot <span className="gradient-text">“AI info”</span></h2>
          <p>Instagram, Facebook, Threads, TikTok and LinkedIn read industry-standard metadata embedded in your file. If it’s there, the label appears automatically — even if you only used AI for a tiny edit.</p>
        </div>

        <div className="explain-grid">
          <article className="explain-card">
            <div className="explain-num">01</div>
            <h3>C2PA Content Credentials</h3>
            <p>A signed manifest added by ChatGPT, DALL·E, Adobe Firefly, Photoshop Generative Fill, Google and others. Stored in JPEG APP11/JUMBF, PNG <code>caBX</code> and WebP chunks.</p>
            <span className="explain-tag">Removed ✓</span>
          </article>
          <article className="explain-card">
            <div className="explain-num">02</div>
            <h3>IPTC DigitalSourceType</h3>
            <p>An XMP field set to <code>trainedAlgorithmicMedia</code> or <code>compositeSynthetic</code>. This single tag is what Meta’s “AI info” label relies on most.</p>
            <span className="explain-tag">Removed ✓</span>
          </article>
          <article className="explain-card">
            <div className="explain-num">03</div>
            <h3>Prompts & generator tags</h3>
            <p>Stable Diffusion, ComfyUI and Midjourney write prompts, seeds and workflows into PNG text chunks and EXIF — plus revealing filenames.</p>
            <span className="explain-tag">Removed ✓</span>
          </article>
        </div>

        <div className="note-card">
          <Icon.Shield />
          <p>
            <strong>Good to know:</strong> some generators (e.g. Google SynthID) also embed an <em>invisible watermark in the pixels themselves</em>.
            That isn’t metadata, so no lossless cleaner can remove it — and platforms may still detect it. Encrypz Cleaner removes everything stored <em>around</em> the pixels.
          </p>
        </div>
      </section>

      {/* ---------- What we remove ---------- */}
      <section className="section" id="what-we-remove">
        <div className="section-head">
          <span className="section-kicker">Full scrub</span>
          <h2>Everything hidden in your file, <span className="gradient-text">gone</span></h2>
        </div>
        <div className="remove-grid">
          {[
            [Icon.Pin, 'GPS location', 'Exact coordinates of where a photo was taken.'],
            [Icon.Camera, 'Device & serials', 'Phone model, lens, and body serial numbers.'],
            [Icon.Clock, 'Timestamps', 'Capture, edit and modification dates.'],
            [Icon.Sparkle, 'AI provenance', 'C2PA manifests, IPTC AI tags, prompts.'],
            [Icon.Tag, 'Author & software', 'Names, copyright, editing app history.'],
            [Icon.File, 'Hidden extras', 'Thumbnails, trailers & data after the image end.'],
          ].map(([I, title, desc]) => (
            <div className="remove-item" key={title}>
              <span className="remove-icon"><I /></span>
              <div>
                <h4>{title}</h4>
                <p>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Privacy ---------- */}
      <section className="section" id="privacy">
        <div className="bento">
          <div className="bento-card bento-wide">
            <span className="section-kicker">Zero-disk architecture</span>
            <h3>Your files never touch a hard drive</h3>
            <p>Uploads live only in <code>io.BytesIO</code> RAM buffers on our FastAPI server. They’re cleaned, streamed back, and garbage-collected instantly. ZIP archives are built right inside your browser.</p>
            <div className="big-stats">
              <div><span>0</span><small>bytes written to disk</small></div>
              <div><span>&lt;1s</span><small>average per file</small></div>
              <div><span>100%</span><small>original pixel quality</small></div>
            </div>
          </div>
          <div className="bento-card">
            <span className="bento-icon"><Icon.Bolt /></span>
            <h3>Lossless byte surgery</h3>
            <p>We parse JPEG segments, PNG chunks and WebP RIFF boxes directly — dropping metadata without decoding or re-compressing images.</p>
          </div>
          <div className="bento-card">
            <span className="bento-icon"><Icon.Shield /></span>
            <h3>Open source</h3>
            <p>Audit every line of the cleaner on GitHub. No logs, no tracking, no accounts. Free forever.</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <img src={encrypzLogo} alt="" /> Built for the <strong>Encrypz</strong> ecosystem
        </div>
        <div className="footer-links">
          <a href="https://encrypz.com/privacy.html">Privacy Policy</a>
          <a href="https://encrypz.com/terms.html">Terms</a>
          <a href="https://github.com/Encrypz">GitHub</a>
        </div>
        <p className="copyright">© 2026 Encrypz. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
