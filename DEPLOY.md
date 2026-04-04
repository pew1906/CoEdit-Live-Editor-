# CoEdit — Deployment Guide (Render + MongoDB Atlas)

Estimated time: **20–30 minutes**. Result: a permanent public URL.

---

## Step 1 — Push to GitHub

```bash
cd coedit

git init
git add .
git commit -m "feat: initial CoEdit implementation

- Real-time CRDT sync via Yjs
- User presence + colored cursor tracking
- Document persistence with MongoDB
- Revision history with restore
- URL-based document routing
- Responsive UI"

# Create a new repo on github.com (don't add README, .gitignore, or license)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/coedit.git
git branch -M main
git push -u origin main
```

---

## Step 2 — MongoDB Atlas (free database)

1. Go to **https://cloud.mongodb.com** → Sign up free
2. Create a new project → **Build a Database** → choose **M0 Free**
3. Choose a cloud provider (any) → **Create**
4. **Security Quickstart**:
   - Username: `coedit`
   - Password: generate a strong password → **copy it**
   - Click **Create User**
5. **Where would you like to connect from?** → choose **My Local Environment**
   - Add IP: `0.0.0.0/0` (allows Render's dynamic IPs) → **Add Entry**
6. Click **Finish and Close** → **Go to Database**
7. Click **Connect** → **Drivers** → copy the connection string:
   ```
   mongodb+srv://coedit:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<password>` with your actual password.  
   Add the DB name: append `coedit-db` before the `?`:
   ```
   mongodb+srv://coedit:<password>@cluster0.xxxxx.mongodb.net/coedit-db?retryWrites=true&w=majority
   ```
   **Save this string — you'll need it in Step 3.**

---

## Step 3 — Deploy on Render

1. Go to **https://render.com** → Sign up (use GitHub login)
2. Dashboard → **New +** → **Web Service**
3. Connect your GitHub repo → select **coedit**
4. Fill in the settings:

| Field | Value |
|---|---|
| **Name** | `coedit` |
| **Region** | Oregon (or closest to you) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm run build && cd server && npm install` |
| **Start Command** | `npm start` |
| **Plan** | `Free` |

5. Scroll to **Environment Variables** → Add these:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PROJ_SERVER_PORT` | `8001` |
| `PROJ_DB_CONNECTION_STRING` | *(your Atlas connection string from Step 2)* |
| `SAVE_DEBOUNCE_MS` | `2000` |
| `REVISION_DEBOUNCE_MS` | `10000` |

6. Click **Create Web Service**

Render will build and deploy. Takes ~5 minutes first time.

---

## Step 4 — Set the frontend URL env var

Once deployed, Render gives you a URL like `https://coedit.onrender.com`.

Go to your service → **Environment** → add:

| Key | Value |
|---|---|
| `PROJ_DEPLOYED_FRONTEND_URL` | `https://coedit.onrender.com` |

Click **Save Changes** — Render redeploys automatically.

---

## Step 5 — Verify

Open `https://coedit.onrender.com` — you should see the CoEdit home screen.

Open the same URL on your phone or share with a friend → create or join the same document → edits sync in real time.

Health check: `https://coedit.onrender.com/health` should return `{"status":"ok"}`.

---

## Notes

- **Free tier spins down after 15 min of inactivity** — first load after idle takes ~30s. Acceptable for a hackathon demo; upgrade to Starter ($7/mo) to avoid this.
- **Logs**: Render Dashboard → your service → **Logs** tab
- **Redeploy**: push a new commit to `main` → Render auto-deploys

---

## Local dev still works

Nothing changed for local Docker development:

```bash
docker compose -f docker-compose.dev.yaml up --build
```
