import { createClient } from '@libsql/client';

function getTursoClient() {
  const url = process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_URL and TURSO_AUTH_TOKEN must be set in environment variables');
  }

  return createClient({ url, authToken });
}

// ─── Database Initialization ─────────────────────────────────────────

export async function initDatabase() {
  const client = getTursoClient();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      device_id TEXT PRIMARY KEY,
      telegram_id TEXT UNIQUE,
      credits INTEGER NOT NULL DEFAULT 5,
      total_uploads INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      pending_verify_code TEXT,
      pending_verify_telegram TEXT,
      daily_ad_count INTEGER NOT NULL DEFAULT 0,
      daily_ad_date TEXT NOT NULL DEFAULT ''
    )
  `);

  // Migrate existing tables created before verification/ad-limit columns existed.
  for (const col of ['pending_verify_code', 'pending_verify_telegram']) {
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
    } catch {
      // column already exists — ignore
    }
  }
  try {
    await client.execute(`ALTER TABLE users ADD COLUMN daily_ad_count INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // column already exists — ignore
  }
  try {
    await client.execute(`ALTER TABLE users ADD COLUMN daily_ad_date TEXT NOT NULL DEFAULT ''`);
  } catch {
    // column already exists — ignore
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS credit_codes (
      code TEXT PRIMARY KEY,
      amount INTEGER NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_by TEXT,
      claimed_at TEXT,
      is_used INTEGER NOT NULL DEFAULT 0
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS server_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  // Default config values
  await client.execute(`
    INSERT OR IGNORE INTO server_config (key, value) VALUES ('maintenance_mode', 'off')
  `);
  await client.execute(`
    INSERT OR IGNORE INTO server_config (key, value) VALUES ('maintenance_title', 'Server Sedang Maintenance')
  `);
  await client.execute(`
    INSERT OR IGNORE INTO server_config (key, value) VALUES ('maintenance_message', 'Sila cuba lagi nanti. Server sedang dalam proses penyelenggaraan.')
  `);
  await client.execute(`
    INSERT OR IGNORE INTO server_config (key, value) VALUES ('maintenance_music_url', '')
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_url TEXT NOT NULL,
      click_url TEXT,
      title TEXT,
      caption TEXT,
      target_device_id TEXT,
      target_telegram_id TEXT,
      limit_type TEXT NOT NULL DEFAULT 'views',
      limit_value INTEGER NOT NULL DEFAULT 1,
      views_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return true;
}

// ─── User Operations ──────────────────────────────────────────────────

export interface UserRecord {
  device_id: string;
  telegram_id: string | null;
  credits: number;
  total_uploads: number;
  created_at: string;
  daily_ad_count?: number;
  daily_ad_date?: string;
}

export async function getUser(deviceId: string): Promise<UserRecord> {
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'SELECT * FROM users WHERE device_id = ?',
    args: [deviceId],
  });

  if (result.rows.length === 0) {
    // Auto-register new user with 5 free credits
    await client.execute({
      sql: 'INSERT INTO users (device_id, credits) VALUES (?, 5)',
      args: [deviceId],
    });

    const fresh = await client.execute({
      sql: 'SELECT * FROM users WHERE device_id = ?',
      args: [deviceId],
    });

    return fresh.rows[0] as unknown as UserRecord;
  }

  return result.rows[0] as unknown as UserRecord;
}

export async function getUserByTelegram(telegramId: string): Promise<UserRecord | null> {
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'SELECT * FROM users WHERE telegram_id = ?',
    args: [telegramId],
  });
  return result.rows.length > 0 ? (result.rows[0] as unknown as UserRecord) : null;
}

function generateVerifyCode(): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Step 1 — device requests to bind a Telegram ID. A verification code is
// generated and stored against this device; the caller is responsible for
// sending it to the user via Telegram (wrapped in <blockquote>) so only
// someone with access to that Telegram account can complete the bind.
export async function requestBindVerification(
  deviceId: string,
  telegramId: string
): Promise<{ success: boolean; message: string; code?: string }> {
  const client = getTursoClient();
  const user = await getUser(deviceId);

  if (user.telegram_id) {
    return {
      success: false,
      message: 'Device ini sudah diikat ke satu akaun Telegram. Sila unbind dahulu.',
    };
  }

  const code = generateVerifyCode();
  await client.execute({
    sql: 'UPDATE users SET pending_verify_code = ?, pending_verify_telegram = ? WHERE device_id = ?',
    args: [code, telegramId, deviceId],
  });

  return { success: true, message: 'Kod pengesahan telah dijana.', code };
}

// Step 2 — device submits the code it received via Telegram. On success,
// the telegram_id is released from any other device that previously held
// it (a fresh, verified bind always wins over a stale one).
export async function confirmBindVerification(
  deviceId: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  const client = getTursoClient();

  const result = await client.execute({
    sql: 'SELECT pending_verify_code, pending_verify_telegram FROM users WHERE device_id = ?',
    args: [deviceId],
  });

  if (result.rows.length === 0) {
    return { success: false, message: 'Device tidak dijumpai.' };
  }

  const row = result.rows[0] as unknown as {
    pending_verify_code: string | null;
    pending_verify_telegram: string | null;
  };

  if (!row.pending_verify_code || !row.pending_verify_telegram) {
    return { success: false, message: 'Tiada permintaan pengesahan aktif. Sila mula semula.' };
  }

  if (String(row.pending_verify_code) !== String(code).trim()) {
    return { success: false, message: 'Kod pengesahan salah.' };
  }

  const telegramId = row.pending_verify_telegram;

  // Release this Telegram ID from any other device that had it bound —
  // a device that just completed verification takes priority over an
  // old, unverified binding elsewhere.
  await client.execute({
    sql: 'UPDATE users SET telegram_id = NULL WHERE telegram_id = ? AND device_id != ?',
    args: [telegramId, deviceId],
  });

  await client.execute({
    sql: 'UPDATE users SET telegram_id = ?, pending_verify_code = NULL, pending_verify_telegram = NULL WHERE device_id = ?',
    args: [telegramId, deviceId],
  });

  return { success: true, message: 'Telegram berjaya diikat.' };
}

// Unbind — required before a device that already has a Telegram ID bound
// can start a new bind request.
export async function unbindTelegram(deviceId: string): Promise<{ success: boolean; message: string }> {
  const client = getTursoClient();
  await client.execute({
    sql: 'UPDATE users SET telegram_id = NULL, pending_verify_code = NULL, pending_verify_telegram = NULL WHERE device_id = ?',
    args: [deviceId],
  });
  return { success: true, message: 'Telegram berjaya diunbind.' };
}

export async function deductCredits(deviceId: string, amount: number): Promise<{ success: boolean; credits: number; message: string }> {
  const client = getTursoClient();
  const user = await getUser(deviceId);

  if (user.credits < amount) {
    return { success: false, credits: user.credits, message: 'Kredit tidak mencukupi untuk upload.' };
  }

  await client.execute({
    sql: 'UPDATE users SET credits = credits - ?, total_uploads = total_uploads + 1 WHERE device_id = ?',
    args: [amount, deviceId],
  });

  return { success: true, credits: user.credits - amount, message: 'Upload berjaya dimulakan.' };
}

export async function addCredits(targetIdentifier: string, amount: number): Promise<{ success: boolean; message: string }> {
  const client = getTursoClient();

  // Try by device_id first, then by telegram_id
  let result = await client.execute({
    sql: 'UPDATE users SET credits = credits + ? WHERE device_id = ?',
    args: [amount, targetIdentifier],
  });

  if (result.rowsAffected === 0) {
    result = await client.execute({
      sql: 'UPDATE users SET credits = credits + ? WHERE telegram_id = ?',
      args: [amount, targetIdentifier],
    });
  }

  if (result.rowsAffected === 0) {
    return { success: false, message: 'User tidak dijumpai. Pastikan device ID atau Telegram ID wujud dalam sistem.' };
  }

  return { success: true, message: `${amount} kredit berjaya ditambah.` };
}

export async function getAllUsers(): Promise<UserRecord[]> {
  const client = getTursoClient();
  const result = await client.execute('SELECT * FROM users ORDER BY created_at DESC');
  return result.rows as unknown as UserRecord[];
}

export async function deleteUser(deviceId: string): Promise<{ success: boolean; message: string }> {
  const client = getTursoClient();
  const result = await client.execute({
    sql: 'DELETE FROM users WHERE device_id = ?',
    args: [deviceId],
  });

  if (result.rowsAffected === 0) {
    return { success: false, message: 'User tidak dijumpai.' };
  }

  return { success: true, message: 'User berjaya dipadam.' };
}

export async function deleteUsers(deviceIds: string[]): Promise<{ success: boolean; deleted: number }> {
  const client = getTursoClient();
  let deleted = 0;
  for (const id of deviceIds) {
    const result = await client.execute({
      sql: 'DELETE FROM users WHERE device_id = ?',
      args: [id],
    });
    deleted += result.rowsAffected;
  }
  return { success: true, deleted };
}

export async function getUserCount(): Promise<number> {
  const client = getTursoClient();
  const result = await client.execute('SELECT COUNT(*) as count FROM users');
  return Number(result.rows[0].count);
}

// ─── Credit Codes ──────────────────────────────────────────────────────

export interface CreditCode {
  code: string;
  amount: number;
  created_by: string;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  is_used: number;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Format: XXXX-XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

export async function generateCreditCodes(amount: number, count: number): Promise<CreditCode[]> {
  const client = getTursoClient();
  const codes: CreditCode[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateCode();
    await client.execute({
      sql: 'INSERT INTO credit_codes (code, amount) VALUES (?, ?)',
      args: [code, amount],
    });
    codes.push({
      code,
      amount,
      created_by: 'owner',
      created_at: new Date().toISOString(),
      claimed_by: null,
      claimed_at: null,
      is_used: 0,
    });
  }

  return codes;
}

export async function claimCode(deviceId: string, code: string): Promise<{ success: boolean; message: string; credits?: number }> {
  const client = getTursoClient();

  const existing = await client.execute({
    sql: 'SELECT * FROM credit_codes WHERE code = ?',
    args: [code],
  });

  if (existing.rows.length === 0) {
    return { success: false, message: 'Kod tidak sah.' };
  }

  const codeRecord = existing.rows[0] as unknown as CreditCode;

  if (codeRecord.is_used) {
    return { success: false, message: 'Kod ini telah digunakan.' };
  }

  // Mark code as used & add credits
  await client.execute({
    sql: 'UPDATE credit_codes SET is_used = 1, claimed_by = ?, claimed_at = datetime(\'now\') WHERE code = ?',
    args: [deviceId, code],
  });

  await client.execute({
    sql: 'UPDATE users SET credits = credits + ? WHERE device_id = ?',
    args: [codeRecord.amount, deviceId],
  });

  const user = await getUser(deviceId);
  return { success: true, message: `Berjaya tebus ${codeRecord.amount} kredit!`, credits: user.credits };
}

export async function getActiveCodes(): Promise<CreditCode[]> {
  const client = getTursoClient();
  const result = await client.execute('SELECT * FROM credit_codes WHERE is_used = 0 ORDER BY created_at DESC');
  return result.rows as unknown as CreditCode[];
}

export async function deleteCodes(codes: string[]): Promise<{ success: boolean; deleted: number }> {
  const client = getTursoClient();
  let deleted = 0;
  for (const code of codes) {
    const result = await client.execute({
      sql: 'DELETE FROM credit_codes WHERE code = ?',
      args: [code],
    });
    deleted += result.rowsAffected;
  }
  return { success: true, deleted };
}

// ─── Server Config ──────────────────────────────────────────────────────

export interface ServerConfig {
  maintenance_mode: string;
  maintenance_title: string;
  maintenance_message: string;
  maintenance_music_url: string;
}

export async function getServerConfig(): Promise<ServerConfig> {
  const client = getTursoClient();
  const result = await client.execute('SELECT key, value FROM server_config');
  const config: Record<string, string> = {};
  for (const row of result.rows) {
    config[String(row.key)] = String(row.value);
  }
  return {
    maintenance_mode: config.maintenance_mode || 'off',
    maintenance_title: config.maintenance_title || 'Server Sedang Maintenance',
    maintenance_message: config.maintenance_message || 'Sila cuba lagi nanti.',
    maintenance_music_url: config.maintenance_music_url || '',
  };
}

export async function checkMaintenance(): Promise<{ is_maintenance: boolean; title: string; message: string; music_url: string }> {
  const config = await getServerConfig();
  return {
    is_maintenance: config.maintenance_mode === 'on',
    title: config.maintenance_title,
    message: config.maintenance_message,
    music_url: config.maintenance_music_url,
  };
}

export async function setServerConfig(key: string, value: string): Promise<void> {
  const client = getTursoClient();
  await client.execute({
    sql: 'INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)',
    args: [key, value],
  });
}

export async function toggleMaintenance(
  mode: string,
  title?: string,
  message?: string,
  musicUrl?: string
): Promise<ServerConfig> {
  await setServerConfig('maintenance_mode', mode);
  if (title !== undefined) await setServerConfig('maintenance_title', title);
  if (message !== undefined) await setServerConfig('maintenance_message', message);
  if (musicUrl !== undefined) await setServerConfig('maintenance_music_url', musicUrl);
  return getServerConfig();
}

// ─── Ads ──────────────────────────────────────────────────────────────
// Ads are per-user: each one targets exactly one device_id or telegram_id.
// A user only ever sees an ad the owner specifically pointed at them —
// there is no broadcast/global ad. The reward roll lives entirely here,
// server-side, so nothing about the odds is reachable from either app.

export interface AdRecord {
  id: number;
  media_url: string;
  click_url: string | null;
  title: string | null;
  caption: string | null;
  target_device_id: string | null;
  target_telegram_id: string | null;
  limit_type: 'views' | 'days';
  limit_value: number;
  views_count: number;
  created_at: string;
}

export async function createAd(params: {
  mediaUrl: string;
  clickUrl?: string;
  title?: string;
  caption?: string;
  targetDeviceId?: string;
  targetTelegramId?: string;
  limitType: 'views' | 'days';
  limitValue: number;
}): Promise<AdRecord> {
  const client = getTursoClient();
  const targetDeviceId = params.targetDeviceId?.trim() || null;
  const targetTelegramId = params.targetTelegramId?.trim() || null;
  const result = await client.execute({
    sql: `INSERT INTO ads (media_url, click_url, title, caption, target_device_id, target_telegram_id, limit_type, limit_value)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      params.mediaUrl,
      params.clickUrl || null,
      params.title || null,
      params.caption || null,
      // Target is optional — an ad with neither set is a broadcast ad,
      // visible to every user (e.g. the owner's own general promotions).
      targetDeviceId,
      targetTelegramId,
      params.limitType,
      params.limitValue,
    ],
  });
  return result.rows[0] as unknown as AdRecord;
}

export async function getAds(): Promise<AdRecord[]> {
  const client = getTursoClient();
  const result = await client.execute('SELECT * FROM ads ORDER BY created_at DESC');
  return result.rows as unknown as AdRecord[];
}

export async function deleteAds(ids: number[]): Promise<{ success: boolean; deleted: number }> {
  const client = getTursoClient();
  let deleted = 0;
  for (const id of ids) {
    const result = await client.execute({
      sql: 'DELETE FROM ads WHERE id = ?',
      args: [id],
    });
    deleted += result.rowsAffected;
  }
  return { success: true, deleted };
}

function isAdStillActive(row: AdRecord): boolean {
  if (row.limit_type === 'views') {
    return row.views_count < row.limit_value;
  }
  const created = new Date(row.created_at + 'Z').getTime();
  const expiresAt = created + row.limit_value * 24 * 60 * 60 * 1000;
  return Date.now() < expiresAt;
}

// Returns the ad currently available to this device — either one
// explicitly targeted at this device_id / bound telegram_id, or a
// broadcast ad (no target set at all) — whichever is newest and not yet
// expired by its own views/days limit. Null if nothing is available.
export async function getActiveAdForUser(deviceId: string, telegramId: string | null): Promise<AdRecord | null> {
  const client = getTursoClient();
  const result = await client.execute({
    sql: `SELECT * FROM ads
          WHERE target_device_id = ?
             OR (target_telegram_id IS NOT NULL AND target_telegram_id = ?)
             OR (target_device_id IS NULL AND target_telegram_id IS NULL)
          ORDER BY created_at DESC`,
    args: [deviceId, telegramId || ''],
  });

  for (const row of result.rows as unknown as AdRecord[]) {
    if (isAdStillActive(row)) return row;
  }
  return null;
}

// Same-day tracking uses Asia/Kuala_Lumpur's calendar date (UTC+8, no
// DST) — not the server's own timezone — so the daily cap always resets
// at midnight local time for the owner/users, regardless of where the
// Vercel function happens to run.
const DAILY_AD_LIMIT = 10;

function getKLDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Read-only lookup of how many ad-rewards this device has left today —
// used to show "{n}/10 left today" in the Free Credits info dialog,
// without mutating anything.
export async function getDailyAdStatus(deviceId: string): Promise<{ remaining: number; limit: number }> {
  const user = await getUser(deviceId);
  const today = getKLDateString();
  const usedToday = user.daily_ad_date === today ? user.daily_ad_count || 0 : 0;
  return { remaining: Math.max(0, DAILY_AD_LIMIT - usedToday), limit: DAILY_AD_LIMIT };
}

// Weighted random reward roll — higher amounts are deliberately rarer.
// Kept private to this module; neither app can see or influence this.
function rollAdReward(): number {
  const r = Math.random() * 100;
  let lo: number, hi: number;
  if (r < 60) {
    [lo, hi] = [1, 10];
  } else if (r < 85) {
    [lo, hi] = [11, 25];
  } else if (r < 95) {
    [lo, hi] = [26, 50];
  } else if (r < 99) {
    [lo, hi] = [51, 75];
  } else {
    [lo, hi] = [76, 100];
  }
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export async function claimAdReward(
  deviceId: string,
  adId: number,
  watchSeconds: number
): Promise<{ success: boolean; message: string; reward?: number; credits?: number; daily_remaining?: number }> {
  const MIN_WATCH_SECONDS = 15;

  if (watchSeconds < MIN_WATCH_SECONDS) {
    return { success: false, message: 'Ad was not watched long enough.' };
  }

  const client = getTursoClient();
  const user = await getUser(deviceId);

  const today = getKLDateString();
  const usedToday = user.daily_ad_date === today ? user.daily_ad_count || 0 : 0;
  if (usedToday >= DAILY_AD_LIMIT) {
    return {
      success: false,
      message: 'Daily limit reached. Come back tomorrow for more.',
      daily_remaining: 0,
    };
  }

  const adResult = await client.execute({
    sql: 'SELECT * FROM ads WHERE id = ?',
    args: [adId],
  });

  if (adResult.rows.length === 0) {
    return { success: false, message: 'Ad not found.' };
  }

  const ad = adResult.rows[0] as unknown as AdRecord;
  const isBroadcast = !ad.target_device_id && !ad.target_telegram_id;
  const targetsThisUser =
    isBroadcast ||
    ad.target_device_id === deviceId ||
    (ad.target_telegram_id && user.telegram_id && ad.target_telegram_id === user.telegram_id);

  if (!targetsThisUser) {
    return { success: false, message: 'This ad is not available for your account.' };
  }

  if (!isAdStillActive(ad)) {
    return { success: false, message: 'This ad is no longer available.' };
  }

  const reward = rollAdReward();

  await client.execute({
    sql: 'UPDATE ads SET views_count = views_count + 1 WHERE id = ?',
    args: [adId],
  });
  await client.execute({
    sql: 'UPDATE users SET credits = credits + ?, daily_ad_count = ?, daily_ad_date = ? WHERE device_id = ?',
    args: [reward, usedToday + 1, today, deviceId],
  });

  const updatedUser = await getUser(deviceId);

  return {
    success: true,
    message: `You earned ${reward} credits!`,
    reward,
    credits: updatedUser.credits,
    daily_remaining: DAILY_AD_LIMIT - (usedToday + 1),
  };
}
