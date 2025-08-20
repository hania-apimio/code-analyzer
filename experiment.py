import requests
import os

# --- CONFIG ---
GITHUB_TOKEN = "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"
BASE_URL = "https://api.github.com"

headers = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

def fetch(endpoint):
    """Helper to fetch data from GitHub API with error handling"""
    url = f"{BASE_URL}{endpoint}"
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        return r.json()
    else:
        print(f"Failed {endpoint}: {r.status_code} - {r.text}")
        return None

def parse_owner_repo(full_name):
    try:
        owner, repo = full_name.split("/", 1)
        return owner, repo
    except ValueError:
        return None, None

def get_total_commits(owner, repo, branch):
    """Estimate total commits on a branch using Link header pagination.

    Makes a request with per_page=1; if a 'last' link exists, its page number
    is the total commit count. Falls back to counting the single item returned.
    """
    url = f"{BASE_URL}/repos/{owner}/{repo}/commits"
    try:
        r = requests.get(url, headers=headers, params={"sha": branch, "per_page": 1})
    except requests.exceptions.RequestException as e:
        print(f"  commits: network error: {e}")
        return None

    if r.status_code != 200:
        print(f"  commits: failed to get total commits: {r.status_code} - {r.text}")
        return None

    link = r.headers.get("Link")
    if link and 'rel="last"' in link:
        # Example: <https://api.github.com/...&page=42>; rel="last"
        try:
            last_part = [p for p in link.split(",") if 'rel="last"' in p][0]
            # Extract page=NNN
            import re
            match = re.search(r"[?&]page=(\d+)", last_part)
            if match:
                return int(match.group(1))
        except Exception:
            pass

    # Fallback: length of returned list (0 or 1)
    try:
        items = r.json()
        return len(items)
    except Exception:
        return None

def fetch_recent_commit_details(owner, repo, branch, limit):
    """Fetch details (stats and files changed) for the latest N commits on branch."""
    commits_url = f"{BASE_URL}/repos/{owner}/{repo}/commits"
    try:
        r = requests.get(commits_url, headers=headers, params={"sha": branch, "per_page": max(1, limit)})
    except requests.exceptions.RequestException as e:
        print(f"  commits: network error: {e}")
        return []

    if r.status_code != 200:
        print(f"  commits: failed to list: {r.status_code} - {r.text}")
        return []

    commit_summaries = []
    for item in r.json() or []:
        sha = item.get("sha")
        if not sha:
            continue
        detail_url = f"{BASE_URL}/repos/{owner}/{repo}/commits/{sha}"
        try:
            dr = requests.get(detail_url, headers=headers)
        except requests.exceptions.RequestException as e:
            print(f"  commit {sha[:7]}: network error: {e}")
            continue

        if dr.status_code != 200:
            print(f"  commit {sha[:7]}: failed: {dr.status_code} - {dr.text}")
            continue

        detail = dr.json()
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

def fetch_all_repos():
    """Fetch all repositories with pagination (public + private if scopes allow)."""
    all_repos = []
    page = 1
    while True:
        url = f"{BASE_URL}/user/repos"
        try:
            r = requests.get(url, headers=headers, params={"per_page": 100, "page": page})
        except requests.exceptions.RequestException as e:
            print(f"Network error while fetching repositories: {e}")
            break

        if r.status_code != 200:
            print(f"Failed /user/repos (page {page}): {r.status_code} - {r.text}")
            break

        batch = r.json()
        if not batch:
            break
        all_repos.extend(batch)
        page += 1

    return all_repos

def fetch_all_branches(owner, repo, max_branches=None):
    """Fetch all branches for a repository with pagination.

    If max_branches is provided and > 0, stops after reaching that count.
    """
    all_branches = []
    page = 1
    while True:
        url = f"{BASE_URL}/repos/{owner}/{repo}/branches"
        try:
            r = requests.get(url, headers=headers, params={"per_page": 100, "page": page})
        except requests.exceptions.RequestException as e:
            print(f"  branches: network error: {e}")
            break

        if r.status_code != 200:
            print(f"  branches: failed (page {page}): {r.status_code} - {r.text}")
            break

        batch = r.json() or []
        if not batch:
            break
        all_branches.extend(batch)
        if max_branches and max_branches > 0 and len(all_branches) >= max_branches:
            all_branches = all_branches[:max_branches]
            break
        page += 1

    return all_branches

def main():
    # 1. User basic profile
    user = fetch("/user")
    print("\n=== USER PROFILE ===")
    print(user)

    # 2. User emails (requires user:email)
    emails = fetch("/user/emails")
    print("\n=== USER EMAILS ===")
    print(emails)

    # 3. User orgs (public + private if read:org)
    orgs = fetch("/user/orgs")
    print("\n=== ORGANIZATIONS ===")
    print(orgs)

    # 4. Repos (public + private if repo scope)
    repos = fetch_all_repos()
    print("\n=== REPOSITORIES (DETAILED) ===")
    if repos:
        try:
            repos = sorted(repos, key=lambda x: x.get("updated_at") or "", reverse=True)
        except Exception:
            pass
        max_commits = int(os.environ.get("MAX_COMMITS_PER_REPO", "5"))
        for r in repos:
            full_name = r.get("full_name")
            print(f"- {full_name}")
            print(
                f"  visibility: {r.get('visibility')} | private: {r.get('private')} | "
                f"fork: {r.get('fork')} | archived: {r.get('archived')}"
            )
            print(
                f"  stats: stars={r.get('stargazers_count')} forks={r.get('forks_count')} "
                f"watchers={r.get('watchers_count')} issues={r.get('open_issues_count')}"
            )
            license_name = (r.get('license') or {}).get('name') if r.get('license') else None
            print(f"  lang: {r.get('language')} | license: {license_name}")
            print(f"  default_branch: {r.get('default_branch')} | size: {r.get('size')} KB")
            print(
                f"  dates: created={r.get('created_at')} updated={r.get('updated_at')} "
                f"pushed={r.get('pushed_at')}"
            )
            perms = r.get('permissions') or {}
            print(
                f"  perms: admin={perms.get('admin')} push={perms.get('push')} pull={perms.get('pull')}"
            )
            print(f"  url: {r.get('html_url')}")
            if r.get('description'):
                print(f"  desc: {r.get('description')}")

            owner, repo = parse_owner_repo(full_name or "")
            default_branch = r.get("default_branch") or "main"
            if owner and repo:
                max_branches_env = os.environ.get("MAX_BRANCHES_PER_REPO")
                max_branches = int(max_branches_env) if max_branches_env else 0
                branches = fetch_all_branches(owner, repo, max_branches if max_branches > 0 else None)
                if branches:
                    print(f"  branches (count {len(branches)}):")
                    for b in branches:
                        bname = b.get("name")
                        protected = b.get("protected")
                        tag = "default" if bname == default_branch else ""
                        tag_str = f" [{tag}]" if tag else ""
                        print(f"    - {bname}{tag_str} protected={protected}")

                        total_commits = get_total_commits(owner, repo, bname)
                        if total_commits is not None:
                            print(f"      total_commits[{bname}]: {total_commits}")
                        if max_commits > 0:
                            summaries = fetch_recent_commit_details(owner, repo, bname, max_commits)
                            if summaries:
                                print(f"      recent_commits (max {max_commits}):")
                                for c in summaries:
                                    sha_short = (c.get("sha") or "")[:7]
                                    print(
                                        f"        - {sha_short} | {c.get('date')} | {c.get('author_name')} <{c.get('author_email')}>"
                                    )
                                    print(
                                        f"          msg: {c.get('message')}"
                                    )
                                    print(
                                        f"          changes: +{c.get('additions')} -{c.get('deletions')} (~{c.get('changes')})"
                                    )
                                    files = c.get("files") or []
                                    if files:
                                        limit_files = 10
                                        print("          files:")
                                        for f in files[:limit_files]:
                                            print(
                                                f"            * {f.get('filename')} ({f.get('status')}) +{f.get('additions')} -{f.get('deletions')} (~{f.get('changes')})"
                                            )
                                        if len(files) > limit_files:
                                            print(f"            ... and {len(files) - limit_files} more files")

if __name__ == "__main__":
    main()
