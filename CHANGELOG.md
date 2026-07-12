# Changelog — Earl Builder Vercel API

## [1.0.0] — 2026-07-11

### Added
- Initial serverless API for Earl Builder build queue
- Endpoints:
  - `/api/health` — server status check
  - `/api/users` — register / get user info
  - `/api/upload/init` — initialize chunked upload
  - `/api/upload/chunk` — upload individual chunk
  - `/api/upload/complete` — finalize upload + trigger build
  - `/api/codes` — generate / redeem codes (owner + user)
  - `/api/server/status` — get maintenance state
  - `/api/server/toggle` — set maintenance state (owner only)
- Telegram bot integration:
  - `bot.py` — long-running bot (separate deployment)
  - Webhook notification on build complete / code redeem

### Environment Variables

Required:
- `TELEGRAM_BOT_TOKEN` — bot authentication
- `GITHUB_TOKEN` — GitHub API token (for triggering workflows)
- `OWNER_TELEGRAM_ID` — owner chat ID for notifications
- `GITHUB_REPO` — target repo for build triggers (e.g. `earltiktokofficial/earl-builder-builds`)

Optional:
- `ALLOWED_ORIGINS` — comma-separated CORS origins (default: `*`)
- `MAX_FILE_SIZE_MB` — upload size limit (default: 1024 MB)
- `CHUNK_SIZE_KB` — chunk size (default: 512 KB)

### Database

Uses Vercel KV (Redis-compatible) for:
- User records
- Active codes
- Upload state metadata
- Server maintenance state

### Security Notes

- All endpoints validate inputs server-side
- Telegram bot token via env var only — never hardcoded
- CORS restricted via `ALLOWED_ORIGINS` env var
- Code validation prevents double-redemption
- Server maintenance toggle requires `OWNER_TELEGRAM_ID` match
