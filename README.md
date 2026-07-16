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
│   │   ├── bind-telegram/route.ts → Step 1: request verification code
│   │   ├── bind-telegram/confirm/route.ts → Step 2: confirm code, bind
│   │   ├── unbind-telegram/route.ts → Unbind Telegram from device
│   │   └── claim-code/route.ts   → Claim credit code
│   ├── upload/
│   │   ├── init/route.ts         → Start chunked upload session
│   │   ├── chunk/route.ts        → Receive one chunk
│   │   └── complete/route.ts     → Assemble, auto-detect framework, push GitHub, deduct credits
│   ├── build/
│   │   └── status/route.ts       → Check GitHub Actions build queue
│   └── owner/
│       ├── users/route.ts        → List all users
│       ├── delete-user/route.ts  → Delete a user
│       ├── add-credit/route.ts   → Add credit directly
│       ├── generate-code/route.ts → Generate credit codes
│       ├── codes/route.ts        → List active codes
│       ├── toggle-server/route.ts → Toggle maintenance mode (+ music_url)
│       └── server-status/route.ts → Get server config
└── lib/
    ├── turso.ts                  → Turso database helper
    ├── github.ts                 → GitHub API + Telegram notification
    └── detect.ts                 → Auto-detect project framework from ZIP
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
| `CHANNEL_ID` | ID channel Telegram untuk broadcast status build (workflow input `channel_id`) | Ya |
| `API_ID` | Telethon API ID — daftar di [my.telegram.org](https://my.telegram.org) (workflow input `api_id`) | Ya |
| `API_HASH` | Telethon API Hash — daftar di [my.telegram.org](https://my.telegram.org) (workflow input `api_hash`) | Ya |

> `CHANNEL_ID`, `API_ID`, dan `API_HASH` diperlukan oleh `.github/workflows/build.yml` di repo BUILDER-APKV3. Tanpa nilai-nilai ni, GitHub akan menolak `workflow_dispatch` (422) — fail tetap ter-push ke `temp/` tapi build tidak akan start.

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
| POST | `/api/user/bind-telegram` | `{device_id, telegram_id}` | Step 1: request verification code (sent via Telegram) |
| POST | `/api/user/bind-telegram/confirm` | `{device_id, code}` | Step 2: confirm code, complete bind |
| POST | `/api/user/unbind-telegram` | `{device_id}` | Unbind Telegram from device |
| POST | `/api/user/claim-code` | `{device_id, code}` | Claim code |

### Upload (Chunked)

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/api/upload/init` | `{device_id, filename, total_size, total_chunks}` | Start upload |
| POST | `/api/upload/chunk` | FormData `{upload_id, chunk_index, chunk}` | Send chunk |
| POST | `/api/upload/complete` | `{upload_id}` | Assemble, auto-detect framework, push & trigger build |

### Owner

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| GET | `/api/owner/users` | - | List all users |
| POST | `/api/owner/delete-user` | `{device_id}` | Delete a user |
| POST | `/api/owner/add-credit` | `{target, amount}` | Add credit |
| POST | `/api/owner/generate-code` | `{amount, count}` | Generate codes |
| GET | `/api/owner/codes` | - | List active codes |
| POST | `/api/owner/toggle-server` | `{mode, title?, message?, music_url?}` | Toggle maintenance (`music_url` loops in the background on the user app while offline) |
| GET | `/api/owner/server-status` | - | Get server config |

---

Built by Earl
