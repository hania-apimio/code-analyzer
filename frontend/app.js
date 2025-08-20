function getBase() {
  const el = document.getElementById('baseUrl');
  const raw = el && typeof el.value === 'string' ? el.value : '';
  return raw.trim().replace(/\/$/, '');
}
function getToken() {
  const el = document.getElementById('token');
  const raw = el && typeof el.value === 'string' ? el.value : '';
  return raw.trim();
}
function hdrs() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['X-GitHub-Token'] = token;
  return h;
}
function show(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  // If it's the timeframes endpoint, render split sections for commit and PR timeframes
  if (data && data.repo && data.branches && data.branches.length && (data.branches[0].commit_timeframes || data.branches[0].timeframes)) {
    el.innerHTML = data.branches.map(b => renderTimeframesBranchCard(b)).join('');
    return;
  }
  // Otherwise, format branches with separate sections for commits and PRs
  if (data && data.branches && Array.isArray(data.branches)) {
    el.innerHTML = data.branches.map(b => renderBranchCard(b)).join('');
  } else {
    el.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  }
}

function renderTimeframesBranchCard(branch) {
  const name = branch.name || 'unknown';
  const isDefault = branch.is_default ? '<span class="badge">default</span>' : '';
  const protectedBadge = branch.protected ? '<span class="badge">protected</span>' : '';
  const commitTF = branch.commit_timeframes || branch.timeframes || {};

  const renderCommitBlock = ([label, stats]) => {
    const commits = (stats && stats.commits) || [];
    const head = `${label} — total: ${(stats?.total_commits ?? 0)} (+${stats?.total_additions ?? 0} / -${stats?.total_deletions ?? 0} ~${stats?.total_changes ?? 0})`;
    const items = commits.slice(0, 200).map(c => {
      const sha = (c.sha || '').slice(0, 7);
      const msg = c.message || '';
      const cls = (c.classification && c.classification.label) ? c.classification.label : '';
      const adds = c.additions ?? 0;
      const dels = c.deletions ?? 0;
      const chg = c.changes ?? (adds + dels);
      const contributor = c.contributor ? `<span class="badge">${escapeHtml(c.contributor)}</span>` : '';
      return `<li><code>${escapeHtml(sha)}</code> ${escapeHtml(msg)} ${contributor} <span class="badge">${escapeHtml(String(cls))}</span> <span class="badge">+${adds} -${dels} ~${chg}</span></li>`;
    }).join('');
    return `
      <div class="tf-block">
        <h4>${escapeHtml(head)}</h4>
        <ul>${items || '<li><em>No commits</em></li>'}</ul>
      </div>
    `;
  };

  const commitBlocks = Object.entries(commitTF).map(renderCommitBlock).join('');

  return `
    <div class="branch-card">
      <div class="branch-header">
        <strong>${escapeHtml(name)}</strong>
        ${isDefault}
        ${protectedBadge}
      </div>
      <div class="branch-body">
        <div class="panel">
          <h3>Commit History</h3>
          <div class="tf-list">${commitBlocks}</div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderBranchCard(branch) {
  const name = branch.name || 'unknown';
  const isDefault = branch.is_default ? '<span class="badge">default</span>' : '';
  const protectedBadge = branch.protected ? '<span class="badge">protected</span>' : '';
  const commits = branch.commits || [];
  const prs = branch.pull_requests || [];
  return `
    <div class="branch-card">
      <div class="branch-header">
        <strong>${escapeHtml(name)}</strong>
        ${isDefault}
        ${protectedBadge}
        <span class="badge">commits: ${commits.length}</span>
        <span class="badge">PRs: ${prs.length}</span>
      </div>
      <div class="branch-body">
        <div class="panel">
          <h3>Commits</h3>
          <pre>${escapeHtml(JSON.stringify(commits.slice(0, 50), null, 2))}</pre>
        </div>
        <div class="panel">
          <h3>Pull Requests</h3>
          <pre>${escapeHtml(JSON.stringify(prs.slice(0, 50), null, 2))}</pre>
        </div>
      </div>
    </div>
  `;
}
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, { ...options, mode: 'cors' });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) throw new Error((json && json.detail) || res.statusText || 'Request failed');
    return json;
  } catch (e) {
    return { error: e.message };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const btnTimeframes = document.getElementById('btnTimeframes');

  if (!btnTimeframes) {
    console.error('Buttons not found in DOM');
    return;
  }

  btnTimeframes.addEventListener('click', async () => {
    const repoInput = document.getElementById('repoFullName');
    const repoFullName = ((repoInput && repoInput.value) || '').trim();
    if (!repoFullName) {
      show('outRepos', { error: 'Please enter a repo in the form owner/repo' });
      return;
    }
    const url = `${getBase()}/repos/timeframes?full_name=${encodeURIComponent(repoFullName)}`;
    console.log('GET', url);
    const data = await safeFetch(url, { headers: hdrs() });
    show('outRepos', data);
  });
});


