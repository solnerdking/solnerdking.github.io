class CacheService {
  constructor() {
    this.cachePrefix = 'jitterhands_';
    this.defaultTTL = {
      walletAnalysis: 24 * 60 * 60 * 1000, // 24 hours
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

  // Set cached item
  set(key, data, ttl = null) {
    try {
      const expiry = ttl ? Date.now() + ttl : null;
      const item = {
        data,
        expiry,
        timestamp: Date.now(),
      };
      localStorage.setItem(this.cachePrefix + key, JSON.stringify(item));
    } catch (e) {
      console.error('Cache set error:', e);
      // If storage is full, clear old items
      if (e.name === 'QuotaExceededError') {
        this.clearOld();
        try {
          const expiry = ttl ? Date.now() + ttl : null;
          const item = { data, expiry, timestamp: Date.now() };
          localStorage.setItem(this.cachePrefix + key, JSON.stringify(item));
        } catch (e2) {
          console.error('Cache set failed after cleanup:', e2);
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

  // Clear expired items
  clearOld() {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (item.expiry && now > item.expiry) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // Invalid item, remove it
            localStorage.removeItem(key);
          }
        }
      });
    } catch (e) {
      console.error('Cache clearOld error:', e);
    }
  }

  // Cache wallet analysis
  cacheWalletAnalysis(walletAddress, data) {
    const key = `wallet_${walletAddress}`;
    this.set(key, data, this.defaultTTL.walletAnalysis);
  }

  // Get cached wallet analysis
  getCachedWalletAnalysis(walletAddress) {
    const key = `wallet_${walletAddress}`;
    return this.get(key);
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

