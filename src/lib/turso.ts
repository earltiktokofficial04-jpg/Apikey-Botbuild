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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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

  return true;
}

// ─── User Operations ──────────────────────────────────────────────────

export interface UserRecord {
  device_id: string;
  telegram_id: string | null;
  credits: number;
  total_uploads: number;
  created_at: string;
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

export async function bindTelegram(deviceId: string, telegramId: string): Promise<{ success: boolean; message: string }> {
  const client = getTursoClient();

  // Check if telegram_id already bound to another device
  const existing = await client.execute({
    sql: 'SELECT device_id FROM users WHERE telegram_id = ?',
    args: [telegramId],
  });

  if (existing.rows.length > 0 && String(existing.rows[0].device_id) !== deviceId) {
    return { success: false, message: 'Telegram ID ini sudah diikat ke device lain.' };
  }

  await client.execute({
    sql: 'UPDATE users SET telegram_id = ? WHERE device_id = ?',
    args: [telegramId, deviceId],
  });

  return { success: true, message: 'Telegram berjaya diikat.' };
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

// ─── Server Config ──────────────────────────────────────────────────────

export interface ServerConfig {
  maintenance_mode: string;
  maintenance_title: string;
  maintenance_message: string;
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
  };
}

export async function checkMaintenance(): Promise<{ is_maintenance: boolean; title: string; message: string }> {
  const config = await getServerConfig();
  return {
    is_maintenance: config.maintenance_mode === 'on',
    title: config.maintenance_title,
    message: config.maintenance_message,
  };
}

export async function setServerConfig(key: string, value: string): Promise<void> {
  const client = getTursoClient();
  await client.execute({
    sql: 'INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)',
    args: [key, value],
  });
}

export async function toggleMaintenance(mode: string, title?: string, message?: string): Promise<ServerConfig> {
  await setServerConfig('maintenance_mode', mode);
  if (title !== undefined) await setServerConfig('maintenance_title', title);
  if (message !== undefined) await setServerConfig('maintenance_message', message);
  return getServerConfig();
}
