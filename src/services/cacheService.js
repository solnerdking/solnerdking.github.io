class CacheService {
  constructor() {
    this.cachePrefix = 'jitterhands_';
    this.defaultTTL = {
      walletAnalysis: 7 * 24 * 60 * 60 * 1000, // 7 days (increased from 24 hours for better caching)
      tokenMetadata: 7 * 24 * 60 * 60 * 1000, // 7 days
      prices: 60 * 1000, // 1 minute
    };
  }

  // Get cached item
  get(key) {
    try {
      const item = localStorage.getItem(this.cachePrefix + key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      const now = Date.now();

      // Check if expired
      if (parsed.expiry && now > parsed.expiry) {
        this.remove(key);
        return null;
      }

      return parsed.data;
    } catch (e) {
      console.error('Cache get error:', e);
      return null;
    }
  }

  // Set cached item with size limit and compression
  set(key, data, ttl = null) {
    try {
      // For wallet analysis, store only essential data to reduce size
      let dataToStore = data;
      if (key.includes('wallet_') && data && typeof data === 'object') {
        // Store only essential fields, remove large transaction arrays
        dataToStore = {
          walletAddress: data.walletAddress,
          allTokens: (data.allTokens || []).map(token => ({
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            totalCost: token.totalCost,
            actualProceeds: token.actualProceeds,
            currentValue: token.currentValue,
            missedGainsCurrent: token.missedGainsCurrent,
            roiIfHeldCurrent: token.roiIfHeldCurrent,
            status: token.status,
            logoURI: token.logoURI,
            platform: token.platform,
            // Remove large arrays and detailed transaction data
          })),
          summary: data.summary,
          lastUpdated: data.lastUpdated,
          // Don't store full transactions array - it's too large
          transactionCount: data.transactions?.length || 0,
        };
      }
      
      const expiry = ttl ? Date.now() + ttl : null;
      const item = {
        data: dataToStore,
        expiry,
        timestamp: Date.now(),
      };
      
      const serialized = JSON.stringify(item);
      
      // Check size before storing (localStorage limit is usually ~5-10MB)
      if (serialized.length > 2 * 1024 * 1024) { // 2MB limit per item
        console.warn(`Cache item too large (${(serialized.length / 1024 / 1024).toFixed(2)}MB), skipping cache for ${key}`);
        return; // Don't cache if too large
      }
      
      localStorage.setItem(this.cachePrefix + key, serialized);
    } catch (e) {
      console.error('Cache set error:', e);
      // If storage is full, clear old items
      if (e.name === 'QuotaExceededError') {
        console.log('Storage quota exceeded, clearing old cache items...');
        this.clearOld();
        try {
          // Try again with reduced data
          let dataToStore = data;
          if (key.includes('wallet_') && data && typeof data === 'object') {
            dataToStore = {
              walletAddress: data.walletAddress,
              allTokens: (data.allTokens || []).slice(0, 50).map(token => ({
                mint: token.mint,
                symbol: token.symbol,
                totalCost: token.totalCost,
                actualProceeds: token.actualProceeds,
                missedGainsCurrent: token.missedGainsCurrent,
                status: token.status,
              })),
              summary: data.summary,
              lastUpdated: data.lastUpdated,
            };
          }
          
          const expiry = ttl ? Date.now() + ttl : null;
          const item = { data: dataToStore, expiry, timestamp: Date.now() };
          const serialized = JSON.stringify(item);
          
          if (serialized.length < 2 * 1024 * 1024) {
            localStorage.setItem(this.cachePrefix + key, serialized);
          } else {
            console.warn('Cache item still too large after reduction, skipping cache');
          }
        } catch (e2) {
          console.error('Cache set failed after cleanup:', e2);
          // Last resort: clear all cache and try once more
          if (e2.name === 'QuotaExceededError') {
            try {
              this.clear(); // Clear all cache
              console.log('Cleared all cache due to quota exceeded');
            } catch (e3) {
              console.error('Failed to clear cache:', e3);
            }
          }
        }
      }
    }
  }

  // Remove cached item
  remove(key) {
    try {
      localStorage.removeItem(this.cachePrefix + key);
    } catch (e) {
      console.error('Cache remove error:', e);
    }
  }

  // Clear all cache
  clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('Cache clear error:', e);
    }
  }

  // Clear expired items and implement LRU eviction
  clearOld() {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      const cacheItems = [];
      
      // First pass: remove expired items and collect cache items
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (item.expiry && now > item.expiry) {
              localStorage.removeItem(key);
            } else {
              cacheItems.push({ key, timestamp: item.timestamp || 0, size: localStorage.getItem(key).length });
            }
          } catch (e) {
            // Invalid item, remove it
            localStorage.removeItem(key);
          }
        }
      });
      
      // If still over quota, remove oldest items (LRU)
      if (cacheItems.length > 0) {
        // Sort by timestamp (oldest first)
        cacheItems.sort((a, b) => a.timestamp - b.timestamp);
        
        // Remove oldest 50% of items if we have more than 10 cached wallets
        const walletCaches = cacheItems.filter(item => item.key.includes('wallet_'));
        if (walletCaches.length > 10) {
          const toRemove = Math.floor(walletCaches.length / 2);
          walletCaches.slice(0, toRemove).forEach(item => {
            localStorage.removeItem(item.key);
          });
        }
      }
    } catch (e) {
      console.error('Cache clearOld error:', e);
    }
  }
  
  // Get storage size estimate
  getStorageSize() {
    try {
      let total = 0;
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          total += localStorage.getItem(key).length;
        }
      });
      return total;
    } catch (e) {
      return 0;
    }
  }

  // Cache wallet analysis with size management
  cacheWalletAnalysis(walletAddress, data) {
    // Limit number of cached wallets to prevent quota issues
    const maxCachedWallets = 5;
    const keys = Object.keys(localStorage);
    const walletKeys = keys.filter(k => k.startsWith(this.cachePrefix + 'wallet_'));
    
    // If we have too many cached wallets, remove oldest ones
    if (walletKeys.length >= maxCachedWallets) {
      const walletItems = walletKeys.map(key => {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          return { key, timestamp: item.timestamp || 0 };
        } catch (e) {
          return { key, timestamp: 0 };
        }
      }).sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest wallets (keep only maxCachedWallets - 1)
      const toRemove = walletItems.slice(0, walletItems.length - (maxCachedWallets - 1));
      toRemove.forEach(item => {
        localStorage.removeItem(item.key);
      });
    }
    
    const key = `wallet_${walletAddress}`;
    this.set(key, data, this.defaultTTL.walletAnalysis);
  }

  // Get cached wallet analysis
  getCachedWalletAnalysis(walletAddress) {
    const key = `wallet_${walletAddress}`;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cacheService.js:242',message:'getCachedWalletAnalysis',data:{walletAddress,key},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    const result = this.get(key);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cacheService.js:246',message:'getCachedWalletAnalysis result',data:{hasResult:!!result,walletAddress},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    return result;
  }

  // Cache token metadata
  cacheTokenMetadata(mint, data) {
    const key = `token_${mint}`;
    this.set(key, data, this.defaultTTL.tokenMetadata);
  }

  // Get cached token metadata
  getCachedTokenMetadata(mint) {
    const key = `token_${mint}`;
    return this.get(key);
  }

  // Cache price
  cachePrice(mint, price) {
    const key = `price_${mint}`;
    this.set(key, price, this.defaultTTL.prices);
  }

  // Get cached price
  getCachedPrice(mint) {
    const key = `price_${mint}`;
    return this.get(key);
  }
}

const cacheService = new CacheService();

export default cacheService;

