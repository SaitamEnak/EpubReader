import React, { useState, useEffect, useRef } from 'react';
import ePub from 'epubjs';
import { Upload, Settings, List, ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import './EpubReader.css';

const THEMES = {
  light:     { bg: '#f5f0e8', color: '#1a1a1a', menuBg: '#ffffff', menuColor: '#000000' },
  dark:      { bg: '#1a1a1a', color: '#d4d0c8', menuBg: '#2a2a2a', menuColor: '#ffffff' },
  sepia:     { bg: '#f8efe0', color: '#3d2b1f', menuBg: '#fdf5e6', menuColor: '#3d2b1f' },
  grayscale: { bg: '#e8e8e8', color: '#1c1c1c', menuBg: '#f0f0f0', menuColor: '#111111' },
};

export default function EpubReader() {
  const [fileData, setFileData] = useState(null);
  const [rendition, setRendition] = useState(null);
  const [book, setBook] = useState(null);

  const [showMenu, setShowMenu]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc]         = useState(false);
  const [toc, setToc]                 = useState([]);

  const [theme, setTheme]       = useState('light');
  const [fontSize, setFontSize] = useState(100);
  const [fontFamily, setFontFamily] = useState('Georgia');
  const [progress, setProgress] = useState(0);
  const [chapterTitle, setChapterTitle] = useState('');

  const viewerRef = useRef(null);
  const renditionRef = useRef(null); // always-current ref for keyboard handler
  const settingsRef = useRef({ theme: 'light', fontSize: 100, fontFamily: 'Georgia' }); // always-current settings ref

  // ─── File Upload ───────────────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFileData(ev.target.result);
    reader.readAsArrayBuffer(file);
  };

  // ─── Init book when fileData changes ──────────────────────────────────────
  useEffect(() => {
    if (!fileData || !viewerRef.current) return;

    const newBook = ePub(fileData);
    setBook(newBook);

    const newRendition = newBook.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated',
    });
    setRendition(newRendition);
    renditionRef.current = newRendition;

    // Load TOC
    newBook.loaded.navigation.then((nav) => setToc(nav.toc || []));

    // Track progress
    newBook.ready.then(() => newBook.locations.generate(1600));

    newRendition.on('relocated', (loc) => {
      if (newBook.locations.length() > 0) {
        setProgress(Math.round(newBook.locations.percentageFromCfi(loc.start.cfi) * 100));
      }
      setChapterTitle(loc.start.href || '');
    });

    // Inject styles on every chapter load (iframes get recreated per chapter)
    newRendition.on('rendered', (_section, view) => {
      injectStyles(view);
    });

    newRendition.display();

    return () => newBook.destroy();
  }, [fileData]);

  // ─── Helper: build CSS string from current settings ──────────────────────
  const buildCSS = ({ theme, fontSize, fontFamily }) => {
    const t = THEMES[theme];
    return `
      * {
        font-family: ${fontFamily}, serif !important;
      }
      html, body {
        background: ${t.bg} !important;
        color: ${t.color} !important;
        font-size: ${fontSize}% !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      p, div, h1, h2, h3, h4, h5, h6, li, span, td, th, blockquote {
        color: ${t.color} !important;
      }
      a { color: ${t.color} !important; }
    `;
  };

  // ─── Inject CSS into a single iframe view ────────────────────────────────
  const injectStyles = (view) => {
    const doc = view?.document;
    if (!doc) return;
    let el = doc.getElementById('_kindle_override');
    if (!el) {
      el = doc.createElement('style');
      el.id = '_kindle_override';
      doc.head.appendChild(el);
    }
    el.textContent = buildCSS(settingsRef.current);
  };

  // ─── Re-inject into all currently open views ─────────────────────────────
  const applyToAllViews = (rend) => {
    rend = rend || renditionRef.current;
    if (!rend) return;
    rend.getContents().forEach(content => injectStyles(content.document ? { document: content.document } : content));
  };

  // ─── Apply Theme / Font / Size inside iframe ─────────────────────────────
  useEffect(() => {
    settingsRef.current = { theme, fontSize, fontFamily };
    applyToAllViews();
  }, [rendition, theme, fontSize, fontFamily]);

  // ─── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') renditionRef.current?.next();
      if (e.key === 'ArrowLeft')  renditionRef.current?.prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Helper ────────────────────────────────────────────────────────────────
  const goTo = (href) => {
    rendition?.display(href);
    setShowToc(false);
    setShowMenu(false);
    setShowSettings(false);
  };
  const closeAll = () => { setShowMenu(false); setShowSettings(false); setShowToc(false); };
  const t = THEMES[theme];

  // ─── Upload screen ─────────────────────────────────────────────────────────
  if (!fileData) {
    return (
      <div style={{ ...css.root, background: t.bg, color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={css.uploadBox}>
          <Upload size={52} style={{ opacity: 0.5, marginBottom: 20 }} />
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, marginBottom: 8 }}>Kindle Reader</h1>
          <p style={{ opacity: 0.6, marginBottom: 28 }}>Open an EPUB file to start reading</p>
          <label style={{ ...css.pill, background: t.color, color: t.bg, cursor: 'pointer' }}>
            Select EPUB
            <input type="file" accept=".epub" onChange={handleFile} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    );
  }

  // ─── Reader screen ─────────────────────────────────────────────────────────
  return (
    <div style={{ ...css.root, background: t.bg, color: t.color, position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{ ...css.topBar, background: t.menuBg, color: t.menuColor }}>
        <button onClick={() => { setFileData(null); setBook(null); setRendition(null); setToc([]); }} style={css.iconBtn} title="Library">
          <ArrowLeft size={20} />
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => { setShowSettings(s => !s); setShowToc(false); }} style={{ ...css.iconBtn, color: t.menuColor }} title="Settings">
          <Settings size={20} />
        </button>
        <button onClick={() => { setShowToc(s => !s); setShowSettings(false); }} style={{ ...css.iconBtn, color: t.menuColor }} title="Table of Contents">
          <List size={20} />
        </button>
      </div>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div style={{ ...css.panel, background: t.menuBg, color: t.menuColor }}>
          <div style={css.panelHeader}>
            <span style={{ fontFamily: 'Georgia,serif', fontWeight: 'bold' }}>Display Settings</span>
            <button onClick={() => setShowSettings(false)} style={css.iconBtn}><X size={16} /></button>
          </div>

          {/* Font Size */}
          <div style={css.row}>
            <span style={css.label}>Font Size</span>
            <div style={css.controls}>
              <button style={{ ...css.circle, background: t.menuColor, color: t.menuBg }} onClick={() => setFontSize(f => Math.max(70, f - 10))}>A-</button>
              <span style={{ minWidth: 40, textAlign: 'center' }}>{fontSize}%</span>
              <button style={{ ...css.circle, background: t.menuColor, color: t.menuBg }} onClick={() => setFontSize(f => Math.min(200, f + 10))}>A+</button>
            </div>
          </div>

          {/* Font Family */}
          <div style={css.row}>
            <span style={css.label}>Font</span>
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ ...css.select, background: t.menuBg, color: t.menuColor }}>
              <option value="Georgia">Georgia</option>
              <option value="'Palatino Linotype', Palatino">Palatino</option>
              <option value="Arial, Helvetica">Arial</option>
              <option value="'Times New Roman', Times">Times New Roman</option>
              <option value="'Courier New', Courier">Courier New</option>
            </select>
          </div>

          {/* Theme */}
          <div style={css.row}>
            <span style={css.label}>Theme</span>
            <div style={{ display: 'flex', gap: 10 }}>
              {Object.entries(THEMES).map(([key, val]) => (
                <button
                  key={key}
                  title={key}
                  onClick={() => setTheme(key)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: val.bg,
                    border: theme === key ? `3px solid ${t.menuColor}` : `1px solid ${t.menuColor}40`,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TOC panel ── */}
      {showToc && (
        <div style={{ ...css.panel, background: t.menuBg, color: t.menuColor, left: 0, right: 'auto', maxWidth: 280, maxHeight: '70vh' }}>
          <div style={css.panelHeader}>
            <span style={{ fontFamily: 'Georgia,serif', fontWeight: 'bold' }}>Contents</span>
            <button onClick={() => setShowToc(false)} style={css.iconBtn}><X size={16} /></button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {toc.length === 0 && <p style={{ opacity: 0.5 }}>No chapters found</p>}
            {toc.map((item, i) => (
              <div key={i} onClick={() => goTo(item.href)} style={css.tocItem}>
                {item.label?.trim()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EPUB viewport ── */}
      <div style={css.viewer} ref={viewerRef} />

      {/* ── Side nav arrows ── */}
      <button
        onClick={() => rendition?.prev()}
        style={{ ...css.navArrow, left: 0 }}
        title="Previous page"
      >
        <ChevronLeft size={28} />
      </button>
      <button
        onClick={() => rendition?.next()}
        style={{ ...css.navArrow, right: 0 }}
        title="Next page"
      >
        <ChevronRight size={28} />
      </button>

      {/* ── Bottom bar ── */}
      <div style={{ ...css.bottomBar, color: t.color + '88' }}>
        <span>{chapterTitle ? chapterTitle.split('/').pop().replace('.xhtml','').replace('.html','') : ''}</span>
        <span>{progress > 0 ? `${progress}%` : ''}</span>
      </div>
    </div>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const css = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'background 0.3s, color 0.3s',
  },
  uploadBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '48px 40px',
    borderRadius: 16,
    border: '2px dashed currentColor',
    opacity: 0.9,
    maxWidth: 400,
  },
  pill: {
    padding: '12px 28px',
    borderRadius: 99,
    border: 'none',
    fontWeight: 600,
    fontSize: 15,
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    gap: 4,
    borderBottom: '1px solid rgba(128,128,128,0.15)',
    flexShrink: 0,
    zIndex: 30,
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 8,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'inherit',
  },
  panel: {
    position: 'absolute',
    top: 53,
    right: 0,
    width: 280,
    padding: 20,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    borderRadius: '0 0 0 12px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(128,128,128,0.2)',
    paddingBottom: 12,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 14,
    opacity: 0.7,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  circle: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(128,128,128,0.3)',
    fontSize: 14,
  },
  tocItem: {
    padding: '10px 0',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(128,128,128,0.1)',
    fontSize: 14,
    lineHeight: 1.4,
  },
  viewer: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(128,128,128,0.08)',
    border: 'none',
    cursor: 'pointer',
    padding: '24px 8px',
    color: 'inherit',
    zIndex: 10,
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
  },
  bottomBar: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 64px',
    fontSize: 11,
    flexShrink: 0,
    letterSpacing: '0.05em',
  },
};
