/**
 * UserPresence
 * Displays colored avatar badges for all active users in the document.
 * Hover to reveal the full username.
 */
export default function UserPresence({ users, connected }) {
  return (
    <div className="user-presence">
      <div className={`connection-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Connected' : 'Reconnecting…'} />
      {users.map((u) => (
        <div key={u.socketId} className="user-badge" title={u.username}>
          <span className="user-avatar" style={{ backgroundColor: u.color }}>
            {u.username[0].toUpperCase()}
          </span>
          <span className="user-name-label">{u.username}</span>
        </div>
      ))}
      {users.length > 0 && (
        <span className="user-count">
          {users.length} {users.length === 1 ? 'editor' : 'editors'}
        </span>
      )}
    </div>
  );
}
