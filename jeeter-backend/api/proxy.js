export default async function handler(req, res) {
  // Log the request for debugging
  console.log('Request received:', {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: Object.keys(req.headers || {})
  });

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Test endpoint to verify Helius API key works (must be before endpoint validation)
  if (req.query.test === 'helius' && req.query.wallet) {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      return res.status(400).json({
        success: false,
        error: 'HELIUS_API_KEY not found in environment variables',
        troubleshooting: [
          '1. Verify in Vercel Dashboard → Settings → Environment Variables',
          '2. Make sure variable name is exactly: HELIUS_API_KEY',
          '3. Make sure it\'s set for Production environment',
          '4. Redeploy after adding/updating the variable'
        ]
      });
    }
    
    // Test the Helius API call
    try {
      const testUrl = `https://api.helius.xyz/v0/addresses/${req.query.wallet}/transactions?api-key=${heliusApiKey}&limit=5`;
      console.log('Testing Helius API with URL:', testUrl.replace(heliusApiKey, 'HIDDEN'));
      
      const response = await fetch(testUrl);
      const data = await response.json();
      
      return res.status(200).json({
        success: true,
        message: 'Helius API test successful',
        apiKeyLength: heliusApiKey.length,
        apiKeyPreview: `${heliusApiKey.substring(0, 8)}...`,
        responseStatus: response.status,
        responseOk: response.ok,
        dataType: Array.isArray(data) ? 'array' : typeof data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
        dataPreview: data ? (Array.isArray(data) ? `Array with ${data.length} items` : (data.transactions ? `Object with transactions array (${data.transactions.length} items)` : 'Object')) : 'null'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        apiKeyLength: heliusApiKey.length,
        apiKeyPreview: `${heliusApiKey.substring(0, 8)}...`
      });
    }
  }

  // Health check endpoint
  if (req.query.health === 'check') {
    // Try multiple ways to access the environment variable
    const heliusKey1 = process.env.HELIUS_API_KEY;
    const heliusKey2 = process.env['HELIUS_API_KEY'];
    const heliusKey3 = globalThis.process?.env?.HELIUS_API_KEY;
    
    const heliusKey = heliusKey1 || heliusKey2 || heliusKey3;
    
    const allEnvKeys = Object.keys(process.env || {});
    const apiRelatedKeys = allEnvKeys.filter(k => 
      k.toUpperCase().includes('HELIUS') || 
      k.toUpperCase().includes('API') || 
      k.toUpperCase().includes('KEY')
    ).slice(0, 15);
    
    // Check for common variations
    const variations = {
      HELIUS_API_KEY: process.env.HELIUS_API_KEY,
      helius_api_key: process.env.helius_api_key,
      HELIUS_KEY: process.env.HELIUS_KEY,
      'HELIUS_API_KEY (bracket)': process.env['HELIUS_API_KEY'],
    };
    
    // Log to console for Vercel logs
    console.log('Health check - Environment variable check:', {
      hasHeliusKey1: !!heliusKey1,
      hasHeliusKey2: !!heliusKey2,
      hasHeliusKey3: !!heliusKey3,
      totalEnvKeys: allEnvKeys.length,
      sampleKeys: allEnvKeys.slice(0, 10),
      apiRelatedKeys: apiRelatedKeys
    });
    
    return res.status(200).json({ 
      success: true, 
      message: 'Backend is running',
      nodeVersion: process.version,
      hasFetch: typeof fetch !== 'undefined',
      hasHeliusKey: !!heliusKey,
      heliusKeyLength: heliusKey ? heliusKey.length : 0,
      heliusKeyPreview: heliusKey ? `${heliusKey.substring(0, 8)}...` : 'not set',
      envKeys: apiRelatedKeys,
      totalEnvKeys: allEnvKeys.length,
      variations: Object.keys(variations).map(k => ({ key: k, hasValue: !!variations[k] })),
      note: 'If hasHeliusKey is false, the environment variable is not available. Check Vercel Dashboard → Settings → Environment Variables and ensure you redeployed after adding it.',
      troubleshooting: [
        '1. Verify HELIUS_API_KEY exists in Vercel Dashboard → Settings → Environment Variables',
        '2. Ensure it\'s set for Production environment',
        '3. Check the deployment timestamp is AFTER the env var was added/updated',
        '4. If deployment is old, click Redeploy on the latest deployment',
        '5. After redeploy, wait 1-2 minutes and test again'
      ],
      debug: {
        processEnvType: typeof process.env,
        hasProcessEnv: !!process.env,
        sampleEnvKeys: allEnvKeys.slice(0, 10),
        accessMethods: {
          dotNotation: !!process.env.HELIUS_API_KEY,
          bracketNotation: !!process.env['HELIUS_API_KEY'],
          globalThis: !!globalThis.process?.env?.HELIUS_API_KEY
        }
      }
    });
  }

  const { endpoint, wallet, mint } = req.query;

  try {
    // Validate endpoint
    if (!endpoint || (endpoint !== 'solscan' && endpoint !== 'birdeye' && endpoint !== 'helius')) {
      return res.status(400).json({ success: false, error: 'Invalid endpoint. Use "solscan", "helius", or "birdeye"' });
    }

    let url = '';
    
    if (endpoint === 'solscan') {
      if (!wallet) {
        return res.status(400).json({ success: false, error: 'Wallet address required' });
      }
      // Try the Solscan API endpoint
      url = `https://api.solscan.io/account/transfers?account=${wallet}&limit=100`;
    } else if (endpoint === 'helius') {
      // Alternative: Use Helius API (more reliable, but requires API key)
      // For now, we'll note this as an option
      if (!wallet) {
        return res.status(400).json({ success: false, error: 'Wallet address required' });
      }
      // Helius requires API key - would need to be set as environment variable
      // TEMPORARY: Fallback to hardcoded key for testing (REMOVE IN PRODUCTION)
      const heliusApiKey = process.env.HELIUS_API_KEY || '1ac688b0-f67c-4bd5-a95d-e8cdd82e17b5';
      console.log('Helius API key check:', {
        hasKey: !!heliusApiKey,
        keyLength: heliusApiKey ? heliusApiKey.length : 0,
        envKeys: Object.keys(process.env).filter(k => k.includes('HELIUS') || k.includes('API'))
      });
      
      if (!heliusApiKey) {
        console.error('HELIUS_API_KEY environment variable is not set');
        return res.status(400).json({ 
          success: false, 
          error: 'Helius API requires an API key. Please configure HELIUS_API_KEY environment variable in Vercel.',
          note: 'Get a free API key at https://www.helius.dev. After adding it, redeploy the backend.',
          troubleshooting: '1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables. 2. Add HELIUS_API_KEY. 3. Redeploy the backend.'
        });
      }
      url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=100`;
    } else if (endpoint === 'birdeye') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
      // BirdEye API endpoint for token data
      url = `https://public-api.birdeye.so/public/token_data?address=${mint}`;
    }

    // Make API request
    let response;
    try {
      console.log('Making request to:', url);
      // Use global fetch (available in Node.js 18+, which Vercel uses)
      // Check if fetch is available
      if (typeof fetch === 'undefined') {
        console.error('fetch is not available');
        throw new Error('fetch is not available in this environment. Node.js 18+ is required.');
      }
      // Add timeout to prevent 522 errors (Vercel has 10s timeout for Hobby plan)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://solscan.io/',
            'Origin': 'https://solscan.io',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Request timeout after 8 seconds');
          return res.status(504).json({ 
            success: false, 
            error: 'Request to Solscan API timed out. The API may be slow or unavailable.',
            type: 'timeout'
          });
        }
        throw fetchError;
      }
      console.log('Response status:', response.status, response.statusText);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      console.error('Fetch error stack:', fetchError.stack);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to connect to API: ${fetchError.message}`,
        type: 'fetch_error'
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`API error: ${response.status} ${response.statusText}`, errorText);
      
      // Handle 403 Forbidden - API might be blocking requests
      if (response.status === 403) {
        return res.status(403).json({ 
          success: false, 
          error: 'Solscan API blocked the request. This may be due to rate limiting or IP restrictions. Please try again later.',
          type: 'api_blocked',
          status: 403
        });
      }
      
      return res.status(response.status).json({ 
        success: false, 
        error: `API error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 200)
      });
    }

    // Parse response
    let data;
    try {
      const text = await response.text();
      console.log('Response text length:', text.length);
      console.log('Response text preview:', text.substring(0, 200));
      if (!text) {
        console.error('Empty response from API');
        return res.status(500).json({ success: false, error: 'Empty response from API' });
      }
      data = JSON.parse(text);
      console.log('Parsed data type:', typeof data, Array.isArray(data) ? 'array' : 'object');
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Parse error stack:', parseError.stack);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to parse API response: ${parseError.message}`,
        type: 'parse_error'
      });
    }
    
    // Handle API response formats and transform to expected format
    if (endpoint === 'solscan' || endpoint === 'helius') {
      // Both Solscan and Helius return transaction data
      // Solscan may return:
      // 1. An array directly: [...]
      // 2. An object with data property: {data: [...]}
      // 3. An error object: {success: false, message: "..."}
      // Helius returns: {transactions: [...]}
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // Check if it's an error response
        if (data.success === false || data.message || data.error) {
          return res.status(400).json({ 
            success: false, 
            error: data.message || data.error || 'API returned an error' 
          });
        }
        // Helius format: {transactions: [...]}
        if (Array.isArray(data.transactions)) {
          data = data.transactions;
        }
        // Solscan format: {data: [...]}
        else if (Array.isArray(data.data)) {
          data = data.data;
        } 
        // Some APIs use 'result' instead of 'data'
        else if (Array.isArray(data.result)) {
          data = data.result;
        }
      }
      // Ensure data is an array (default to empty array if not)
      if (!Array.isArray(data)) {
        data = [];
      }
      
      // Transform Helius transactions to match Solscan format
      if (endpoint === 'helius' && Array.isArray(data) && data.length > 0) {
        const wallet = req.query.wallet?.toLowerCase();
        data = data.map(tx => {
          const tokenTransfers = [];
          
          // Extract timestamp - Helius provides timestamp in various formats
          let timestamp = null;
          if (tx.timestamp) {
            timestamp = typeof tx.timestamp === 'number' ? tx.timestamp : parseInt(tx.timestamp);
          } else if (tx.blockTime) {
            timestamp = typeof tx.blockTime === 'number' ? tx.blockTime : parseInt(tx.blockTime);
          } else if (tx.date) {
            timestamp = typeof tx.date === 'number' ? tx.date : new Date(tx.date).getTime() / 1000;
          } else {
            // Fallback to current time if no timestamp
            timestamp = Math.floor(Date.now() / 1000);
          }
          
          // Helius returns token transfers in tx.tokenTransfers array
          if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
            tx.tokenTransfers.forEach(transfer => {
              const fromAddr = (transfer.fromUserAccount || transfer.from || '').toLowerCase();
              const toAddr = (transfer.toUserAccount || transfer.to || '').toLowerCase();
              
              // Extract price - try multiple fields
              let priceUsd = 0;
              if (transfer.priceUsd) {
                priceUsd = typeof transfer.priceUsd === 'number' ? transfer.priceUsd : parseFloat(transfer.priceUsd);
              } else if (transfer.usdValue) {
                priceUsd = typeof transfer.usdValue === 'number' ? transfer.usdValue : parseFloat(transfer.usdValue);
              } else if (transfer.nativeTransfers && transfer.nativeTransfers.length > 0) {
                // Try to calculate from SOL value if available
                const solValue = transfer.nativeTransfers[0]?.amount || 0;
                // Rough estimate: 1 SOL = $100 (this should be fetched from API in production)
                priceUsd = (solValue / 1e9) * 100;
              }
              
              tokenTransfers.push({
                mint: transfer.mint || transfer.tokenAddress || transfer.tokenMint,
                tokenSymbol: transfer.tokenSymbol || transfer.symbol || 'Unknown',
                tokenName: transfer.tokenName || transfer.name || 'Unknown Token',
                tokenAmount: transfer.tokenAmount || transfer.amount || 0,
                priceUsd: priceUsd,
                fromUserAccount: wallet && fromAddr === wallet,
                toUserAccount: wallet && toAddr === wallet,
              });
            });
          }
          
          // Return transaction with tokenTransfers and timestamp in expected format
          return {
            ...tx,
            timestamp: timestamp,
            blockTime: timestamp, // Also set blockTime for compatibility
            tokenTransfers: tokenTransfers.length > 0 ? tokenTransfers : undefined
          };
        });
      }
    }
    
    // Wrap response in the format expected by frontend
    res.status(200).json({ success: true, data: data });
  } catch (error) {
    console.error('Proxy error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

