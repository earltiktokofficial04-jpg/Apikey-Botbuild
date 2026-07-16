// GitHub API helper for pushing files and triggering workflows

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const [REPO_OWNER, REPO_NAME] = (process.env.GITHUB_REPO || '/').split('/');
const WORKFLOW_ID = process.env.GITHUB_WORKFLOW_ID || 'build.yml';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
// Required by the build workflow (see .github/workflows/build.yml in the
// builder repo) — without these, GitHub rejects the workflow_dispatch call
// entirely (the file still gets pushed to temp/, but no build ever starts).
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const API_ID = process.env.API_ID || '';
const API_HASH = process.env.API_HASH || '';

let cachedBotUsername: string | null = null;

// Dapatkan username bot sendiri terus dari Telegram guna BOT_TOKEN (getMe),
// tak perlu env BOT_USERNAME lagi.
export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  if (!BOT_TOKEN) return null;

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const data = await response.json();

    if (data.ok && data.result?.username) {
      cachedBotUsername = data.result.username as string;
      return cachedBotUsername;
    }

    return null;
  } catch {
    return null;
  }
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  };
}

export async function pushToGitHub(
  fileBuffer: Buffer,
  filename: string
): Promise<{ success: boolean; uniqueName: string; error?: string }> {
  if (!GITHUB_TOKEN) {
    return { success: false, uniqueName: '', error: 'GitHub token not configured' };
  }

  const baseName = filename.replace(/\.zip$/i, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  const uniqueName = `${baseName}_${suffix}.zip`;

  try {
    const content = fileBuffer.toString('base64');

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/temp/${uniqueName}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        message: `Build: ${uniqueName}`,
        content: content,
      }),
    });

    if (response.status === 200 || response.status === 201) {
      return { success: true, uniqueName };
    }

    return {
      success: false,
      uniqueName: '',
      error: `GitHub API error: ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      uniqueName: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function triggerWorkflow(
  projectType: string,
  uniqueName: string,
  telegramId: string,
  userDisplay?: string
): Promise<{ success: boolean; error?: string }> {
  if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured' };

  try {
    // Same idea as panel_bot's get_github_queue() — count active/queued
    // runs so the worker can show an accurate queue position.
    const inProgress = await getBuildQueue();

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/dispatches`;

    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          project_type: projectType,
          target: uniqueName,
          bot_token: BOT_TOKEN,
          chat_id: String(telegramId),
          user_display: userDisplay || `ID:${telegramId}`,
          in_progress: String(inProgress + 1),
          channel_id: CHANNEL_ID,
          api_id: API_ID,
          api_hash: API_HASH,
        },
      }),
    });

    if (response.status === 204) {
      return { success: true };
    }

    // GitHub returns 422 (with a body explaining which input failed) when
    // a required input is missing — surface that instead of pretending
    // the build started.
    const errorBody = await response.text().catch(() => '');
    return {
      success: false,
      error: `GitHub workflow dispatch failed (${response.status}): ${errorBody || 'unknown error'}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getBuildQueue(): Promise<number> {
  if (!GITHUB_TOKEN) return 0;

  try {
    const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

    const [inProgress, queued] = await Promise.all([
      fetch(`${apiBase}/actions/runs?status=in_progress`, { headers: getHeaders() }),
      fetch(`${apiBase}/actions/runs?status=queued`, { headers: getHeaders() }),
    ]);

    const inProgressJson = await inProgress.json().catch(() => ({}));
    const queuedJson = await queued.json().catch(() => ({}));

    return (inProgressJson.total_count || 0) + (queuedJson.total_count || 0);
  } catch {
    return 0;
  }
}

export async function notifyTelegram(
  telegramId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!BOT_TOKEN) {
    return { success: false, error: 'Bot token not configured' };
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(telegramId),
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return { success: false, error: data.description || 'Unknown error' };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}
