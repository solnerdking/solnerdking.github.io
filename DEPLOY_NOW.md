# Deployment Steps - Do This Now

## Current Status
- ✅ Build successful (build folder exists)
- ❌ Frontend NOT deployed to GitHub Pages (uncommitted changes)
- ❌ Backend NOT deployed to Vercel (needs deployment)

## Step 1: Commit and Deploy Frontend to GitHub Pages

```bash
cd ~/jeeter

# Stage all changes
git add .

# Commit changes
git commit -m "Add token images, enhanced metadata display, and improved UI"

# Deploy to GitHub Pages
npm run deploy
```

This will:
1. Build the React app
2. Deploy to the `gh-pages` branch
3. Make it live at https://solnerdking.github.io

## Step 2: Deploy Backend to Vercel

### Option A: Using Vercel CLI (Recommended)

```bash
cd ~/jeeter/jeeter-backend

# Login to Vercel (if not already logged in)
vercel login

# Deploy to production
vercel --prod
```

### Option B: Using Vercel Dashboard

1. Go to https://vercel.com and sign in
2. Click "Add New Project"
3. Import the `jeeter-backend` folder:
   - If using Git: Connect your GitHub repo and select the `jeeter-backend` directory
   - If uploading: Drag and drop the `jeeter-backend` folder
4. Vercel will auto-detect the serverless functions in the `api/` directory
5. **IMPORTANT**: Add environment variable:
   - Go to Settings → Environment Variables
   - Add: `HELIUS_API_KEY` = (your Helius API key)
6. Click "Deploy"
7. Note the deployment URL (e.g., `https://jeeter-backend.vercel.app`)

## Step 3: Verify Deployment

### Frontend
- Visit: https://solnerdking.github.io
- Should load the JitterHands.fun interface
- Try scanning a wallet to test

### Backend
- Visit: `https://jeeter-backend.vercel.app/api/proxy?endpoint=helius&wallet=H1PqJguV6W4FsrTwHoarJn8tip7U47tgrkXzuxoqLSv`
- Should return JSON data (not an error)

## Troubleshooting

### If Frontend Shows Old Version
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- Wait 1-2 minutes for GitHub Pages to update

### If Backend Returns Errors
- Check Vercel dashboard for deployment logs
- Verify `HELIUS_API_KEY` is set in Vercel environment variables
- Check that the backend URL in `src/App.js` matches your Vercel deployment URL

### If CORS Errors
- Backend should handle CORS automatically
- Check browser console for specific error messages

