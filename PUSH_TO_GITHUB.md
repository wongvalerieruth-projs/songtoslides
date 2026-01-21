# How to Push Code to GitHub

## Step 1: Install Git (if not installed)
Open Terminal and run:
```bash
xcode-select --install
```
Or download from: https://git-scm.com/download/mac

## Step 2: Create GitHub Repository
1. Go to https://github.com
2. Sign in (or create account)
3. Click the "+" icon → "New repository"
4. Name it: `lyrics-generator` (or any name)
5. **Don't** initialize with README, .gitignore, or license
6. Click "Create repository"

## Step 3: Push Your Code
Open Terminal and run these commands:

```bash
# Navigate to your project
cd /Users/valeriewong/Desktop/Cursor

# Initialize git (if not already done)
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit: Lyrics slide generator app"

# Add your GitHub repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/lyrics-generator.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Note**: GitHub will ask for your username and password (or personal access token).

## Step 4: Deploy to Vercel
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your `lyrics-generator` repository
5. Add environment variable: `GEMINI_API_KEY`
6. Click "Deploy"

