import { useEffect, useRef, useState, useCallback } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import 'quill/dist/quill.snow.css';
import { useCollaboration } from '../hooks/useCollaboration.js';
import UserPresence from './UserPresence.jsx';
import RevisionHistory from './RevisionHistory.jsx';
import '../styles/editor.css';

Quill.register('modules/cursors', QuillCursors);

// Register custom fonts with Quill
const Font = Quill.import('formats/font');
Font.whitelist = ['arial', 'times-new-roman', 'calibri', 'georgia', 'courier-new', 'verdana', 'trebuchet'];
Quill.register(Font, true);

const Size = Quill.import('attributors/style/size');
Size.whitelist = ['8px','9px','10px','11px','12px','14px','16px','18px','24px','36px'];
Quill.register(Size, true);

// Custom image resize handler
function setupImageResize(quill) {
  let selected = null;
  let startX, startW;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:absolute; border:2px solid #4c6ef5; pointer-events:none; display:none; box-sizing:border-box;
  `;
  document.body.appendChild(overlay);

  const handle = document.createElement('div');
  handle.style.cssText = `
    position:absolute; bottom:-5px; right:-5px; width:12px; height:12px;
    background:#4c6ef5; border-radius:50%; cursor:se-resize; pointer-events:all;
  `;
  overlay.appendChild(handle);

  quill.root.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      selected = e.target;
      const rect = selected.getBoundingClientRect();
      overlay.style.display = 'block';
      overlay.style.left = rect.left + window.scrollX + 'px';
      overlay.style.top = rect.top + window.scrollY + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    } else if (e.target !== handle) {
      selected = null;
      overlay.style.display = 'none';
    }
  });

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startW = selected.width;

    const onMove = (e) => {
      if (!selected) return;
      const newW = Math.max(50, startW + (e.clientX - startX));
      selected.style.width = newW + 'px';
      selected.style.height = 'auto';
      const rect = selected.getBoundingClientRect();
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

const TOOLBAR_OPTIONS = [
  [{ font: ['arial', 'times-new-roman', 'calibri', 'georgia', 'courier-new', 'verdana', 'trebuchet'] }, { size: ['8px','9px','10px','11px','12px','14px','16px','18px','24px','36px'] }],
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  ['blockquote', 'code-block', 'link', 'image'],
  ['clean'],
];

export default function Editor({ docId, username }) {
  const editorContainerRef = useRef(null);
  const quillRef = useRef(null);
  const cursorsModuleRef = useRef(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Init Quill once
  useEffect(() => {
    if (quillRef.current) return;
    const quill = new Quill(editorContainerRef.current, {
      theme: 'snow',
      placeholder: 'Start typing to collaborate…',
      modules: {
        toolbar: TOOLBAR_OPTIONS,
        cursors: { transformOnTextChange: true, hideDelayMs: 3000, hideSpeedMs: 400 },
        history: { delay: 500, maxStack: 500, userOnly: true },
      },
    });
    quillRef.current = quill;
    cursorsModuleRef.current = quill.getModule('cursors');
    setupImageResize(quill);  
  }, []);

  const { users, revisions, fetchRevisions, connected, loading, onSocket } = useCollaboration({
    quillRef,
    docId,
    username,
  });

  // Wire remote cursors
  useEffect(() => {
    const cursors = cursorsModuleRef.current;
    if (!cursors) return;

    return onSocket((socket) => {
      const handleCursorUpdate = ({ socketId, username: uname, color, range }) => {
        if (!range) { cursors.removeCursor(socketId); return; }
        cursors.createCursor(socketId, uname, color);
        cursors.moveCursor(socketId, range);
      };
      const handleCursorRemove = ({ socketId }) => cursors.removeCursor(socketId);

      socket.on('cursor-update', handleCursorUpdate);
      socket.on('cursor-remove', handleCursorRemove);

      return () => {
        socket.off('cursor-update', handleCursorUpdate);
        socket.off('cursor-remove', handleCursorRemove);
      };
    });
  }, [onSocket]);

  // Save indicator
  useEffect(() => {
    return onSocket((socket) => {
      let t1, t2;
      const handler = () => {
        setSaveIndicator('saving');
        clearTimeout(t1); clearTimeout(t2);
        t1 = setTimeout(() => setSaveIndicator('saved'), 2100);
        t2 = setTimeout(() => setSaveIndicator(''), 3500);
      };
      socket.on('yjs-update', handler);
      return () => {
        socket.off('yjs-update', handler);
        clearTimeout(t1);
        clearTimeout(t2);
      };
    });
  }, [onSocket]);

  const handleOpenRevisions = () => {
    fetchRevisions();
    setShowRevisions(true);
  };

  const handleRestore = useCallback((delta) => {
    quillRef.current?.setContents(delta);
    setShowRevisions(false);
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ✅ NEW EXPORT FUNCTION
  const handleExport = () => {
    const text = quillRef.current?.getText() || '';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="editor-root">
      {loading && (
        <div className="editor-loading">
          <div className="loading-spinner" />
          <span>Connecting to document…</span>
        </div>
      )}

      <header className="editor-topbar">
        <div className="topbar-left">
          <div className="topbar-logo">
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="7" fill="#4c6ef5" />
              <path d="M9 11h10M9 18h18M9 25h13" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span className="topbar-brand">CoEdit</span>
          </div>
          <div className="topbar-sep" />
          <div className="topbar-doc-info">
            <span className="topbar-doc-id">{docId}</span>
            <button className="topbar-share-btn" onClick={copyLink} title="Copy invite link">
              {linkCopied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>
          {saveIndicator === 'saving' && <span className="save-badge saving">Saving…</span>}
          {saveIndicator === 'saved' && <span className="save-badge saved">✓ Saved</span>}
        </div>

        <div className="topbar-right">
          <UserPresence users={users} connected={connected} />

          {/* ✅ NEW EXPORT BUTTON */}
          <button className="btn-export" onClick={handleExport} title="Download as .txt">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="btn-history-label">Export</span>
          </button>

          {/* EXISTING BUTTON */}
          <button className="btn-history" onClick={handleOpenRevisions}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
            </svg>
            <span className="btn-history-label">History</span>
          </button>
        </div>
      </header>

      <main className="editor-main">
        <div className="editor-page">
          <div ref={editorContainerRef} className="quill-mount" />
        </div>
      </main>

      {showRevisions && (
        <RevisionHistory
          revisions={revisions}
          onClose={() => setShowRevisions(false)}
          onRestore={handleRestore}
        />
      )}
    </div>
  );
}