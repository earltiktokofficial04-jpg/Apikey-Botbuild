# EARL BUILD API

Backend API untuk sistem build APK. Dibina menggunakan **Next.js** (App Router) dan di-deploy ke **Vercel** sebagai serverless functions. Database menggunakan **Turso (libsql)**.

---

## Struktur

```
src/
├── app/api/
│   ├── health/route.ts           → Public health check + maintenance status
│   ├── user/
│   │   ├── register/route.ts     → Register/get user by device ID
│   │   ├── me/route.ts           → Get user info & credits
│   │   ├── bind-telegram/route.ts → Bind Telegram ID to device
│   │   └── claim-code/route.ts   → Claim credit code
│   ├── upload/
│   │   ├── init/route.ts         → Start chunked upload session
│   │   ├── chunk/route.ts        → Receive one chunk
│   │   └── complete/route.ts     → Assemble, push GitHub, deduct credits
│   ├── build/
│   │   └── status/route.ts       → Check GitHub Actions build queue
│   └── owner/
│       ├── users/route.ts        → List all users
│       ├── add-credit/route.ts   → Add credit directly
│       ├── generate-code/route.ts → Generate credit codes
│       ├── codes/route.ts        → List active codes
│       ├── toggle-server/route.ts → Toggle maintenance mode
│       └── server-status/route.ts → Get server config
└── lib/
    ├── turso.ts                  → Turso database helper
    └── github.ts                 → GitHub API + Telegram notification
```

---

## Deployment (Vercel)

### 1. Setup Environment Variables

Di **Vercel Dashboard → Project → Settings → Environment Variables**, tambah:

| Key | Penerangan | Wajib |
|-----|-----------|-------|
| `TURSO_URL` | URL database Turso (format: `libsql://...`) | Ya |
| `TURSO_AUTH_TOKEN` | Auth token Turso (JWT) | Ya |
| `GITHUB_TOKEN` | GitHub Personal Access Token | Ya |
| `GITHUB_REPO` | Owner/repo GitHub, dipisahkan `/` (contoh: `owner/nama-repo`) | Ya |
| `GITHUB_WORKFLOW_ID` | Nama fail workflow (default: `build.yml`) | Ya |
| `BOT_TOKEN` | Token bot Telegram (untuk notifikasi & ambil username bot) | Tidak |

### 2. Deploy

```bash
# Install dependencies
cd vercel-api
npm install

# Deploy ke Vercel
vercel --prod
```

### 3. Init Database

Selepas deploy, panggil endpoint ini sekali untuk create table:

```bash
curl https://your-project.vercel.app/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"device_id":"init_device"}'
```

Table akan auto-create pada request pertama.

---

## Tukar Link Vercel

Untuk menukar link Vercel deployment di aplikasi Flutter, edit fail ini:

| App | Fail | Baris |
|-----|------|-------|
| User App | `user_app/lib/config.dart` | `const baseUrl = '...'` |
| Owner App | `owner_app/lib/config.dart` | `const baseUrl = '...'` |

---

## API Reference

### Public

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Check server status + maintenance mode |

### User

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/api/user/register` | `{device_id}` | Register/get user |
| GET | `/api/user/me?device_id=` | - | Get user info |
| POST | `/api/user/bind-telegram` | `{device_id, telegram_id}` | Bind Telegram |
| POST | `/api/user/claim-code` | `{device_id, code}` | Claim code |

### Upload (Chunked)

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/api/upload/init` | `{device_id, filename, total_size, total_chunks}` | Start upload |
| POST | `/api/upload/chunk` | FormData `{upload_id, chunk_index, chunk}` | Send chunk |
| POST | `/api/upload/complete` | `{upload_id, project_type}` | Assemble & push |

### Owner

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| GET | `/api/owner/users` | - | List all users |
| POST | `/api/owner/add-credit` | `{target, amount}` | Add credit |
| POST | `/api/owner/generate-code` | `{amount, count}` | Generate codes |
| GET | `/api/owner/codes` | - | List active codes |
| POST | `/api/owner/toggle-server` | `{mode, title?, message?}` | Toggle maintenance |
| GET | `/api/owner/server-status` | - | Get server config |

---

Built by Earl
