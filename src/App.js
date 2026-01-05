import React, { useState } from 'react';
import { Search, TrendingDown, TrendingUp } from 'lucide-react';

const SolanaAnalyzer = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Backend URL configurable via environment variable, defaults to production Vercel URL
  const backendUrl = process.env.REACT_APP_API_URL || 'https://jeeter-backend.vercel.app/api/proxy';

  const analyzeSoldTokens = (transactions) => {
    const tokenMap = {};
    transactions.forEach(tx => {
      if (!tx.tokenTransfers) return;
      tx.tokenTransfers.forEach(transfer => {
        const mint = transfer.mint;
        if (!tokenMap[mint]) {
          tokenMap[mint] = {
            mint,
            symbol: transfer.tokenSymbol || 'Unknown',
            name: transfer.tokenName || 'Unknown Token',
            totalBought: 0,
            totalSold: 0,
            avgBuyPrice: 0,
            avgSellPrice: 0,
            buyCount: 0,
            sellCount: 0,
          };
        }
        const amount = transfer.tokenAmount;
        const priceUsd = transfer.priceUsd || 0;
        if (transfer.fromUserAccount) {
          tokenMap[mint].totalSold += amount;
          tokenMap[mint].avgSellPrice = (tokenMap[mint].avgSellPrice * tokenMap[mint].sellCount + priceUsd) / (tokenMap[mint].sellCount + 1);
          tokenMap[mint].sellCount += 1;
        } else {
          tokenMap[mint].totalBought += amount;
          tokenMap[mint].avgBuyPrice = (tokenMap[mint].avgBuyPrice * tokenMap[mint].buyCount + priceUsd) / (tokenMap[mint].buyCount + 1);
          tokenMap[mint].buyCount += 1;
        }
      });
    });
    return Object.values(tokenMap).filter(t => t.totalSold > 0);
  };

  const fetchWalletData = async () => {
    if (!walletAddress.trim()) {
      setError('Please enter a valid Solana wallet address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:57',message:'Fetching wallet data',data:{backendUrl,walletAddress},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const solscanResponse = await fetch(`${backendUrl}?endpoint=solscan&wallet=${walletAddress}`);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:60',message:'Solscan response received',data:{ok:solscanResponse.ok,status:solscanResponse.status,statusText:solscanResponse.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (!solscanResponse.ok) throw new Error('Failed to fetch wallet data from Solscan');
      
      const solscanData = await solscanResponse.json();
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:65',message:'Solscan data parsed',data:{hasSuccess:'success' in solscanData,successValue:solscanData.success,hasData:'data' in solscanData,dataIsArray:Array.isArray(solscanData.data),dataLength:solscanData.data?.length,dataType:typeof solscanData.data,dataKeys:Object.keys(solscanData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (!solscanData.success || !Array.isArray(solscanData.data)) throw new Error('No data found');
      
      const transactions = solscanData.data;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:66',message:'Transactions extracted',data:{transactionCount:transactions.length,firstTxHasTokenTransfers:transactions[0]?.tokenTransfers !== undefined,firstTxKeys:transactions[0] ? Object.keys(transactions[0]) : []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const soldTokens = analyzeSoldTokens(transactions);

      const enrichedTokens = await Promise.all(
        soldTokens.map(async (token) => {
          try {
            const birdeyeResponse = await fetch(`${backendUrl}?endpoint=birdeye&mint=${token.mint}`);
            
            if (birdeyeResponse.ok) {
              const birdeyeData = await birdeyeResponse.json();
              
              if (birdeyeData.success && birdeyeData.data) {
                const tokenInfo = birdeyeData.data;
                const currentPrice = tokenInfo.price?.usd || token.avgSellPrice;
                const ath = tokenInfo.history?.ath?.value || currentPrice * 1.5;
                const athMultiplier = ath / (token.avgSellPrice || 0.000001);
                const missedGains = (ath - token.avgSellPrice) * token.totalSold;
                return { 
                  ...token, 
                  currentPrice, 
                  ath, 
                  athMultiplier: Math.max(1, athMultiplier), 
                  missedGains: Math.max(0, missedGains) 
                };
              }
            }
          } catch (e) {
            console.log('BirdEye error:', e);
          }
          return { 
            ...token, 
            currentPrice: token.avgSellPrice, 
            ath: token.avgSellPrice * 1.2, 
            athMultiplier: 1.2, 
            missedGains: 0 
          };
        })
      );

      const totalMissedGains = enrichedTokens.reduce((sum, t) => sum + (t.missedGains || 0), 0);
      const avgMultiplierMissed = enrichedTokens.length > 0 ? enrichedTokens.reduce((sum, t) => sum + (t.athMultiplier || 1), 0) / enrichedTokens.length : 0;
      const jeetScore = Math.min(100, Math.max(0, (avgMultiplierMissed * 20) + (enrichedTokens.length * 5)));
      const heldTokens = enrichedTokens.filter(t => t.totalBought > t.totalSold);
      const diamondHandsGains = heldTokens.reduce((sum, t) => sum + Math.max(0, (t.currentPrice - t.avgBuyPrice) * (t.totalBought - t.totalSold)), 0);

      setResults({
        walletAddress,
        soldTokens: enrichedTokens,
        heldTokens,
        jeetScore: Math.round(jeetScore),
        totalMissedGains: Math.round(totalMissedGains),
        diamondHandsGains: Math.round(diamondHandsGains),
        transactionCount: transactions.length,
      });
    } catch (err) {
      setError(err.message || 'Error analyzing wallet. Try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getJeetRating = (score) => {
    if (score > 80) return '🚀 ULTIMATE JEET';
    if (score > 60) return '📉 MAJOR JEET';
    if (score > 40) return '😬 PAPER HANDS';
    if (score > 20) return '💎 MOSTLY HODL';
    return '🙌 DIAMOND HANDS';
  };

  const getSolscanUrl = (address, type = 'account') => `https://solscan.io/${type}/${address}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="border-b border-purple-500/20 bg-black/40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-4xl font-bold text-white mb-2">Jeeter</h1>
          <p className="text-purple-300">Powered by BirdEye & Solscan | Discover your trading regrets & hidden gains</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-gray-800/50 border border-purple-500/20 rounded-lg p-6 mb-8 backdrop-blur">
          <label className="block text-sm font-semibold text-purple-300 mb-3">Solana Wallet Address</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && fetchWalletData()}
              placeholder="Enter your Solana wallet address..."
              className="flex-1 bg-gray-900 border border-purple-500/30 rounded px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={fetchWalletData}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-semibold px-6 py-3 rounded flex items-center gap-2 transition"
            >
              <Search size={20} />
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
          <p className="text-gray-400 text-xs mt-3">Data sourced from Solscan and BirdEye. Processing may take 5-15 seconds.</p>
        </div>

        {results && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-red-900/30 to-red-900/10 border border-red-500/30 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingDown className="text-red-400" size={24} />
                  <h3 className="text-xl font-bold text-white">Jeet Score</h3>
                </div>
                <div className="text-5xl font-bold text-red-400 mb-2">{results.jeetScore}</div>
                <p className="text-red-300 text-lg font-semibold mb-4">{getJeetRating(results.jeetScore)}</p>
                <p className="text-red-200 text-sm">You missed <span className="font-bold text-red-400">${results.totalMissedGains.toLocaleString()}</span> in gains</p>
              </div>

              <div className="bg-gradient-to-br from-green-900/30 to-green-900/10 border border-green-500/30 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="text-green-400" size={24} />
                  <h3 className="text-xl font-bold text-white">Diamond Hands</h3>
                </div>
                <div className="text-5xl font-bold text-green-400 mb-2">${results.diamondHandsGains.toLocaleString()}</div>
                <p className="text-green-300 text-lg font-semibold mb-4">💎 Current Holdings Gains</p>
                <p className="text-green-200 text-sm">From <span className="font-bold text-green-400">{results.heldTokens.length}</span> tokens still held</p>
              </div>
            </div>

            <div className="border-b border-purple-500/20">
              <div className="flex gap-6">
                {['overview', 'sold', 'held'].map((tab) => (
                  <button 
                    key={tab} 
                    onClick={() => setActiveTab(tab)} 
                    className={`px-4 py-3 font-semibold transition ${activeTab === tab ? 'text-purple-400 border-b-2 border-purple-500' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {tab === 'overview' && 'Overview'} 
                    {tab === 'sold' && `Sold (${results.soldTokens.length})`} 
                    {tab === 'held' && `Held (${results.heldTokens.length})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 border border-purple-500/20 rounded-lg p-6 backdrop-blur">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-900/50 rounded p-4">
                      <p className="text-gray-400 text-sm mb-1">Total Transactions</p>
                      <p className="text-2xl font-bold text-white">{results.transactionCount}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded p-4">
                      <p className="text-gray-400 text-sm mb-1">Tokens Sold</p>
                      <p className="text-2xl font-bold text-red-400">{results.soldTokens.length}</p>
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded p-4">
                    <a 
                      href={getSolscanUrl(results.walletAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 font-semibold"
                    >
                      View Full Wallet on Solscan →
                    </a>
                  </div>
                </div>
              )}

              {activeTab === 'sold' && (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {results.soldTokens.length === 0 ? (
                    <p className="text-gray-400">No sold tokens found</p>
                  ) : (
                    results.soldTokens.map((token) => (
                      <div key={token.mint} className="bg-gray-900/50 rounded p-4 border border-red-500/20">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-white">{token.symbol}</p>
                            <p className="text-gray-400 text-sm">{token.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-red-400 font-bold">-${(token.missedGains || 0).toLocaleString()}</p>
                            <p className="text-red-300 text-sm">missed</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                          <div>
                            <p className="text-gray-500">Sold Price</p>
                            <p className="text-white font-semibold">${token.avgSellPrice.toFixed(6)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">ATH</p>
                            <p className="text-white font-semibold">${token.ath.toFixed(6)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Amount Sold</p>
                            <p className="text-white font-semibold">{token.totalSold.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Missed Multiplier</p>
                            <p className="text-red-400 font-bold">{token.athMultiplier.toFixed(2)}x</p>
                          </div>
                        </div>
                        <a 
                          href={getSolscanUrl(token.mint, 'token')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 text-xs"
                        >
                          View on Solscan →
                        </a>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'held' && (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {results.heldTokens.length === 0 ? (
                    <p className="text-gray-400">No held tokens found</p>
                  ) : (
                    results.heldTokens.map((token) => (
                      <div key={token.mint} className="bg-gray-900/50 rounded p-4 border border-green-500/20">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-white">{token.symbol}</p>
                            <p className="text-gray-400 text-sm">{token.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-green-400 font-bold">+${Math.max(0, (token.currentPrice - token.avgBuyPrice) * (token.totalBought - token.totalSold)).toLocaleString()}</p>
                            <p className="text-green-300 text-sm">current gain</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                          <div>
                            <p className="text-gray-500">Avg Buy Price</p>
                            <p className="text-white font-semibold">${token.avgBuyPrice.toFixed(6)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Current Price</p>
                            <p className="text-white font-semibold">${token.currentPrice.toFixed(6)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Tokens Held</p>
                            <p className="text-white font-semibold">{(token.totalBought - token.totalSold).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Multiplier</p>
                            <p className="text-green-400 font-bold">{(token.currentPrice / (token.avgBuyPrice || 0.000001)).toFixed(2)}x</p>
                          </div>
                        </div>
                        <a 
                          href={getSolscanUrl(token.mint, 'token')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 text-xs"
                        >
                          View on Solscan →
                        </a>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="bg-gray-900/30 border border-gray-700/30 rounded-lg p-4">
              <p className="text-gray-400 text-xs">
                <span className="font-semibold">Data Sources:</span> Transactions from Solscan, Token data (prices, ATH) from BirdEye. Real-time data.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SolanaAnalyzer;
