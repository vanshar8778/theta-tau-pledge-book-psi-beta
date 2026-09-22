# Θ Τ Pledge Book

## Setup (do this once)

### 1. Install dependencies
```
npm install
```

### 2. Configure Firebase
- Go to Firebase Console → your project → Project Settings → Your Apps
- Click "Add app" → Web → register it
- Copy the config object values into a `.env` file:

```
cp .env.example .env
```

Then fill in `.env` with your values:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_PM_PASSWORD=your_password_here
```

### 3. Set up Firestore
- Firebase Console → Build → Firestore Database → Create database
- Start in **test mode** (you can tighten rules later)
- Paste the contents of `firestore.rules` into the Rules tab

### 4. Run locally
```
npm run dev
```
Open http://localhost:5173

---

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → import that repo
3. In Vercel project settings → Environment Variables, add all your `VITE_*` values from `.env`
4. Deploy — Vercel auto-deploys on every `git push`

Your site will be at `your-project.vercel.app` (or a custom domain if you set one up).
