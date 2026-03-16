# Cradible5 Python GMB Token Backend

This service handles Google Business Profile OAuth tokens outside Supabase OAuth:

- Generates Google consent URL for the signed-in user
- Handles callback and stores refresh token in Supabase
- Marks `user_profiles.google_connected_at` and `onboarding_completed`
- Mints fresh Google access tokens from stored refresh tokens

## Endpoints

- `GET /health`
- `GET /oauth/google/url?next=/protected`
- `GET /oauth/google/callback`
- `POST /oauth/google/refresh`

## Setup

1. Create a Python virtual environment in `backend/`.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill values.
4. In Google Cloud OAuth client settings, add this redirect URI:

```text
http://localhost:8000/oauth/google/callback
```

5. Run:

```bash
# from repo root:
npm run backend

# or from backend/ directory:
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# also valid from backend/ directory:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## How frontend should call it

1. Read current Supabase session access token in browser.
2. Call `GET /oauth/google/url?next=/protected` with header:
   - `Authorization: Bearer <supabase_access_token>`
3. Redirect browser to returned `authorization_url`.
4. Callback will redirect to:
   - `/protected?google=connected` on success
   - `/protected?google=<error_code>` on failure
