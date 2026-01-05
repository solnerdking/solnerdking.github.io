# How to Add Helius API Key to Vercel

## Step-by-Step Instructions

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/dashboard
   - Find and click on your `jeeter-backend` project

2. **Navigate to Environment Variables**
   - Click on **Settings** (in the top navigation)
   - Click on **Environment Variables** (in the left sidebar)

3. **Add the Environment Variable**
   - Click **Add New**
   - **Key**: `HELIUS_API_KEY` (exactly this, case-sensitive)
   - **Value**: Paste your Helius API key here
   - **Environment**: Select **Production** (and optionally Preview/Development)
   - Click **Save**

4. **Redeploy the Backend**
   - Go to **Deployments** tab
   - Find the latest deployment
   - Click the three dots (⋯) menu
   - Click **Redeploy**
   - OR use CLI: `cd jeeter-backend && vercel --prod`

5. **Verify It's Working**
   - Test health check: `https://jeeter-backend.vercel.app/api/proxy?health=check`
   - Should show: `"hasHeliusKey": true`

## Important Notes

- The variable name MUST be exactly: `HELIUS_API_KEY` (all caps, with underscores)
- After adding the variable, you MUST redeploy for it to take effect
- Environment variables are only available after redeployment
- Make sure you select "Production" environment when adding the variable

## Troubleshooting

If `hasHeliusKey` is still `false` after redeployment:
1. Double-check the variable name is exactly `HELIUS_API_KEY`
2. Make sure it's set for "Production" environment
3. Verify the value is not empty
4. Try removing and re-adding the variable
5. Check Vercel logs for any errors

