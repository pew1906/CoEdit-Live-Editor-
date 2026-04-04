# CoEdit

A real-time collaborative document editor with CRDT-based conflict resolution.

## Features

- **Real-time sync** via Yjs CRDT — concurrent edits merge correctly
- **User presence** — see who's editing with colored avatars
- **Cursor tracking** — live colored cursors with username labels
- **Text formatting** — bold, italic, underline, headings, lists, code blocks
- **Document persistence** — auto-saved to MongoDB with debounce
- **Revision history** — timestamped snapshots, view and restore past versions

## Tech Stack

- **Frontend**: React + Vite + Quill Editor + Yjs + quill-cursors
- **Backend**: Node.js + Express + Socket.IO + Yjs
- **Database**: MongoDB (Mongoose)
- **Infra**: Docker + Docker Compose

## Quick Start (Docker)

```bash
git clone <repo-url> coedit
cd coedit
docker compose -f docker-compose.dev.yaml up --build
```

Open http://localhost:5173 — enter your name and start editing.  
Open another tab/browser at the same URL to collaborate.

## Local Development

Prerequisites: Node.js v20+, pnpm, MongoDB running on port 27017

```bash
# Terminal 1 — Server
cd server
pnpm install
pnpm run dev

# Terminal 2 — Client
cd client
pnpm install
pnpm run dev
```

## Environment Variables

Copy `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `PROJ_SERVER_PORT` | `8001` | Server port |
| `PROJ_CLIENT_PORT` | `5173` | Vite dev port |
| `PROJ_DB_CONNECTION_STRING` | `mongodb://localhost:27017/coedit-db` | MongoDB URI |
| `DEFAULT_DOC_ID` | `coedit-default-doc` | Default document ID |
| `SAVE_DEBOUNCE_MS` | `2000` | DB save debounce |
| `REVISION_DEBOUNCE_MS` | `10000` | Revision snapshot debounce |

## Project Structure

```
coedit/
├── client/               # React + Vite frontend
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── Editor.jsx
│       │   ├── UserPresence.jsx
│       │   └── RevisionHistory.jsx
│       ├── hooks/
│       │   └── useCollaboration.js
│       └── styles/
│           └── editor.css
└── server/               # Node.js + Express + Socket.IO backend
    ├── index.js
    ├── db/connection.js
    ├── models/
    │   ├── Document.js
    │   └── Revision.js
    └── socket/handlers.js
```

## Cleanup

```bash
docker compose -f docker-compose.dev.yaml down
docker image remove coedit-client coedit-server
```
