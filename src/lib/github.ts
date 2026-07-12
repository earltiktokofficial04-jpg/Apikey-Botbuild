// GitHub API helper for pushing files and triggering workflows

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || '';
const REPO_NAME = process.env.GITHUB_REPO_NAME || '';
const WORKFLOW_ID = process.env.GITHUB_WORKFLOW_ID || 'build.yml';
const BOT_TOKEN = process.env.BOT_TOKEN || '';

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
  uniqueName: string
): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;

  try {
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
        },
      }),
    });

    return response.status === 204;
  } catch {
    return false;
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
