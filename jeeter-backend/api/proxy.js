// Helper function to parse RPC transaction to Helius-compatible format
function parseRPCTransaction(rpcTx, walletAddress) {
  if (!rpcTx || !rpcTx.transaction || !rpcTx.transaction.message) {
    return null;
  }

  const tx = rpcTx.transaction;
  const message = tx.message;
  const blockTime = rpcTx.blockTime || Math.floor(Date.now() / 1000);
  const meta = rpcTx.meta || {};
  
  // Extract token transfers from transaction
  const tokenTransfers = [];
  
  // Get account keys
  const accountKeys = message.accountKeys || [];
  const walletLower = walletAddress.toLowerCase();
  
  // Parse pre/post token balances to detect transfers
  const postTokenBalances = meta.postTokenBalances || [];
  const preTokenBalances = meta.preTokenBalances || [];
  
  // Create a map of token account changes
  const tokenAccountChanges = new Map();
  
  // Process each post-token balance
  postTokenBalances.forEach((post) => {
    const pre = preTokenBalances.find(p => 
      p.accountIndex === post.accountIndex && 
      p.mint === post.mint
    );
    
    if (pre) {
      const preAmount = parseFloat(pre.uiTokenAmount?.uiAmountString || pre.uiTokenAmount?.amount || '0');
      const postAmount = parseFloat(post.uiTokenAmount?.uiAmountString || post.uiTokenAmount?.amount || '0');
      const change = postAmount - preAmount;
      
      if (Math.abs(change) > 0.000000001) { // Significant change
        const accountKey = accountKeys[post.accountIndex];
        const owner = post.owner || accountKey;
        const mint = post.mint;
        const ownerLower = (owner || '').toLowerCase();
        
        // Only process if wallet is involved
        if (ownerLower === walletLower) {
          const key = `${mint}_${post.accountIndex}`;
          if (!tokenAccountChanges.has(key)) {
            tokenAccountChanges.set(key, {
              mint,
              accountIndex: post.accountIndex,
              accountKey: accountKey,
              owner: owner,
              preAmount,
              postAmount,
              change,
            });
          }
        }
      }
    }
  });
  
  // Also check pre-token balances that might have been closed (balance went to 0)
  preTokenBalances.forEach((pre) => {
    const post = postTokenBalances.find(p => 
      p.accountIndex === pre.accountIndex && 
      p.mint === pre.mint
    );
    
    if (!post) {
      // Account was closed or balance went to zero
      const preAmount = parseFloat(pre.uiTokenAmount?.uiAmountString || pre.uiTokenAmount?.amount || '0');
      if (preAmount > 0.000000001) {
        const owner = pre.owner;
        const ownerLower = (owner || '').toLowerCase();
        
        if (ownerLower === walletLower) {
          const accountKey = accountKeys[pre.accountIndex];
          const key = `${pre.mint}_${pre.accountIndex}_closed`;
          
          if (!tokenAccountChanges.has(key)) {
            tokenAccountChanges.set(key, {
              mint: pre.mint,
              accountIndex: pre.accountIndex,
              accountKey: accountKey,
              owner: owner,
              preAmount,
              postAmount: 0,
              change: -preAmount, // All tokens were removed
            });
          }
        }
      }
    }
  });
  
  // Convert balance changes to token transfers
  // Group by mint to find matching pairs
  const transfersByMint = new Map();
  
  tokenAccountChanges.forEach((change, key) => {
    if (!transfersByMint.has(change.mint)) {
      transfersByMint.set(change.mint, []);
    }
    transfersByMint.get(change.mint).push(change);
  });
  
  // Create transfers from balance changes
  transfersByMint.forEach((changes, mint) => {
    // Separate incoming and outgoing
    const outgoing = changes.filter(c => c.change < 0);
    const incoming = changes.filter(c => c.change > 0);
    
    // Process outgoing (sells/transfers out)
    outgoing.forEach(out => {
      const amount = Math.abs(out.change);
      tokenTransfers.push({
        mint,
        tokenAmount: amount.toString(),
        tokenSymbol: null, // Will be filled later by token metadata APIs
        tokenName: null, // Will be filled later
        fromUserAccount: true, // Wallet is sending
        toUserAccount: false,
        fromTokenAccount: out.accountKey,
        toTokenAccount: null, // Unknown from balance change alone
        priceUsd: 0, // Will be filled later by price APIs
      });
    });
    
    // Process incoming (buys/transfers in)
    incoming.forEach(in => {
      const amount = in.change;
      tokenTransfers.push({
        mint,
        tokenAmount: amount.toString(),
        tokenSymbol: null, // Will be filled later
        tokenName: null, // Will be filled later
        fromUserAccount: false,
        toUserAccount: true, // Wallet is receiving
        fromTokenAccount: null, // Unknown from balance change alone
        toTokenAccount: in.accountKey,
        priceUsd: 0, // Will be filled later by price APIs
      });
    });
  });
  
  // If no token transfers found, return null
  if (tokenTransfers.length === 0) {
    return null; // No token transfers involving this wallet
  }
  
  return {
    signature: tx.signatures?.[0] || '',
    timestamp: blockTime,
    blockTime,
    type: 'TRANSFER',
    description: `Token transfer transaction`,
    tokenTransfers,
    source: 'RPC',
  };
}

// Fetch transactions using Solana RPC (primary source)
async function fetchWithRPC(walletAddress) {
  // Expanded list of free public RPC endpoints
  const rpcEndpoints = [
    'https://api.mainnet-beta.solana.com', // Official Solana RPC
    'https://solana-api.projectserum.com',
    'https://rpc.ankr.com/solana',
    'https://solana.public-rpc.com',
    'https://rpc.solana.com',
    'https://solana-rpc.publicnode.com', // PublicNode
  ];
  
  let lastError = null;
  
  // Try each RPC endpoint
  for (const rpcUrl of rpcEndpoints) {
    try {
      console.log(`Attempting RPC with ${rpcUrl}`);
      
      // Step 1: Get transaction signatures
      const signaturesResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [
            walletAddress,
            { limit: 100 }
          ],
        }),
      });
      
      if (!signaturesResponse.ok) {
        throw new Error(`RPC endpoint returned ${signaturesResponse.status}`);
      }
      
      const signaturesData = await signaturesResponse.json();
      
      if (signaturesData.error) {
        throw new Error(signaturesData.error.message || 'RPC error');
      }
      
      const signatures = signaturesData.result || [];
      
      if (signatures.length === 0) {
        return { success: true, data: [], source: 'RPC' };
      }
      
      console.log(`Found ${signatures.length} transaction signatures, fetching details...`);
      
      // Step 2: Get transaction details in batches (optimized: 5-8 parallel for better reliability)
      const batchSize = 8; // Reduced from 10 to avoid rate limiting
      const transactions = [];
      
      for (let i = 0; i < signatures.length; i += batchSize) {
        const batch = signatures.slice(i, i + batchSize);
        const batchPromises = batch.map(sig => 
          fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [
                sig.signature,
                {
                  encoding: 'jsonParsed',
                  maxSupportedTransactionVersion: 0
                }
              ],
            }),
            signal: AbortSignal.timeout(30000), // 30 second timeout per request
          }).then(res => res.json())
            .then(data => ({ signature: sig.signature, data: data.result }))
            .catch(err => {
              if (err.name !== 'AbortError') {
                console.error(`Error fetching transaction ${sig.signature.slice(0, 8)}...:`, err.message);
              }
              return null;
            })
        );
        
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => {
          if (result && result.data) {
            const parsed = parseRPCTransaction(result.data, walletAddress);
            if (parsed) {
              transactions.push(parsed);
            }
          }
        });
        
        // Adaptive delay between batches to avoid rate limiting (longer delay for more requests)
        if (i + batchSize < signatures.length) {
          const delay = Math.min(300, 100 + (i / batchSize) * 20); // 100-300ms delay
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      console.log(`RPC successful: ${transactions.length} transactions parsed from ${rpcUrl}`);
      
      return {
        success: true,
        data: transactions,
        source: 'RPC',
        rpcEndpoint: rpcUrl
      };
      
    } catch (error) {
      console.error(`RPC endpoint ${rpcUrl} failed:`, error.message);
      lastError = error;
      continue; // Try next endpoint
    }
  }
  
  throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Helius API Keys (primary and secondary)
const HELIUS_KEYS = {
  PRIMARY: process.env.HELIUS_API_KEY_PRIMARY || '1866fd12-52ed-453b-9cce-31c7f553dd67',
  SECONDARY: process.env.HELIUS_API_KEY_SECONDARY || 'b6cbae84-b87b-439b-8b89-56612e3e903a',
};

// Fetch with Helius keys (primary -> secondary -> RPC fallback)
async function fetchWithHeliusKeys(walletAddress) {
  // Try primary key first
  try {
    const primaryUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_KEYS.PRIMARY}&limit=100`;
    console.log('Attempting Helius PRIMARY key...');
    
    const primaryResponse = await fetch(primaryUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (primaryResponse.ok) {
      const data = await primaryResponse.json();
      console.log(`Helius PRIMARY successful: ${data.length} transactions`);
      return {
        success: true,
        data: data,
        source: 'HELIUS_PRIMARY'
      };
    }
    
    // If 429 or other error, log and try secondary
    if (primaryResponse.status === 429) {
      console.log('Helius PRIMARY rate limited (429), trying SECONDARY...');
    } else {
      console.log(`Helius PRIMARY error (${primaryResponse.status}), trying SECONDARY...`);
    }
  } catch (error) {
    console.log('Helius PRIMARY failed:', error.message, '- trying SECONDARY...');
  }
  
  // Try secondary key
  try {
    const secondaryUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_KEYS.SECONDARY}&limit=100`;
    console.log('Attempting Helius SECONDARY key...');
    
    const secondaryResponse = await fetch(secondaryUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (secondaryResponse.ok) {
      const data = await secondaryResponse.json();
      console.log(`Helius SECONDARY successful: ${data.length} transactions`);
      return {
        success: true,
        data: data,
        source: 'HELIUS_SECONDARY'
      };
    }
    
    // If 429 or other error, log and use RPC fallback
    if (secondaryResponse.status === 429) {
      console.log('Helius SECONDARY rate limited (429) or out of credits, using RPC fallback...');
    } else {
      console.log(`Helius SECONDARY error (${secondaryResponse.status}), using RPC fallback...`);
    }
  } catch (error) {
    console.log('Helius SECONDARY failed:', error.message, '- using RPC fallback...');
  }
  
  // Both keys failed, use RPC fallback
  console.log('Both Helius keys failed, using RPC fallback...');
  return await fetchWithRPC(walletAddress);
}

// Rate limiting: simple in-memory store (resets on serverless cold start)
const rateLimitStore = new Map();

// Simple rate limiting: max 10 requests per minute per IP
function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'default';
  const requests = rateLimitStore.get(key) || [];
  
  // Remove requests older than 1 minute
  const recentRequests = requests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= 10) {
    return false; // Rate limited
  }
  
  recentRequests.push(now);
  rateLimitStore.set(key, recentRequests);
  return true; // Allowed
}

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
    if (!endpoint || (endpoint !== 'solscan' && endpoint !== 'birdeye' && endpoint !== 'helius' && endpoint !== 'helius-token' && endpoint !== 'coingecko' && endpoint !== 'dexscreener' && endpoint !== 'pumpfun' && endpoint !== 'solana-balance')) {
      return res.status(400).json({ success: false, error: 'Invalid endpoint. Use "solscan", "helius", "birdeye", "helius-token", "coingecko", "dexscreener", "pumpfun", or "solana-balance"' });
    }

    let url = '';
    
    if (endpoint === 'solscan') {
      if (!wallet) {
        return res.status(400).json({ success: false, error: 'Wallet address required' });
      }
      // Try the Solscan API endpoint
      url = `https://api.solscan.io/account/transfers?account=${wallet}&limit=100`;
    } else if (endpoint === 'helius') {
      // Use Helius keys (primary -> secondary -> RPC fallback)
      if (!wallet) {
        return res.status(400).json({ success: false, error: 'Wallet address required' });
      }
      
      // Rate limiting: check if IP is rate limited
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                       req.headers['x-real-ip'] || 
                       req.socket?.remoteAddress || 
                       'unknown';
      
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please wait a minute before trying again.',
          retryAfter: 60
        });
      }
      
      try {
        // Use multi-key system (Helius primary -> secondary -> RPC)
        const result = await fetchWithHeliusKeys(wallet);
        
        // Transform result to match expected format
        let transactions = result.data || [];
        
        // Ensure transactions are properly formatted
        transactions = transactions.map(tx => {
          // Ensure tokenTransfers is properly formatted
          if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
            tx.tokenTransfers = tx.tokenTransfers.map(transfer => ({
              mint: transfer.mint,
              tokenSymbol: transfer.tokenSymbol || null,
              tokenName: transfer.tokenName || null,
              tokenAmount: transfer.tokenAmount || transfer.amount || 0,
              priceUsd: transfer.priceUsd || 0,
              fromUserAccount: transfer.fromUserAccount || false,
              toUserAccount: transfer.toUserAccount || false,
              from: transfer.fromTokenAccount,
              to: transfer.toTokenAccount,
            }));
          }
          return {
            ...tx,
            timestamp: tx.timestamp || tx.blockTime || Math.floor(Date.now() / 1000),
            blockTime: tx.blockTime || tx.timestamp || Math.floor(Date.now() / 1000),
          };
        });
        
        // Return in format expected by frontend (array of transactions)
        return res.status(200).json({
          success: true,
          data: transactions,
          source: result.source || 'RPC',
          rpcEndpoint: result.rpcEndpoint || null
        });
      } catch (error) {
        console.error('Error in fetchWithHeliusKeys:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch wallet transactions',
          details: error.message,
          source: 'ERROR'
        });
      }
    } else if (endpoint === 'birdeye') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
      // BirdEye API endpoint for token data
      url = `https://public-api.birdeye.so/public/token_data?address=${mint}`;
    } else if (endpoint === 'solscan') {
      if (!mint && !wallet) {
        return res.status(400).json({ success: false, error: 'Mint address or wallet required' });
      }
      // Solscan API endpoint for token metadata
      if (mint) {
        url = `https://api.solscan.io/token/meta?token=${mint}`;
      } else {
        url = `https://api.solscan.io/account/transfers?account=${wallet}&limit=100`;
      }
    } else if (endpoint === 'helius-token') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
      // Helius API endpoint for token metadata
      const heliusApiKey = process.env.HELIUS_API_KEY || '1ac688b0-f67c-4bd5-a95d-e8cdd82e17b5';
      url = `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`;
      // This endpoint requires POST with body
    } else if (endpoint === 'coingecko') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
      // CoinGecko API - first try to find Solana token by contract
      // Note: CoinGecko uses different IDs, may need to map mint addresses
      url = `https://api.coingecko.com/api/v3/coins/solana/contract/${mint}`;
    } else if (endpoint === 'dexscreener') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
      // DexScreener API for Solana tokens
      url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
    } else if (endpoint === 'pumpfun') {
      if (!mint) {
        return res.status(400).json({ success: false, error: 'Mint address required' });
      }
      // Pump.fun API - try multiple endpoints
      // Note: Pump.fun may not have a public API, but we can try common patterns
      url = `https://frontend-api.pump.fun/coins/${mint}`;
    } else if (endpoint === 'solana-balance') {
      if (!wallet) {
        return res.status(400).json({ success: false, error: 'Wallet address required' });
      }
      
      // Handle balance fetch separately (before making URL-based requests)
      let lamports = 0;
      const rpcEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana',
        'https://solana.public-rpc.com',
        'https://rpc.solana.com',
      ];

      // Try each RPC endpoint
      for (const rpcUrl of rpcEndpoints) {
        try {
          const balanceResponse = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getBalance',
              params: [wallet],
            }),
          });
          
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            if (balanceData.result?.value !== undefined && balanceData.result?.value !== null) {
              lamports = balanceData.result.value;
              console.log(`Successfully fetched balance from ${rpcUrl}: ${lamports} lamports`);
              break;
            }
          }
        } catch (e) {
          console.log(`RPC endpoint ${rpcUrl} failed:`, e.message);
          continue;
        }
      }

      // If all RPC endpoints failed, try Solscan API as fallback
      if (lamports === 0) {
        try {
          const solscanResponse = await fetch(`https://api.solscan.io/account?address=${wallet}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });
          if (solscanResponse.ok) {
            const solscanData = await solscanResponse.json();
            if (solscanData.data?.lamports) {
              lamports = solscanData.data.lamports;
              console.log(`Successfully fetched balance from Solscan: ${lamports} lamports`);
            }
          }
        } catch (e) {
          console.log('Solscan fallback also failed:', e.message);
        }
      }

      const sol = lamports / 1e9;
      
      // Fetch SOL price from CoinGecko
      let solPrice = 150; // Default
      try {
        const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          if (priceData.solana?.usd) {
            solPrice = priceData.solana.usd;
          }
        }
      } catch (e) {
        console.log('Error fetching SOL price:', e);
      }

      const usd = sol * solPrice;

      return res.status(200).json({
        success: true,
        data: {
          lamports,
          sol,
          usd,
          solPrice,
        },
      });
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
        // Helius token metadata endpoint requires POST
        if (endpoint === 'helius-token') {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mintAccounts: [mint] }),
            signal: controller.signal,
          });
        } else if (endpoint === 'coingecko' || endpoint === 'dexscreener' || endpoint === 'pumpfun') {
          // CoinGecko, DexScreener, and Pump.fun don't need special headers
          response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
          });
        } else {
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
        }
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Request timeout after 8 seconds');
          return res.status(504).json({ 
            success: false, 
            error: 'Request to API timed out. The API may be slow or unavailable.',
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
              
              // Try direct price fields first
              if (transfer.priceUsd) {
                priceUsd = typeof transfer.priceUsd === 'number' ? transfer.priceUsd : parseFloat(transfer.priceUsd);
              } else if (transfer.usdValue) {
                priceUsd = typeof transfer.usdValue === 'number' ? transfer.usdValue : parseFloat(transfer.usdValue);
              } else if (transfer.price) {
                priceUsd = typeof transfer.price === 'number' ? transfer.price : parseFloat(transfer.price);
              }
              
              // If no direct price, try to calculate from native transfers (SOL)
              if (priceUsd === 0 && tx.nativeTransfers && Array.isArray(tx.nativeTransfers)) {
                const nativeTransfer = tx.nativeTransfers.find(nt => 
                  (nt.fromUserAccount && nt.fromUserAccount.toLowerCase() === wallet) ||
                  (nt.toUserAccount && nt.toUserAccount.toLowerCase() === wallet)
                );
                if (nativeTransfer && nativeTransfer.amount) {
                  const solAmount = nativeTransfer.amount / 1e9; // Convert lamports to SOL
                  const tokenAmount = transfer.tokenAmount || transfer.amount || 1;
                  // Rough estimate: 1 SOL = $150 (should fetch from API)
                  // Price per token = (SOL value * SOL price) / token amount
                  priceUsd = (solAmount * 150) / tokenAmount;
                }
              }
              
              // If still no price, try to calculate from transaction fee or other indicators
              if (priceUsd === 0 && tx.fee && transfer.tokenAmount) {
                // Use fee as rough indicator (very rough estimate)
                const feeInSol = tx.fee / 1e9;
                priceUsd = (feeInSol * 150) / (transfer.tokenAmount || 1);
              }
              
              console.log(`Token ${transfer.mint?.slice(0, 8)}: priceUsd=${priceUsd}, tokenAmount=${transfer.tokenAmount || transfer.amount}`);
              
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
    
    // Handle Solscan token metadata response
    if (endpoint === 'solscan' && mint) {
      if (data && typeof data === 'object') {
        const result = {
          symbol: data.symbol || data.tokenSymbol || '',
          name: data.name || data.tokenName || data.displayName || '',
          decimals: data.decimals || 9,
          logoURI: data.logoURI || data.logo || data.image || '',
          price: { usd: 0 }, // Solscan doesn't provide price in metadata endpoint
          history: { ath: { value: 0, unixTime: null } },
        };
        return res.status(200).json({ success: true, data: result });
      }
    }
    
    // Handle Helius token metadata response
    if (endpoint === 'helius-token') {
      if (data && Array.isArray(data) && data.length > 0) {
        const tokenData = data[0];
        const result = {
          symbol: tokenData.symbol || tokenData.tokenSymbol || '',
          name: tokenData.name || tokenData.tokenName || tokenData.displayName || '',
          decimals: tokenData.decimals || 9,
          logoURI: tokenData.logoURI || tokenData.logo || tokenData.image || '',
          price: { usd: 0 }, // Helius metadata doesn't provide price
          history: { ath: { value: 0, unixTime: null } },
        };
        return res.status(200).json({ success: true, data: result });
      }
    }
    
    // Handle BirdEye API response format
    if (endpoint === 'birdeye') {
      // BirdEye returns data in various formats
      if (data && typeof data === 'object') {
        // Check for error first
        if (data.success === false || data.error || data.message) {
          console.log('BirdEye API error:', data.error || data.message);
          // Don't return error, return empty data instead so frontend can handle it
          return res.status(200).json({ 
            success: true, 
            data: {
              price: { usd: 0 },
              symbol: '',
              name: '',
              history: { ath: { value: 0, unixTime: null } },
              decimals: 9,
              logoURI: ''
            }
          });
        }
        
        // BirdEye can return data in different structures
        // Common formats:
        // 1. { data: { price: ..., symbol: ... } }
        // 2. { price: ..., symbol: ... } (direct)
        // 3. { result: { price: ..., symbol: ... } }
        let tokenData = data;
        if (data.data && typeof data.data === 'object') {
          tokenData = data.data;
        } else if (data.result && typeof data.result === 'object') {
          tokenData = data.result;
        }
        
        console.log('BirdEye tokenData keys:', Object.keys(tokenData));
        console.log('BirdEye price structure:', tokenData.price);
        console.log('BirdEye symbol:', tokenData.symbol);
        console.log('BirdEye name:', tokenData.name);
        
        // Extract price - BirdEye API structure varies
        let priceUsd = 0;
        if (tokenData.price) {
          if (typeof tokenData.price === 'number') {
            priceUsd = tokenData.price;
          } else if (typeof tokenData.price === 'object') {
            priceUsd = tokenData.price.usd || tokenData.price.value || tokenData.price.price || 0;
          }
        } else if (tokenData.priceUsd) {
          priceUsd = typeof tokenData.priceUsd === 'number' ? tokenData.priceUsd : parseFloat(tokenData.priceUsd) || 0;
        }
        
        // Extract ATH
        let athValue = 0;
        let athTime = null;
        if (tokenData.history && tokenData.history.ath) {
          athValue = tokenData.history.ath.value || tokenData.history.ath.price || 0;
          athTime = tokenData.history.ath.unixTime || tokenData.history.ath.timestamp || null;
        } else if (tokenData.ath) {
          if (typeof tokenData.ath === 'number') {
            athValue = tokenData.ath;
          } else if (typeof tokenData.ath === 'object') {
            athValue = tokenData.ath.value || tokenData.ath.price || 0;
            athTime = tokenData.ath.unixTime || tokenData.ath.timestamp || null;
          }
        }
        
        // Extract token metadata
        const symbol = tokenData.symbol || tokenData.tokenSymbol || tokenData.symbolName || '';
        const name = tokenData.name || tokenData.tokenName || tokenData.displayName || '';
        
        // Extract token information - BirdEye API structure
        const result = {
          // Price data
          price: {
            usd: priceUsd
          },
          // Token metadata
          symbol: symbol,
          name: name,
          // ATH data
          history: {
            ath: {
              value: athValue,
              unixTime: athTime
            }
          },
          // Additional metadata
          decimals: tokenData.decimals || tokenData.tokenDecimals || 9,
          logoURI: tokenData.logoURI || tokenData.logo || tokenData.image || '',
        };
        
        console.log('BirdEye result:', JSON.stringify(result, null, 2));
        
        return res.status(200).json({ success: true, data: result });
      }
    }
    
    // Handle CoinGecko API response
    if (endpoint === 'coingecko') {
      if (data && typeof data === 'object') {
        if (data.error) {
          return res.status(404).json({ 
            success: false, 
            error: data.error || 'Token not found on CoinGecko' 
          });
        }
        
        // Check if it's a wrapped token
        const platforms = data.platforms || {};
        const isWrapped = Object.keys(platforms).length > 1 || (platforms.ethereum && platforms.solana);
        const wrappedAddress = platforms.ethereum || platforms.bsc || platforms.polygon || null;
        
        const result = {
          symbol: data.symbol || '',
          name: data.name || '',
          logoURI: data.image?.large || data.image?.small || '',
          price: {
            usd: data.market_data?.current_price?.usd || 0
          },
          marketCap: data.market_data?.market_cap?.usd || 0,
          volume24h: data.market_data?.total_volume?.usd || 0,
          priceChange24h: data.market_data?.price_change_percentage_24h || 0,
          description: data.description?.en || '',
          website: data.links?.homepage?.[0] || '',
          twitter: data.links?.twitter_screen_name ? `https://twitter.com/${data.links.twitter_screen_name}` : '',
          telegram: data.links?.telegram_channel_identifier ? `https://t.me/${data.links.telegram_channel_identifier}` : '',
          platforms: platforms,
          isWrapped: isWrapped,
          wrappedTokenAddress: wrappedAddress,
          history: {
            ath: {
              value: data.market_data?.ath?.usd || 0,
              unixTime: data.market_data?.ath_date?.usd ? new Date(data.market_data.ath_date.usd).getTime() / 1000 : null
            }
          },
          decimals: data.detail_platforms?.solana?.decimal_place || 9,
        };
        
        return res.status(200).json({ success: true, data: result });
      }
    }
    
    // Handle DexScreener API response
    if (endpoint === 'dexscreener') {
      if (data && typeof data === 'object') {
        if (data.pairs && Array.isArray(data.pairs) && data.pairs.length > 0) {
          // Get the most liquid pair
          const pair = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
          
          const result = {
            symbol: pair.baseToken?.symbol || '',
            name: pair.baseToken?.name || '',
            logoURI: pair.baseToken?.logoURI || pair.baseToken?.logo || '',
            price: {
              usd: parseFloat(pair.priceUsd) || 0
            },
            priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            liquidity: parseFloat(pair.liquidity?.usd) || 0,
            dex: pair.dexId || '',
            pairAddress: pair.pairAddress || '',
            marketCap: parseFloat(pair.fdv) || 0,
            website: pair.info?.websiteUrl || '',
            twitter: pair.info?.twitterUrl || '',
            telegram: pair.info?.telegramUrl || '',
            description: pair.info?.description || '',
            history: {
              ath: {
                value: parseFloat(pair.athPrice) || 0,
                unixTime: pair.athDate ? new Date(pair.athDate).getTime() / 1000 : null
              }
            },
          };
          
          return res.status(200).json({ success: true, data: result });
        } else {
          return res.status(404).json({ 
            success: false, 
            error: 'No trading pairs found for this token' 
          });
        }
      }
    }
    
    // Handle Pump.fun API response
    if (endpoint === 'pumpfun') {
      if (data && typeof data === 'object') {
        // Pump.fun API structure may vary
        const result = {
          symbol: data.symbol || data.tokenSymbol || '',
          name: data.name || data.tokenName || data.displayName || '',
          decimals: data.decimals || 9,
          logoURI: data.image || data.logo || data.logoURI || data.imageUrl || '',
          price: { usd: data.priceUsd || data.price || 0 },
          history: { ath: { value: data.ath || data.allTimeHigh || 0, unixTime: null } },
          platform: 'pump.fun',
          website: data.website || data.url || '',
          twitter: data.twitter || data.twitterUrl || '',
          telegram: data.telegram || data.telegramUrl || '',
          description: data.description || '',
        };
        return res.status(200).json({ success: true, data: result });
      }
      // If pump.fun doesn't have the token, return empty data (don't error)
      return res.status(200).json({ 
        success: true, 
        data: {
          symbol: '',
          name: '',
          decimals: 9,
          logoURI: '',
          price: { usd: 0 },
          history: { ath: { value: 0, unixTime: null } },
        }
      });
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

