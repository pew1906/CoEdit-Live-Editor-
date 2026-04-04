import { useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Editor from './components/Editor.jsx';
import './styles/global.css';

function generateDocId() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Home: create new doc or join existing ────────────────────────
function HomePage() {
  const [name, setName] = useState(sessionStorage.getItem('coedit-username') || '');
  const [docInput, setDocInput] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const validate = () => {
    if (!name.trim()) { setError('Please enter your name.'); return false; }
    if (name.trim().length > 32) { setError('Name must be 32 characters or fewer.'); return false; }
    sessionStorage.setItem('coedit-username', name.trim());
    return true;
  };

  const handleCreate = () => {
    if (!validate()) return;
    navigate(`/doc/${generateDocId()}`);
  };

  const handleJoin = () => {
    if (!validate()) return;
    if (!docInput.trim()) { setError('Please enter a document ID.'); return; }
    navigate(`/doc/${docInput.trim()}`);
  };

  return (
    <div className="join-screen">
      <div className="join-bg-grid" />
      <div className="join-card">
        <div className="join-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#4c6ef5" />
            <path d="M10 12h10M10 18h16M10 24h12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span>CoEdit</span>
        </div>
        <h1>Collaborative Editing,<br />Reimagined.</h1>
        <p>Real-time · CRDT-powered · No conflicts</p>

        <div className="join-input-group">
          <label>Your name</label>
          <input
            autoFocus
            placeholder="Display name"
            value={name}
            maxLength={32}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        <button className="join-btn" onClick={handleCreate}>✦ Create new document</button>

        <div className="join-divider"><span>or join existing</span></div>

        <div className="join-input-group">
          <label>Document ID</label>
          <div className="join-row">
            <input
              placeholder="e.g. abc1234"
              value={docInput}
              maxLength={32}
              onChange={(e) => { setDocInput(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button className="join-btn-secondary" onClick={handleJoin}>Join →</button>
          </div>
        </div>

        {error && <span className="join-error">{error}</span>}

        <div className="join-features">
          <span>✦ Live cursors</span>
          <span>✦ Revision history</span>
          <span>✦ Auto-saved</span>
        </div>
      </div>
    </div>
  );
}

// ── Doc page: prompt for name if missing, then show editor ───────
function DocPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const stored = sessionStorage.getItem('coedit-username') || '';
  const [username, setUsername] = useState(stored);
  const [input, setInput] = useState(stored);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!!stored);

  const handleEnter = () => {
    const name = input.trim();
    if (!name) { setError('Please enter your name.'); return; }
    if (name.length > 32) { setError('Name must be 32 characters or fewer.'); return; }
    sessionStorage.setItem('coedit-username', name);
    setUsername(name);
    setReady(true);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  };

  if (ready && username) {
    return <Editor docId={docId} username={username} />;
  }

  return (
    <div className="join-screen">
      <div className="join-bg-grid" />
      <div className="join-card">
        <div className="join-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#4c6ef5" />
            <path d="M10 12h10M10 18h16M10 24h12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span>CoEdit</span>
        </div>
        <h1>Join Document</h1>

        <div className="doc-id-chip">
          <span>Doc:</span>
          <code>{docId}</code>
          <button className="copy-btn" onClick={copyLink} title="Copy invite link">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy invite link
          </button>
        </div>

        <div className="join-input-group">
          <label>Your name</label>
          <input
            autoFocus
            placeholder="Display name"
            value={input}
            maxLength={32}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
          />
          {error && <span className="join-error">{error}</span>}
        </div>

        <button className="join-btn" onClick={handleEnter}>Enter Document →</button>
        <button className="join-back" onClick={() => navigate('/')}>← Back to home</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/doc/:docId" element={<DocPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
