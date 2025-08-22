import os
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, timedelta, timezone

from . import github_client
from .github_client import get_code_quality_metrics


app = FastAPI(title="MyCodeAnalyser API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


def resolve_token(x_github_token: Optional[str], token_query: Optional[str]) -> str:
    token = x_github_token or token_query or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise HTTPException(status_code=400, detail="Provide a GitHub token via X-GitHub-Token header, token query param, or GITHUB_TOKEN env.")
    return token


# Serve frontend
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def root_page():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend not found. Ensure 'frontend/index.html' exists."}


def _parse_iso_to_dt(iso_str: str) -> datetime | None:
    if not iso_str:
        return None
    try:
        # GitHub dates are ISO 8601 often with 'Z' suffix
        if iso_str.endswith("Z"):
            iso_str = iso_str.replace("Z", "+00:00")
        return datetime.fromisoformat(iso_str).astimezone(timezone.utc)
    except Exception:
        return None


def _timeframe_windows(now: datetime):
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    # Windows: [since, until)
    return {
        "Yesterday": (today_start - timedelta(days=1), today_start),
        "Last 5 days": (now - timedelta(days=5), now),
        "Weekly": (now - timedelta(days=7), now),
        "Monthly": (now - timedelta(days=30), now),
    }


def _aggregate_commits(commits: list[dict], since_dt: datetime, until_dt: datetime) -> dict:
    total_add = 0
    total_del = 0
    total_changes = 0
    total_commits = 0
    contributors: dict[str, dict] = {}
    for c in commits or []:
        dt = _parse_iso_to_dt(c.get("date"))
        if dt is None or not (since_dt <= dt < until_dt):
            continue
        total_commits += 1
        a = int(c.get("additions") or 0)
        d = int(c.get("deletions") or 0)
        t = int(c.get("changes") or a + d)
        total_add += a
        total_del += d
        total_changes += t
        name = c.get("author_name") or c.get("committer_name") or "Unknown"
        email = c.get("author_email") or c.get("committer_email") or ""
        key = f"{name}|{email}"
        entry = contributors.get(key)
        if not entry:
            entry = {
                "name": name,
                "email": email,
                "commits": 0,
                "additions": 0,
                "deletions": 0,
                "changes": 0,
            }
            contributors[key] = entry
        entry["commits"] += 1
        entry["additions"] += a
        entry["deletions"] += d
        entry["changes"] += t

    return {
        "total_commits": total_commits,
        "total_additions": total_add,
        "total_deletions": total_del,
        "total_changes": total_changes,
        "contributors": list(contributors.values()),
    }


@app.get("/repos/timeframes")
def get_repo_timeframes(
    x_github_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
    full_name: Optional[str] = Query(default=None, description="Repository full name 'owner/repo'"),
):
    if not full_name:
        raise HTTPException(status_code=400, detail="Query param 'full_name' is required")
    pat = resolve_token(x_github_token, token)
    repo = github_client.fetch_repo_by_full_name(pat, full_name)
    if repo is None:
        raise HTTPException(status_code=github_client.last_status or 404, detail=github_client.last_error or "Repository not found or access denied")

    owner_repo = repo.get("full_name") or full_name
    owner, name = github_client.parse_owner_repo(owner_repo)
    if not owner or not name:
        raise HTTPException(status_code=400, detail="Invalid full_name. Expected 'owner/repo'.")

    default_branch = repo.get("default_branch") or "main"
    branches = github_client.fetch_all_branches(pat, owner, name)
    now = datetime.now(timezone.utc)
    windows = _timeframe_windows(now)
    # Add all-time window
    windows["All time"] = (datetime(1970, 1, 1, tzinfo=timezone.utc), now)

    items = []
    for b in branches or []:
        bname = b.get("name")
        protected = b.get("protected")
        commits = github_client.fetch_all_commits_for_branch(pat, owner, name, bname)
        prs = github_client.fetch_merged_prs_for_branch(pat, owner, name, bname, now - timedelta(days=30))
        total_files = github_client.get_total_files_in_branch(pat, owner, name, bname)
        commit_timeframes: dict[str, dict] = {}
        pr_timeframes: dict[str, dict] = {}

        # Helper to select commits within window and include classification
        def commits_in_window(all_commits: list[dict], start_dt: datetime, end_dt: datetime) -> list[dict]:
            selected: list[dict] = []
            for c in all_commits or []:
                dt = _parse_iso_to_dt(c.get("date"))
                if dt is None or not (start_dt <= dt < end_dt):
                    continue
                # Keep key fields including contributor's name and classification
                selected.append({
                    "sha": c.get("sha"),
                    "date": c.get("date"),
                    "author_name": c.get("author_name"),
                    "author_email": c.get("author_email"),
                    "contributor": c.get("author_name"),  # Add contributor's name
                    "message": c.get("message"),
                    "additions": c.get("additions"),
                    "deletions": c.get("deletions"),
                    "changes": c.get("changes"),
                    "classification": c.get("classification")
                })
            return selected

        # Classify commits
        def classify_commits(commits_list):
            out = []
            for c in commits_list:
                msg = c.get("message")
                changes = int(c.get("changes") or 0)
                files = len(c.get("files") or [])
                cls = github_client.classify_change(msg, changes, files, total_files)
                c2 = dict(c)
                c2["classification"] = cls
                out.append(c2)
            return out

        commits_classified = classify_commits(commits)

        for label, (since_dt, until_dt) in windows.items():
            commit_tf_stats = _aggregate_commits(commits_classified, since_dt, until_dt)
            commit_tf_stats["commits"] = commits_in_window(commits_classified, since_dt, until_dt)
            commit_timeframes[label] = commit_tf_stats

        items.append({
            "name": bname,
            "protected": protected,
            "is_default": bname == default_branch,
            "total_commits": len(commits_classified),
            "commits": commits_classified,
            "commit_timeframes": commit_timeframes
        })

    return {
        "repo": {
            "full_name": repo.get("full_name"),
            "default_branch": default_branch,
            "html_url": repo.get("html_url"),
        },
        "branches": items
    }


@app.get("/repos/{owner}/{repo}/branches")
async def get_repo_branches(
    owner: str,
    repo: str,
    x_github_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
):
    """
    Get all branches for a repository.
    Returns a list of branches with their names and protection status.
    """
    pat = resolve_token(x_github_token, token)
    
    try:
        branches = github_client.fetch_all_branches(pat, owner, repo)
        if branches is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to fetch branches from GitHub"
            )
        
        # Format the response to include only necessary fields
        formatted_branches = [
            {
                "name": branch.get("name"),
                "protected": branch.get("protected", False),
                "commit": {
                    "sha": branch.get("commit", {}).get("sha"),
                    "url": branch.get("commit", {}).get("url")
                }
            }
            for branch in branches
        ]
        
        return {"branches": formatted_branches}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching branches: {str(e)}"
        )

@app.get("/repos/{owner}/{repo}/insights")
async def get_repo_insights(
    owner: str,
    repo: str,
    x_github_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
):
    """
    Repo insights (unique by commit SHA):
    - total_unique_commits
    - per_branch: {branch: commit_count}            # partitioned, no double counting
    - by_developer: [{username, commits}]           # unique across repo
    - per_branch_per_developer: {branch: {username: commit_count}}
    - author_metrics: detailed breakdown per developer
    - total_developers, total_branches, latest_activity_date
    - latest_commit: dict (most recent commit)
    - recent_commits: list of top 5 commits (if available)
    """
    pat = resolve_token(x_github_token, token)

    try:
        branches = github_client.fetch_all_branches(pat, owner, repo)
        if branches is None:
            raise HTTPException(status_code=500, detail="Failed to fetch branches from GitHub")

        repo_seen_shas: set[str] = set()
        per_branch_counts: dict[str, int] = {}
        branch_dev_sha_sets: dict[str, dict[str, set[str]]] = {}
        dev_sha_sets: dict[str, set[str]] = {}
        login_display: dict[str, str] = {}

        latest_activity_dt = None
        all_commits: dict[str, dict] = {}

        # Collect commits across all branches
        for b in branches:
            branch_name = b.get("name")
            if not branch_name:
                continue

            commits = github_client.fetch_all_commits_for_branch(pat, owner, repo, branch_name)
            branch_dev_sha_sets[branch_name] = {}
            branch_count = 0

            for c in commits:
                sha = c.get("sha")
                if not sha:
                    continue

                # If already added, just add branch info
                if sha in all_commits:
                    all_commits[sha]["branches"].add(branch_name)
                    continue

                repo_seen_shas.add(sha)
                branch_count += 1

                raw_username = c.get("author_login") or c.get("committer_login") or "unknown"
                dev_key = (raw_username or "unknown").lower()
                login_display.setdefault(dev_key, raw_username)

                dev_sha_sets.setdefault(dev_key, set()).add(sha)
                branch_dev_sha_sets[branch_name].setdefault(dev_key, set()).add(sha)

                dt = _parse_iso_to_dt(c.get("date"))
                if dt and (latest_activity_dt is None or dt > latest_activity_dt):
                    latest_activity_dt = dt

                # Attach branches set
                c["branches"] = {branch_name}
                all_commits[sha] = c

            per_branch_counts[branch_name] = branch_count

        # Calculate author metrics
        author_metrics: dict[str, dict] = {}
        for commit in all_commits.values():
            author = commit.get("author_login") or commit.get("author_name")
            if not author:
                continue

            if author not in author_metrics:
                author_metrics[author] = {
                    "total_commits": 0,
                    "lines_added": 0,
                    "lines_removed": 0,
                    "files_changed": set(),
                    "commits": [],
                    "branches": set()
                }

            metrics = author_metrics[author]
            metrics["total_commits"] += 1
            metrics["lines_added"] += commit.get("additions") or 0
            metrics["lines_removed"] += commit.get("deletions") or 0

            # Track unique files changed
            for file in commit.get("files") or []:
                metrics["files_changed"].add(file.get("filename"))

            # Track branches
            for branch in commit.get("branches", []):
                metrics["branches"].add(branch)

            metrics["commits"].append(commit)

        # Format author metrics for response
        formatted_author_metrics = {}
        for author, metrics in author_metrics.items():
            total_commits = metrics["total_commits"]
            good_quality = sum(1 for c in metrics["commits"]
                               if "fix" in (c.get("message") or "").lower())
            low_risk = sum(1 for c in metrics["commits"]
                           if (c.get("deletions") or 0) < 50
                           and (c.get("additions") or 0) < 200)
            simple_commits = sum(1 for c in metrics["commits"]
                                 if len(c.get("files") or []) <= 3)

            quality_score = round((good_quality / total_commits) * 100, 2) if total_commits else 0
            low_risk_score = round((low_risk / total_commits) * 100, 2) if total_commits else 0
            simple_score = round((simple_commits / total_commits) * 100, 2) if total_commits else 0

            # Prepare commits data for the response
            author_commits = []
            for commit in metrics["commits"]:
                commit_data = {
                    "sha": commit.get("sha"),
                    "message": commit.get("message"),
                    "date": commit.get("date"),
                    "additions": commit.get("additions", 0),
                    "deletions": commit.get("deletions", 0),
                    "files": [{
                        "filename": f.get("filename"),
                        "status": f.get("status"),
                        "additions": f.get("additions", 0),
                        "deletions": f.get("deletions", 0),
                        "changes": f.get("changes", 0)
                    } for f in commit.get("files", [])],
                    "branches": list(commit.get("branches", []))
                }
                author_commits.append(commit_data)


            formatted_author_metrics[author] = {
                "total_commits": total_commits,
                "lines_added": metrics["lines_added"],
                "lines_removed": metrics["lines_removed"],
                "files_changed": len(metrics["files_changed"]),
                "quality_metrics": {
                    "quality_score": quality_score,
                    "good_commits": good_quality,
                    "low_risk_score": low_risk_score,
                    "low_risk_commits": low_risk,
                    "simple_score": simple_score,
                    "simple_commits": simple_commits
                },
                "branches": list(metrics["branches"]),  # serialize set
                "commits": author_commits
            }

        # Parse commit date helper
        def parse_date(iso_str: Optional[str]) -> datetime:
            if not iso_str:
                return datetime.min.replace(tzinfo=timezone.utc)
            try:
                if iso_str.endswith("Z"):
                    iso_str = iso_str.replace("Z", "+00:00")
                return datetime.fromisoformat(iso_str).astimezone(timezone.utc)
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)

        # Get top 5 recent commits
        recent_commits = sorted(
            all_commits.values(),
            key=lambda x: parse_date(x.get("date")),
            reverse=True
        )[:5]

        latest_commit = recent_commits[0] if recent_commits else None

        developers = list(author_metrics.keys())
        by_developer = [
            {"username": author, "commits": data["total_commits"]}
            for author, data in formatted_author_metrics.items()
        ]
        by_developer.sort(key=lambda x: x["commits"], reverse=True)


        # per-branch per-developer
        per_branch_per_developer = {}
        for author, metrics in author_metrics.items():
            for branch in metrics["branches"]:
                if branch not in per_branch_per_developer:
                    per_branch_per_developer[branch] = {}
                per_branch_per_developer[branch][author] = sum(
                    1 for c in metrics["commits"]
                    if branch in c.get("branches", [])
                )

        return {
            "owner": owner,
            "repo": repo,
            "total_unique_commits": len(all_commits),
            "total_branches": len(branches),
            "total_developers": len(developers),
            "latest_activity_date": latest_commit.get("date") if latest_commit else None,
            "latest_commit": latest_commit,
            "recent_commits": recent_commits,
            "per_branch": per_branch_counts,
            "by_developer": by_developer,
            "per_branch_per_developer": per_branch_per_developer,
            "author_metrics": formatted_author_metrics,
            "code_quality_metrics": get_code_quality_metrics(
                pat, 
                owner, 
                repo, 
                list(all_commits.values())
            )
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching repo insights: {str(e)}"
        )




# @app.get("/repos/{owner}/{repo}/commits/latest")
# async def get_latest_commit(
#     owner: str,
#     repo: str,
#     x_github_token: Optional[str] = Header(default=None),
#     token: Optional[str] = Query(default=None),
# ):
#     """
#     Get the most recent commit across all branches in a repository.
    
#     Returns the commit details including author, message, and file changes.
#     """
#     pat = resolve_token(x_github_token, token)
    
#     try:
#         commit = github_client.fetch_latest_commit(pat, owner, repo)
#         if not commit:
#             raise HTTPException(
#                 status_code=404,
#                 detail="No commits found or repository not accessible"
#             )
#         return commit
#     except Exception as e:
#         raise HTTPException(
#             status_code=500,
#             detail=f"Error fetching latest commit: {str(e)}"
#         )

@app.get("/repos/{owner}/{repo}/commits/author/{author}")
async def get_commits_by_author(
    owner: str,
    repo: str,
    author: str,
    x_github_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
):
    """
    Get all unique commits by a specific author in a repository with aggregated metrics.
    """
    pat = resolve_token(x_github_token, token)
    
    try:
        branches = github_client.fetch_all_branches(pat, owner, repo)
        if not branches:
            raise HTTPException(status_code=404, detail="No branches found")
        
        all_commits = {}
        for branch in branches:
            branch_name = branch.get("name")
            if not branch_name:
                continue

            commits = github_client.fetch_all_commits_for_branch(pat, owner, repo, branch_name)
            if not commits:
                continue

            # Filter by author
            for commit in commits:
                commit_author = (commit.get("author_login") or "").lower()
                commit_author_name = (commit.get("author_name") or "").lower()

                if author.lower() in [commit_author, commit_author_name]:
                    sha = commit.get("sha")
                    if not sha:
                        continue

                    # Ensure uniqueness by SHA
                    if sha not in all_commits:
                        commit["branches"] = set()
                        all_commits[sha] = commit
                    
                    # Track all branches this commit belongs to
                    all_commits[sha]["branches"].add(branch_name)

        # Convert branch sets to list for JSON serialization
        for c in all_commits.values():
            c["branches"] = list(c["branches"])

        # Sorting by commit date
        def parse_date(iso_str: Optional[str]) -> datetime:
            if not iso_str:
                return datetime.min.replace(tzinfo=timezone.utc)
            try:
                if iso_str.endswith("Z"):
                    iso_str = iso_str.replace("Z", "+00:00")
                return datetime.fromisoformat(iso_str).astimezone(timezone.utc)
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)

        unique_commits = list(all_commits.values())
        unique_commits.sort(key=lambda x: parse_date(x.get("date")), reverse=True)

        # Aggregated metrics
        total_commits = len(unique_commits)
        total_additions = sum(c.get("additions") or 0 for c in unique_commits)
        total_deletions = sum(c.get("deletions") or 0 for c in unique_commits)
        total_files_changed = sum(len(c.get("files") or []) for c in unique_commits)

        good_quality = sum(1 for c in unique_commits if "fix" in (c.get("message") or "").lower())
        low_risk = sum(1 for c in unique_commits if (c.get("deletions") or 0) < 50 and (c.get("additions") or 0) < 200)
        simple_commits = sum(1 for c in unique_commits if len(c.get("files") or []) <= 3)

        quality_score = round((good_quality / total_commits) * 100, 2) if total_commits else 0
        low_risk_score = round((low_risk / total_commits) * 100, 2) if total_commits else 0
        simple_score = round((simple_commits / total_commits) * 100, 2) if total_commits else 0

        return {
            "author": author,
            "total_commits": total_commits,
            "lines_added": total_additions,
            "lines_removed": total_deletions,
            "files_changed": total_files_changed,
            "quality_metrics": {
                "quality_score": quality_score,
                "good_commits": good_quality,
                "low_risk_score": low_risk_score,
                "low_risk_commits": low_risk,
                "simple_score": simple_score,
                "simple_commits": simple_commits
            },
            "commits": unique_commits,  # full details for each commit
            # "branches": sorted(set(b for c in unique_commits for b in c["branches"]))
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching commits by author: {str(e)}")
