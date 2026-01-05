class PriceService {
  constructor() {
    this.cache = new Map();
    this.subscribers = new Map();
    this.pollingIntervals = new Map();
    this.cacheTTL = 10000; // 10 seconds
    this.pollingInterval = 10000; // 10 seconds
    this.backendUrl = process.env.REACT_APP_API_URL || 'https://jeeter-backend.vercel.app/api/proxy';
  }

  // Subscribe to price updates for a token
  subscribe(mint, callback) {
    if (!this.subscribers.has(mint)) {
      this.subscribers.set(mint, new Set());
    }
    this.subscribers.get(mint).add(callback);

    // Start polling if not already started
    if (!this.pollingIntervals.has(mint)) {
      this.startPolling(mint);
    }

    // Return cached price immediately if available
    const cached = this.cache.get(mint);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      callback(cached.price);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(mint);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.stopPolling(mint);
          this.subscribers.delete(mint);
        }
      }
    };
  }

  // Start polling for a token
  startPolling(mint) {
    const fetchPrice = async () => {
      try {
        const response = await fetch(`${this.backendUrl}?endpoint=birdeye&mint=${mint}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const price = data.data.price?.usd || 
                         (typeof data.data.price === 'number' ? data.data.price : 0) || 0;
            
            // Update cache
            this.cache.set(mint, {
              price,
              timestamp: Date.now(),
            });

            // Notify subscribers
            const callbacks = this.subscribers.get(mint);
            if (callbacks) {
              callbacks.forEach(cb => cb(price));
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching price for ${mint}:`, error);
      }
    };

    // Fetch immediately
    fetchPrice();

    // Then poll at interval
    const interval = setInterval(fetchPrice, this.pollingInterval);
    this.pollingIntervals.set(mint, interval);
  }

  // Stop polling for a token
  stopPolling(mint) {
    const interval = this.pollingIntervals.get(mint);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(mint);
    }
  }

  // Batch fetch prices for multiple tokens
  async fetchBatchPrices(mints) {
    const promises = mints.map(async (mint) => {
      // Check cache first
      const cached = this.cache.get(mint);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return { mint, price: cached.price, fromCache: true };
      }

      try {
        const response = await fetch(`${this.backendUrl}?endpoint=birdeye&mint=${mint}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const price = data.data.price?.usd || 
                         (typeof data.data.price === 'number' ? data.data.price : 0) || 0;
            
            // Update cache
            this.cache.set(mint, {
              price,
              timestamp: Date.now(),
            });

            return { mint, price, fromCache: false };
          }
        }
      } catch (error) {
        console.error(`Error fetching price for ${mint}:`, error);
      }
      return { mint, price: 0, fromCache: false };
    });

    return Promise.all(promises);
  }

  // Get cached price
  getCachedPrice(mint) {
    const cached = this.cache.get(mint);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }
    return null;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
const priceService = new PriceService();

export default priceService;

