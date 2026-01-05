# Environment Variable Troubleshooting

## Current Status
- Health check shows: `hasHeliusKey: false`
- Environment variable is set in Vercel: `HELIUS_API_KEY = 1ac688b0-f67c-4bd5-a95d-e8cdd82e17b5`
- Backend has been redeployed but still not detecting the key

## Possible Issues

### 1. Environment Variable Not Applied to Deployment
**Solution:** The deployment might not have picked up the env var. Try:
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Verify `HELIUS_API_KEY` is set for **Production**
- Click "Redeploy" on the latest deployment
- Wait for deployment to complete

### 2. Variable Name Mismatch
**Check:** Make sure the variable name in Vercel is exactly: `HELIUS_API_KEY` (all caps, underscores)

### 3. Deployment Not Using Latest Variables
**Solution:** 
- Delete the environment variable
- Re-add it
- Redeploy

### 4. Test the API Key Directly
After redeployment, test:
```
https://jeeter-backend.vercel.app/api/proxy?test=helius&wallet=H1PqJguV6W4FsrTwHoarJn8tip7U47tgrkXzuxoqLSv
```

This will show if the key is detected and test the Helius API call.

## Manual Verification Steps

1. **Check Vercel Dashboard:**
   - Settings → Environment Variables
   - Verify `HELIUS_API_KEY` exists
   - Check it's set for Production
   - Note the "Updated" timestamp

2. **Check Deployment:**
   - Deployments tab
   - Look at the latest deployment timestamp
   - It should be AFTER the env var was updated

3. **Test Health Check:**
   ```
   https://jeeter-backend.vercel.app/api/proxy?health=check
   ```
   Should show `hasHeliusKey: true` after redeployment

4. **Check Vercel Logs:**
   - Go to your project → Functions → View logs
   - Look for any errors about environment variables

