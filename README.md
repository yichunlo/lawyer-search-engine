# Lawyer Search Engine Frontend

Frontend-only GitHub Pages app for the lawyer search service.

This repository intentionally does not contain:

- API keys or `.env.local`
- `judicial.db` or SQLite files
- RAR archives or raw judgment data
- generated lawyer/JTITLE/judgment index JSON files
- backend server code

The public page calls a separate backend API at `/api/classify`. Configure the backend origin through the GitHub repository variable `PUBLIC_API_BASE_URL`, for example:

```text
https://your-backend.example.com
```

The backend must hold the private API key, `judicial.db`, and CORS allowlist for the GitHub Pages origin.

## Build

```bash
npm run build
```

The build output goes to `dist/`, which is ignored locally and deployed by GitHub Actions.
