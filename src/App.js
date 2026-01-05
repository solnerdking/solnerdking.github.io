import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import GlassCard from './components/GlassCard';

const SolanaAnalyzer = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('paperhand');
  const [selectedToken, setSelectedToken] = useState(null);
  const [expandedTokens, setExpandedTokens] = useState(new Set());

  const toggleTokenExpand = (mint) => {
    setExpandedTokens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mint)) {
        newSet.delete(mint);
      } else {
        newSet.add(mint);
      }
      return newSet;
    });
  };

  // Backend URL configurable via environment variable
  const backendUrl = process.env.REACT_APP_API_URL || 'https://jeeter-backend.vercel.app/api/proxy';

  // Enhanced analysis function - tracks ALL tokens
  const analyzeAllTokens = (transactions) => {
    const tokenMap = {};
    
    transactions.forEach(tx => {
      if (!tx.tokenTransfers) return;
      const txTimestamp = tx.timestamp || tx.blockTime || Date.now() / 1000;
      const txDate = new Date(txTimestamp * 1000);
      
      tx.tokenTransfers.forEach(transfer => {
        const mint = transfer.mint;
        if (!tokenMap[mint]) {
          tokenMap[mint] = {
            mint,
            symbol: transfer.tokenSymbol || 'Unknown',
            name: transfer.tokenName || 'Unknown Token',
            totalBought: 0,
            totalSold: 0,
            currentHeld: 0,
            avgBuyPrice: 0,
            avgSellPrice: 0,
            bestBuyPrice: Infinity,
            worstSellPrice: Infinity,
            buyCount: 0,
            sellCount: 0,
            totalTransactions: 0,
            buyDates: [],
            sellDates: [],
            firstBuyDate: null,
            lastBuyDate: null,
            firstSellDate: null,
            lastSellDate: null,
            buyPrices: [],
            sellPrices: [],
          };
        }
        
        const amount = transfer.tokenAmount || 0;
        const priceUsd = transfer.priceUsd || 0;
        
        if (transfer.fromUserAccount) {
          // Selling
          tokenMap[mint].totalSold += amount;
          tokenMap[mint].avgSellPrice = tokenMap[mint].sellCount === 0 
            ? priceUsd 
            : (tokenMap[mint].avgSellPrice * tokenMap[mint].sellCount + priceUsd) / (tokenMap[mint].sellCount + 1);
          tokenMap[mint].sellCount += 1;
          tokenMap[mint].sellDates.push(txDate);
          tokenMap[mint].sellPrices.push(priceUsd);
          if (!tokenMap[mint].firstSellDate || txDate < tokenMap[mint].firstSellDate) {
            tokenMap[mint].firstSellDate = txDate;
          }
          if (!tokenMap[mint].lastSellDate || txDate > tokenMap[mint].lastSellDate) {
            tokenMap[mint].lastSellDate = txDate;
          }
          if (priceUsd > 0 && (tokenMap[mint].worstSellPrice === Infinity || priceUsd < tokenMap[mint].worstSellPrice)) {
            tokenMap[mint].worstSellPrice = priceUsd;
          }
        } else {
          // Buying
          tokenMap[mint].totalBought += amount;
          tokenMap[mint].avgBuyPrice = tokenMap[mint].buyCount === 0
            ? priceUsd
            : (tokenMap[mint].avgBuyPrice * tokenMap[mint].buyCount + priceUsd) / (tokenMap[mint].buyCount + 1);
          tokenMap[mint].buyCount += 1;
          tokenMap[mint].buyDates.push(txDate);
          tokenMap[mint].buyPrices.push(priceUsd);
          if (!tokenMap[mint].firstBuyDate || txDate < tokenMap[mint].firstBuyDate) {
            tokenMap[mint].firstBuyDate = txDate;
          }
          if (!tokenMap[mint].lastBuyDate || txDate > tokenMap[mint].lastBuyDate) {
            tokenMap[mint].lastBuyDate = txDate;
          }
          if (priceUsd > 0 && priceUsd < tokenMap[mint].bestBuyPrice) {
            tokenMap[mint].bestBuyPrice = priceUsd;
          }
        }
        tokenMap[mint].totalTransactions += 1;
      });
    });

    // Calculate current held and determine status
    return Object.values(tokenMap).map(token => {
      token.currentHeld = Math.max(0, token.totalBought - token.totalSold);
      token.totalVolumeTraded = token.totalBought + token.totalSold;
      token.bestBuyPrice = token.bestBuyPrice === Infinity ? token.avgBuyPrice : token.bestBuyPrice;
      token.worstSellPrice = token.worstSellPrice === Infinity ? token.avgSellPrice : token.worstSellPrice;
      
      // Determine status
      if (token.totalSold === 0) {
        token.status = 'never_sold';
      } else if (token.currentHeld === 0) {
        token.status = 'sold';
      } else if (token.totalSold > 0 && token.currentHeld > 0) {
        token.status = 'partial';
      } else {
        token.status = 'held';
      }
      
      return token;
    });
  };

  // Calculate comprehensive metrics for a token
  const calculateTokenMetrics = (token) => {
    const totalCost = token.totalBought * token.avgBuyPrice;
    const actualProceeds = token.totalSold * token.avgSellPrice;
    const currentValue = token.currentHeld * (token.currentPrice || 0);
    
    // ROI
    const roi = totalCost > 0 ? ((actualProceeds - totalCost) / totalCost) * 100 : 0;
    
    // What if held to current
    const whatIfCurrentValue = token.totalBought * (token.currentPrice || token.avgBuyPrice);
    const missedGainsCurrent = whatIfCurrentValue - actualProceeds;
    const roiIfHeldCurrent = totalCost > 0 ? ((whatIfCurrentValue - totalCost) / totalCost) * 100 : 0;
    
    // What if held to ATH
    const whatIfATHValue = token.totalBought * (token.ath || token.currentPrice || token.avgBuyPrice);
    const missedGainsATH = whatIfATHValue - actualProceeds;
    const roiIfHeldATH = totalCost > 0 ? ((whatIfATHValue - totalCost) / totalCost) * 100 : 0;
    
    // Time held
    let timeHeldDays = 0;
    if (token.firstBuyDate && token.lastSellDate) {
      timeHeldDays = differenceInDays(token.lastSellDate, token.firstBuyDate);
    } else if (token.firstBuyDate) {
      timeHeldDays = differenceInDays(new Date(), token.firstBuyDate);
    }
    
    // Price change
    const priceChange = token.avgBuyPrice > 0 
      ? ((token.currentPrice - token.avgBuyPrice) / token.avgBuyPrice) * 100 
      : 0;
    
    return {
      ...token,
      totalCost,
      actualProceeds,
      currentValue,
      roi,
      whatIfCurrentValue,
      missedGainsCurrent,
      roiIfHeldCurrent,
      whatIfATHValue,
      missedGainsATH,
      roiIfHeldATH,
      timeHeldDays,
      priceChange,
    };
  };

  const fetchWalletData = async () => {
    if (!walletAddress.trim()) {
      setError('Please enter a valid Solana wallet address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const heliusResponse = await fetch(`${backendUrl}?endpoint=helius&wallet=${walletAddress}`);
      
      if (!heliusResponse.ok) {
        const errorText = await heliusResponse.text().catch(() => 'Could not read error');
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText };
        }
        
        let errorMessage = errorData.error || errorData.message || 'Failed to fetch wallet data';
        if (heliusResponse.status === 403) {
          errorMessage = 'Helius API blocked the request. Please try again in a few minutes.';
        } else if (heliusResponse.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (heliusResponse.status === 504) {
          errorMessage = 'Request timed out. Please try again.';
        }
        
        throw new Error(errorMessage);
      }
      
      const heliusData = await heliusResponse.json();
      
      if (!heliusData.success || !Array.isArray(heliusData.data)) {
        throw new Error('No data found');
      }
      
      const transactions = heliusData.data;
      const allTokens = analyzeAllTokens(transactions);

      // Enrich tokens with BirdEye data
      const enrichedTokens = await Promise.all(
        allTokens.map(async (token) => {
          try {
            const birdeyeResponse = await fetch(`${backendUrl}?endpoint=birdeye&mint=${token.mint}`);
            
            if (birdeyeResponse.ok) {
              const birdeyeData = await birdeyeResponse.json();
              
              if (birdeyeData.success && birdeyeData.data) {
                const tokenInfo = birdeyeData.data;
                return { 
                  ...token, 
                  currentPrice: tokenInfo.price?.usd || token.avgBuyPrice || 0,
                  ath: tokenInfo.history?.ath?.value || tokenInfo.price?.usd || token.avgBuyPrice || 0,
                  athDate: tokenInfo.history?.ath?.unixTime ? new Date(tokenInfo.history.ath.unixTime * 1000) : null,
                };
              }
            }
          } catch (e) {
            console.log('BirdEye error:', e);
          }
          return { 
            ...token, 
            currentPrice: token.avgBuyPrice || 0,
            ath: (token.avgBuyPrice || 0) * 1.2,
            athDate: null,
          };
        })
      );

      // Calculate all metrics
      const tokensWithMetrics = enrichedTokens.map(calculateTokenMetrics);

      // Calculate summary statistics
      const totalCost = tokensWithMetrics.reduce((sum, t) => sum + (t.totalCost || 0), 0);
      const actualProceeds = tokensWithMetrics.reduce((sum, t) => sum + (t.actualProceeds || 0), 0);
      const totalCurrentValue = tokensWithMetrics.reduce((sum, t) => sum + (t.currentValue || 0), 0);
      const totalWhatIfCurrent = tokensWithMetrics.reduce((sum, t) => sum + (t.whatIfCurrentValue || 0), 0);
      const totalWhatIfATH = tokensWithMetrics.reduce((sum, t) => sum + (t.whatIfATHValue || 0), 0);
      const totalMissedGainsCurrent = tokensWithMetrics.reduce((sum, t) => sum + (t.missedGainsCurrent || 0), 0);
      const totalMissedGainsATH = tokensWithMetrics.reduce((sum, t) => sum + (t.missedGainsATH || 0), 0);
      const avgROI = tokensWithMetrics.length > 0 
        ? tokensWithMetrics.reduce((sum, t) => sum + (t.roi || 0), 0) / tokensWithMetrics.length 
        : 0;
      const avgROIIfHeld = tokensWithMetrics.length > 0
        ? tokensWithMetrics.reduce((sum, t) => sum + (t.roiIfHeldCurrent || 0), 0) / tokensWithMetrics.length
        : 0;

      // Find best/worst performers
      const bestPerformer = tokensWithMetrics.reduce((best, token) => 
        (token.roiIfHeldCurrent || 0) > (best.roiIfHeldCurrent || 0) ? token : best, 
        tokensWithMetrics[0] || {}
      );
      const worstPerformer = tokensWithMetrics.reduce((worst, token) => 
        (token.roiIfHeldCurrent || 0) < (worst.roiIfHeldCurrent || 0) ? token : worst, 
        tokensWithMetrics[0] || {}
      );
      const biggestMiss = tokensWithMetrics.reduce((biggest, token) => 
        (token.missedGainsCurrent || 0) > (biggest.missedGainsCurrent || 0) ? token : biggest, 
        tokensWithMetrics[0] || {}
      );

      setResults({
        walletAddress,
        allTokens: tokensWithMetrics,
        summary: {
          totalCost,
          actualProceeds,
          totalCurrentValue,
          totalWhatIfCurrent,
          totalWhatIfATH,
          totalMissedGainsCurrent,
          totalMissedGainsATH,
          avgROI,
          avgROIIfHeld,
          bestPerformer,
          worstPerformer,
          biggestMiss,
        transactionCount: transactions.length,
          totalTokens: tokensWithMetrics.length,
        },
      });
    } catch (err) {
      setError(err.message || 'Error analyzing wallet. Try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort tokens
  const filteredAndSortedTokens = useMemo(() => {
    if (!results) return [];
    
    let filtered = results.allTokens;
    
    // Apply tab filter
    switch (activeTab) {
      case 'paperhand':
        filtered = filtered.filter(t => t.status === 'sold');
        break;
      case 'roundtrip':
        filtered = filtered.filter(t => t.status === 'partial');
        break;
      case 'gained':
        filtered = filtered.filter(t => t.status === 'held' || t.status === 'never_sold');
        break;
      default:
        // Show all
        break;
    }
    
    // Sort by missed gains (descending)
    filtered.sort((a, b) => {
      const aVal = a.missedGainsCurrent || 0;
      const bVal = b.missedGainsCurrent || 0;
      return bVal - aVal;
    });
    
    return filtered;
  }, [results, activeTab]);

  // Get token image URL (placeholder for now - can be enhanced with API)
  const getTokenImageUrl = (mint) => {
    // Use a placeholder service or token image API
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(mint.slice(0, 2))}&background=22c55e&color=fff&size=128&bold=true`;
  };

  const tabs = [
    { id: 'paperhand', label: 'Paperhand' },
    { id: 'roundtrip', label: 'Roundtrip' },
    { id: 'gained', label: 'Gained' },
  ];

  return (
    <div className="min-h-screen animate-fade-in bg-[#1a1a1a]">
      {/* Header */}
      <div className="border-b border-[#404040] bg-[#1a1a1a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-white text-2xl font-bold">Ph</span>
              <span className="text-white text-xl">paperhands .gm.ai</span>
              <span className="text-gray-500 text-sm ml-2">BETA</span>
            </div>
            <button
              onClick={fetchWalletData}
              disabled={loading}
              className="bg-[#2a2a2a] border border-[#404040] text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:border-green-500 transition-all disabled:opacity-50"
            >
              <Search size={18} />
              {loading ? 'Analyzing...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search Input */}
        {!results && (
          <GlassCard className="p-6 mb-6">
            <label className="block text-sm font-semibold text-gray-300 mb-3">Solana Wallet Address</label>
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && fetchWalletData()}
              placeholder="Enter your Solana wallet address..."
                  className="w-full bg-[#1a1a1a] border border-[#404040] rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-all"
            />
              </div>
            <button
              onClick={fetchWalletData}
              disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold px-8 py-3 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search size={20} />
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
            {error && (
              <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
                <p className="text-red-300 text-sm font-medium">{error}</p>
              </div>
            )}
            <p className="text-gray-500 text-xs mt-3">Data sourced from Helius and BirdEye. Processing may take 10-30 seconds.</p>
          </GlassCard>
        )}

        {/* Search bar when results are shown */}
        {results && (
          <div className="mb-6">
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchWalletData()}
                  placeholder="Enter wallet address..."
                  className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-all text-sm"
                />
              </div>
              <button
                onClick={fetchWalletData}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 text-sm"
              >
                <Search size={18} />
                {loading ? 'Analyzing...' : 'Search'}
              </button>
            </div>
        </div>
        )}

        {results && (
          <div className="space-y-6 animate-fade-in">
            {/* Navigation Tabs */}
            <div className="flex gap-4 border-b border-[#404040]">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                    activeTab === tab.id
                      ? 'text-green-500 border-green-500'
                      : 'text-gray-400 border-transparent hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Summary - Large Green Text */}
            {filteredAndSortedTokens.length > 0 && (
              <div className="mb-6">
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-gray-400 text-sm mb-2">Total Paperhanded</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-green-500 text-5xl font-bold">
                        ${Math.round(results.summary.totalMissedGainsCurrent || 0).toLocaleString()}
                      </span>
                      <span className="text-gray-500 text-lg">
                        ({filteredAndSortedTokens.length} tokens)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Details Grid */}
            {filteredAndSortedTokens.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <GlassCard className="p-4">
                  <p className="text-gray-400 text-xs mb-2">Bought with</p>
                  <p className="text-white text-lg font-semibold">
                    {Math.round(results.summary.totalCost || 0).toLocaleString()}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    (${Math.round(results.summary.totalCost || 0).toLocaleString()})
                  </p>
                </GlassCard>
                <GlassCard className="p-4">
                  <p className="text-gray-400 text-xs mb-2">Sold for</p>
                  <p className="text-white text-lg font-semibold">
                    {Math.round(results.summary.actualProceeds || 0).toLocaleString()}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    (${Math.round(results.summary.actualProceeds || 0).toLocaleString()})
                  </p>
                </GlassCard>
                <GlassCard className="p-4">
                  <p className="text-gray-400 text-xs mb-2">Fumbled</p>
                  <p className="text-white text-lg font-semibold">
                    {Math.round(results.summary.totalMissedGainsCurrent || 0).toLocaleString()}
                  </p>
                </GlassCard>
                <GlassCard className="p-4">
                  <p className="text-gray-400 text-xs mb-2">Held for</p>
                  <p className="text-white text-lg font-semibold">
                    {filteredAndSortedTokens[0]?.timeHeldDays || 0} Days
                  </p>
                </GlassCard>
              </div>
            )}

            {/* Token Cards - Horizontal Scrollable Row */}
            <div className="overflow-x-auto pb-4 -mx-6 px-6">
              <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                {filteredAndSortedTokens.map((token, index) => {
                  const isSelected = selectedToken === token.mint;
                  const isExpanded = expandedTokens.has(token.mint);
                  const rankColor = index === 0 ? 'bg-green-500' : index === 1 ? 'bg-yellow-500' : 'bg-gray-600';
                  
                  return (
                    <GlassCard
                      key={token.mint}
                      selected={isSelected}
                      className="w-80 flex-shrink-0 p-6 cursor-pointer"
                      onClick={() => setSelectedToken(isSelected ? null : token.mint)}
                    >
                      {/* Ranking Number */}
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-8 h-8 ${rankColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                          {index + 1}
                        </div>
                      </div>
                      
                      {/* Token Image */}
                      <div className="flex items-center gap-4 mb-4">
                        <img
                          src={getTokenImageUrl(token.mint)}
                          alt={token.symbol}
                          className="w-20 h-20 rounded-lg object-cover bg-[#404040]"
                          onError={(e) => {
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol)}&background=22c55e&color=fff&size=128&bold=true`;
                          }}
                        />
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold text-white mb-1">{token.symbol}</h3>
                          <p className="text-gray-400 text-sm">{token.name}</p>
                        </div>
                      </div>
                      
                      {/* Value - Large Green Text */}
                      <div className="mb-3">
                        <p className="text-green-500 text-3xl font-bold">
                          ${Math.round(token.missedGainsCurrent || token.whatIfCurrentValue || 0).toLocaleString()}
                        </p>
                        <p className="text-gray-500 text-sm mt-1">
                          ({((token.roiIfHeldCurrent || 0).toFixed(2))}%)
                        </p>
                      </div>

                      {/* Quick Stats */}
                      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                        <div>
                          <p className="text-gray-500">Actual ROI</p>
                          <p className={`font-semibold ${(token.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(token.roi || 0).toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Current Value</p>
                          <p className="text-white font-semibold">
                            ${Math.round(token.currentValue || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">If Held (ATH)</p>
                          <p className="text-green-400 font-semibold">
                            ${Math.round(token.whatIfATHValue || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Held For</p>
                          <p className="text-white font-semibold">
                            {token.timeHeldDays || 0} days
                          </p>
                        </div>
                      </div>
                      
                      {/* Expand Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTokenExpand(token.mint);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-[#404040] hover:bg-[#505050] rounded-lg transition text-gray-300 text-sm mb-3"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        {isExpanded ? 'Show Less' : 'Show Details'}
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-[#404040] space-y-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-gray-500">Avg Buy Price</p>
                              <p className="text-white font-semibold">${(token.avgBuyPrice || 0).toFixed(6)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Current Price</p>
                              <p className="text-white font-semibold">${(token.currentPrice || 0).toFixed(6)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">ATH</p>
                              <p className="text-white font-semibold">${(token.ath || 0).toFixed(6)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Price Change</p>
                              <p className={`font-semibold ${(token.priceChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {(token.priceChange || 0).toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Total Bought</p>
                              <p className="text-white font-semibold">{(token.totalBought || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Total Sold</p>
                              <p className="text-white font-semibold">{(token.totalSold || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Currently Held</p>
                              <p className="text-white font-semibold">{(token.currentHeld || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Actual Proceeds</p>
                              <p className="text-white font-semibold">
                                ${Math.round(token.actualProceeds || 0).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          
                          {token.firstBuyDate && (
                            <div className="pt-2 border-t border-[#404040]">
                              <p className="text-gray-500 mb-1">Transaction Dates</p>
                              <div className="space-y-0.5 text-gray-400">
                                {token.firstBuyDate && (
                                  <p>First Buy: {format(token.firstBuyDate, 'MMM dd, yyyy')}</p>
                                )}
                                {token.lastBuyDate && (
                                  <p>Last Buy: {format(token.lastBuyDate, 'MMM dd, yyyy')}</p>
                                )}
                                {token.firstSellDate && (
                                  <p>First Sell: {format(token.firstSellDate, 'MMM dd, yyyy')}</p>
                                )}
                                {token.lastSellDate && (
                                  <p>Last Sell: {format(token.lastSellDate, 'MMM dd, yyyy')}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Additional Info */}
                      <div className="pt-3 border-t border-[#404040] text-xs text-gray-400">
                        <p>CA: {token.mint.slice(0, 4)}...{token.mint.slice(-4)}</p>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </div>

            {filteredAndSortedTokens.length === 0 && (
              <GlassCard className="p-12 text-center">
                <p className="text-gray-400 text-lg">No tokens found matching your filters.</p>
              </GlassCard>
            )}

            {/* Footer */}
            <GlassCard className="p-4">
              <p className="text-gray-400 text-xs text-center">
                <span className="font-semibold">Data Sources:</span> Transactions from Helius, Token data (prices, ATH) from BirdEye. Real-time analysis.
              </p>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
};

export default SolanaAnalyzer;
