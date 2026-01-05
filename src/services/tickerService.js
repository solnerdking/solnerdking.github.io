import priceService from './priceService';

class TickerService {
  constructor() {
    this.subscribers = new Set();
    this.tokens = [];
    this.prices = {};
    this.updateInterval = null;
  }

  // Subscribe to ticker updates
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Set tokens to track
  setTokens(tokens) {
    this.tokens = tokens.slice(0, 20); // Limit to top 20
    this.startUpdates();
  }

  // Start price updates
  startUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Fetch prices immediately
    this.updatePrices();

    // Then update every 10 seconds
    this.updateInterval = setInterval(() => {
      this.updatePrices();
    }, 10000);
  }

  // Update prices for all tracked tokens
  async updatePrices() {
    if (this.tokens.length === 0) return;

    const priceUpdates = await priceService.fetchBatchPrices(
      this.tokens.map(t => t.mint)
    );

    priceUpdates.forEach(({ mint, price }) => {
      this.prices[mint] = price;
    });

    // Notify subscribers
    this.subscribers.forEach(callback => {
      callback(this.prices);
    });
  }

  // Stop updates
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Get current prices
  getPrices() {
    return { ...this.prices };
  }
}

const tickerService = new TickerService();

export default tickerService;

