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

  // Health check endpoint
  if (req.query.health === 'check') {
    return res.status(200).json({ 
      success: true, 
      message: 'Backend is running',
      nodeVersion: process.version,
      hasFetch: typeof fetch !== 'undefined'
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
      const heliusApiKey = process.env.HELIUS_API_KEY;
      if (!heliusApiKey) {
        return res.status(400).json({ 
          success: false, 
          error: 'Helius API requires an API key. Please configure HELIUS_API_KEY environment variable.',
          note: 'Get a free API key at https://www.helius.dev'
        });
      }
      url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=100`;
    } else if (endpoint === 'birdeye') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
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
          
          // Helius returns token transfers in tx.tokenTransfers array
          if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
            tx.tokenTransfers.forEach(transfer => {
              const fromAddr = (transfer.fromUserAccount || transfer.from || '').toLowerCase();
              const toAddr = (transfer.toUserAccount || transfer.to || '').toLowerCase();
              
              tokenTransfers.push({
                mint: transfer.mint || transfer.tokenAddress,
                tokenSymbol: transfer.tokenSymbol || transfer.symbol || 'Unknown',
                tokenName: transfer.tokenName || transfer.name || 'Unknown Token',
                tokenAmount: transfer.tokenAmount || transfer.amount || 0,
                priceUsd: transfer.priceUsd || transfer.usdValue || 0,
                fromUserAccount: wallet && fromAddr === wallet,
                toUserAccount: wallet && toAddr === wallet,
              });
            });
          }
          
          // Return transaction with tokenTransfers in expected format
          return {
            ...tx,
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

