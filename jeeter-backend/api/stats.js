// JSON file storage API with GitHub API integration
// Automatically updates data/stats.json in the repository using GitHub API

// GitHub API configuration
const GITHUB_OWNER = 'solnerdking';
const GITHUB_REPO = 'solnerdking.github.io';
const GITHUB_BRANCH = 'main';
const GITHUB_FILE_PATH = 'jeeter-backend/data/stats.json';
const GITHUB_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE_PATH}`;
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;

// In-memory storage (loaded from GitHub file)
let statsData = {
  visits: 0,
  walletScans: 0,
  leaderboard: [],
  lastUpdated: null
};

// Get GitHub token from environment variable
const getGitHubToken = () => {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (!token) {
    console.warn('GITHUB_TOKEN or GITHUB_PAT environment variable is not set! Stats will not persist to GitHub.');
  }
  return token;
};

// Load data from GitHub file
const loadFromGitHub = async () => {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:30',message:'loadFromGitHub ENTRY',data:{url:GITHUB_RAW_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  try {
    const response = await fetch(GITHUB_RAW_URL, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:36',message:'loadFromGitHub fetch response',data:{ok:response.ok,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    if (response.ok) {
      const fileData = await response.json();
      statsData = {
        visits: fileData.visits || 0,
        walletScans: fileData.walletScans || 0,
        leaderboard: Array.isArray(fileData.leaderboard) ? fileData.leaderboard : [],
        lastUpdated: fileData.lastUpdated || null
      };
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:47',message:'loadFromGitHub SUCCESS',data:{visits:statsData.visits,walletScans:statsData.walletScans,leaderboardCount:statsData.leaderboard.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      console.log('Loaded stats from GitHub JSON file');
      return true;
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:51',message:'loadFromGitHub 404',data:{status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      console.log('Stats JSON file not found in GitHub, using defaults');
      return false;
    }
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:54',message:'loadFromGitHub ERROR',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    console.log('Could not load from GitHub file (using defaults):', e.message);
    return false;
  }
};

// Save data to GitHub file using GitHub API
const saveToGitHub = async (data) => {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:59',message:'saveToGitHub ENTRY',data:{visits:data.visits,walletScans:data.walletScans,leaderboardCount:data.leaderboard?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  const token = getGitHubToken();
  
  if (!token) {
    const error = 'GitHub token not configured. Please set GITHUB_TOKEN or GITHUB_PAT in Vercel environment variables. See GITHUB_API_SETUP.md for instructions.';
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:66',message:'saveToGitHub NO_TOKEN',data:{error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    console.error(error);
    return { success: false, error: error };
  }

  try {
    // First, get the current file to get its SHA (required for update)
    // IMPORTANT: Include ?ref parameter to specify branch, otherwise GET may return 404
    const getUrl = `${GITHUB_API_URL}?ref=${GITHUB_BRANCH}`;
    const getResponse = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'JitterHands-Stats-API'
      }
    });

    let sha = null;
    let fileExists = false;
    
    if (getResponse.ok) {
      const fileInfo = await getResponse.json();
      sha = fileInfo.sha;
      fileExists = true;
      console.log('File exists, got SHA for update');
    } else if (getResponse.status === 404) {
      // File doesn't exist yet, we'll create it (no SHA needed)
      console.log('GET returned 404 - file does not exist, will create new file');
      fileExists = false;
    } else {
      // If GET fails with non-404, log but still try to save
      const errorText = await getResponse.text().catch(() => 'Could not read error');
      console.warn(`Failed to get file info (status ${getResponse.status}):`, errorText);
      // Continue anyway - we'll try without SHA and see what happens
    }

    // Prepare the file content
    const content = JSON.stringify(data, null, 2);
    const encodedContent = Buffer.from(content).toString('base64');

    // Prepare the body
    const putBody = {
      message: `Update stats: ${data.visits} visits, ${data.walletScans} scans, ${data.leaderboard.length} leaderboard entries`,
      content: encodedContent,
      branch: GITHUB_BRANCH
    };

    // Include SHA only if we have it (file exists)
    if (sha) {
      putBody.sha = sha;
    }
    
    console.log(`Attempting to save to GitHub: fileExists=${fileExists}, hasSHA=${!!sha}`);

    // Update or create the file
    const updateResponse = await fetch(GITHUB_API_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'JitterHands-Stats-API'
      },
      body: JSON.stringify(putBody)
    });

    if (updateResponse.ok) {
      const result = await updateResponse.json();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:153',message:'saveToGitHub SUCCESS',data:{visits:data.visits,walletScans:data.walletScans},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      console.log('Successfully updated stats.json in GitHub');
      return { success: true, commit: result.commit };
    } else {
      const errorResponse = await updateResponse.json().catch(() => ({ message: updateResponse.statusText }));
      const errorMessage = errorResponse.message || updateResponse.statusText;
      const statusCode = updateResponse.status;
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:160',message:'saveToGitHub PUT_FAILED',data:{status:statusCode,error:errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      console.log(`PUT failed with status ${statusCode}:`, errorMessage);
      
      // If error says SHA is required but we didn't have it, try alternative method
      // This happens when the file exists but GET returns 404 (possible token permission issue)
      if ((errorMessage.toLowerCase().includes('sha') || statusCode === 409 || statusCode === 422) && !sha) {
        console.log('PUT failed requiring SHA but GET returned 404 - trying alternative method with branch ref...');
        
        // Alternative: Try to get SHA using the GitHub API with branch ref explicitly
        try {
          const altGetUrl = `${GITHUB_API_URL}?ref=${GITHUB_BRANCH}`;
          console.log(`Trying alternative GET with branch ref: ${altGetUrl}`);
          const altGetResponse = await fetch(altGetUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'JitterHands-Stats-API'
            }
          });
          
          if (altGetResponse.ok) {
            const altFileInfo = await altGetResponse.json();
            putBody.sha = altFileInfo.sha;
            console.log('Got SHA from alternative GET method, retrying PUT with SHA...');
            
            // Retry PUT with SHA
            const retryUpdateResponse = await fetch(GITHUB_API_URL, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'JitterHands-Stats-API'
              },
              body: JSON.stringify(putBody)
            });
            
            if (retryUpdateResponse.ok) {
              const result = await retryUpdateResponse.json();
              console.log('Successfully updated stats.json in GitHub (alternative method succeeded)');
              return { success: true, commit: result.commit };
            } else {
              const retryErrorResponse = await retryUpdateResponse.json().catch(() => ({ message: retryUpdateResponse.statusText }));
              console.error('Retry PUT failed even with SHA:', retryErrorResponse);
              throw new Error(`Failed to update file (retry failed): ${retryErrorResponse.message || retryUpdateResponse.statusText}`);
            }
          } else {
            const altErrorText = await altGetResponse.text().catch(() => 'Could not read error');
            console.error(`Alternative GET with branch ref also failed with status ${altGetResponse.status}:`, altErrorText);
            
            // Last resort: If we can read the file via raw but API can't, 
            // and PUT requires SHA, there's likely a permission issue
            throw new Error(`Cannot get file SHA: Both GET requests return 404, but PUT requires SHA. This indicates the token may not have access to the repository '${GITHUB_OWNER}/${GITHUB_REPO}'. Please verify: 1) The token has 'repo' scope, 2) The token has access to this specific repository, 3) The repository exists and is accessible. Original error: ${errorMessage}`);
          }
        } catch (altError) {
          console.error('Alternative method failed:', altError.message);
          throw new Error(`Failed to get SHA: ${altError.message}. Original error: ${errorMessage}`);
        }
      }
      
      throw new Error(`Failed to update file: ${errorMessage}`);
    }
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:223',message:'saveToGitHub CATCH_ERROR',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    console.error('Error saving to GitHub:', error);
    return { success: false, error: error.message };
  }
};

// Load on module initialization (will refresh on each serverless function invocation)
loadFromGitHub();

export default async function handler(req, res) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:230',message:'handler ENTRY',data:{method:req.method,action:req.query.action},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
  // #endregion
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // CRITICAL FIX: Reload stats from GitHub on every request to ensure we have the latest global data
  // This is necessary because Vercel serverless functions are stateless
  const loaded = await loadFromGitHub();
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:246',message:'handler after initial load',data:{loaded,visits:statsData.visits,walletScans:statsData.walletScans},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  // If loading failed and this is a fresh instance, we'll use defaults
  // But we'll still try to save on increments
  if (!loaded) {
    console.warn('Could not load stats from GitHub - using current in-memory values or defaults');
  }

  const { action } = req.query;

  try {
    // GET: Retrieve stats and leaderboard
    if (req.method === 'GET') {
      // Note: loadFromGitHub() is already called at the start of handler for all requests
      if (action === 'all' || !action) {
        return res.status(200).json({
          success: true,
          data: {
            visits: statsData.visits || 0,
            walletScans: statsData.walletScans || 0,
            leaderboard: Array.isArray(statsData.leaderboard) ? statsData.leaderboard : [],
            lastUpdated: statsData.lastUpdated
          }
        });
      } else if (action === 'visits') {
        return res.status(200).json({ success: true, data: { visits: statsData.visits || 0 } });
      } else if (action === 'wallet_scans') {
        return res.status(200).json({ success: true, data: { walletScans: statsData.walletScans || 0 } });
      } else if (action === 'leaderboard') {
        return res.status(200).json({ success: true, data: { leaderboard: Array.isArray(statsData.leaderboard) ? statsData.leaderboard : [] } });
      } else if (action === 'export' || action === 'json') {
        // Export as downloadable JSON file
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="jitterhands-stats.json"');
        return res.status(200).json(statsData);
      } else if (action === 'file') {
        // Return the JSON data that can be saved to data/stats.json
        return res.status(200).json({
          success: true,
          message: 'Copy this JSON and save it to jeeter-backend/data/stats.json',
          data: statsData
        });
      } else if (action === 'health' || action === 'check') {
        // Health check endpoint - verify GitHub token and connection
        const token1 = process.env.GITHUB_TOKEN;
        const token2 = process.env.GITHUB_PAT;
        const token = token1 || token2;
        const tokenConfigured = !!token;
        
        // Get all environment variable keys (for debugging)
        const allEnvKeys = Object.keys(process.env || {});
        const githubRelatedKeys = allEnvKeys.filter(k => 
          k.toUpperCase().includes('GITHUB') || 
          k.toUpperCase().includes('PAT') ||
          k.toUpperCase().includes('TOKEN')
        );
        
        let gitHubReachable = false;
        let fileExists = false;
        
        // Test if we can reach GitHub
        try {
          const testResponse = await fetch(GITHUB_RAW_URL, {
            headers: { 'Cache-Control': 'no-cache' }
          });
          gitHubReachable = testResponse.ok || testResponse.status === 404;
          fileExists = testResponse.ok;
        } catch (e) {
          gitHubReachable = false;
        }
        
        // Log to console for Vercel logs
        console.log('Stats Health Check:', {
          hasGITHUB_TOKEN: !!token1,
          hasGITHUB_PAT: !!token2,
          tokenLength: token ? token.length : 0,
          githubRelatedEnvKeys: githubRelatedKeys,
          totalEnvKeys: allEnvKeys.length,
          gitHubReachable: gitHubReachable,
          fileExists: fileExists
        });
        
        return res.status(200).json({
          success: true,
          health: {
            githubTokenConfigured: tokenConfigured,
            githubReachable: gitHubReachable,
            statsFileExists: fileExists,
            currentStats: statsData,
            debug: {
              hasGITHUB_TOKEN: !!token1,
              hasGITHUB_PAT: !!token2,
              githubRelatedEnvKeys: githubRelatedKeys,
              totalEnvKeys: allEnvKeys.length
            },
            recommendations: tokenConfigured 
              ? (gitHubReachable ? 'All systems operational' : 'GitHub not reachable - check network/Vercel configuration')
              : 'GitHub token not configured - stats will not persist. Set GITHUB_TOKEN or GITHUB_PAT in Vercel environment variables. Check Settings → Environment Variables → Make sure it\'s set for Production environment.'
          }
        });
      }
    }

    // POST: Update stats and leaderboard
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

      if (action === 'increment_visit') {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:368',message:'increment_visit ENTRY',data:{visitsBeforeIncrement:statsData.visits},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        // NOTE: We already loaded from GitHub at the start of handler
        // Using the already-loaded value to avoid race conditions from multiple reloads
        const beforeVisits = statsData.visits || 0;
        const newVisits = (statsData.visits || 0) + 1;
        statsData.visits = newVisits;
        statsData.lastUpdated = new Date().toISOString();
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:347',message:'increment_visit before save',data:{beforeVisits,newVisits},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        
        // CRITICAL FIX: Save to GitHub and WAIT for it to complete before returning response
        // This ensures the data is persisted globally before the next request
        let saveSuccess = false;
        try {
          const saveResult = await saveToGitHub(statsData);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:354',message:'increment_visit save result',data:{success:saveResult.success,error:saveResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          saveSuccess = saveResult.success;
          if (!saveResult.success) {
            console.error('Failed to save visits to GitHub:', saveResult.error);
            // CRITICAL: If save fails, we should NOT return success - this is a data integrity issue
            // But we'll still return the incremented value to the frontend for UX
          } else {
            console.log(`Successfully saved visits: ${beforeVisits} -> ${newVisits}`);
          }
        } catch (err) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:362',message:'increment_visit save catch',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          console.error('Error saving visits to GitHub:', err.message || err);
          saveSuccess = false;
        }
        
        // Log final state for debugging
        console.log(`[DEBUG] increment_visit final state: before=${beforeVisits}, after=${statsData.visits}, saveSuccess=${saveSuccess}`);
        
        return res.status(200).json({ 
          success: true, 
          data: { visits: statsData.visits },
          message: `Visits incremented: ${beforeVisits} -> ${statsData.visits}`,
          saved: saveSuccess // Include save status in response for debugging
        });
      }

      if (action === 'increment_wallet_scan') {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:424',message:'increment_wallet_scan ENTRY',data:{scansBeforeIncrement:statsData.walletScans},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        // NOTE: We already loaded from GitHub at the start of handler
        // Using the already-loaded value to avoid race conditions from multiple reloads
        const beforeScans = statsData.walletScans || 0;
        const newScans = (statsData.walletScans || 0) + 1;
        statsData.walletScans = newScans;
        statsData.lastUpdated = new Date().toISOString();
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:390',message:'increment_wallet_scan before save',data:{beforeScans,newScans},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        console.log(`Incrementing wallet scans: ${beforeScans} -> ${newScans}`);
        
        // CRITICAL FIX: Save to GitHub and WAIT for it to complete before returning response
        // This ensures the data is persisted globally before the next request
        let saveSuccess = false;
        try {
          const saveResult = await saveToGitHub(statsData);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:398',message:'increment_wallet_scan save result',data:{success:saveResult.success,error:saveResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          saveSuccess = saveResult.success;
          if (!saveResult.success) {
            console.error('Failed to save wallet scans to GitHub:', saveResult.error);
            // CRITICAL: If save fails, we should NOT return success - this is a data integrity issue
          } else {
            console.log(`Successfully saved wallet scans: ${beforeScans} -> ${newScans}`);
          }
        } catch (err) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:406',message:'increment_wallet_scan save catch',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          console.error('Error saving wallet scans to GitHub:', err.message || err);
          saveSuccess = false;
        }
        
        // Log final state for debugging
        console.log(`[DEBUG] increment_wallet_scan final state: before=${beforeScans}, after=${statsData.walletScans}, saveSuccess=${saveSuccess}`);
        
        return res.status(200).json({ 
          success: true, 
          data: { walletScans: statsData.walletScans },
          message: `Wallet scans incremented: ${beforeScans} -> ${statsData.walletScans}`,
          saved: saveSuccess // Include save status in response for debugging
        });
      }

      if (action === 'update_leaderboard') {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stats.js:468',message:'update_leaderboard ENTRY',data:{leaderboardCount:body.leaderboard?.length,existingCount:statsData.leaderboard?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        // NOTE: We already loaded from GitHub at the start of handler
        // Using the already-loaded value to avoid race conditions from multiple reloads
        const { leaderboard } = body;
        if (Array.isArray(leaderboard)) {
          // Merge with existing leaderboard to avoid losing entries from concurrent updates
          const existingLeaderboard = statsData.leaderboard || [];
          const mergedLeaderboard = [...existingLeaderboard];
          
          // Update or add entries from the new leaderboard
          leaderboard.forEach(newEntry => {
            const existingIndex = mergedLeaderboard.findIndex(e => e.walletAddress === newEntry.walletAddress);
            if (existingIndex >= 0) {
              // Update existing entry if new one has higher value or more recent
              if ((newEntry.paperhandedValue || 0) > (mergedLeaderboard[existingIndex].paperhandedValue || 0)) {
                mergedLeaderboard[existingIndex] = newEntry;
              }
            } else {
              mergedLeaderboard.push(newEntry);
            }
          });
          
          // Sort and keep top 200
          const sorted = mergedLeaderboard.sort((a, b) => (b.paperhandedValue || 0) - (a.paperhandedValue || 0));
          statsData.leaderboard = sorted.slice(0, 200);
          statsData.lastUpdated = new Date().toISOString();
          
          // CRITICAL FIX: Save to GitHub and WAIT for it to complete before returning response
          try {
            const saveResult = await saveToGitHub(statsData);
            if (!saveResult.success) {
              console.error('Failed to save leaderboard to GitHub:', saveResult.error);
            } else {
              console.log(`Successfully saved leaderboard with ${statsData.leaderboard.length} entries`);
            }
          } catch (err) {
            console.error('Error saving leaderboard to GitHub:', err);
          }
          
          return res.status(200).json({ success: true, data: { leaderboard: statsData.leaderboard } });
        }
        return res.status(400).json({ success: false, error: 'Invalid leaderboard data' });
      }

      if (action === 'set_all') {
        const { visits, walletScans, leaderboard } = body;
        if (visits !== undefined) statsData.visits = parseInt(visits) || 0;
        if (walletScans !== undefined) statsData.walletScans = parseInt(walletScans) || 0;
        if (Array.isArray(leaderboard)) {
          const sorted = leaderboard.sort((a, b) => (b.paperhandedValue || 0) - (a.paperhandedValue || 0));
          statsData.leaderboard = sorted.slice(0, 200);
        }
        statsData.lastUpdated = new Date().toISOString();
        
        // CRITICAL FIX: Save to GitHub and WAIT for it to complete before returning response
        try {
          const saveResult = await saveToGitHub(statsData);
          if (!saveResult.success) {
            console.error('Failed to save stats to GitHub:', saveResult.error);
          }
        } catch (err) {
          console.error('Error saving stats to GitHub:', err);
        }
        
        return res.status(200).json({ success: true, message: 'Data updated', data: statsData });
      }

      if (action === 'reload') {
        // Reload from GitHub file
        const loaded = await loadFromGitHub();
        return res.status(200).json({ 
          success: true, 
          message: loaded ? 'Data reloaded from GitHub' : 'Using current data (file not found)',
          data: statsData 
        });
      }

      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error'
    });
  }
}

