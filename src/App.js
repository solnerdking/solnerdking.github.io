import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { safeParseNumber, roundToDecimals } from './utils/numberFormatter';
import GlassCard from './components/GlassCard';
import DonationSupport from './components/DonationSupport';
import Leaderboard from './components/Leaderboard';
import SearchModal from './components/SearchModal';
import exportService from './utils/exportService';
import cacheService from './services/cacheService';
import statsService from './services/statsService';
import tokenListService from './services/tokenListService';
import { Share2, Copy, Check, ExternalLink, BarChart3, ArrowLeft } from 'lucide-react';

const SolanaAnalyzer = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('paperhands');
  const [searchQuery] = useState('');
  const [dateFilter] = useState('all');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState('');
  const [leaderboardWallets, setLeaderboardWallets] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [visitCount, setVisitCount] = useState(0);
  const [walletScanCount, setWalletScanCount] = useState(0);

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
            totalBoughtValue: 0, // Total USD value of all bought tokens
            totalSoldValue: 0, // Total USD value of all sold tokens
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
        
        // Get token amount - ensure it's a valid number
        const amount = Math.max(0, parseFloat(transfer.tokenAmount) || 0);
        
        // Get price in USD - validate it's a positive number
        let priceUsd = Math.max(0, parseFloat(transfer.priceUsd) || 0);
        
        // Note: If price is 0, it will be filled by BirdEye/DexScreener API later
        // We don't calculate price here to avoid inaccurate estimates
        
        // Store transaction details
        tokenMap[mint].transactions.push({
          date: txDate,
          type: transfer.fromUserAccount ? 'sell' : 'buy',
          amount,
          priceUsd,
          timestamp: txTimestamp,
        });
        
        if (transfer.fromUserAccount) {
          // Selling - only process if amount is valid
          if (amount > 0) {
          tokenMap[mint].totalSold += amount;
            // Calculate weighted average sell price (only use valid prices > 0)
            if (priceUsd > 0) {
              if (tokenMap[mint].sellCount === 0) {
                tokenMap[mint].avgSellPrice = priceUsd;
                tokenMap[mint].totalSoldValue = amount * priceUsd; // Track total USD value of sold tokens
              } else {
                // Proper weighted average: (sum of (amount * price)) / (sum of amounts)
                tokenMap[mint].totalSoldValue = (tokenMap[mint].totalSoldValue || 0) + (amount * priceUsd);
                tokenMap[mint].avgSellPrice = tokenMap[mint].totalSoldValue / tokenMap[mint].totalSold;
              }
              tokenMap[mint].sellPrices.push(priceUsd);
            }
          tokenMap[mint].sellCount += 1;
            tokenMap[mint].sellDates.push(txDate);
            if (!tokenMap[mint].firstSellDate || txDate < tokenMap[mint].firstSellDate) {
              tokenMap[mint].firstSellDate = txDate;
            }
            if (!tokenMap[mint].lastSellDate || txDate > tokenMap[mint].lastSellDate) {
              tokenMap[mint].lastSellDate = txDate;
            }
            if (priceUsd > 0 && (tokenMap[mint].worstSellPrice === Infinity || priceUsd < tokenMap[mint].worstSellPrice)) {
              tokenMap[mint].worstSellPrice = priceUsd;
            }
          }
        } else {
          // Buying - only process if amount is valid
          if (amount > 0) {
          tokenMap[mint].totalBought += amount;
            // Calculate weighted average buy price (only use valid prices > 0)
            if (priceUsd > 0) {
              if (tokenMap[mint].buyCount === 0) {
                tokenMap[mint].avgBuyPrice = priceUsd;
                tokenMap[mint].totalBoughtValue = amount * priceUsd; // Track total USD value of bought tokens
              } else {
                // Proper weighted average: (sum of (amount * price)) / (sum of amounts)
                tokenMap[mint].totalBoughtValue = (tokenMap[mint].totalBoughtValue || 0) + (amount * priceUsd);
                tokenMap[mint].avgBuyPrice = tokenMap[mint].totalBoughtValue / tokenMap[mint].totalBought;
              }
              tokenMap[mint].buyPrices.push(priceUsd);
            }
          tokenMap[mint].buyCount += 1;
            tokenMap[mint].buyDates.push(txDate);
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

  // Calculate comprehensive metrics for a token with validation
  const calculateTokenMetrics = (token) => {
    // Validate and sanitize inputs using safeParseNumber
    const totalBought = Math.max(0, safeParseNumber(token.totalBought));
    const totalSold = Math.max(0, safeParseNumber(token.totalSold));
    const currentHeld = Math.max(0, safeParseNumber(token.currentHeld));
    let avgBuyPrice = Math.max(0, safeParseNumber(token.avgBuyPrice));
    let avgSellPrice = Math.max(0, safeParseNumber(token.avgSellPrice));
    const currentPrice = Math.max(0, safeParseNumber(token.currentPrice));
    const ath = Math.max(0, safeParseNumber(token.ath));
    
    // Use totalBoughtValue/totalSoldValue if available (more accurate - actual USD spent/received)
    // Otherwise fall back to calculated average
    let totalBoughtValue = safeParseNumber(token.totalBoughtValue);
    let totalSoldValue = safeParseNumber(token.totalSoldValue);
    
    // Recalculate average prices from total values if available (more accurate)
    if (totalBoughtValue > 0 && totalBought > 0) {
      avgBuyPrice = totalBoughtValue / totalBought;
    }
    if (totalSoldValue > 0 && totalSold > 0) {
      avgSellPrice = totalSoldValue / totalSold;
    }
    
    // If totalBoughtValue/totalSoldValue are 0 but we have valid average prices and amounts,
    // recalculate them using the updated average prices (from API fetches)
    // This handles cases where transaction prices weren't available initially but were fetched later
    if (totalBoughtValue === 0 && totalBought > 0 && avgBuyPrice > 0) {
      totalBoughtValue = totalBought * avgBuyPrice;
    }
    if (totalSoldValue === 0 && totalSold > 0 && avgSellPrice > 0) {
      totalSoldValue = totalSold * avgSellPrice;
    }
    
    // Calculate total cost (what was spent buying tokens)
    // Use totalBoughtValue if available (actual USD spent), otherwise calculate from average
    const totalCost = totalBoughtValue > 0 ? totalBoughtValue : (totalBought * avgBuyPrice);
    
    // Calculate actual proceeds (what was received from selling)
    // Use totalSoldValue if available (actual USD received), otherwise calculate from average
    const actualProceeds = totalSoldValue > 0 ? totalSoldValue : (totalSold * avgSellPrice);
    
    // Calculate current value of held tokens
    const currentValue = currentHeld * currentPrice;
    
    // Calculate actual ROI (based on what was sold vs what was spent)
    // ROI = (Proceeds - Cost) / Cost * 100
    // Only calculate if we actually sold something and had cost
    let roi = 0;
    if (totalCost > 0 && totalSold > 0) {
      // For sold tokens, calculate ROI based on actual sales
      const soldCost = (totalSold / totalBought) * totalCost; // Proportional cost of sold tokens
      if (soldCost > 0) {
        roi = ((actualProceeds - soldCost) / soldCost) * 100;
      }
    } else if (totalCost > 0 && totalSold === 0) {
      // Never sold - ROI is based on current value vs cost
      roi = ((currentValue - totalCost) / totalCost) * 100;
    }
    
    // What if held ALL bought tokens to current price
    const whatIfCurrentValue = totalBought * (currentPrice || avgBuyPrice || 0);
    
    // MISSED GAINS CALCULATION (per spec):
    // Missed Gains = max(0, (tokensSold × referencePriceAfterSell) − solReceived)
    // Reference price = highest price after the user's final sell (default: ATH if after sell date, else current price)
    // Do NOT include any price action before the sell
    // Missed gains can never be negative
    // Use the final sell timestamp for all calculations
    
    let referencePriceAfterSell = 0;
    if (totalSold > 0 && token.lastSellDate) {
      try {
        const lastSellDate = token.lastSellDate instanceof Date 
          ? token.lastSellDate 
          : new Date(token.lastSellDate);
        const athDate = token.athDate instanceof Date 
          ? token.athDate 
          : (token.athDate ? new Date(token.athDate) : null);
        
        // Reference price = highest price after final sell
        // Use ATH if it occurred after the final sell, otherwise use current price
        if (ath && athDate && !isNaN(athDate.getTime()) && athDate > lastSellDate) {
          referencePriceAfterSell = ath;
        } else if (currentPrice > 0) {
          // Use current price as reference (represents highest price after sell if ATH was before sell)
          referencePriceAfterSell = currentPrice;
        } else {
          // Fallback to avg sell price if no other price available
          referencePriceAfterSell = avgSellPrice;
        }
      } catch (e) {
        // Fallback to current price or ATH
        referencePriceAfterSell = ath > currentPrice && ath > 0 ? ath : (currentPrice || avgSellPrice);
      }
    } else {
      referencePriceAfterSell = currentPrice || ath || avgSellPrice;
    }
    
    // Calculate missed gains: max(0, (tokensSold × referencePriceAfterSell) − solReceived)
    // solReceived = actualProceeds (already in USD)
    // Note: This assumes SOL price conversion is already done in actualProceeds
    // For full accuracy, we'd need SOL price at reference timestamp, but we use current SOL price as approximation
    const missedGainsCurrent = totalSold > 0 
      ? Math.max(0, (totalSold * referencePriceAfterSell) - actualProceeds)
      : 0;
    
    // ROI if held all tokens to current price
    const roiIfHeldCurrent = totalCost > 0 
      ? ((whatIfCurrentValue - totalCost) / totalCost) * 100 
      : 0;
    
    // What if held to ATH
    const athPrice = ath || currentPrice || avgBuyPrice || 0;
    const whatIfATHValue = totalBought * athPrice;
    const missedGainsATH = totalSold > 0
      ? Math.max(0, whatIfATHValue - actualProceeds)
      : 0;
    const roiIfHeldATH = totalCost > 0 
      ? ((whatIfATHValue - totalCost) / totalCost) * 100 
      : 0;
    
    // Time held calculation
    let timeHeldDays = 0;
    if (token.firstBuyDate) {
      try {
        // Ensure firstBuyDate is a Date object
        const firstBuy = token.firstBuyDate instanceof Date 
          ? token.firstBuyDate 
          : new Date(token.firstBuyDate);
        
        // For tokens that were never sold, use current date; otherwise use last sell date
        const endDate = token.lastSellDate 
          ? (token.lastSellDate instanceof Date ? token.lastSellDate : new Date(token.lastSellDate))
          : new Date();
        
        // Only calculate if both dates are valid
        if (!isNaN(firstBuy.getTime()) && !isNaN(endDate.getTime()) && endDate >= firstBuy) {
          timeHeldDays = Math.max(0, differenceInDays(endDate, firstBuy));
        }
      } catch (e) {
        console.log('Error calculating timeHeldDays for token', token.mint?.slice(0, 8), ':', e);
        timeHeldDays = 0;
      }
    }
    
    // Price change percentage
    let priceChange = 0;
    if (avgBuyPrice > 0 && currentPrice > 0) {
      priceChange = ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
    }
    
    // Validate all calculations are finite numbers using safeParseNumber and roundToDecimals
    const validateNumber = (val) => {
      const num = safeParseNumber(val);
      return isFinite(num) ? roundToDecimals(num, 2) : 0;
    };
    
    return {
      ...token,
      totalCost: roundToDecimals(validateNumber(totalCost), 2),
      actualProceeds: roundToDecimals(validateNumber(actualProceeds), 2),
      currentValue: roundToDecimals(validateNumber(currentValue), 2),
      roi: roundToDecimals(validateNumber(roi), 2),
      whatIfCurrentValue: roundToDecimals(validateNumber(whatIfCurrentValue), 2),
      missedGainsCurrent: roundToDecimals(validateNumber(missedGainsCurrent), 2),
      roiIfHeldCurrent: roundToDecimals(validateNumber(roiIfHeldCurrent), 2),
      whatIfATHValue: roundToDecimals(validateNumber(whatIfATHValue), 2),
      missedGainsATH: roundToDecimals(validateNumber(missedGainsATH), 2),
      roiIfHeldATH: roundToDecimals(validateNumber(roiIfHeldATH), 2),
      timeHeldDays: Math.max(0, Math.round(timeHeldDays)),
      priceChange: roundToDecimals(validateNumber(priceChange), 2),
      referencePriceAfterSell: roundToDecimals(validateNumber(referencePriceAfterSell), 6), // Store for warning calculation
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
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:372',message:'fetchWalletData ENTRY',data:{walletAddress:walletAddress.trim(),walletAddressLength:walletAddress.trim().length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    // Check cache first to avoid unnecessary API calls
    const trimmedWallet = walletAddress.trim();
    const cachedResult = cacheService.getCachedWalletAnalysis(trimmedWallet);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:380',message:'cache check result',data:{hasCachedResult:!!cachedResult,trimmedWallet,walletAddress},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    
    if (cachedResult) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:383',message:'using cached result',data:{hasResults:!!cachedResult},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      console.log('Using cached wallet analysis');
      setResults(cachedResult);
      setLoading(false);
      setError('');
      return;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:392',message:'cache miss - making API call',data:{trimmedWallet},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    setLoading(true);
    setError('');
    setResults(null); // Clear previous results
    setSelectedToken(null); // Reset selected token when fetching new wallet
    try {
      const heliusResponse = await fetch(`${backendUrl}?endpoint=helius&wallet=${walletAddress}`);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:400',message:'helius response status',data:{status:heliusResponse.status,ok:heliusResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      
      if (!heliusResponse.ok) {
        const errorText = await heliusResponse.text().catch(() => 'Could not read error');
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText };
        }
        
        let errorMessage = errorData.error || errorData.message || 'Failed to fetch wallet data';
        if (heliusResponse.status === 401) {
          errorMessage = 'API key authentication failed. Using alternative data source...';
        } else if (heliusResponse.status === 403) {
          errorMessage = 'Helius API blocked the request. Please try again in a few minutes.';
        } else if (heliusResponse.status === 429) {
          errorMessage = 'Rate limit exceeded. Using alternative data source...';
        } else if (heliusResponse.status === 504) {
          errorMessage = 'Request timed out. Please try again.';
        }
        
        throw new Error(errorMessage);
      }
      
      const heliusData = await heliusResponse.json();
      
      if (!heliusData.success || !Array.isArray(heliusData.data)) {
        throw new Error('No data found');
      }
      
      // Show info message if using fallback (non-blocking, just log)
      if (heliusData.source === 'RPC') {
        console.log('Using Solana RPC - service continues normally');
      }
      
      const transactions = heliusData.data;
      const allTokens = analyzeAllTokens(transactions);

      // Pre-load Token List once for all tokens (optimization)
      const tokenList = await tokenListService.loadTokenList();

      // Enrich tokens with simplified data sources (DexScreener + Token List only)
      const enrichedTokens = await Promise.all(
        allTokens.map(async (token, tokenIndex) => {
          // Check cache first
          const cachedMetadata = cacheService.getCachedTokenMetadata(token.mint);
          if (cachedMetadata) {
            return { ...token, ...cachedMetadata };
          }

          // Add small delay between tokens to avoid rate limiting
          if (tokenIndex > 0 && tokenIndex % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          let symbol = token.symbol || '';
          let name = token.name || '';
          let currentPrice = 0;
          let ath = 0;
          let athDate = null;
          let logoURI = null;
          let verified = false;
          let decimals = 9;
          let liquidity = 0;

          // 1. Try Token List FIRST (verified tokens - fastest, most reliable)
          try {
            const tokenFromList = tokenList?.find(t => t.address === token.mint);
            if (tokenFromList) {
              if (tokenFromList.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenFromList.symbol;
              if (tokenFromList.name && (!name || name === 'Unknown Token')) name = tokenFromList.name;
              if (tokenFromList.logoURI && !logoURI) logoURI = tokenFromList.logoURI;
              if (tokenFromList.decimals) decimals = tokenFromList.decimals;
              verified = true;
            }
          } catch (e) {
            // Token list already loaded, ignore errors
          }

          // 2. Try DexScreener for price/ATH/liquidity (primary data source)
          try {
            const dexscreenerResponse = await fetch(`${backendUrl}?endpoint=dexscreener&mint=${token.mint}`);
            if (dexscreenerResponse.ok) {
              const dexscreenerData = await dexscreenerResponse.json();
              if (dexscreenerData.success && dexscreenerData.data) {
                const tokenInfo = dexscreenerData.data;
                
                if (tokenInfo.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenInfo.symbol;
                if (tokenInfo.name && (!name || name === 'Unknown Token')) name = tokenInfo.name;
                if (tokenInfo.price?.usd) currentPrice = tokenInfo.price.usd;
                if (tokenInfo.liquidity) liquidity = tokenInfo.liquidity;
                if (tokenInfo.logoURI && !logoURI) logoURI = tokenInfo.logoURI;
                if (tokenInfo.history?.ath?.value) {
                  ath = tokenInfo.history.ath.value;
                  athDate = tokenInfo.history.ath.unixTime ? new Date(tokenInfo.history.ath.unixTime * 1000) : null;
                }
              }
            }
          } catch (e) {
            // Only log unexpected errors (not 404/400)
            if (e.message && !e.message.includes('404') && !e.message.includes('400')) {
              console.log(`[DexScreener] Error for ${token.mint.slice(0, 8)}:`, e.message);
            }
          }

          // Final fallback: use mint address
          if (!symbol || symbol === 'Unknown') {
            symbol = token.mint.slice(0, 4).toUpperCase();
          }
          if (!name || name === 'Unknown Token') {
            name = `${symbol} Token`;
          }

          // Use transaction prices if available and > 0
          let finalBuyPrice = token.avgBuyPrice > 0 ? token.avgBuyPrice : 0;
          let finalSellPrice = token.avgSellPrice > 0 ? token.avgSellPrice : 0;

          // Only use current price as fallback if we have no transaction price data
          if (finalBuyPrice === 0 && currentPrice > 0 && token.buyCount === 0) {
            finalBuyPrice = currentPrice;
          }
          if (finalSellPrice === 0 && currentPrice > 0 && token.sellCount === 0) {
            finalSellPrice = currentPrice;
          }

          const enrichedToken = { 
            ...token, 
            symbol: symbol,
            name: name,
            currentPrice: currentPrice || 0,
            ath: ath || currentPrice || 0,
            athDate: athDate,
            avgBuyPrice: finalBuyPrice,
            avgSellPrice: finalSellPrice,
            logoURI: logoURI,
            verified: verified,
            decimals: decimals,
            liquidity: liquidity,
          };

          // Cache the metadata for future use
          cacheService.cacheTokenMetadata(token.mint, enrichedToken);

          return enrichedToken;
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

      const resultsData = {
        walletAddress,
        allTokens: tokensWithMetrics,
        transactions,
        currentlyHeld,
        deposits,
        withdraws,
        transfers,
        lastUpdated: new Date(),
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
      };

      // Cache the results
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:632',message:'caching wallet analysis',data:{walletAddress:walletAddress.trim(),hasResultsData:!!resultsData,tokenCount:resultsData?.allTokens?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      cacheService.cacheWalletAnalysis(walletAddress.trim(), resultsData);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:637',message:'cache saved',data:{walletAddress:walletAddress.trim()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion

      setResults(resultsData);
      
      // Increment wallet scan count on every successful analysis (via backend API)
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:812',message:'incrementing wallet scan',data:{walletAddress:walletAddress.slice(0,8)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      try {
        const newScans = await statsService.incrementWalletScan();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:815',message:'wallet scan increment success',data:{newScans,success:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        setWalletScanCount(newScans);
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:818',message:'wallet scan increment error',data:{error:e.message,success:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        console.error('Error updating wallet scan count:', e);
        // Try to at least show existing count
        try {
          const existing = await statsService.getWalletScans();
          setWalletScanCount(existing);
        } catch (e2) {
          console.error('Error loading existing wallet scan count:', e2);
        }
      }
      
      // Add to leaderboard (via backend API - saves to JSON file)
      const existingLeaderboard = await statsService.getLeaderboard();
      
      // Calculate the biggest single missed opportunity (biggest miss token)
      const biggestMissToken = resultsData.summary.biggestMiss || {};
      const biggestMissValue = biggestMissToken.missedGainsCurrent || 0;
      
      // Use total missed gains for ranking (sum of all missed opportunities)
      const totalMissedGains = resultsData.summary.totalMissedGainsCurrent || 0;
      
      // Create comprehensive wallet entry matching the analysis data
      const walletEntry = {
        walletAddress: walletAddress.trim(),
        address: walletAddress.trim(),
        // Primary ranking value: total missed gains across all tokens
        paperhandedValue: totalMissedGains,
        totalMissedGains: totalMissedGains,
        // Additional metrics for verification and display
        jitterScore: resultsData.summary.jitterScore || 0,
        biggestMissValue: biggestMissValue,
        biggestMissToken: biggestMissToken.symbol || biggestMissToken.mint?.slice(0, 8) || 'Unknown',
        totalTokens: resultsData.summary.totalTokens || 0,
        totalCost: resultsData.summary.totalCost || 0,
        actualProceeds: resultsData.summary.actualProceeds || 0,
        totalCurrentValue: resultsData.summary.totalCurrentValue || 0,
        // Timestamp for tracking
        lastUpdated: new Date().toISOString(),
      };
      
      // Check if wallet already exists in leaderboard
      const existingIndex = existingLeaderboard.findIndex(w => w.walletAddress === walletAddress.trim());
      if (existingIndex >= 0) {
        existingLeaderboard[existingIndex] = walletEntry;
      } else {
        existingLeaderboard.push(walletEntry);
      }
      
      // Sort by paperhanded value and keep top 200
      existingLeaderboard.sort((a, b) => (b.paperhandedValue || 0) - (a.paperhandedValue || 0));
      const top200 = existingLeaderboard.slice(0, 200);
      
      // Save to backend (updates JSON file via GitHub API)
      try {
        const updatedLeaderboard = await statsService.updateLeaderboard(top200);
        setLeaderboardWallets(updatedLeaderboard);
      } catch (e) {
        console.error('Error updating leaderboard:', e);
        // Fallback: use local data
        setLeaderboardWallets(top200);
      }
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
    
    // Apply tab filter - only sold tokens for all tabs
    filtered = filtered.filter(t => t.status === 'sold');
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.symbol || '').toLowerCase().includes(query) ||
        (t.name || '').toLowerCase().includes(query) ||
        (t.mint || '').toLowerCase().includes(query)
      );
    }
    
    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const daysAgo = dateFilter === '7d' ? 7 : 
                     dateFilter === '30d' ? 30 : 
                     dateFilter === '90d' ? 90 : 365;
      const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      
      filtered = filtered.filter(t => {
        if (t.firstBuyDate) return t.firstBuyDate >= cutoff;
        if (t.lastSellDate) return t.lastSellDate >= cutoff;
        return true;
      });
    }
    
    // Sort based on active tab
    filtered.sort((a, b) => {
      switch (activeTab) {
        case 'paperhands':
          // Sort by missedGainsATH (potential loss if held to ATH)
          return (b.missedGainsATH || 0) - (a.missedGainsATH || 0);
        case 'mostprofit':
          // Sort by actual profit (actualProceeds - totalCost) descending
          const profitA = (a.actualProceeds || 0) - (a.totalCost || 0);
          const profitB = (b.actualProceeds || 0) - (b.totalCost || 0);
          return profitB - profitA;
        case 'biggestloss':
          // Sort by actual loss (actualProceeds - totalCost) ascending (most negative first)
          const lossA = (a.actualProceeds || 0) - (a.totalCost || 0);
          const lossB = (b.actualProceeds || 0) - (b.totalCost || 0);
          return lossA - lossB;
        default:
          return (b.missedGainsATH || 0) - (a.missedGainsATH || 0);
      }
    });
    
    // Limit to Top 10 for PaperHands tab
    if (activeTab === 'paperhands') {
      filtered = filtered.slice(0, 10);
    }
    
    return filtered;
  }, [results, activeTab, searchQuery, dateFilter]);


  // Enhanced image component with multiple fallbacks including pump.fun and launchpads
  const TokenImage = React.memo(({ token, size = 'w-20 h-20', className = '' }) => {
    const [imgSrc, setImgSrc] = useState(() => {
      // Try logoURI first, then official token list, then fallback
      return token.logoURI || 
             `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`;
    });
    const [errorCount, setErrorCount] = useState(0);
    
    // Comprehensive fallback sources prioritizing launch platforms
    const getFallbackSources = useCallback(() => {
      const symbol = token.symbol || token.mint.slice(0, 4);
      return [
        token.logoURI, // From API metadata (CoinGecko, DexScreener, etc.)
        // Launch platforms (HIGHEST PRIORITY for memecoins)
        `https://pump.fun/${token.mint}.png`,
        `https://pump.monster/api/token/${token.mint}/image`,
        `https://pump.fun/api/token/${token.mint}/image`,
        `https://api.pump.fun/tokens/${token.mint}/logo`,
        // Moonshot launchpad
        `https://api.moonshot.fun/token/${token.mint}/image`,
        `https://moonshot.fun/token/${token.mint}/logo.png`,
        // Other launchpads
        `https://api.step.finance/token/${token.mint}/logo`,
        `https://api.raydium.io/token/${token.mint}/logo`,
        // DEX and aggregator CDNs (high priority)
        `https://img.raydium.io/${token.mint}`,
        `https://static.jup.ag/tokens/${token.mint}.png`,
        `https://assets.jup.ag/tokens/${token.mint}.png`,
        // Official Solana token list
        `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`,
        `https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/${token.mint}/logo.png`,
        // CoinGecko
        `https://assets.coingecko.com/coins/images/solana/${token.mint}/large.png`,
        // Arweave (common for Solana NFTs and tokens)
        `https://arweave.net/${token.mint}`,
        `https://arweave.net/${token.mint}/logo.png`,
        // IPFS gateways
        `https://ipfs.io/ipfs/${token.mint}`,
        `https://gateway.pinata.cloud/ipfs/${token.mint}`,
        `https://cloudflare-ipfs.com/ipfs/${token.mint}`,
        // Generated avatar (last resort)
        `https://ui-avatars.com/api/?name=${encodeURIComponent(symbol)}&background=22c55e&color=fff&size=128&bold=true`,
      ].filter(Boolean); // Remove null/undefined values
    }, [token.mint, token.logoURI, token.symbol]);
    
    useEffect(() => {
      // Reset when token changes
      const sources = getFallbackSources();
      setImgSrc(sources[0] || sources[1] || sources[sources.length - 1]);
      setErrorCount(0);
    }, [token.mint, token.logoURI, token.symbol, getFallbackSources]);
    
    const handleError = (e) => {
      // Suppress CORS errors in console - they're expected and handled by fallback
      e.stopPropagation();
      const sources = getFallbackSources();
      if (errorCount < sources.length - 1) {
        const nextIndex = errorCount + 1;
        setErrorCount(nextIndex);
        setImgSrc(sources[nextIndex] || sources[sources.length - 1]);
      }
    };
    
    return (
      <img
        src={imgSrc}
        alt={token.symbol || token.name || 'Token'}
        className={`${size} rounded-lg object-cover bg-[#404040] ${className}`}
        onError={handleError}
        loading="lazy"
      />
    );
  });
  
  TokenImage.displayName = 'TokenImage';

  const tabs = [
    { id: 'paperhands', label: 'PaperHands', description: 'Top 10 tokens sold too early - potential loss if held to ATH' },
    { id: 'mostprofit', label: 'Most Profit', description: 'Top trades with highest profit (actual proceeds - cost)' },
    { id: 'biggestloss', label: 'Biggest Loss', description: 'Top trades with biggest loss (actual proceeds - cost)' },
  ];


  const handleTokenClick = useCallback((token) => {
    // Find the full token object from allTokens to ensure we have all data
    const fullToken = results?.allTokens?.find(t => t.mint === token.mint) || token;
    setSelectedToken(fullToken);
    
    // Keep current tab (all tabs show sold tokens)
    
    // Scroll to top when clicked
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [results?.allTokens]);

  // Render horizontal token card matching paperhands.gm.ai style
  const renderHorizontalTokenCard = (token, index) => {
    const rankColor = index === 0 ? 'bg-green-500' : index === 1 ? 'bg-yellow-500' : index === 2 ? 'bg-orange-500' : 'bg-gray-600';
    const isSelected = selectedToken?.mint === token.mint || (!selectedToken && index === 0);
    
    // Calculate display value based on active tab
    let displayValue, displayLabel, solAmount;
    const solPrice = 150;
    
    let isGain = false;
    let isLoss = false;
    
    if (activeTab === 'paperhands') {
      // PaperHands: Show missed gains at ATH (always a loss)
      displayValue = token.missedGainsATH || 0;
      const roiIfHeldATH = token.roiIfHeldATH || 0;
      displayLabel = `(${roiIfHeldATH.toFixed(2)}%)`;
      solAmount = (token.missedGainsATH || 0) / solPrice;
      isLoss = true;
    } else if (activeTab === 'mostprofit') {
      // Most Profit: Show actual profit (actualProceeds - totalCost)
      const profit = (token.actualProceeds || 0) - (token.totalCost || 0);
      displayValue = profit;
      const roi = token.roi || 0;
      displayLabel = `(${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%)`;
      solAmount = profit / solPrice;
      if (profit > 0) {
        isGain = true;
      } else if (profit < 0) {
        isLoss = true;
      }
    } else if (activeTab === 'biggestloss') {
      // Biggest Loss: Show actual loss (actualProceeds - totalCost, negative values)
      const loss = (token.actualProceeds || 0) - (token.totalCost || 0);
      displayValue = Math.abs(loss); // Show absolute value for display
      const roi = token.roi || 0;
      displayLabel = `(${roi.toFixed(2)}%)`;
      solAmount = Math.abs(loss) / solPrice;
      isLoss = true; // Always a loss in this tab
    } else {
      // Fallback (shouldn't happen)
      displayValue = token.missedGainsATH || 0;
      displayLabel = `(${(token.roiIfHeldATH || 0).toFixed(2)}%)`;
      solAmount = (token.missedGainsATH || 0) / solPrice;
      isLoss = true;
    }
    
    const formatValue = (val) => {
      if (val >= 1000000) {
        const millions = val / 1000000;
        return `$${millions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
      }
      if (val >= 1000) {
        const thousands = val / 1000;
        return `$${thousands.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
      }
      return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

  // Determine border and background colors based on gain/loss (matching LiveTicker)
  let borderColor, bgColor, hoverBorderColor;
  if (isGain) {
    borderColor = 'border-green-500';
    bgColor = 'bg-[#1a2e1a]'; // Subtle green tint
    hoverBorderColor = 'hover:border-green-400';
  } else if (isLoss) {
    borderColor = 'border-red-500';
    bgColor = 'bg-[#2e1a1a]'; // Subtle red tint
    hoverBorderColor = 'hover:border-red-400';
  } else {
    borderColor = 'border-[#404040]';
    bgColor = 'bg-[#2a2a2a]';
    hoverBorderColor = 'hover:border-[#606060]';
  }
  
  // Override with green if selected (for visual feedback)
  if (isSelected) {
    borderColor = 'border-green-500';
    bgColor = 'bg-green-500/10';
    hoverBorderColor = 'hover:border-green-400';
  }

  return (
      <div
        key={token.mint}
        data-token-mint={token.mint}
        className={`flex-shrink-0 w-64 sm:w-72 p-3 sm:p-4 rounded-lg border-2 ${borderColor} ${bgColor} ${hoverBorderColor} transition-all cursor-pointer`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleTokenClick(token);
        }}
      >
        {/* Rank Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className={`w-6 h-6 ${rankColor} rounded-full flex items-center justify-center text-white font-bold text-xs`}>
            {index + 1}
        </div>
      </div>

        {/* Token Image and Info */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-shrink-0">
            <TokenImage token={token} size="w-12 h-12" className="rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`text-lg font-bold truncate ${
                isGain ? 'text-green-300' : isLoss ? 'text-red-300' : 'text-white'
              }`}>{token.symbol || 'Unknown'}</h3>
              {index < 3 && (
                <div className={`w-5 h-5 ${rankColor} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                  {index + 1}
                </div>
              )}
            </div>
            <p className={`text-xs truncate ${
              isGain ? 'text-green-400/70' : isLoss ? 'text-red-400/70' : 'text-gray-400'
            }`} title={token.name}>{token.name || 'Unknown Token'}</p>
          </div>
        </div>
        
        {/* Value and Percentage */}
        <div className="mb-2">
          <p className={`text-sm mb-1 ${
            isGain ? 'text-green-300' : isLoss ? 'text-red-300' : 'text-white'
          }`}>
            {solAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SOL
            <span className={`text-xs ml-2 ${
              isGain ? 'text-green-400/70' : isLoss ? 'text-red-400/70' : 'text-gray-500'
            }`}>• Amount in Solana</span>
          </p>
          <p className={`${isGain ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-white'} text-2xl font-bold`}>
            {formatValue(displayValue)}
            <span className={`text-xs ml-2 font-normal ${
              isGain ? 'text-green-400/70' : isLoss ? 'text-red-400/70' : 'text-gray-500'
            }`}>
              {activeTab === 'paperhands' 
                ? '• Missed gains (ATH)'
                : activeTab === 'mostprofit'
                ? '• Profit'
                : activeTab === 'biggestloss'
                ? '• Loss'
                : '• Value'}
            </span>
          </p>
          <p className={`${isGain ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-white'} text-sm`}>
            {displayLabel}
            <span className={`text-xs ml-2 ${
              isGain ? 'text-green-400/70' : isLoss ? 'text-red-400/70' : 'text-gray-500'
            }`}>
              {isGain ? '• Profit' : isLoss ? '• Loss' : '• Breakeven'}
            </span>
          </p>
        </div>
      </div>
    );
  };

  // Load shareable link on mount, load leaderboard, and track visits
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get('share');
    if (shareParam) {
      try {
        const decoded = JSON.parse(atob(shareParam));
        if (decoded.wallet) {
          setWalletAddress(decoded.wallet);
          // Auto-fetch if wallet is in share link
          setTimeout(() => {
            fetchWalletData();
          }, 500);
        }
      } catch (e) {
        console.log('Invalid share link:', e);
      }
    }
    
    // Load all stats from backend API (JSON file) - shared globally
    const loadStats = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:1235',message:'loadStats called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      try {
        // Load all stats at once
        const stats = await statsService.getAllStats();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:1239',message:'loadStats result',data:{visits:stats.visits,walletScans:stats.walletScans,leaderboardLength:stats.leaderboard?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        setVisitCount(stats.visits || 0);
        setWalletScanCount(stats.walletScans || 0);
        setLeaderboardWallets(stats.leaderboard || []);
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:1244',message:'loadStats error',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        console.error('Error loading stats:', e);
        // Fallback to defaults
        setVisitCount(0);
        setWalletScanCount(0);
        setLeaderboardWallets([]);
      }
    };
    
    // Load initial stats
    loadStats();
    
    // Track visits (increment on every page load via backend API)
    const trackVisit = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:1254',message:'trackVisit called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      try {
        const newVisits = await statsService.incrementVisit();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:1257',message:'visit increment success',data:{newVisits,success:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        setVisitCount(newVisits);
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a26cdc5f-d73f-4028-8b75-616d869592b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.js:1260',message:'visit increment error',data:{error:e.message,success:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        console.error('Error tracking visits:', e);
        // Try to at least show existing count
        try {
          const existing = await statsService.getVisits();
          setVisitCount(existing);
        } catch (e2) {
          setVisitCount(0);
        }
      }
    };
    
    // Increment visit count (saves to JSON file via backend)
    trackVisit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="min-h-screen animate-fade-in bg-[#1a1a1a]">
      {/* Simplified Header matching paperhands.gm.ai */}
      <div className="bg-[#1a1a1a] border-b border-[#404040] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            {/* Left: Logo and Branding */}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-white text-xl sm:text-2xl font-bold">JH</span>
              <span className="text-white text-lg sm:text-xl">JitterHands.fun</span>
              <span className="text-gray-500 text-xs sm:text-sm ml-1 sm:ml-2">BETA</span>
            </div>

            {/* Right: Navigation Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowLeaderboard(true);
                  setWalletAddress('');
                  setResults(null);
                }}
                className={`px-3 sm:px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all font-mono text-sm sm:text-base ${
                  showLeaderboard
                    ? 'bg-[#2a2a2a] border border-[#404040] text-green-500'
                    : 'bg-[#2a2a2a] hover:bg-[#404040] border border-[#404040] text-gray-300 hover:text-white'
                }`}
              >
                <BarChart3 size={16} className={showLeaderboard ? 'text-green-500' : 'text-gray-300'} />
                <span className="hidden sm:inline">Leaderboard</span>
                <span className="sm:hidden">Board</span>
              </button>
            </div>
          </div>
        </div>
      </div>


      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Leaderboard View */}
        {showLeaderboard && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500 sm:w-6 sm:h-6">
                  <path d="M3 3v18h18" />
                  <path d="M7 12h4M7 8h8M7 16h2" />
                </svg>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Top Giga Jeeters</h1>
              </div>
              <button
                onClick={() => {
                  setShowLeaderboard(false);
                  setWalletAddress('');
                  setResults(null);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-[#2a2a2a] hover:bg-[#404040] border border-[#404040] text-white rounded-lg flex items-center justify-center gap-2 transition-all text-sm sm:text-base"
              >
                <ArrowLeft size={18} />
                Back to Search
              </button>
            </div>
            <Leaderboard wallets={leaderboardWallets} />
          </div>
        )}

        {/* Stats Counter - Subtle display in header area */}
        {!showLeaderboard && (
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-4 text-gray-500 text-xs">
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-gray-400">{visitCount.toLocaleString()}</span>
              <span className="text-gray-600">visits</span>
            </div>
            <div className="w-px h-3 bg-[#404040]"></div>
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <span className="text-gray-400">{walletScanCount.toLocaleString()}</span>
              <span className="text-gray-600">wallets scanned</span>
            </div>
          </div>
        )}

        {/* Search Input */}
        {!showLeaderboard && !results && (
          <GlassCard className="p-4 sm:p-6 mb-6">
            <div className="flex flex-col items-center mb-4 sm:mb-6">
              <img 
                src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                alt="Solana" 
                className="w-16 h-16 sm:w-24 sm:h-24 mb-3 sm:mb-4"
                onError={(e) => {
                  e.target.src = 'https://cryptologos.cc/logos/solana-sol-logo.png';
                }}
              />
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">Welcome to JitterHands.fun</h2>
              <p className="text-gray-400 text-xs sm:text-sm text-center">Analyze your Solana wallet trading history</p>
            </div>
            <label className="block text-xs sm:text-sm font-semibold text-gray-300 mb-3">Solana Wallet Address</label>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && fetchWalletData()}
              placeholder="Enter wallet address..."
                  className="w-full bg-[#1a1a1a] border border-[#404040] rounded-lg pl-10 sm:pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-all text-base"
            />
              </div>
            <button
              onClick={fetchWalletData}
              disabled={loading}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold px-6 sm:px-8 py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Search size={18} />
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
        {!showLeaderboard && results && (
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchWalletData()}
                  placeholder="Enter wallet address..."
                  className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg pl-10 pr-4 py-2.5 sm:py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-all text-base sm:text-sm"
                />
                </div>
              <button
                onClick={fetchWalletData}
                disabled={loading}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2.5 sm:py-2 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm"
              >
                <Search size={18} />
                {loading ? 'Analyzing...' : 'Search'}
              </button>
              </div>
                </div>
        )}

        {!showLeaderboard && results && (
          <div className="space-y-6 animate-fade-in">
            {/* Jitter Score Display */}
            {results.summary?.jitterScore !== undefined && (
              <GlassCard className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex-1 w-full">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="text-white font-semibold text-base sm:text-lg">Jitter Score</h3>
                      <span 
                        className="text-gray-400 text-xs cursor-help"
                        title="A composite score (0-100) measuring how 'jittery' or 'paperhanded' your wallet is. Higher scores indicate more early sells, missed gains, and shorter hold times. Calculated from: Paperhand ratio (40%) + Missed gains ratio (40%) + Hold time (20%)."
                      >
                        ⓘ
                      </span>
                </div>
                    <p className="text-gray-500 text-xs mb-3">
                      Measures your tendency to sell early and miss potential gains. Higher = more jittery.
                    </p>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-2xl sm:text-3xl font-bold ${
                            results.summary.jitterScore >= 70 ? 'text-red-500' :
                            results.summary.jitterScore >= 40 ? 'text-yellow-500' :
                            'text-green-500'
                          }`}>
                            {results.summary.jitterScore}
                          </span>
                          <span className="text-gray-500 text-xs sm:text-sm">/ 100</span>
              </div>
                        <div className="w-full bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              results.summary.jitterScore >= 70 ? 'bg-red-500' :
                              results.summary.jitterScore >= 40 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${results.summary.jitterScore}%` }}
                          />
            </div>
                      </div>
                      <div className="text-left sm:text-right w-full sm:w-auto">
                        <p className="text-gray-400 text-xs mb-1">Interpretation</p>
                        <p className={`text-sm font-semibold ${
                          results.summary.jitterScore >= 70 ? 'text-red-400' :
                          results.summary.jitterScore >= 40 ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {results.summary.jitterScore >= 70 ? 'Giga Jeeter' :
                           results.summary.jitterScore >= 40 ? 'Jittery' :
                           'Diamond Hands'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* Navigation Tabs - Simplified matching paperhands.gm.ai */}
            <div className="space-y-2">
              <div className="flex gap-2 sm:gap-4 border-b border-[#404040] overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                {tabs.map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSelectedToken(null); // Reset selection when changing tabs
                    }}
                    className={`flex-shrink-0 px-4 sm:px-6 py-3 font-semibold text-xs sm:text-sm transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'text-white bg-[#2a2a2a] border-b-2 border-green-500'
                        : 'text-gray-400 hover:text-gray-300'
                    }`}
                    >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeTab && (
                <p className="text-gray-500 text-xs px-2">
                  {tabs.find(t => t.id === activeTab)?.description}
                </p>
              )}
            </div>

            {/* Main Content - Matching paperhands.gm.ai style */}
            {activeTab && filteredAndSortedTokens.length > 0 && (
              <div className="space-y-6">
                {/* Horizontal Scrollable Token Cards */}
                <div className="overflow-x-auto pb-4 -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-hide">
                  <div className="flex gap-3 sm:gap-4" style={{ width: 'max-content' }}>
                    {filteredAndSortedTokens.slice(0, 10).map((token, index) => renderHorizontalTokenCard(token, index))}
                    </div>
                    </div>

                {/* Tab-Specific Content Section */}
                {(() => {
                  const solPrice = 150; // Default, should fetch real-time
                  
                  // Find the token to display: selectedToken if it exists, otherwise first token
                  let displayToken = null;
                  
                  if (selectedToken && selectedToken.mint) {
                    // First try to find it in the filtered list for current tab
                    displayToken = filteredAndSortedTokens.find(t => t.mint === selectedToken.mint);
                    // If not in filtered list, use selectedToken directly (it has all the data we need)
                    if (!displayToken) {
                      displayToken = selectedToken;
                    }
                  }
                  // Fallback to first token in filtered list if no valid selection
                  if (!displayToken || !displayToken.mint) {
                    displayToken = filteredAndSortedTokens[0];
                  }
                  
                  if (!displayToken) return null;
                  
                  // Calculate tab-specific metrics based on displayToken
                  let title, titleDescription, tokenAmount, usdValue, contractAddress, platform, tokenSymbol, tokenName;
                  let gridCards = [];
                  
                  if (activeTab === 'paperhands') {
                    // PaperHands: Show selected token's data (or biggest miss if no selection)
                    const tokenToShow = displayToken;
                    const totalMissedGains = tokenToShow?.missedGainsATH || 0;
                    const totalMissedGainsSOL = totalMissedGains / solPrice;
                    const boughtCost = tokenToShow?.totalCost || 0;
                    const soldProceeds = tokenToShow?.actualProceeds || 0;
                    const netResult = soldProceeds - boughtCost;
                    
                    title = 'You JitterHanded';
                    titleDescription = 'Tokens you sold too early - potential loss if held to ATH';
                    tokenAmount = tokenToShow?.totalSold || 0;
                    usdValue = totalMissedGains;
                    contractAddress = tokenToShow?.mint;
                    platform = tokenToShow?.platform;
                    tokenSymbol = tokenToShow?.symbol || 'Unknown';
                    tokenName = tokenToShow?.name || 'Unknown Token';
                    
                    gridCards = [
                      { 
                        label: 'Bought with', 
                        description: 'Total amount spent to buy these tokens',
                        tooltip: 'Total SOL spent to buy these tokens',
                        sol: boughtCost / solPrice, 
                        usd: boughtCost,
                        isGain: false,
                        isLoss: false
                      },
                      { 
                        label: 'Sold for', 
                        description: 'Amount received when you sold',
                        tooltip: 'Total SOL received when you sold',
                        sol: soldProceeds / solPrice, 
                        usd: soldProceeds,
                        isGain: netResult > 0,
                        isLoss: netResult < 0,
                        isBreakeven: netResult === 0
                      },
                      { 
                        label: 'Fumbled', 
                        description: 'Potential gains you missed by selling early (if held to ATH)',
                        tooltip: 'Additional value your tokens reached at ATH after you sold, compared to what you received. This represents missed post-sale upside (not guaranteed profit).',
                        sol: totalMissedGainsSOL, 
                        usd: totalMissedGains,
                        isGain: false,
                        isLoss: true // Always a loss (missed opportunity)
                      },
                      { 
                        label: 'Held for', 
                        description: 'How long you held before selling',
                        tooltip: 'Time between first buy and final sell',
                        value: tokenToShow?.timeHeldDays ? `${tokenToShow.timeHeldDays} ${tokenToShow.timeHeldDays === 1 ? 'Day' : 'Days'}` : '0 Days',
                        isGain: false,
                        isLoss: false
                      },
                    ];
                  } else if (activeTab === 'mostprofit') {
                    // Most Profit: Show selected token with highest profit
                    const tokenToShow = displayToken;
                    const boughtCost = tokenToShow?.totalCost || 0;
                    const soldProceeds = tokenToShow?.actualProceeds || 0;
                    const profit = soldProceeds - boughtCost;
                    const profitSOL = profit / solPrice;
                    const roi = tokenToShow?.roi || 0;
                    
                    title = 'Most Profit';
                    titleDescription = 'Highest profit trade (actual proceeds - cost)';
                    tokenAmount = tokenToShow?.totalSold || 0;
                    usdValue = profit;
                    contractAddress = tokenToShow?.mint;
                    platform = tokenToShow?.platform;
                    tokenSymbol = tokenToShow?.symbol || 'Unknown';
                    tokenName = tokenToShow?.name || 'Unknown Token';
                    
                    gridCards = [
                      { 
                        label: 'Bought with', 
                        description: 'Total amount spent to buy these tokens',
                        tooltip: 'Total SOL spent to buy these tokens',
                        sol: boughtCost / solPrice, 
                        usd: boughtCost,
                        isGain: false,
                        isLoss: false
                      },
                      { 
                        label: 'Sold for', 
                        description: 'Amount received when you sold',
                        tooltip: 'Total SOL received when you sold',
                        sol: soldProceeds / solPrice, 
                        usd: soldProceeds,
                        isGain: true,
                        isLoss: false
                      },
                      { 
                        label: 'Profit', 
                        description: 'Profit from this trade',
                        tooltip: 'Profit = Sold for - Bought with',
                        sol: profitSOL, 
                        usd: profit,
                        isGain: true,
                        isLoss: false
                      },
                      { 
                        label: 'ROI', 
                        description: 'Return on investment percentage',
                        tooltip: 'ROI percentage for this trade',
                        value: `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`,
                        isGain: profit > 0,
                        isLoss: profit < 0,
                        isBreakeven: profit === 0
                      },
                    ];
                  } else if (activeTab === 'biggestloss') {
                    // Biggest Loss: Show selected token with biggest loss
                    const tokenToShow = displayToken;
                    const boughtCost = tokenToShow?.totalCost || 0;
                    const soldProceeds = tokenToShow?.actualProceeds || 0;
                    const loss = soldProceeds - boughtCost;
                    const lossSOL = Math.abs(loss) / solPrice;
                    const roi = tokenToShow?.roi || 0;
                    
                    title = 'Biggest Loss';
                    titleDescription = 'Biggest loss trade (actual proceeds - cost)';
                    tokenAmount = tokenToShow?.totalSold || 0;
                    usdValue = Math.abs(loss);
                    contractAddress = tokenToShow?.mint;
                    platform = tokenToShow?.platform;
                    tokenSymbol = tokenToShow?.symbol || 'Unknown';
                    tokenName = tokenToShow?.name || 'Unknown Token';
                    
                    gridCards = [
                      { 
                        label: 'Bought with', 
                        description: 'Total amount spent to buy these tokens',
                        tooltip: 'Total SOL spent to buy these tokens',
                        sol: boughtCost / solPrice, 
                        usd: boughtCost,
                        isGain: false,
                        isLoss: false
                      },
                      { 
                        label: 'Sold for', 
                        description: 'Amount received when you sold',
                        tooltip: 'Total SOL received when you sold',
                        sol: soldProceeds / solPrice, 
                        usd: soldProceeds,
                        isGain: false,
                        isLoss: true
                      },
                      { 
                        label: 'Loss', 
                        description: 'Loss from this trade',
                        tooltip: 'Loss = Sold for - Bought with',
                        sol: lossSOL, 
                        usd: Math.abs(loss),
                        isGain: false,
                        isLoss: true
                      },
                      { 
                        label: 'ROI', 
                        description: 'Return on investment percentage',
                        tooltip: 'ROI percentage for this trade',
                        value: `${roi.toFixed(2)}%`,
                        isGain: false,
                        isLoss: true
                      },
                    ];
                  } else {
                    // Fallback (shouldn't happen)
                    const tokenToShow = displayToken;
                    const totalMissedGains = tokenToShow?.missedGainsATH || 0;
                    
                    title = 'PaperHands';
                    titleDescription = 'Tokens you sold too early';
                    tokenAmount = tokenToShow?.totalSold || 0;
                    usdValue = totalMissedGains;
                    contractAddress = tokenToShow?.mint;
                    platform = tokenToShow?.platform;
                    tokenSymbol = tokenToShow?.symbol || 'Unknown';
                    tokenName = tokenToShow?.name || 'Unknown Token';
                    
                    gridCards = [];
                  }
                  
                  const formatTokenAmount = (amount) => {
                    if (amount >= 1000000) {
                      const millions = amount / 1000000;
                      return `${millions.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
                    }
                    if (amount >= 1000) {
                      const thousands = amount / 1000;
                      return `${thousands.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
                    }
                    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  };
                  
                  // Determine color for main value based on gain/loss
                  const mainValueColor = activeTab === 'paperhands' 
                    ? 'text-red-500' // Missed gains = loss (red)
                    : activeTab === 'mostprofit'
                    ? 'text-green-500' // Profit = green
                    : activeTab === 'biggestloss'
                    ? 'text-red-500' // Loss = red
                    : 'text-white';
                  
                  return (
                <div className="space-y-4">
                      <div>
                        <p className="text-gray-400 text-sm mb-1">{title}</p>
                        {titleDescription && (
                          <p className="text-gray-500 text-xs mb-3">{titleDescription}</p>
                        )}
                        {displayToken && (
                          <div className="flex flex-col gap-2 mb-2">
                            <div className="flex flex-col sm:flex-row items-baseline gap-2 sm:gap-3">
                              <span className={`${mainValueColor} text-4xl sm:text-6xl font-bold break-words`}>
                                {formatTokenAmount(tokenAmount)} {tokenSymbol}
                              </span>
                              <span className={`${mainValueColor} text-base sm:text-lg font-semibold`}>
                                (${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </span>
                  </div>
                            <p className="text-gray-500 text-xs">
                              {activeTab === 'paperhand' 
                                ? 'Amount of tokens sold • Missed gains in USD'
                                : activeTab === 'roundtrip'
                                ? 'Amount roundtripped • Value received in USD'
                                : 'Amount currently held • Current value in USD'}
                            </p>
                    </div>
                        )}
                        {contractAddress && (
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500">CA:</span>
                            <span className="text-white font-mono" title={contractAddress}>
                              {contractAddress.slice(0, 4)}...{contractAddress.slice(-4)}
                            </span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(contractAddress);
                                setCopiedAddress(contractAddress);
                                setTimeout(() => setCopiedAddress(''), 2000);
                              }}
                              className="text-green-400 hover:text-green-300 transition flex-shrink-0"
                              title="Copy contract address"
                            >
                              {copiedAddress === contractAddress ? (
                                <Check size={14} className="text-green-400" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                            <a
                              href={`https://solscan.io/token/${contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 transition flex-shrink-0"
                              title="Verify token on Solscan"
                    >
                              <ExternalLink size={14} />
                    </a>
                            {platform && (
                              <span className="text-gray-500 text-xs ml-2">{platform}</span>
                            )}
                  </div>
                        )}
                        {/* Display token name/ticker properly */}
                        {displayToken && (
                          <div className="flex items-center gap-2 text-xs mt-1">
                            <span className="text-gray-500">Ticker:</span>
                            <span className="text-white font-semibold">{tokenSymbol}</span>
                            {tokenName && tokenName !== tokenSymbol && (
                              <>
                                <span className="text-gray-500">•</span>
                                <span className="text-gray-400" title={tokenName}>{tokenName}</span>
                              </>
                            )}
                </div>
              )}
                      </div>

                      {/* 2x2 Transaction Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {gridCards.map((card, idx) => {
                          // Determine color based on gain/loss/breakeven
                          let valueColor = 'text-white';
                          if (card.isGain) valueColor = 'text-green-500';
                          else if (card.isLoss) valueColor = 'text-red-500';
                          else if (card.isBreakeven) valueColor = 'text-white';
                          
                          return (
                            <GlassCard key={idx} className="p-4">
                              <div className="flex items-center gap-1 mb-1">
                                <p className="text-gray-400 text-xs">{card.label}</p>
                                {card.tooltip && (
                                  <span 
                                    className="text-gray-500 text-xs cursor-help"
                                    title={card.tooltip}
                                  >
                                    ⓘ
                                  </span>
                                )}
                              </div>
                              {card.description && (
                                <p className="text-gray-500 text-xs mb-2 italic">{card.description}</p>
                              )}
                              {card.value ? (
                                <p className={`${valueColor} text-lg font-semibold`}>{card.value}</p>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className={`${valueColor} text-lg font-semibold`}>
                                      {card.sol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <img 
                                      src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                                      alt="SOL" 
                                      className="w-5 h-5"
                                      onError={(e) => {
                                        e.target.src = 'https://cryptologos.cc/logos/solana-sol-logo.png';
                                      }}
                                    />
                          </div>
                                  <p className={`${valueColor} text-xs mt-1 font-medium`}>
                                    (${card.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                  </p>
                                  <p className="text-gray-500 text-xs mt-1">
                                    {card.label === 'Bought with' || card.label === 'Invested' 
                                      ? 'Amount spent'
                                      : card.label === 'Sold for' || card.label === 'Roundtripped'
                                      ? 'Amount received'
                                      : card.label === 'Fumbled'
                                      ? 'Missed opportunity value'
                                      : card.label === 'Now worth'
                                      ? 'Current market value'
                                      : card.label === 'Gains'
                                      ? 'Profit or loss amount'
                                      : 'Value'}
                                  </p>
                                </>
                              )}
                            </GlassCard>
                          );
                        })}
                          </div>

                      {/* Warning if value at reference price is still below buy cost */}
                      {activeTab === 'paperhand' && (() => {
                        const tokenToShow = displayToken;
                        const tokensSold = tokenToShow?.totalSold || 0;
                        const referencePriceAfterSell = tokenToShow?.referencePriceAfterSell || 0;
                        const boughtCost = tokenToShow?.totalCost || 0;
                        
                        // Calculate value at reference price: tokensSold × referencePriceAfterSell
                        const valueAtReferencePrice = tokensSold * referencePriceAfterSell;
                        const showWarning = referencePriceAfterSell > 0 && valueAtReferencePrice > 0 && valueAtReferencePrice < boughtCost;
                        
                        if (showWarning) {
                          return (
                            <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                              <p className="text-yellow-300 text-xs font-medium">
                                ⚠️ Info: The value at reference price (${valueAtReferencePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) is still below your buy cost (${boughtCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). This represents missed post-sale upside, not guaranteed profit.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Verification Section */}
                      <div className="mt-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#404040]">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-gray-400 text-sm font-semibold">Data Verification</p>
                          <span className="text-gray-500 text-xs">
                            {results.transactions?.length || 0} transactions analyzed
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <a
                            href={`https://solscan.io/account/${walletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] hover:bg-[#404040] border border-[#404040] rounded-lg transition text-white text-sm"
                          >
                            <ExternalLink size={14} />
                            View Wallet on Solscan
                          </a>
                          <a
                            href={`https://explorer.solana.com/address/${walletAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] hover:bg-[#404040] border border-[#404040] rounded-lg transition text-white text-sm"
                          >
                            <ExternalLink size={14} />
                            View on Solana Explorer
                          </a>
                          {contractAddress && (
                            <a
                              href={`https://solscan.io/token/${contractAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition text-white text-sm font-semibold"
                            >
                              <ExternalLink size={14} />
                              Verify Token
                            </a>
                  )}
                </div>
                        <p className="text-gray-500 text-xs mt-3">
                          Data sourced from Helius API • Last updated: {results.lastUpdated ? new Date(results.lastUpdated).toLocaleString() : 'N/A'}
                        </p>
                          </div>
                          </div>
                  );
                })()}

                {/* Bottom Action Bar - Matching paperhands.gm.ai */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t border-[#404040]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-gray-400 text-xs sm:text-sm">Wallet Address</span>
                    <span className="text-white font-mono text-xs sm:text-sm break-all">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(walletAddress);
                        setCopiedAddress(walletAddress);
                        setTimeout(() => setCopiedAddress(''), 2000);
                      }}
                      className="text-green-400 hover:text-green-300 transition flex-shrink-0"
                      title="Copy wallet address"
                    >
                      {copiedAddress === walletAddress ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                    <a
                      href={`https://solscan.io/account/${walletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                      className="text-green-400 hover:text-green-300 transition flex-shrink-0"
                      title="Verify wallet on Solscan"
                        >
                      <ExternalLink size={14} />
                        </a>
                      </div>
                  <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => setShowSearchModal(true)}
                      className="flex-1 sm:flex-none bg-[#2a2a2a] hover:bg-[#404040] border border-[#404040] text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
                    >
                      Checker
                    </button>
                    <button
                      onClick={async () => {
                        const result = await exportService.copyShareableLink(walletAddress, results);
                        if (result.success) {
                          alert('Shareable link copied to clipboard!');
                        } else {
                          alert('Failed to copy link. Please copy manually: ' + result.link);
                        }
                      }}
                      className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
                    >
                      <Share2 size={16} />
                      Share
                    </button>
                </div>
            </div>
                </div>
              )}

            {filteredAndSortedTokens.length === 0 && (
              <GlassCard className="p-12 text-center">
                <p className="text-gray-400 text-lg">No tokens found matching your filters.</p>
              </GlassCard>
            )}


            {/* Footer - Matching paperhands.gm.ai */}
            <div className="text-center py-6 space-y-3">
              <p className="text-gray-400 text-sm">Powered by JitterHands.fun</p>
              <div className="flex items-center justify-center gap-4">
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition">
                  <span className="text-xl">𝕏</span>
                </a>
                <a href="https://t.me" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition">
                  <span className="text-xl">✈️</span>
                </a>
                <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition">
                  <span className="text-xl">💬</span>
                </a>
            </div>
            </div>
          </div>
        )}
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSearch={async (address) => {
          setWalletAddress(address); // Set the address first
          setShowSearchModal(false);
          setError(''); // Clear any previous errors
          // Wait a bit longer and ensure address is set before fetching
          await new Promise(resolve => setTimeout(resolve, 150));
          // Double-check address is set before calling fetchWalletData
          if (address && address.trim()) {
            fetchWalletData();
          }
        }}
        loading={loading}
      />

      {/* Donation Support Section - Bottom */}
      <DonationSupport position="bottom" />
    </div>
  );
};

export default SolanaAnalyzer;
