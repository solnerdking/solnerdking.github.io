class TokenListService {
  constructor() {
    this.cache = new Map();
    this.tokenListUrl = 'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json';
    this.tokenList = null;
    this.loading = false;
  }

  async loadTokenList() {
    if (this.tokenList) return this.tokenList;
    if (this.loading) {
      // Wait for existing load
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.tokenList) {
            clearInterval(checkInterval);
            resolve(this.tokenList);
          }
        }, 100);
      });
    }

    this.loading = true;
    try {
      const response = await fetch(this.tokenListUrl);
      const data = await response.json();
      this.tokenList = data.tokens || [];
      this.loading = false;
      return this.tokenList;
    } catch (error) {
      console.error('Error loading token list:', error);
      this.loading = false;
      return [];
    }
  }

  async getTokenMetadata(mint) {
    // Check cache first
    if (this.cache.has(mint)) {
      return this.cache.get(mint);
    }

    // Load token list if not loaded
    if (!this.tokenList) {
      await this.loadTokenList();
    }

    // Find token in list
    const token = this.tokenList.find(t => t.address === mint);
    
    if (token) {
      const metadata = {
        symbol: token.symbol,
        name: token.name,
        logoURI: token.logoURI,
        decimals: token.decimals,
        verified: true, // Tokens in official list are verified
      };
      this.cache.set(mint, metadata);
      return metadata;
    }

    // Return null if not found
    return null;
  }

  async getTokenLogo(mint) {
    const metadata = await this.getTokenMetadata(mint);
    return metadata?.logoURI || null;
  }

  isVerified(mint) {
    // This would need the token list loaded
    return this.tokenList?.some(t => t.address === mint) || false;
  }

  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
const tokenListService = new TokenListService();

export default tokenListService;

