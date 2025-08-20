import os
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, timedelta, timezone

from . import github_client


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

