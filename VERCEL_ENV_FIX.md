# Fix for HELIUS_API_KEY Not Being Detected

## The Problem
The environment variable is set in Vercel but not being detected by the backend, even after redeployment.

## Solution Steps

### 1. Verify Environment Variable in Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `HELIUS_API_KEY`
3. **Click Edit** (pencil icon)
4. Verify:
   - Name: Exactly `HELIUS_API_KEY` (no spaces, all caps)
   - Value: `1ac688b0-f67c-4bd5-a95d-e8cdd82e17b5`
   - Environments: **Production** is checked (and Preview/Development if needed)
5. Click **Save**

### 2. Force a New Deployment
**Option A: Via Dashboard (Recommended)**
1. Go to **Deployments** tab
2. Click **"Redeploy"** button (or three dots → Redeploy)
3. **IMPORTANT**: Make sure you select "Use existing Build Cache" = **OFF**
4. Click **Redeploy**
5. Wait for completion (2-3 minutes)

**Option B: Via CLI**
```bash
cd ~/jeeter/jeeter-backend
vercel --prod --force
```

### 3. Verify Deployment Picked Up the Variable
1. After deployment completes, check the deployment logs:
   - Go to Deployments → Click on the new deployment
   - Click "View Function Logs" or "Runtime Logs"
   - Look for any errors about environment variables

2. Test the health check:
   ```
   https://jeeter-backend.vercel.app/api/proxy?health=check
   ```
   Should show: `"hasHeliusKey": true`

### 4. If Still Not Working
Try this nuclear option:
1. **Delete** the environment variable in Vercel
2. **Re-add** it with the exact same name and value
3. **Redeploy** (with build cache OFF)
4. Test again

## Alternative: Temporary Hardcode (For Testing Only)
If you want to test immediately while troubleshooting, you can temporarily hardcode the key in the code (REMOVE BEFORE COMMITTING):

In `jeeter-backend/api/proxy.js` line ~133, change:
```javascript
const heliusApiKey = process.env.HELIUS_API_KEY;
```
to:
```javascript
const heliusApiKey = process.env.HELIUS_API_KEY || '1ac688b0-f67c-4bd5-a95d-e8cdd82e17b5';
```

**WARNING**: Remove this before committing to git!

