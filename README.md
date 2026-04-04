# CoEdit — Real-Time Collaborative Text Editor

> A Google Docs-inspired collaborative editor where multiple users can edit the same document simultaneously with zero conflicts.

🔗 **Live Demo:** [https://coedit-live-editor.onrender.com]  
📁 **GitHub:** [https://github.com/pew1906/CoEdit-Live-Editor-] 
🎥 **Video Demo:** [https://drive.google.com/file/d/1XkDgnwYU2lai9-AFvA0fK6-lS4eUSst6/view?usp=sharing]

---

## Features

- ✅ **Real-time sync** — edits appear instantly across all connected users
- ✅ **CRDT conflict resolution** — concurrent edits never conflict, powered by Yjs
- ✅ **User presence** — see who's online with colored avatar badges
- ✅ **Cursor tracking** — each user's cursor shown in a unique color with their name
- ✅ **Rich text formatting** — bold, italic, underline, strikethrough, headings, lists, alignment, color, highlight
- ✅ **Font family & size** — Arial, Times New Roman, Calibri, Georgia, Courier New, Verdana, Trebuchet; sizes 8–36px
- ✅ **Image insert & resize** — embed images with drag-to-resize
- ✅ **Document persistence** — auto-saved to MongoDB every 2 seconds
- ✅ **Revision history** — timestamped snapshots with preview and one-click restore
- ✅ **URL-based document routing** — each document has a unique shareable URL (`/doc/:id`)
- ✅ **Export to .txt** — download document as plain text
- ✅ **Responsive design** — works on desktop and mobile

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Editor | Quill.js with quill-cursors |
| CRDT | Yjs + y-quill binding |
| Real-time | Socket.IO (WebSockets) |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Hosting | Render (server + client), MongoDB Atlas |
| Containerisation | Docker, Docker Compose |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Browser (React)                  │
│                                                      │
│   Quill Editor ◄──► y-quill ◄──► Y.Doc (CRDT)      │
│                                      │               │
│                               Socket.IO Client       │
└──────────────────────────────────────┼──────────────┘
                                       │ WebSocket
┌──────────────────────────────────────┼──────────────┐
│                  Node.js Server      │               │
│                                      │               │
│   Socket.IO ◄────────────────────────┘               │
│       │                                              │
│       ├── In-memory Y.Doc per document               │
│       ├── Relay yjs-update to all room members       │
│       ├── Broadcast user presence list               │
│       └── Debounced save to MongoDB                  │
│                                                      │
│   Express ── serves built React client (production)  │
└──────────────────────────┬───────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────┐
│                     MongoDB Atlas                     │
│                                                      │
│   Document  { _id, yjsState (Buffer) }               │
│   Revision  { documentId, content, savedAt }         │
└──────────────────────────────────────────────────────┘
```

### How CRDT works here

Every client maintains a local `Y.Doc`. When a user types:
1. Yjs generates an **update** (binary delta)
2. The update is sent to the server via `yjs-update` Socket.IO event
3. The server applies it to the authoritative in-memory `Y.Doc` and relays it to all other clients
4. Each client applies the update to their local `Y.Doc` — Yjs guarantees all copies **converge to the same state** regardless of order or concurrency

This eliminates last-write-wins conflicts entirely. Two users editing the same word simultaneously will both see their changes merged correctly.

---

## Project Structure

```
coedit/
├── client/                        # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx                # Routing (/, /doc/:id)
│   │   ├── components/
│   │   │   ├── Editor.jsx         # Main editor component
│   │   │   ├── UserPresence.jsx   # Online user badges
│   │   │   └── RevisionHistory.jsx# Revision panel
│   │   ├── hooks/
│   │   │   └── useCollaboration.js# Yjs + Socket.IO wiring
│   │   └── styles/
│   │       ├── global.css         # Join screen styles
│   │       └── editor.css         # Editor UI styles
│   └── package.json
├── server/                        # Node.js backend
│   ├── index.js                   # Express + Socket.IO entry
│   ├── db/connection.js           # MongoDB connect
│   ├── models/
│   │   ├── Document.js            # Yjs state persistence
│   │   └── Revision.js            # Revision snapshots
│   └── socket/handlers.js         # All real-time logic
├── docker-compose.dev.yaml        # Local dev environment
├── Dockerfile.client
├── Dockerfile.server
├── render.yaml                    # Render deploy blueprint
└── README.md
```

---

## Setup Instructions

### Prerequisites
- Node.js v20+
- Docker + Docker Compose
- pnpm (`npm install -g pnpm`)

### Local Development (Docker — recommended)

```bash
git clone https://github.com/YOUR_USERNAME/coedit.git
cd coedit
docker compose -f docker-compose.dev.yaml up --build
```

Open [http://localhost:5173](http://localhost:5173)

### Local Development (without Docker)

```bash
# 1. Start MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7.0.3

# 2. Create root .env (copy from .env.example)
cp .env.example .env

# 3. Create client/.env
echo "VITE_SERVER_URL=http://localhost:8001" > client/.env

# 4. Install and run server
cd server && pnpm install && pnpm run dev

# 5. In a new terminal — install and run client
cd client && pnpm install && pnpm run dev
```

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PROJ_SERVER_PORT` | Server port | `8001` |
| `PROJ_DB_CONNECTION_STRING` | MongoDB URI | `mongodb://localhost:27017/coedit-db` |
| `PROJ_DEPLOYED_FRONTEND_URL` | Frontend origin (for CORS) | `https://coedit.onrender.com` |
| `NODE_ENV` | Environment | `production` |
| `SAVE_DEBOUNCE_MS` | DB save debounce | `2000` |
| `REVISION_DEBOUNCE_MS` | Revision snapshot debounce | `10000` |

### Production Deployment (Render)

See [DEPLOY.md](./DEPLOY.md) for full step-by-step instructions.

**Quick summary:**
1. Push repo to GitHub
2. Create free MongoDB Atlas cluster → get connection string
3. Create Render Web Service → connect GitHub repo
4. Set build command: `npm run build && cd server && npm install`
5. Set start command: `NODE_ENV=production node server/index.js`
6. Add environment variables in Render dashboard
7. Deploy

---

## AI Tools Used

This project was built with assistance from **Claude (Anthropic)** — Claude Sonnet 4.5 via claude.ai.

AI assistance was used for:
- Yjs + Quill + Socket.IO integration code
- CSS styling and responsive layout
- Debugging build and deployment errors

All AI-generated code was reviewed, tested, and integrated by the developer. The overall system design, feature decisions, and debugging approach were directed by the developer throughout.

---

## Known Limitations

- **Image resize is local only** — resizing an image does not sync the new dimensions to other collaborators (the image itself syncs, not the size)
- **Single server instance** — no Redis adapter for Socket.IO, so horizontal scaling across multiple server instances is not supported
- **Free tier cold starts** — Render free tier spins down after 15 minutes of inactivity; first load after idle takes ~30 seconds
- **Revision history stores plain text** — snapshots capture text content only, not full Delta formatting
- **No authentication** — any user can join any document by knowing its ID; there is no access control
- **Base64 images** — inserted images are stored as base64 in the Yjs document, which can inflate document size with large images

---

## How to Use

1. Open the live URL
2. Enter your display name
3. Click **Create new document** — a unique document URL is generated
4. Share the URL with collaborators — they enter their name and join instantly
5. Edit together in real time — cursors are visible with name labels
6. Click **History** to view and restore past versions
7. Click **Export** to download as `.txt`