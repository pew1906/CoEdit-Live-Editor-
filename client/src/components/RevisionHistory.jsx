import { useState } from 'react';

/**
 * RevisionHistory
 * Slide-in panel showing timestamped document snapshots.
 * Users can preview and restore any past version.
 */
export default function RevisionHistory({ revisions, onClose, onRestore }) {
  const [selected, setSelected] = useState(null);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getPreviewText = (content) => {
    if (!content) return '';
    if (Array.isArray(content.ops)) {
      return content.ops
        .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
        .join('')
        .trim()
        .slice(0, 300);
    }
    return JSON.stringify(content).slice(0, 300);
  };

  return (
    <div className="revision-overlay">
      <div className="revision-panel">
        <div className="revision-header">
          <div className="revision-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
            </svg>
            Revision History
          </div>
          <button className="revision-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="revision-body">
          <div className="revision-list">
            {revisions.length === 0 ? (
              <div className="revision-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                  <path d="M9 12h6M9 16h6M7 3H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
                  <path d="M9 3h6v4H9z" />
                </svg>
                <p>No revisions yet.<br />Keep editing — snapshots are saved automatically.</p>
              </div>
            ) : (
              revisions.map((rev, idx) => (
                <button
                  key={rev._id}
                  className={`revision-item ${selected?._id === rev._id ? 'active' : ''}`}
                  onClick={() => setSelected(rev)}
                >
                  <div className="revision-item-dot" />
                  <div className="revision-item-info">
                    <span className="revision-label">
                      {idx === 0 ? '🕐 Latest save' : `Version ${revisions.length - idx}`}
                    </span>
                    <span className="revision-time">{formatDate(rev.savedAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {selected && (
            <div className="revision-preview">
              <div className="revision-preview-header">
                <span>Preview — {formatDate(selected.savedAt)}</span>
              </div>
              <div className="revision-preview-text">
                {getPreviewText(selected.content) || <em>Empty document</em>}
              </div>
              <button
                className="revision-restore-btn"
                onClick={() => onRestore(selected.content)}
              >
                Restore this version
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
