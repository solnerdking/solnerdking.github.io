# Deployment Instructions

## Backend Deployment (Vercel)

### Option 1: Via Vercel Dashboard (Recommended)
1. Go to https://vercel.com and sign in
2. Click "Add New Project"
3. Import the `jeeter-backend` folder:
   - Select "Import Git Repository" OR "Upload Folder"
   - If using Git: Connect your GitHub repo and select the `jeeter-backend` directory
   - If uploading: Select the `jeeter-backend` folder
4. Vercel will auto-detect the serverless functions in the `api/` directory
5. Click "Deploy"
6. Note the deployment URL (e.g., `https://jeeter-backend.vercel.app`)

### Option 2: Via Vercel CLI
```bash
cd jeeter-backend
vercel login
vercel --prod
```

## Frontend Deployment (GitHub Pages)

1. Make sure you're in the root directory:
```bash
cd ~/jeeter
```

2. Build and deploy:
```bash
npm run deploy
```

3. Wait for deployment to complete (may take 1-2 minutes)

4. Visit your site at: https://solnerdking.github.io

## Verify Deployment

1. **Backend**: Visit `https://jeeter-backend.vercel.app/api/proxy?endpoint=solscan&wallet=TEST_WALLET`
   - Should return: `{"success":true,"data":[...]}` or `{"success":false,"error":"..."}`

2. **Frontend**: Visit https://solnerdking.github.io
   - Should load the Jeeter interface
   - Try scanning a wallet to test

## Troubleshooting

- If backend URL is different, update `src/App.js` line 12 with the correct Vercel URL
- If CORS errors occur, verify backend CORS headers are set correctly
- Check browser console for API errors

