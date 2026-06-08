# Acarson DDL Orchestrator

A zero-cost, serverless-friendly orchestrator for automatically scraping Direct Download Links (DDLs) and pushing them to JDownloader. It enforces strict scoring (prioritizing H.264 video and SxxExx file naming) before submitting to MyJDownloader, eliminating manual file sorting.

## Architecture
- **Backend:** Python FastAPI. Hosted on Fly.io (scales to zero when idle). Features a dynamic Provider Registry.
- **Frontend:** Vanilla HTML/CSS/JS. Hosted on Cloudflare Pages.
- **Integration:** MyJDownloader API (`myjdapi`).

## Initial Deployment Setup

### 1. Backend Setup (Fly.io)
You will need the Fly.io CLI installed and authenticated (`fly auth login`).

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Set your secure secrets in Fly.io. This links the app to your MyJDownloader account and sets your UI access key.
   ```bash
   fly secrets set API_KEY="your_secure_password"
   fly secrets set JD_EMAIL="your_jdownloader_email"
   fly secrets set JD_PASSWORD="your_jdownloader_password"
   fly secrets set JD_DEVICE_NAME="your_device_name"
   ```
3. Deploy the application for the first time:
   ```bash
   fly deploy
   ```
   *Take note of the URL Fly.io provides you (e.g., `https://tokyoinsider-orchestrator.fly.dev`).*

### 2. Frontend Setup (Cloudflare Pages)
1. Open `frontend/app.js` and update the `API_URL` variable at the top of the file to your new Fly.io URL:
   ```javascript
   const API_URL = "https://your-app-name.fly.dev/api";
   ```
2. Push your changes to GitHub.
3. Log into Cloudflare Pages, select **Connect to Git**, and choose this repository.
4. In the Build Settings:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `frontend/`
5. Click **Save and Deploy**. 
6. Set your custom domain to `ddl-orchestrator.minirecc.com` in the Cloudflare Pages settings.

## Setting Up Auto-Deploy (CI/CD)

### Frontend Auto-Deploy
Because you connected Cloudflare Pages directly to GitHub, any push to the `main` branch will automatically trigger a frontend deployment. No further action is required.

### Backend Auto-Deploy (GitHub Actions)
To make Fly.io auto-deploy when you push backend changes:

1. Generate a deploy token via your terminal:
   ```bash
   fly tokens create deploy -x 999999h
   ```
2. In this GitHub Repository, go to **Settings > Secrets and variables > Actions**.
3. Create a **New Repository Secret**:
   - **Name:** `FLY_API_TOKEN`
   - **Secret:** *(paste the token generated above)*
4. Create the GitHub Action file in your local repository at `.github/workflows/fly.yml` with the following content:
   ```yaml
   name: Fly Deploy
   on:
     push:
       branches:
         - main
       paths:
         - 'backend/**'
   jobs:
     deploy:
       name: Deploy app
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: superfly/flyctl-actions/setup-flyctl@master
         - run: flyctl deploy --remote-only
           working-directory: ./backend
           env:
             FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
   ```
5. Commit and push this file. 

## Adding New Providers
The orchestrator uses a `ProviderRegistry`. To add a new provider, create a new class in `backend/scraper.py` that inherits from `Provider`, implement the required `health_check`, `get_episodes`, and `get_links` methods, and register it at the bottom of the file.
