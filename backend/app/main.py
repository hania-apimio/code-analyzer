import os
from typing import Optional, List, Dict, Any, Set
from dotenv import load_dotenv
import requests
from pydantic import BaseModel
import concurrent.futures
import threading

# Load environment variables from .env file
load_dotenv()

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, timedelta, timezone

from . import github_client
from .github_client import get_code_quality_metrics
from stripe_api import router as stripe_router

app = FastAPI(title="MyCodeAnalyser API", version="0.1.0")

# Include routers
app.include_router(stripe_router, prefix="/api")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get environment variables
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
if not CLERK_SECRET_KEY:
    raise RuntimeError("CLERK_SECRET_KEY environment variable not set!")

CLERK_API_BASE = os.getenv("CLERK_API_BASE", "https://api.clerk.com/v1")

# Serve frontend
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

class UpdateUserRequest(BaseModel):
    user_id: str
    plan: str
    stripe_customer_id:str
    subscription_status:str

class UpdatePlanRequest(BaseModel):
    user_id: str
    plan: str

class UpdateStripeRequest(BaseModel):
    user_id: str
    stripe_customer_id: str

class EnsureMetadataRequest(BaseModel):
    user_id: str
    default_plan: str = "Free"
    stripe_customer_id: str = None

@app.put("/update-user")
def update_user(data: UpdateUserRequest):
    headers = {
        "Authorization": f"Bearer {CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "public_metadata": {
            "plan": data.plan
        },
        "private_metadata": {
            "stripe_customer_id": data.stripe_customer_id,
            "subscription_status": data.subscription_status
        }
    }
    url = f"{CLERK_API_BASE}/users/{data.user_id}/metadata"
    resp = requests.patch(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"success": True, "plan": data.plan, "stripe_customer_id":  data.stripe_customer_id, "subscription_status": data.subscription_status}


@app.put("/update-plan")
def update_plan(data: UpdatePlanRequest):
    headers = {
        "Authorization": f"Bearer {CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "public_metadata": {
            "plan": data.plan
        }
    }
    url = f"{CLERK_API_BASE}/users/{data.user_id}/metadata"
    resp = requests.patch(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"success": True, "plan": data.plan}

@app.put("/update-stripe-customer")
def update_plan(data: UpdateStripeRequest):
    headers = {
        "Authorization": f"Bearer {CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "private_metadata": {
            "stripe_customer_id": data.stripe_customer_id
        }
    }
    url = f"{CLERK_API_BASE}/users/{data.user_id}/metadata"
    resp = requests.patch(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"success": True, "stripe_customer_id": data.stripe_customer_id}

@app.post("/ensure-metadata")
def ensure_metadata(data: EnsureMetadataRequest):
    headers = {
        "Authorization": f"Bearer {CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    user_url = f"{CLERK_API_BASE}/users/{data.user_id}"
    
    # Get current user data
    user_resp = requests.get(user_url, headers=headers)
    if user_resp.status_code >= 400:
        raise HTTPException(status_code=user_resp.status_code, detail=user_resp.text)
        
    user = user_resp.json()
    public_metadata = user.get("public_metadata", {}) or {}
    private_metadata = user.get("private_metadata", {}) or {}
    needs_update = False
    
    # Update public metadata
    new_public_metadata = dict(public_metadata)
    if not new_public_metadata.get("plan"):
        new_public_metadata["plan"] = data.default_plan
        needs_update = True
    
    # Update private metadata with Stripe customer ID if provided
    new_private_metadata = dict(private_metadata)
    if data.stripe_customer_id and new_private_metadata.get("stripe_customer_id") != data.stripe_customer_id:
        new_private_metadata["stripe_customer_id"] = data.stripe_customer_id
        needs_update = True
    
    # If no Stripe customer ID exists, initialize it as None
    if "stripe_customer_id" not in new_private_metadata:
        new_private_metadata["stripe_customer_id"] = None
        needs_update = True
    
    if needs_update:
        patch_url = f"{CLERK_API_BASE}/users/{data.user_id}/metadata"
        patch_payload = {}
        
        # Only include the fields that need updating
        if new_public_metadata != public_metadata:
            patch_payload["public_metadata"] = new_public_metadata
        if new_private_metadata != private_metadata:
            patch_payload["private_metadata"] = new_private_metadata
            
        patch_resp = requests.patch(patch_url, headers=headers, json=patch_payload)
        if patch_resp.status_code >= 400:
            raise HTTPException(status_code=patch_resp.status_code, detail=patch_resp.text)
    
    return {
        "success": True, 
        "public_metadata": new_public_metadata,
        "private_metadata": new_private_metadata
    }

@app.get("/get-user-metadata/{user_id}")
def get_user_metadata(user_id: str):
    """Get both public and private metadata for a user"""
    headers = {
        "Authorization": f"Bearer {CLERK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    
    try:
        # Add ?expand[]=public_metadata&expand[]=private_metadata to the URL
        user_url = f"{CLERK_API_BASE}/users/{user_id}?expand[]=public_metadata&expand[]=private_metadata"
        print(f"Fetching user metadata from: {user_url}")
        
        user_resp = requests.get(user_url, headers=headers)
        user_resp.raise_for_status()
        user_data = user_resp.json()
                
        # The metadata might be nested under the expanded fields
        public_metadata = user_data.get("public_metadata", {}) or {}
        private_metadata = user_data.get("private_metadata", {}) or {}
        
        # If metadata is empty, try the expanded format
        if not public_metadata and "public_metadata" in user_data:
            public_metadata = user_data["public_metadata"] or {}
        if not private_metadata and "private_metadata" in user_data:
            private_metadata = user_data["private_metadata"] or {}
        
        print(f"Extracted metadata - Public: {public_metadata}, Private: {private_metadata}")
            
        return {
            "success": True,
            "public_metadata": public_metadata,
            "private_metadata": private_metadata
        }
    except Exception as e:
        error_detail = str(e)
        if hasattr(e, 'response') and e.response is not None:
            error_detail = e.response.text
        print(f"Error in get_user_metadata: {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)


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
                                 if len(c.get("files") or []) <= 5)

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
        )

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

@app.get("/repos/{owner}/{repo}/insights/selected-branches")
async def get_selected_branches_insights(
    owner: str,
    repo: str,
    branches: str = Query(..., description="Comma-separated list of branch names"),
    x_github_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
):
    """
    Repo insights for selected branches (same format as /insights):
    - total_unique_commits
    - per_branch: {branch: commit_count}
    - by_developer: [{username, commits}]
    - per_branch_per_developer: {branch: {username: commit_count}}
    - author_metrics: detailed breakdown per developer
    - total_developers, total_branches, latest_activity_date
    - latest_commit: dict (most recent commit across selected branches)
    - recent_commits: list of top 5 commits
    """
    pat = resolve_token(x_github_token, token)
    branch_list = [b.strip() for b in branches.split(',') if b.strip()]

    if not branch_list:
        raise HTTPException(status_code=400, detail="At least one branch must be specified")

    try:
        # Verify branches exist
        all_branches = github_client.fetch_all_branches(pat, owner, repo)
        if all_branches is None:
            raise HTTPException(status_code=500, detail="Failed to fetch branches from GitHub")

        valid_branches = [b for b in branch_list if any(b == br.get("name") for br in all_branches)]
        if not valid_branches:
            raise HTTPException(status_code=404, detail="None of the specified branches exist in the repository")

        seen_shas: Set[str] = set()
        all_commits: List[Dict[str, Any]] = []
        per_branch_counts: Dict[str, int] = {}
        per_branch_per_developer: Dict[str, Dict[str, int]] = {}
        by_developer_counts: Dict[str, int] = {}
        author_metrics: Dict[str, Dict[str, Any]] = {}
        latest_activity_date: Optional[str] = None

        # Collect commits
        for branch in valid_branches:
            commits = github_client.fetch_all_commits_for_branch(pat, owner, repo, branch)
            if not commits:
                continue

            branch_count = 0
            per_branch_per_developer[branch] = {}

            for c in commits:
                if not isinstance(c, dict) or "sha" not in c:
                    continue
                sha = c["sha"]
                if sha in seen_shas:
                    continue

                seen_shas.add(sha)
                all_commits.append(c)
                branch_count += 1

                # Developer tracking
                author = c.get("author_login") or c.get("committer_login") or c.get("author_name") or "unknown"
                by_developer_counts[author] = by_developer_counts.get(author, 0) + 1
                per_branch_per_developer[branch][author] = per_branch_per_developer[branch].get(author, 0) + 1

                # Track author metrics
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
                metrics["lines_added"] += c.get("additions", 0)
                metrics["lines_removed"] += c.get("deletions", 0)
                metrics["branches"].add(branch)
                for f in c.get("files", []) or []:
                    metrics["files_changed"].add(f.get("filename"))
                metrics["commits"].append(c)

                # Update latest activity
                commit_date = c.get("date")
                if commit_date and (not latest_activity_date or commit_date > latest_activity_date):
                    latest_activity_date = commit_date

            per_branch_counts[branch] = branch_count

        # Build by_developer list
        by_developer = [
            {"username": author, "commits": count}
            for author, count in by_developer_counts.items()
        ]
        by_developer.sort(key=lambda x: x["commits"], reverse=True)

        # Format author metrics
        formatted_author_metrics = {}
        for author, metrics in author_metrics.items():
            total_commits = metrics["total_commits"]
            good_quality = sum(1 for c in metrics["commits"] if "fix" in (c.get("message") or "").lower())
            low_risk = sum(1 for c in metrics["commits"]
                           if (c.get("deletions") or 0) < 50 and (c.get("additions") or 0) < 200)
            simple_commits = sum(1 for c in metrics["commits"] if len(c.get("files") or []) <= 3)

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
                    "branches": list(metrics["branches"])
                }
                author_commits.append(commit_data)

            formatted_author_metrics[author] = {
                "total_commits": total_commits,
                "lines_added": metrics["lines_added"],
                "lines_removed": metrics["lines_removed"],
                "files_changed": len(metrics["files_changed"]),
                "quality_metrics": {
                    "quality_score": round((good_quality / total_commits) * 100, 2) if total_commits else 0,
                    "good_commits": good_quality,
                    "low_risk_score": round((low_risk / total_commits) * 100, 2) if total_commits else 0,
                    "low_risk_commits": low_risk,
                    "simple_score": round((simple_commits / total_commits) * 100, 2) if total_commits else 0,
                    "simple_commits": simple_commits
                },
                "branches": list(metrics["branches"]),
                "commits": author_commits
            }

        # Sort commits for recents & latest
        all_sorted = sorted(all_commits, key=lambda c: c.get("date", ""), reverse=True)
        recent_commits = all_sorted[:5]
        latest_commit = all_sorted[0] if all_sorted else None

        return {
            "owner": owner,
            "repo": repo,
            "total_unique_commits": len(all_commits),
            "total_branches": len(valid_branches),
            "total_developers": len(author_metrics),
            "latest_activity_date": latest_activity_date,
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
                all_commits
            )
        }

    except Exception as e:
        error_detail = str(e)
        if hasattr(e, "response") and e.response is not None:
            error_detail = e.response.text
        raise HTTPException(status_code=500, detail=f"Error fetching repository insights: {error_detail}")



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
@app.get("/repos/{owner}/{repo}/commits/{sha}")
async def get_commit_details(
    owner: str,
    repo: str,
    sha: str,
    x_github_token: Optional[str] = Header(None),
    token: Optional[str] = Query(default=None),
):
    """
    Get detailed information about a specific commit.
    
    Parameters:
    - owner: Repository owner
    - repo: Repository name
    - sha: Commit SHA
    - x_github_token: GitHub token from header (optional)
    - token: GitHub token from query parameter (optional)
    
    Returns:
    - JSON response with commit details or error message
    """
    pat = resolve_token(x_github_token, token)
    
    try:
        # Verify the commit exists and get its details
        commit = github_client.fetch_commit(pat, owner, repo, sha)
        if not commit:
            raise HTTPException(status_code=404, detail="Commit not found")
            
        # Format the response
        return {
            "sha": commit.get("sha"),
            "message": commit.get("commit", {}).get("message", ""),
            "author": {
                "name": commit.get("commit", {}).get("author", {}).get("name"),
                "email": commit.get("commit", {}).get("author", {}).get("email"),
                "login": commit.get("author", {}).get("login"),
                "avatar_url": commit.get("author", {}).get("avatar_url")
            },
            "committer": {
                "name": commit.get("commit", {}).get("committer", {}).get("name"),
                "email": commit.get("commit", {}).get("committer", {}).get("email"),
                "login": commit.get("committer", {}).get("login"),
                "avatar_url": commit.get("committer", {}).get("avatar_url")
            },
            "date": commit.get("commit", {}).get("author", {}).get("date"),
            "stats": {
                "total": commit.get("stats", {}).get("total", 0),
                "additions": commit.get("stats", {}).get("additions", 0),
                "deletions": commit.get("stats", {}).get("deletions", 0)
            },
            "files": [
                {
                    "filename": file.get("filename"),
                    "status": file.get("status"),
                    "additions": file.get("additions", 0),
                    "deletions": file.get("deletions", 0),
                    "changes": file.get("changes", 0),
                    "patch": file.get("patch", "")[:1000]  # Limit patch size
                }
                for file in commit.get("files", [])
            ],
            "parents": [p.get("sha") for p in commit.get("parents", [])],
            "verification": commit.get("verification", {}),
            "status": commit.get("status", {})
        }
        
    except Exception as e:
        error_detail = str(e)
        if hasattr(e, 'response') and e.response is not None:
            error_detail = e.response.text
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching commit details: {error_detail}"
        )

@app.get("/repos/{owner}/{repo}/detailed-commit-info")
async def get_detailed_commit_info(
    owner: str,
    repo: str,
    x_github_token: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
):
    """
    Provides detailed information for each commit in the repository.
    """
    pat = resolve_token(x_github_token, token)
    commits = fetch_commits(pat, owner, repo)
    detailed_info = [process_commit(commit) for commit in commits]
    return {"detailed_commit_info": detailed_info}


def fetch_commits(token: str, owner: str, repo: str) -> List[Dict[str, Any]]:
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # First, get all branches
    branches_url = f"https://api.github.com/repos/{owner}/{repo}/branches"
    branches_response = requests.get(branches_url, headers=headers)
    if branches_response.status_code != 200:
        print(f"Error fetching branches: {branches_response.status_code} {branches_response.text}")
        return []

    branches = branches_response.json()
    all_commits = {}
    seen_shas = set()
    lock = threading.Lock()

    def fetch_commit_details(commit, branch_name):
        nonlocal all_commits, seen_shas
        sha = commit.get("sha")
        
        # Skip if we've already processed this commit
        with lock:
            if sha in seen_shas:
                return
            seen_shas.add(sha)
        
        # Get detailed commit info
        detail_url = f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}"
        detail_response = requests.get(detail_url, headers=headers)
        
        if detail_response.status_code == 200:
            detailed_commit = detail_response.json()
            
            # Initialize branches list if it doesn't exist
            if "branches" not in detailed_commit:
                detailed_commit["branches"] = []
                
            # Add the current branch if not already present
            with lock:
                if sha not in all_commits:
                    detailed_commit["branches"] = [branch_name]
                    all_commits[sha] = detailed_commit
                else:
                    # If commit exists, just add the branch if it's not already there
                    if branch_name not in all_commits[sha]["branches"]:
                        all_commits[sha]["branches"].append(branch_name)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for branch in branches:
            branch_name = branch.get("name")
            page = 1
            while True:
                # Get commits with pagination
                commits_url = f"https://api.github.com/repos/{owner}/{repo}/commits?sha={branch_name}&per_page=100&page={page}"
                response = requests.get(commits_url, headers=headers)
                
                if response.status_code != 200:
                    print(f"Error fetching commits for branch {branch_name}: {response.status_code} {response.text}")
                    break
                    
                commits = response.json()
                if not commits:
                    break
                    
                for commit in commits:
                    futures.append(executor.submit(fetch_commit_details, commit, branch_name))
                
                page += 1
                # GitHub API limits to 100 commits per page, so if we get less, we've reached the end
                if len(commits) < 100:
                    break

        # Wait for all futures to complete
        concurrent.futures.wait(futures)

    # Convert dict to list and sort by commit date (newest first)
    unique_commits = list(all_commits.values())
    unique_commits.sort(
        key=lambda x: x["commit"]["author"].get("date", ""), 
        reverse=True
    )

    return unique_commits


def process_commit(commit: Dict[str, Any]) -> Dict[str, Any]:
    commit_data = commit.get("commit", {})
    author_info = commit_data.get("author", {})
    stats = commit.get("stats", {})
    files = commit.get("files", [])

    return {
        "commit_message": commit_data.get("message"),
        "author_name": author_info.get("name"),
        "date_of_commit": author_info.get("date"),
        "commit_hash": commit.get("sha"),
        "branch": commit.get("branch"),  # This may need additional logic to determine
        "lines_added": stats.get("additions"),
        "lines_removed": stats.get("deletions"),
        "files_changed": [file.get("filename") for file in files],
        "impact_level": calculate_impact_level(commit),
        "complexity": calculate_complexity(commit),
        "quality": assess_quality(commit),
        "risk": evaluate_risk(commit),
        "documentation_score": score_documentation(commit),
        "file_types_involved": identify_file_types(commit),
        "commit_specific_scores": calculate_commit_specific_scores(commit),
    }


def calculate_impact_level(commit: Dict[str, Any]) -> str:
    files_changed = len(commit.get("files", []))
    if files_changed >= 3:
        return "High"
    elif files_changed > 1:
        return "Medium"
    return "Low"


def calculate_complexity(commit: Dict[str, Any]) -> str:
    changes = commit.get("additions", 0) + commit.get("deletions", 0)
    if changes >= 100:
        return "High"
    elif changes >= 500:
        return "Moderate"
    return "Low"


def assess_quality(commit: Dict[str, Any]) -> str:
    message = commit.get("message", "")
    if len(message) >= 10 and any(verb in message for verb in ["add", "fix", "update", "refactor"]):
        return "Good"
    return "Fair"


def evaluate_risk(commit: Dict[str, Any]) -> str:
    changes = commit.get("additions", 0) + commit.get("deletions", 0)
    files_changed = len(commit.get("files", []))
    if changes > 500 or files_changed > 30:
        return "High"
    elif changes >= 100 or files_changed >= 5:
        return "Medium"
    return "Low"


def score_documentation(commit: Dict[str, Any]) -> float:
    message = commit.get("message", "")
    if "docs" in message or "documentation" in message:
        return 80.0
    return 50.0


def identify_file_types(commit: Dict[str, Any]) -> List[str]:
    file_types = set()
    for file in commit.get("files", []):
        filename = file.get("filename", "").lower()

        if filename.endswith(".py"):
            file_types.add("Python")
        elif filename.endswith(".js"):
            file_types.add("JavaScript")
        elif filename.endswith(".ts"):
            file_types.add("TypeScript")
        elif filename.endswith(".jsx"):
            file_types.update(["JavaScript", "CSS"])  # add both, no duplicates
        elif filename.endswith(".tsx"):
            file_types.update(["TypeScript", "CSS"])  # add both, no duplicates
        elif filename.endswith(".css"):
            file_types.add("CSS")
        elif filename.endswith((".scss", ".sass")):
            file_types.add("Sass/SCSS")
        elif filename.endswith(".html"):
            file_types.add("HTML")
        elif filename.endswith(".json"):
            file_types.add("JSON")
        elif filename.endswith((".yml", ".yaml")):
            file_types.add("YAML")
        elif filename.endswith(".xml"):
            file_types.add("XML")
        elif filename.endswith((".md", ".rst")):
            file_types.add("Documentation")
        elif filename.endswith((".sh", ".bash")):
            file_types.add("Shell Script")
        elif filename.endswith(".sql"):
            file_types.add("SQL")
        elif filename.endswith(".dockerfile") or "dockerfile" in filename:
            file_types.add("Docker")
        elif filename.endswith((".toml", ".ini", ".cfg", ".conf")):
            file_types.add("Configuration")
        # else:
        #     file_types.add("Other")

    return sorted(file_types)  # sorted list for consistency



def calculate_commit_specific_scores(commit: Dict[str, Any]) -> Dict[str, float]:
    message = commit.get("message", "")
    additions = commit.get("additions", 0)
    deletions = commit.get("deletions", 0)
    files = commit.get("files", [])
    files_changed = len(files)

    # Code Quality
    code_quality = 50
    if len(message) >= 10 and any(verb in message for verb in ["add", "fix", "update", "refactor"]):
        code_quality += 10
    if additions + deletions > 500 or files_changed > 30:
        code_quality -= 20
    if files_changed <= 10 and additions + deletions <= 300:
        code_quality += 10
    if any(word in message for word in ["refactor", "cleanup", "style"]):
        code_quality += 10

    # Performance
    performance = 50
    if any(word in message for word in ["optimize", "perf", "speed", "cache"]):
        performance += 20
    if any("benchmarks/" in file.get("filename", "") for file in files):
        performance += 20
    if deletions > additions:
        performance += 10

    # Security
    security = 50
    if any(word in message for word in ["security", "CVE", "auth", "encryption"]):
        security += 20
    if any(file.get("filename", "").startswith("auth/") for file in files):
        security += 20
    if any(file.get("filename", "").startswith("crypto/") for file in files):
        security += 10

    # Maintainability
    maintainability = 50
    if any(word in message for word in ["refactor", "cleanup", "restructure"]):
        maintainability += 20
    if deletions > additions:
        maintainability += 10
    if any("//" in file.get("patch", "") or "#" in file.get("patch", "") for file in files):
        maintainability += 10

    # Testing
    testing = 50
    if any("tests/" in file.get("filename", "") for file in files):
        testing += 30
    if any(".github/workflows/" in file.get("filename", "") for file in files):
        testing += 20
    if "test" in message or "coverage" in message:
        testing += 10

    # Documentation
    documentation = score_documentation(commit)

    return {
        "code_quality": min(max(code_quality, 0), 100),
        "performance": min(max(performance, 0), 100),
        "security": min(max(security, 0), 100),
        "maintainability": min(max(maintainability, 0), 100),
        "testing": min(max(testing, 0), 100),
        "documentation": min(max(documentation, 0), 100),
    }