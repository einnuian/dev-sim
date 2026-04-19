// Minimal GitHub REST client — calls go directly from the browser using a PAT.
// Token + repo are stored in localStorage. Used by the orchestrator to land
// real branches, commits, and PRs for every generated game.
//
// Required PAT scopes:
//   - "repo" (classic PAT)  OR
//   - Fine-grained PAT with: Contents: read+write, Pull requests: read+write,
//     Metadata: read, on the target repo only.

const STORAGE = 'devteam-sim:gh';

export function getGhConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || 'null') || {
      token: '', owner: '', repo: '', baseBranch: 'main', enabled: false,
    };
  } catch {
    return { token: '', owner: '', repo: '', baseBranch: 'main', enabled: false };
  }
}

export function setGhConfig(cfg) {
  localStorage.setItem(STORAGE, JSON.stringify(cfg));
}

export function isGhEnabled() {
  const c = getGhConfig();
  return !!(c.enabled && c.token && c.owner && c.repo);
}

const API = 'https://api.github.com';

async function gh(path, { method = 'GET', body, token } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${token}`,
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${method} ${path} -> ${res.status}: ${text.slice(0, 240)}`);
  }
  // 204 has no body
  if (res.status === 204) return null;
  return res.json();
}

// utf8 -> base64 (handles unicode safely)
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Verify the token works against the repo. Returns the default branch.
export async function verifyRepo() {
  const c = getGhConfig();
  if (!c.token || !c.owner || !c.repo) throw new Error('Missing token/owner/repo');
  const data = await gh(`/repos/${c.owner}/${c.repo}`, { token: c.token });
  return { defaultBranch: data.default_branch, fullName: data.full_name };
}

// Get the SHA of the tip commit on a branch.
async function getBranchSha(token, owner, repo, branch) {
  const data = await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, { token });
  return data.object.sha;
}

// Try to get an existing file's SHA on a branch (so we can update it).
async function tryGetFileSha(token, owner, repo, path, branch) {
  try {
    const data = await gh(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { token }
    );
    return data.sha;
  } catch {
    return null;
  }
}

// Create or update a single file on a branch with a custom author.
// Used for committing each file with a different agent identity.
async function putFile({ token, owner, repo, path, content, message, branch, author }) {
  const existingSha = await tryGetFileSha(token, owner, repo, path, branch);
  const body = {
    message,
    content: toBase64(content),
    branch,
    author,
    committer: author,
  };
  if (existingSha) body.sha = existingSha;
  const res = await gh(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    { method: 'PUT', token, body }
  );
  return res; // { content, commit }
}

// Create a branch from base.
async function createBranch(token, owner, repo, branchName, baseBranch) {
  const sha = await getBranchSha(token, owner, repo, baseBranch);
  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST', token,
    body: { ref: `refs/heads/${branchName}`, sha },
  });
}

// Create a pull request.
async function createPullRequest({ token, owner, repo, head, base, title, body }) {
  return gh(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST', token,
    body: { title, body, head, base, maintainer_can_modify: true },
  });
}

// Add a review comment as a generic PR comment (issue comment).
async function addIssueComment({ token, owner, repo, prNumber, body }) {
  return gh(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST', token, body: { body },
  });
}

// Build a deterministic agent git identity (used as commit author/committer).
export function agentIdentity(agent, ownerForFallback) {
  const handle = (agent.id || 'agent').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const safeName = (agent.displayName || 'Agent').replace(/[<>"']/g, '');
  return {
    name: `${safeName} (DevTeam Sim)`,
    email: `${handle}+devteam-sim@users.noreply.github.com`,
    handle,
  };
}

/**
 * Land a generated game as a real PR.
 *
 * files: [{ path, content, message, agent }]   // each file commits separately as the agent
 * Returns: { branch, prNumber, htmlUrl }
 */
export async function landGameAsPR({
  project,             // { id, name, prompt, html, sanitized, readme, log, review, sm, coder, reviewer }
  files,               // pre-built file list with author per commit
  reviewers,           // [{ agent, body }] for review comments after PR is open
  branchName,
  prTitle,
  prBody,
  onLog,               // (text) => void  for streaming progress lines
}) {
  const c = getGhConfig();
  if (!c.token || !c.owner || !c.repo) throw new Error('GitHub not configured');
  const base = c.baseBranch || 'main';
  const owner = c.owner, repo = c.repo, token = c.token;

  onLog?.(`creating branch ${branchName} from ${base}`);
  try {
    await createBranch(token, owner, repo, branchName, base);
  } catch (e) {
    if (!/Reference already exists/i.test(e.message)) throw e;
    onLog?.('branch already existed, reusing');
  }

  for (const f of files) {
    onLog?.(`commit: ${f.path} (by ${f.agent.displayName})`);
    await putFile({
      token, owner, repo,
      path: f.path,
      content: f.content,
      message: f.message,
      branch: branchName,
      author: agentIdentity(f.agent),
    });
  }

  onLog?.('opening pull request');
  const pr = await createPullRequest({
    token, owner, repo,
    head: branchName, base,
    title: prTitle, body: prBody,
  });

  if (reviewers && reviewers.length) {
    for (const r of reviewers) {
      onLog?.(`review comment from ${r.agent.displayName}`);
      try {
        await addIssueComment({ token, owner, repo, prNumber: pr.number, body: r.body });
      } catch (e) {
        onLog?.(`review comment failed: ${e.message.slice(0, 80)}`);
      }
    }
  }

  return {
    branch: branchName,
    prNumber: pr.number,
    htmlUrl: pr.html_url,
    fullName: `${owner}/${repo}`,
  };
}
