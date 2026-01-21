# Deployment Guide for Vercel

## Quick Deploy Steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your repository
5. **IMPORTANT**: Add environment variable:
   - Go to Project Settings → Environment Variables
   - Add: `GEMINI_API_KEY` = `your_actual_api_key`
6. Click "Deploy"

### 3. Access Your App
Your app will be live at: `https://your-project-name.vercel.app`

## Environment Variables on Vercel
- **Variable Name**: `GEMINI_API_KEY`
- **Value**: Your Gemini API key from https://makersuite.google.com/app/apikey
- **Environment**: Production, Preview, Development (select all)

## Notes
- Vercel automatically detects Next.js and configures everything
- No `vercel.json` needed for basic Next.js apps
- The build command `npm run build` runs automatically
- Your app will auto-deploy on every git push (if connected)

