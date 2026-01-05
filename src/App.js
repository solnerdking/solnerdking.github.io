import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import GlassCard from './components/GlassCard';

const SolanaAnalyzer = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [expandedTokens, setExpandedTokens] = useState(new Set());
  const [selectedTokenFromDropdown, setSelectedTokenFromDropdown] = useState('');

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
    
    transactions.forEach((tx, txIndex) => {
      if (!tx.tokenTransfers) return;
      const txTimestamp = tx.timestamp || tx.blockTime || Date.now() / 1000;
      const txDate = new Date(txTimestamp * 1000);
      
      tx.tokenTransfers.forEach((transfer, transferIndex) => {
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
            transactions: [],
          };
        }
        
        const amount = transfer.tokenAmount || 0;
        const priceUsd = transfer.priceUsd || 0;
        
        // Store transaction details
        tokenMap[mint].transactions.push({
          date: txDate,
          type: transfer.fromUserAccount ? 'sell' : 'buy',
          amount,
          priceUsd,
          timestamp: txTimestamp,
        });
        
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
    const totalCost = token.totalBought * (token.avgBuyPrice || 0);
    const actualProceeds = token.totalSold * (token.avgSellPrice || 0);
    const currentValue = token.currentHeld * (token.currentPrice || 0);
    
    // ROI
    const roi = totalCost > 0 ? ((actualProceeds - totalCost) / totalCost) * 100 : 0;
    
    // What if held to current
    const whatIfCurrentValue = token.totalBought * (token.currentPrice || token.avgBuyPrice || 0);
    const missedGainsCurrent = whatIfCurrentValue - actualProceeds;
    const roiIfHeldCurrent = totalCost > 0 ? ((whatIfCurrentValue - totalCost) / totalCost) * 100 : 0;
    
    // What if held to ATH
    const whatIfATHValue = token.totalBought * (token.ath || token.currentPrice || token.avgBuyPrice || 0);
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

  // Calculate Jitter Score (0-100, higher = more jittery/paperhanded)
  const calculateJitterScore = (tokens) => {
    if (!tokens || tokens.length === 0) return 0;
    
    const soldTokens = tokens.filter(t => t.status === 'sold');
    const paperhandRatio = soldTokens.length / tokens.length;
    
    const avgHoldTime = tokens.reduce((sum, t) => sum + (t.timeHeldDays || 0), 0) / tokens.length;
    const holdTimeScore = Math.min(1, avgHoldTime / 30); // Normalize to 30 days max
    
    const totalMissedGains = tokens.reduce((sum, t) => sum + (t.missedGainsCurrent || 0), 0);
    const totalInvested = tokens.reduce((sum, t) => sum + (t.totalCost || 0), 0);
    const missedGainsRatio = totalInvested > 0 ? Math.min(1, totalMissedGains / totalInvested) : 0;
    
    // Calculate score: paperhand ratio (40%) + missed gains ratio (40%) + hold time (20%)
    const score = (paperhandRatio * 40) + (missedGainsRatio * 40) + ((1 - holdTimeScore) * 20);
    
    return Math.round(Math.min(100, Math.max(0, score)));
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

      // Enrich tokens with BirdEye data - use current price as fallback for historical prices
      const enrichedTokens = await Promise.all(
        allTokens.map(async (token) => {
          try {
            const birdeyeResponse = await fetch(`${backendUrl}?endpoint=birdeye&mint=${token.mint}`);
            
            if (birdeyeResponse.ok) {
              const birdeyeData = await birdeyeResponse.json();
              
              if (birdeyeData.success && birdeyeData.data) {
                const tokenInfo = birdeyeData.data;
                // Try multiple paths for price data
                const currentPrice = tokenInfo.price?.usd || 
                                   tokenInfo.price || 
                                   tokenInfo.data?.price?.usd ||
                                   tokenInfo.data?.price ||
                                   0;
                const ath = tokenInfo.history?.ath?.value || 
                          tokenInfo.ath?.value ||
                          tokenInfo.data?.history?.ath?.value ||
                          currentPrice;
                
                // If we have current price but no historical prices, use current price as estimate
                const estimatedBuyPrice = token.avgBuyPrice || currentPrice || 0;
                const estimatedSellPrice = token.avgSellPrice || currentPrice || 0;
                
                return { 
                  ...token, 
                  currentPrice: currentPrice || 0,
                  ath: ath || currentPrice || 0,
                  athDate: tokenInfo.history?.ath?.unixTime ? new Date(tokenInfo.history.ath.unixTime * 1000) : null,
                  // Update buy/sell prices if we have current price but no historical data
                  avgBuyPrice: estimatedBuyPrice,
                  avgSellPrice: estimatedSellPrice,
                };
              }
            }
          } catch (e) {
            console.log('BirdEye error:', e);
          }
          // Fallback: use current price estimate if available
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

      // Calculate Jitter Score
      const jitterScore = calculateJitterScore(tokensWithMetrics);

      // Get currently held tokens
      const currentlyHeld = tokensWithMetrics.filter(t => t.currentHeld > 0);

      // Categorize transactions
      const deposits = transactions.filter(tx => 
        tx.tokenTransfers?.some(tf => !tf.fromUserAccount)
      );
      const withdraws = transactions.filter(tx => 
        tx.tokenTransfers?.some(tf => tf.fromUserAccount)
      );
      const transfers = transactions.filter(tx => 
        tx.tokenTransfers?.some(tf => tf.fromUserAccount && tf.toUserAccount)
      );

      setResults({
        walletAddress,
        allTokens: tokensWithMetrics,
        transactions,
        currentlyHeld,
        deposits,
        withdraws,
        transfers,
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
          jitterScore,
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
        // Show all for dashboard
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

  // Get top 3 tokens and rest for dropdown
  const top3Tokens = useMemo(() => {
    return filteredAndSortedTokens.slice(0, 3);
  }, [filteredAndSortedTokens]);

  const restTokens = useMemo(() => {
    return filteredAndSortedTokens.slice(3);
  }, [filteredAndSortedTokens]);

  // Get selected token from dropdown
  const selectedTokenData = useMemo(() => {
    if (!selectedTokenFromDropdown) return null;
    return results?.allTokens.find(t => t.mint === selectedTokenFromDropdown);
  }, [selectedTokenFromDropdown, results]);

  // Get token image URL
  const getTokenImageUrl = (mint) => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(mint.slice(0, 2))}&background=22c55e&color=fff&size=128&bold=true`;
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'paperhand', label: 'Paperhand' },
    { id: 'roundtrip', label: 'Roundtrip' },
    { id: 'gained', label: 'Gained' },
  ];

  // Render token card component
  const renderTokenCard = (token, index, showRank = true) => {
    const isExpanded = expandedTokens.has(token.mint);
    const rankColor = index === 0 ? 'bg-green-500' : index === 1 ? 'bg-yellow-500' : 'bg-gray-600';
    
    return (
      <GlassCard
        key={token.mint}
        className="w-full md:w-80 flex-shrink-0 p-6"
      >
        {showRank && (
          <div className="flex justify-between items-start mb-4">
            <div className={`w-8 h-8 ${rankColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
              {index + 1}
            </div>
          </div>
        )}
        
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
        
        <div className="mb-3">
          <p className="text-green-500 text-3xl font-bold">
            ${Math.round(token.missedGainsCurrent || token.whatIfCurrentValue || 0).toLocaleString()}
          </p>
          <p className="text-gray-500 text-sm mt-1">
            ({((token.roiIfHeldCurrent || 0).toFixed(2))}%)
          </p>
        </div>

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
        
        <button
          onClick={() => toggleTokenExpand(token.mint)}
          className="w-full flex items-center justify-center gap-2 py-2 bg-[#404040] hover:bg-[#505050] rounded-lg transition text-gray-300 text-sm mb-3"
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {isExpanded ? 'Show Less' : 'Show Details'}
        </button>

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
        
        <div className="pt-3 border-t border-[#404040] text-xs text-gray-400">
          <p>CA: {token.mint.slice(0, 4)}...{token.mint.slice(-4)}</p>
        </div>
      </GlassCard>
    );
  };

  return (
    <div className="min-h-screen animate-fade-in bg-[#1a1a1a]">
      {/* Header */}
      <div className="border-b border-[#404040] bg-[#1a1a1a] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-white text-2xl font-bold">JH</span>
              <span className="text-white text-xl">JitterHands.fun</span>
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
            <div className="flex flex-col items-center mb-6">
              <img 
                src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                alt="Solana" 
                className="w-24 h-24 mb-4"
                onError={(e) => {
                  e.target.src = 'https://cryptologos.cc/logos/solana-sol-logo.png';
                }}
              />
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to JitterHands.fun</h2>
              <p className="text-gray-400 text-sm">Analyze your Solana wallet trading history</p>
            </div>
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

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Jitter Score */}
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-2">Jitter Score</p>
                      <p className="text-green-500 text-5xl font-bold">
                        {results.summary.jitterScore || 0}
                      </p>
                      <p className="text-gray-500 text-xs mt-2">
                        {results.summary.jitterScore >= 70 ? 'Highly Jittery' : 
                         results.summary.jitterScore >= 40 ? 'Moderately Jittery' : 
                         'Stable Trader'}
                      </p>
                    </div>
                  </div>
                </GlassCard>

                {/* Wallet Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Total Invested</p>
                    <p className="text-white text-lg font-semibold">
                      ${Math.round(results.summary.totalCost || 0).toLocaleString()}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Total Proceeds</p>
                    <p className="text-white text-lg font-semibold">
                      ${Math.round(results.summary.actualProceeds || 0).toLocaleString()}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Current Value</p>
                    <p className="text-green-400 text-lg font-semibold">
                      ${Math.round(results.summary.totalCurrentValue || 0).toLocaleString()}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Missed Gains</p>
                    <p className="text-red-400 text-lg font-semibold">
                      ${Math.round(results.summary.totalMissedGainsCurrent || 0).toLocaleString()}
                    </p>
                  </GlassCard>
                </div>

                {/* Currently Held Tokens */}
                <GlassCard className="p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Currently Held Tokens</h3>
                  {results.currentlyHeld.length > 0 ? (
                    <div className="space-y-3">
                      {results.currentlyHeld.map((token) => (
                        <div key={token.mint} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg">
                          <div className="flex items-center gap-3">
                            <img
                              src={getTokenImageUrl(token.mint)}
                              alt={token.symbol}
                              className="w-10 h-10 rounded"
                            />
                            <div>
                              <p className="text-white font-semibold">{token.symbol}</p>
                              <p className="text-gray-400 text-xs">{token.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-semibold">
                              {(token.currentHeld || 0).toFixed(2)}
                            </p>
                            <p className="text-green-400 text-sm">
                              ${Math.round(token.currentValue || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-4">No tokens currently held</p>
                  )}
                </GlassCard>

                {/* Transaction History */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <GlassCard className="p-4">
                    <h4 className="text-white font-semibold mb-3">Deposits</h4>
                    <p className="text-3xl font-bold text-green-400">{results.deposits.length}</p>
                    <p className="text-gray-500 text-xs mt-1">Total transactions</p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <h4 className="text-white font-semibold mb-3">Withdraws</h4>
                    <p className="text-3xl font-bold text-red-400">{results.withdraws.length}</p>
                    <p className="text-gray-500 text-xs mt-1">Total transactions</p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <h4 className="text-white font-semibold mb-3">Transfers</h4>
                    <p className="text-3xl font-bold text-blue-400">{results.transfers.length}</p>
                    <p className="text-gray-500 text-xs mt-1">Total transactions</p>
                  </GlassCard>
                </div>

                {/* Top 3 Tokens */}
                {top3Tokens.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">Top 3 Tokens</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {top3Tokens.map((token, index) => renderTokenCard(token, index, true))}
                    </div>
                  </div>
                )}

                {/* Rest of tokens dropdown */}
                {restTokens.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">Other Tokens</h3>
                    <select
                      value={selectedTokenFromDropdown}
                      onChange={(e) => setSelectedTokenFromDropdown(e.target.value)}
                      className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-green-500"
                    >
                      <option value="">Select a token to view details...</option>
                      {restTokens.map((token, index) => (
                        <option key={token.mint} value={token.mint}>
                          #{index + 4} {token.symbol} - ${Math.round(token.missedGainsCurrent || 0).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    {selectedTokenData && (
                      <div className="mt-4">
                        {renderTokenCard(selectedTokenData, restTokens.findIndex(t => t.mint === selectedTokenFromDropdown) + 3, false)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Other Tabs (Paperhand, Roundtrip, Gained) */}
            {activeTab !== 'dashboard' && (
              <>
                {/* Summary */}
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

                {/* Top 3 Tokens */}
                {top3Tokens.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">Top 3 Tokens</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {top3Tokens.map((token, index) => renderTokenCard(token, index, true))}
                    </div>
                  </div>
                )}

                {/* Rest of tokens dropdown */}
                {restTokens.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">Other Tokens</h3>
                    <select
                      value={selectedTokenFromDropdown}
                      onChange={(e) => setSelectedTokenFromDropdown(e.target.value)}
                      className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-green-500"
                    >
                      <option value="">Select a token to view details...</option>
                      {restTokens.map((token, index) => (
                        <option key={token.mint} value={token.mint}>
                          #{index + 4} {token.symbol} - ${Math.round(token.missedGainsCurrent || 0).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    {selectedTokenData && (
                      <div className="mt-4">
                        {renderTokenCard(selectedTokenData, restTokens.findIndex(t => t.mint === selectedTokenFromDropdown) + 3, false)}
                      </div>
                    )}
                  </div>
                )}

                {filteredAndSortedTokens.length === 0 && (
                  <GlassCard className="p-12 text-center">
                    <p className="text-gray-400 text-lg">No tokens found matching your filters.</p>
                  </GlassCard>
                )}
              </>
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
