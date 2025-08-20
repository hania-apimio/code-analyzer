from typing import Optional, Tuple, List, Dict, Any
import requests
from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import concurrent.futures
from datetime import datetime, timezone
import re

BASE_URL = "https://api.github.com"

last_status: Optional[int] = None
last_error: Optional[str] = None

# Simple in-memory cache for commit details to avoid refetch across branches
_commit_detail_cache: Dict[str, Dict[str, Any]] = {}
_branch_files_count_cache: Dict[str, int] = {}


def headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "MyCodeAnalyser-API"
    }


def _create_session(token: str) -> Session:
    session = requests.Session()
    session.headers.update(headers(token))
    retry = Retry(total=3, backoff_factor=0.2, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _cache_key_branch(owner: str, repo: str, branch: str) -> str:
    return f"{owner}/{repo}@{branch}"


def get_total_files_in_branch(token: str, owner: str, repo: str, branch: str) -> Optional[int]:
    """Return number of files (blobs) in a branch by traversing git tree.

    Cached per branch to minimize API calls. Returns None if tree is truncated or on error.
    """
    key = _cache_key_branch(owner, repo, branch)
    if key in _branch_files_count_cache:
        return _branch_files_count_cache[key]

    session = _create_session(token)
    # 1) Get branch to obtain commit SHA
    try:
        br = session.get(f"{BASE_URL}/repos/{owner}/{repo}/branches/{branch}", timeout=30)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if br.status_code != 200:
        set_error(br.status_code, br.text)
        return None
    sha = ((br.json() or {}).get("commit") or {}).get("sha")
    if not sha:
        return None

    # 2) Fetch tree recursively
    try:
        tr = session.get(f"{BASE_URL}/repos/{owner}/{repo}/git/trees/{sha}", params={"recursive": 1}, timeout=60)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if tr.status_code != 200:
        set_error(tr.status_code, tr.text)
        return None
    tree = tr.json() or {}
    if tree.get("truncated"):
        # Too large to count reliably
        return None
    files = [n for n in (tree.get("tree") or []) if n.get("type") == "blob"]
    count = len(files)
    _branch_files_count_cache[key] = count
    return count


BUG_REGEX = re.compile(r"\b(fix|fixed|bug|bugs|hotfix|patch|revert|regression)\b", re.IGNORECASE)


def classify_change(message: Optional[str], total_changes: Optional[int], changed_files: Optional[int], total_files_in_branch: Optional[int]) -> Dict[str, Any]:
    """Classify as bug_fix, low_feature, or high_feature based on simple rules.

    - Bug if message contains bug/fix keywords.
    - High-complexity feature if changed_files >= 15% of total files in branch (when available), else low.
    """
    msg = message or ""
    if BUG_REGEX.search(msg):
        return {"label": "bug_fix"}

    cf = int(changed_files or 0)
    tf = total_files_in_branch if (isinstance(total_files_in_branch, int) and total_files_in_branch > 0) else None
    if tf:
        percent = (cf / tf) * 100.0
        if percent >= 15.0:
            return {"label": "high_feature", "files_percent": round(percent, 2), "total_files": tf}
        return {"label": "low_feature", "files_percent": round(percent, 2), "total_files": tf}
    # Fallback when total files unknown: consider high if many files changed
    if cf >= 100:
        return {"label": "high_feature"}
    return {"label": "low_feature"}


def extract_rate_limit(h: Dict[str, str]) -> Dict[str, Optional[str]]:
    return {
        "limit": h.get("X-RateLimit-Limit"),
        "remaining": h.get("X-RateLimit-Remaining"),
        "reset": h.get("X-RateLimit-Reset")
    }


def set_error(status: int, message: str) -> None:
    global last_status, last_error
    last_status = status
    last_error = message


def fetch_user(token: str) -> Tuple[Optional[Dict[str, Any]], Dict[str, str]]:
    url = f"{BASE_URL}/user"
    session = _create_session(token)
    try:
        r = session.get(url, timeout=20)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None, {}
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return None, dict(r.headers)
    return r.json(), dict(r.headers)


def fetch_emails(token: str) -> Optional[List[Dict[str, Any]]]:
    url = f"{BASE_URL}/user/emails"
    session = _create_session(token)
    try:
        r = session.get(url, timeout=20)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return None
    return r.json()


def fetch_orgs(token: str) -> Optional[List[Dict[str, Any]]]:
    url = f"{BASE_URL}/user/orgs"
    session = _create_session(token)
    try:
        r = session.get(url, timeout=20)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return None
    return r.json()


def fetch_all_repos(token: str) -> Optional[List[Dict[str, Any]]]:
    all_repos: List[Dict[str, Any]] = []
    page = 1
    session = _create_session(token)
    while True:
        url = f"{BASE_URL}/user/repos"
        try:
            r = session.get(url, params={"per_page": 100, "page": page}, timeout=30)
        except requests.exceptions.RequestException as e:
            set_error(502, f"network error: {e}")
            return None
        if r.status_code != 200:
            set_error(r.status_code, r.text)
            return None
        batch = r.json() or []
        if not batch:
            break
        all_repos.extend(batch)
        page += 1
    return all_repos


def parse_owner_repo(full_name: str) -> Tuple[Optional[str], Optional[str]]:
    try:
        owner, repo = full_name.split("/", 1)
        return owner, repo
    except ValueError:
        return None, None


def fetch_repo(token: str, owner: str, repo: str) -> Optional[Dict[str, Any]]:
    url = f"{BASE_URL}/repos/{owner}/{repo}"
    try:
        r = requests.get(url, headers=headers(token), timeout=30)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return None
    return r.json()


def fetch_repo_by_full_name(token: str, full_name: str) -> Optional[Dict[str, Any]]:
    owner, name = parse_owner_repo(full_name)
    if not owner or not name:
        set_error(400, "Invalid full_name. Expected 'owner/repo'.")
        return None
    return fetch_repo(token, owner, name)


def fetch_all_branches(token: str, owner: str, repo: str, max_branches: Optional[int] = None) -> Optional[List[Dict[str, Any]]]:
    all_branches: List[Dict[str, Any]] = []
    page = 1
    session = _create_session(token)
    while True:
        url = f"{BASE_URL}/repos/{owner}/{repo}/branches"
        try:
            r = session.get(url, params={"per_page": 100, "page": page}, timeout=30)
        except requests.exceptions.RequestException as e:
            set_error(502, f"network error: {e}")
            return None
        if r.status_code != 200:
            set_error(r.status_code, r.text)
            return None
        batch = r.json() or []
        if not batch:
            break
        all_branches.extend(batch)
        if max_branches and max_branches > 0 and len(all_branches) >= max_branches:
            all_branches = all_branches[:max_branches]
            break
        page += 1
    return all_branches


def get_total_commits(token: str, owner: str, repo: str, branch: str) -> Optional[int]:
    url = f"{BASE_URL}/repos/{owner}/{repo}/commits"
    session = _create_session(token)
    try:
        r = session.get(url, params={"sha": branch, "per_page": 1}, timeout=30)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return None
    link = r.headers.get("Link")
    if link and 'rel="last"' in link:
        try:
            last_part = [p for p in link.split(",") if 'rel="last"' in p][0]
            import re
            match = re.search(r"[?&]page=(\d+)", last_part)
            if match:
                return int(match.group(1))
        except Exception:
            pass
    try:
        items = r.json()
        return len(items)
    except Exception:
        return None


def fetch_recent_commit_details(token: str, owner: str, repo: str, branch: str, limit: int) -> List[Dict[str, Any]]:
    commits_url = f"{BASE_URL}/repos/{owner}/{repo}/commits"
    session = _create_session(token)
    try:
        r = session.get(commits_url, params={"sha": branch, "per_page": max(1, limit)}, timeout=30)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return []
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return []
    commit_summaries: List[Dict[str, Any]] = []
    for item in r.json() or []:
        sha = item.get("sha")
        if not sha:
            continue
        # Cached detail if available
        detail = _commit_detail_cache.get(sha)
        if detail is None:
            detail_url = f"{BASE_URL}/repos/{owner}/{repo}/commits/{sha}"
            try:
                dr = session.get(detail_url, timeout=30)
            except requests.exceptions.RequestException as e:
                set_error(502, f"network error: {e}")
                continue
            if dr.status_code != 200:
                set_error(dr.status_code, dr.text)
                continue
            detail = dr.json()
            _commit_detail_cache[sha] = detail
        commit_data = detail.get("commit", {})
        author = commit_data.get("author", {}) or {}
        stats = detail.get("stats", {}) or {}
        files = detail.get("files", []) or []
        commit_summaries.append({
            "sha": sha,
            "message": (commit_data.get("message") or "").splitlines()[0],
            "date": author.get("date"),
            "author_name": author.get("name"),
            "author_email": author.get("email"),
            "additions": stats.get("additions"),
            "deletions": stats.get("deletions"),
            "changes": stats.get("total"),
            "files": [
                {
                    "filename": f.get("filename"),
                    "status": f.get("status"),
                    "additions": f.get("additions"),
                    "deletions": f.get("deletions"),
                    "changes": f.get("changes")
                }
                for f in files
            ]
        })
    return commit_summaries


def fetch_all_commits_for_branch(token: str, owner: str, repo: str, branch: str) -> List[Dict[str, Any]]:
    """Fetch all commits for a branch with pagination and include stats.

    Returns a list of summaries including contributor (author/committer),
    message, and volume (additions/deletions/total changes).
    """
    commits_url = f"{BASE_URL}/repos/{owner}/{repo}/commits"
    session = _create_session(token)
    page = 1
    all_summaries: List[Dict[str, Any]] = []
    shas: List[str] = []
    while True:
        try:
            r = session.get(
                commits_url,
                params={"sha": branch, "per_page": 100, "page": page},
                timeout=30
            )
        except requests.exceptions.RequestException as e:
            set_error(502, f"network error: {e}")
            break
        if r.status_code != 200:
            set_error(r.status_code, r.text)
            break
        batch = r.json() or []
        if not batch:
            break
        for item in batch:
            sha = item.get("sha")
            if sha:
                shas.append(sha)
        page += 1

    # Fetch details in parallel with caching
    def fetch_detail(sha: str) -> Optional[Dict[str, Any]]:
        cached = _commit_detail_cache.get(sha)
        if cached is not None:
            return cached
        detail_url = f"{BASE_URL}/repos/{owner}/{repo}/commits/{sha}"
        try:
            dr = session.get(detail_url, timeout=30)
        except requests.exceptions.RequestException:
            return None
        if dr.status_code != 200:
            return None
        detail_json = dr.json()
        _commit_detail_cache[sha] = detail_json
        return detail_json

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for sha, detail in zip(shas, executor.map(fetch_detail, shas)):
            if detail is None:
                continue
            commit_data = detail.get("commit", {})
            author_info = commit_data.get("author", {}) or {}
            committer_info = commit_data.get("committer", {}) or {}
            stats = detail.get("stats", {}) or {}
            files = detail.get("files", []) or []
            all_summaries.append({
                "sha": sha,
                "date": author_info.get("date"),
                "author_name": author_info.get("name"),
                "author_email": author_info.get("email"),
                "committer_name": committer_info.get("name"),
                "committer_email": committer_info.get("email"),
                "message": (commit_data.get("message") or "").splitlines()[0],
                "additions": stats.get("additions"),
                "deletions": stats.get("deletions"),
                "changes": stats.get("total"),
                "files": [
                    {
                        "filename": f.get("filename"),
                        "status": f.get("status"),
                        "additions": f.get("additions"),
                        "deletions": f.get("deletions"),
                        "changes": f.get("changes")
                    }
                    for f in files
                ]
            })
    return all_summaries


# ---------- Pull Requests (PR)-based aggregation helpers ----------

def _parse_iso_dt(iso_str: Optional[str]) -> Optional[datetime]:
    if not iso_str:
        return None
    try:
        if iso_str.endswith("Z"):
            iso_str = iso_str.replace("Z", "+00:00")
        return datetime.fromisoformat(iso_str).astimezone(timezone.utc)
    except Exception:
        return None


def list_recent_closed_prs(token: str, owner: str, repo: str, updated_since: datetime) -> List[Dict[str, Any]]:
    """List closed PRs updated since a given datetime, newest first, stop when older.

    This minimizes calls by scanning until PRs older than the window.
    """
    session = _create_session(token)
    all_prs: List[Dict[str, Any]] = []
    page = 1
    while True:
        url = f"{BASE_URL}/repos/{owner}/{repo}/pulls"
        try:
            r = session.get(url, params={
                "state": "closed",
                "sort": "updated",
                "direction": "desc",
                "per_page": 100,
                "page": page
            }, timeout=30)
        except requests.exceptions.RequestException as e:
            set_error(502, f"network error: {e}")
            break
        if r.status_code != 200:
            set_error(r.status_code, r.text)
            break
        batch = r.json() or []
        if not batch:
            break
        # Filter by updated_at window; stop when older than updated_since
        older_found = False
        for pr in batch:
            updated_at = _parse_iso_dt(pr.get("updated_at"))
            if updated_at and updated_at < updated_since:
                older_found = True
                continue
            all_prs.append({
                "number": pr.get("number"),
                "title": pr.get("title"),
                "user": pr.get("user") or {},
                "base": pr.get("base") or {},
                "base_ref": ((pr.get("base") or {}).get("ref") if pr.get("base") else None),
                "merged_at": pr.get("merged_at"),
                "closed_at": pr.get("closed_at"),
            })
        if older_found:
            break
        page += 1
    return all_prs


def fetch_pull_request_details(token: str, owner: str, repo: str, number: int) -> Optional[Dict[str, Any]]:
    session = _create_session(token)
    url = f"{BASE_URL}/repos/{owner}/{repo}/pulls/{number}"
    try:
        r = session.get(url, timeout=30)
    except requests.exceptions.RequestException as e:
        set_error(502, f"network error: {e}")
        return None
    if r.status_code != 200:
        set_error(r.status_code, r.text)
        return None
    data = r.json() or {}
    return {
        "number": number,
        "title": data.get("title"),
        "user": data.get("user") or {},
        "base": data.get("base") or {},
        "base_ref": ((data.get("base") or {}).get("ref") if data.get("base") else None),
        "merged_at": data.get("merged_at"),
        "closed_at": data.get("closed_at"),
        "additions": data.get("additions"),
        "deletions": data.get("deletions"),
        "changed_files": data.get("changed_files")
    }


def fetch_merged_prs_for_branch(token: str, owner: str, repo: str, branch: str, updated_since: datetime) -> List[Dict[str, Any]]:
    """Fetch merged PRs targeting a specific base branch, updated since a date, with details.

    Minimizes calls by listing closed PRs sorted by updated desc and stopping when older.
    Details are fetched in parallel.
    """
    base_list = list_recent_closed_prs(token, owner, repo, updated_since)
    target_nums = [pr["number"] for pr in base_list if (pr.get("merged_at") and (pr.get("base_ref") == branch))]
    if not target_nums:
        return []
    session = _create_session(token)

    def fetch_detail(num: int) -> Optional[Dict[str, Any]]:
        url = f"{BASE_URL}/repos/{owner}/{repo}/pulls/{num}"
        try:
            r = session.get(url, timeout=30)
        except requests.exceptions.RequestException:
            return None
        if r.status_code != 200:
            return None
        d = r.json() or {}
        return {
            "number": d.get("number"),
            "title": d.get("title"),
            "user": d.get("user") or {},
            "base_ref": ((d.get("base") or {}).get("ref") if d.get("base") else None),
            "merged_at": d.get("merged_at"),
            "closed_at": d.get("closed_at"),
            "additions": d.get("additions"),
            "deletions": d.get("deletions"),
            "changed_files": d.get("changed_files")
        }

    results: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for prd in ex.map(fetch_detail, target_nums):
            if prd:
                results.append(prd)
    return results


