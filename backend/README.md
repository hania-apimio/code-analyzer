# Backend (FastAPI)

## Setup

- (Optional) Create a virtual environment
- Install dependencies:
```
pip install -r requirements.txt
```

## Run

From the `backend` directory:
```
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or from the repository root:
```
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

## Provide a GitHub Token (PAT)
- Header: `X-GitHub-Token: <PAT>`
- Query: `?token=<PAT>`
- Env var: `GITHUB_TOKEN=<PAT>`

## Endpoints
- GET `/health`
- GET `/user`
- GET `/user/emails`
- GET `/user/orgs`
- GET `/repos?max_commits_per_repo=5&max_branches_per_repo=0`

Docs: http://localhost:8000/docs
