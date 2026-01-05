import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import GlassCard from './components/GlassCard';
import PLChart from './components/PLChart';
import PortfolioTimeline from './components/PortfolioTimeline';
import ROIDistribution from './components/ROIDistribution';
import TokenDistributionChart from './components/TokenDistributionChart';
import PerformanceChart from './components/PerformanceChart';
import LiveTicker from './components/LiveTicker';
import AnimatedCounter from './components/AnimatedCounter';
import Sparkline from './components/Sparkline';
import LivePortfolio from './components/LivePortfolio';
import Watchlist, { isInWatchlist, addToWatchlist as addToWatchlistUtil } from './components/Watchlist';
import TokenComparison from './components/TokenComparison';
import AdvancedAnalytics from './components/AdvancedAnalytics';
import TradingInsights from './components/TradingInsights';
import PriceAlerts from './components/PriceAlerts';
import exportService from './utils/exportService';
import cacheService from './services/cacheService';
import { Star, Download, Share2, FileText, Bell } from 'lucide-react';

const SolanaAnalyzer = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [expandedTokens, setExpandedTokens] = useState(new Set());
  const [selectedTokenFromDropdown, setSelectedTokenFromDropdown] = useState('');
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('missedGains');
  const [dateFilter, setDateFilter] = useState('all');

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
              } else {
                // Weighted average: (old_avg * old_count + new_price) / (old_count + 1)
          tokenMap[mint].avgSellPrice = (tokenMap[mint].avgSellPrice * tokenMap[mint].sellCount + priceUsd) / (tokenMap[mint].sellCount + 1);
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
              } else {
                // Weighted average: (old_avg * old_count + new_price) / (old_count + 1)
          tokenMap[mint].avgBuyPrice = (tokenMap[mint].avgBuyPrice * tokenMap[mint].buyCount + priceUsd) / (tokenMap[mint].buyCount + 1);
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
    // Validate and sanitize inputs
    const totalBought = Math.max(0, parseFloat(token.totalBought) || 0);
    const totalSold = Math.max(0, parseFloat(token.totalSold) || 0);
    const currentHeld = Math.max(0, parseFloat(token.currentHeld) || 0);
    const avgBuyPrice = Math.max(0, parseFloat(token.avgBuyPrice) || 0);
    const avgSellPrice = Math.max(0, parseFloat(token.avgSellPrice) || 0);
    const currentPrice = Math.max(0, parseFloat(token.currentPrice) || 0);
    const ath = Math.max(0, parseFloat(token.ath) || 0);
    
    // Calculate total cost (what was spent buying tokens)
    const totalCost = totalBought * avgBuyPrice;
    
    // Calculate actual proceeds (what was received from selling)
    const actualProceeds = totalSold * avgSellPrice;
    
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
    
    // Missed gains = what we would have if held - what we actually got
    // Only count missed gains if we actually sold something
    const missedGainsCurrent = totalSold > 0 
      ? Math.max(0, whatIfCurrentValue - actualProceeds)
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
      const endDate = token.lastSellDate || new Date();
      timeHeldDays = Math.max(0, differenceInDays(endDate, token.firstBuyDate));
    }
    
    // Price change percentage
    let priceChange = 0;
    if (avgBuyPrice > 0 && currentPrice > 0) {
      priceChange = ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
    }
    
    // Validate all calculations are finite numbers
    const validateNumber = (val) => {
      const num = parseFloat(val);
      return isFinite(num) ? num : 0;
    };
    
    return {
      ...token,
      totalCost: validateNumber(totalCost),
      actualProceeds: validateNumber(actualProceeds),
      currentValue: validateNumber(currentValue),
      roi: validateNumber(roi),
      whatIfCurrentValue: validateNumber(whatIfCurrentValue),
      missedGainsCurrent: validateNumber(missedGainsCurrent),
      roiIfHeldCurrent: validateNumber(roiIfHeldCurrent),
      whatIfATHValue: validateNumber(whatIfATHValue),
      missedGainsATH: validateNumber(missedGainsATH),
      roiIfHeldATH: validateNumber(roiIfHeldATH),
      timeHeldDays: Math.max(0, Math.round(timeHeldDays)),
      priceChange: validateNumber(priceChange),
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

      // Enrich tokens with comprehensive metadata from multiple sources
      const enrichedTokens = await Promise.all(
        allTokens.map(async (token) => {
          let symbol = token.symbol || '';
          let name = token.name || '';
          let currentPrice = 0;
          let ath = 0;
          let athDate = null;
          let platform = 'Solana';
          let developerWallet = null;
          let creatorWallet = null;
          let website = null;
          let twitter = null;
          let telegram = null;
          let description = null;
          let logoURI = null;
          let isWrapped = false;
          let wrappedTokenAddress = null;
          let marketCap = 0;
          let volume24h = 0;
          let liquidity = 0;
          let verified = false;
          let decimals = 9;
          
          // Try DexScreener first for comprehensive token data
          try {
            const dexscreenerResponse = await fetch(`${backendUrl}?endpoint=dexscreener&mint=${token.mint}`);
            if (dexscreenerResponse.ok) {
              const dexscreenerData = await dexscreenerResponse.json();
              if (dexscreenerData.success && dexscreenerData.data) {
                const tokenInfo = dexscreenerData.data;
                
                // Extract comprehensive data
                if (tokenInfo.symbol) symbol = tokenInfo.symbol;
                if (tokenInfo.name) name = tokenInfo.name;
                if (tokenInfo.price?.usd) currentPrice = tokenInfo.price.usd;
                if (tokenInfo.liquidity) liquidity = tokenInfo.liquidity;
                if (tokenInfo.volume24h) volume24h = tokenInfo.volume24h;
                if (tokenInfo.logoURI) logoURI = tokenInfo.logoURI;
                if (tokenInfo.history?.ath?.value) {
                  ath = tokenInfo.history.ath.value;
                  athDate = tokenInfo.history.ath.unixTime ? new Date(tokenInfo.history.ath.unixTime * 1000) : null;
                }
              }
            }
          } catch (e) {
            console.log('DexScreener error for', token.mint, ':', e);
          }
          
          // Try BirdEye for price data and additional metadata
          try {
            const birdeyeResponse = await fetch(`${backendUrl}?endpoint=birdeye&mint=${token.mint}`);
            if (birdeyeResponse.ok) {
              const birdeyeData = await birdeyeResponse.json();
              if (birdeyeData.success && birdeyeData.data) {
                const tokenInfo = birdeyeData.data;
                
                // Extract price
                if (!currentPrice) {
                  currentPrice = tokenInfo.price?.usd || 
                                (typeof tokenInfo.price === 'number' ? tokenInfo.price : 0) || 0;
                }
                
                // Extract ATH
                if (!ath) {
                  ath = tokenInfo.history?.ath?.value || 
                       (typeof tokenInfo.ath === 'number' ? tokenInfo.ath : 0) || 
                       currentPrice || 0;
                  athDate = tokenInfo.history?.ath?.unixTime ? new Date(tokenInfo.history.ath.unixTime * 1000) : null;
                }
                
                // Update symbol and name if available and better
                if (tokenInfo.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenInfo.symbol;
                if (tokenInfo.name && (!name || name === 'Unknown Token')) name = tokenInfo.name;
                if (tokenInfo.logoURI && !logoURI) logoURI = tokenInfo.logoURI;
                if (tokenInfo.decimals) decimals = tokenInfo.decimals;
              }
            }
          } catch (e) {
            console.log('BirdEye error for', token.mint, ':', e);
          }
          
          // Try CoinGecko for comprehensive metadata (if available)
          try {
            const coingeckoResponse = await fetch(`${backendUrl}?endpoint=coingecko&mint=${token.mint}`);
            if (coingeckoResponse.ok) {
              const coingeckoData = await coingeckoResponse.json();
              if (coingeckoData.success && coingeckoData.data) {
                const tokenInfo = coingeckoData.data;
                
                // Extract comprehensive metadata
                if (tokenInfo.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenInfo.symbol;
                if (tokenInfo.name && (!name || name === 'Unknown Token')) name = tokenInfo.name;
                if (tokenInfo.logoURI && !logoURI) logoURI = tokenInfo.logoURI;
                if (tokenInfo.marketCap) marketCap = tokenInfo.marketCap;
                if (tokenInfo.volume24h && !volume24h) volume24h = tokenInfo.volume24h;
                if (tokenInfo.description) description = tokenInfo.description;
                if (tokenInfo.links?.homepage?.[0]) website = tokenInfo.links.homepage[0];
                if (tokenInfo.links?.twitter_screen_name) twitter = `https://twitter.com/${tokenInfo.links.twitter_screen_name}`;
                if (tokenInfo.links?.telegram_channel_identifier) telegram = `https://t.me/${tokenInfo.links.telegram_channel_identifier}`;
                if (tokenInfo.platforms?.solana) {
                  platform = 'Solana';
                  // Check if it's a wrapped token
                  if (tokenInfo.platforms.ethereum || tokenInfo.platforms.bsc) {
                    isWrapped = true;
                    wrappedTokenAddress = tokenInfo.platforms.ethereum || tokenInfo.platforms.bsc;
                  }
                }
              }
            }
          } catch (e) {
            console.log('CoinGecko error for', token.mint, ':', e);
          }
          
          // Try Solscan for developer/creator info
          if ((!symbol || symbol === 'Unknown') || (!name || name === 'Unknown Token') || !developerWallet) {
            try {
              const solscanResponse = await fetch(`${backendUrl}?endpoint=solscan&mint=${token.mint}`);
              if (solscanResponse.ok) {
                const solscanData = await solscanResponse.json();
                if (solscanData.success && solscanData.data) {
                  const tokenInfo = solscanData.data;
                  if (tokenInfo.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenInfo.symbol;
                  if (tokenInfo.name && (!name || name === 'Unknown Token')) name = tokenInfo.name;
                  if (tokenInfo.creator || tokenInfo.authority) {
                    developerWallet = tokenInfo.creator || tokenInfo.authority;
                  }
                  if (tokenInfo.owner) {
                    creatorWallet = tokenInfo.owner;
                  }
                  if (tokenInfo.website) website = tokenInfo.website;
                  if (tokenInfo.twitter) twitter = tokenInfo.twitter;
                  if (tokenInfo.telegram) telegram = tokenInfo.telegram;
                  if (tokenInfo.description) description = tokenInfo.description;
                  if (tokenInfo.logoURI && !logoURI) logoURI = tokenInfo.logoURI;
                  if (tokenInfo.verified !== undefined) verified = tokenInfo.verified;
                }
              }
            } catch (e) {
              console.log('Solscan error for', token.mint, ':', e);
            }
          }
          
          // Try Helius for token metadata and creator info
          if ((!symbol || symbol === 'Unknown') || (!name || name === 'Unknown Token') || !developerWallet) {
            try {
              const heliusResponse = await fetch(`${backendUrl}?endpoint=helius-token&mint=${token.mint}`);
              if (heliusResponse.ok) {
                const heliusData = await heliusResponse.json();
                if (heliusData.success && heliusData.data && Array.isArray(heliusData.data) && heliusData.data.length > 0) {
                  const tokenInfo = heliusData.data[0];
                  if (tokenInfo.onChainMetadata?.metadata?.data?.name && (!name || name === 'Unknown Token')) {
                    name = tokenInfo.onChainMetadata.metadata.data.name;
                  }
                  if (tokenInfo.onChainMetadata?.metadata?.data?.symbol && (!symbol || symbol === 'Unknown')) {
                    symbol = tokenInfo.onChainMetadata.metadata.data.symbol;
                  }
                  if (tokenInfo.onChainMetadata?.metadata?.data?.uri) {
                    // Try to fetch off-chain metadata
                    try {
                      const metadataResponse = await fetch(tokenInfo.onChainMetadata.metadata.data.uri);
                      if (metadataResponse.ok) {
                        const metadata = await metadataResponse.json();
                        if (metadata.name && (!name || name === 'Unknown Token')) name = metadata.name;
                        if (metadata.symbol && (!symbol || symbol === 'Unknown')) symbol = metadata.symbol;
                        if (metadata.description) description = metadata.description;
                        if (metadata.image && !logoURI) logoURI = metadata.image;
                        if (metadata.website) website = metadata.website;
                        if (metadata.twitter) twitter = metadata.twitter;
                        if (metadata.telegram) telegram = metadata.telegram;
                        if (metadata.creators && metadata.creators.length > 0) {
                          developerWallet = metadata.creators[0].address;
                        }
                      }
                    } catch (e) {
                      console.log('Metadata URI fetch error:', e);
                    }
                  }
                  if (tokenInfo.mintAuthority && !developerWallet) {
                    developerWallet = tokenInfo.mintAuthority;
                  }
                  if (tokenInfo.freezeAuthority && !creatorWallet) {
                    creatorWallet = tokenInfo.freezeAuthority;
                  }
                }
              }
            } catch (e) {
              console.log('Helius token error for', token.mint, ':', e);
            }
          }
          
          // Try Pump.fun for launchpad tokens (especially memecoins)
          if (!logoURI || (!symbol || symbol === 'Unknown') || (!name || name === 'Unknown Token')) {
            try {
              const pumpfunResponse = await fetch(`${backendUrl}?endpoint=pumpfun&mint=${token.mint}`);
              if (pumpfunResponse.ok) {
                const pumpfunData = await pumpfunResponse.json();
                if (pumpfunData.success && pumpfunData.data) {
                  const tokenInfo = pumpfunData.data;
                  if (tokenInfo.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenInfo.symbol;
                  if (tokenInfo.name && (!name || name === 'Unknown Token')) name = tokenInfo.name;
                  if (tokenInfo.logoURI && !logoURI) logoURI = tokenInfo.logoURI;
                  if (tokenInfo.platform && platform === 'Solana') platform = tokenInfo.platform;
                  if (tokenInfo.website && !website) website = tokenInfo.website;
                  if (tokenInfo.twitter && !twitter) twitter = tokenInfo.twitter;
                  if (tokenInfo.telegram && !telegram) telegram = tokenInfo.telegram;
                  if (tokenInfo.description && !description) description = tokenInfo.description;
                }
              }
            } catch (e) {
              console.log('Pump.fun error for', token.mint, ':', e);
            }
          }
          
          // Try Solana Token List for verified tokens
          try {
            const tokenListResponse = await fetch('https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json');
            if (tokenListResponse.ok) {
              const tokenListData = await tokenListResponse.json();
              const tokenFromList = tokenListData.tokens?.find(t => t.address === token.mint);
              if (tokenFromList) {
                if (tokenFromList.symbol && (!symbol || symbol === 'Unknown')) symbol = tokenFromList.symbol;
                if (tokenFromList.name && (!name || name === 'Unknown Token')) name = tokenFromList.name;
                if (tokenFromList.logoURI && !logoURI) logoURI = tokenFromList.logoURI;
                verified = true;
                if (tokenFromList.decimals) decimals = tokenFromList.decimals;
              }
            }
          } catch (e) {
            console.log('Token list error:', e);
          }
          
          // Final fallback: use mint address
          if (!symbol || symbol === 'Unknown') {
            symbol = token.mint.slice(0, 4).toUpperCase();
          }
          if (!name || name === 'Unknown Token') {
            name = `${symbol} Token`;
          }
          
          // Use transaction prices if available and > 0
          // Only use current price as fallback if we have no transaction price data
          // This ensures we don't use inaccurate estimates
          let finalBuyPrice = token.avgBuyPrice > 0 ? token.avgBuyPrice : 0;
          let finalSellPrice = token.avgSellPrice > 0 ? token.avgSellPrice : 0;
          
          // Only use current price as fallback if:
          // 1. We have no transaction price data AND
          // 2. We have a valid current price from API
          // This prevents using $0 or inaccurate prices
          if (finalBuyPrice === 0 && currentPrice > 0 && token.buyCount === 0) {
            // Only use as fallback if we never had a buy price
            finalBuyPrice = currentPrice;
          }
          if (finalSellPrice === 0 && currentPrice > 0 && token.sellCount === 0) {
            // Only use as fallback if we never had a sell price
            finalSellPrice = currentPrice;
          }
          
          return { 
            ...token, 
            symbol: symbol,
            name: name,
            currentPrice: currentPrice || 0,
            ath: ath || currentPrice || 0,
            athDate: athDate,
            avgBuyPrice: finalBuyPrice,
            avgSellPrice: finalSellPrice,
            // Enhanced metadata
            platform: platform,
            developerWallet: developerWallet,
            creatorWallet: creatorWallet,
            website: website,
            twitter: twitter,
            telegram: telegram,
            description: description,
            logoURI: logoURI,
            isWrapped: isWrapped,
            wrappedTokenAddress: wrappedTokenAddress,
            marketCap: marketCap,
            volume24h: volume24h,
            liquidity: liquidity,
            verified: verified,
            decimals: decimals,
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

      const resultsData = {
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
      };

      // Cache the results
      cacheService.cacheWalletAnalysis(walletAddress.trim(), resultsData);

      setResults(resultsData);
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
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'roi':
          return (b.roiIfHeldCurrent || 0) - (a.roiIfHeldCurrent || 0);
        case 'holdTime':
          return (b.timeHeldDays || 0) - (a.timeHeldDays || 0);
        case 'symbol':
          return (a.symbol || '').localeCompare(b.symbol || '');
        case 'missedGains':
        default:
          return (b.missedGainsCurrent || 0) - (a.missedGainsCurrent || 0);
      }
    });
    
    return filtered;
  }, [results, activeTab, searchQuery, sortBy, dateFilter]);

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

  // Enhanced image component with multiple fallbacks including pump.fun and launchpads
  const TokenImage = React.memo(({ token, size = 'w-20 h-20', className = '' }) => {
    const [imgSrc, setImgSrc] = useState(() => {
      // Try logoURI first, then official token list, then fallback
      return token.logoURI || 
             `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`;
    });
    const [errorCount, setErrorCount] = useState(0);
    
    // Comprehensive fallback sources including pump.fun and other launchpads
    const getFallbackSources = useCallback(() => {
      const symbol = token.symbol || token.mint.slice(0, 4);
      return [
        token.logoURI, // From API metadata (CoinGecko, DexScreener, etc.)
        `https://pump.fun/${token.mint}.png`, // pump.fun CDN
        `https://pump.monster/api/token/${token.mint}/image`, // Alternative pump.fun API
        `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`, // Official token list
        `https://img.raydium.io/${token.mint}`, // Raydium CDN
        `https://static.jup.ag/tokens/${token.mint}.png`, // Jupiter aggregator
        `https://assets.coingecko.com/coins/images/solana/${token.mint}/large.png`, // CoinGecko
        `https://api.dexscreener.com/latest/dex/tokens/${token.mint}`, // DexScreener (may need API call)
        `https://token-list-api.solana.cloud/v1/search?query=${token.mint}`, // Solana Cloud token list
        `https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/${token.mint}/logo.png`, // JSDelivr CDN mirror
        `https://arweave.net/${token.mint}`, // Arweave (some tokens store images here)
        `https://ipfs.io/ipfs/${token.mint}`, // IPFS (some tokens use IPFS)
        `https://gateway.pinata.cloud/ipfs/${token.mint}`, // Pinata IPFS gateway
        `https://ui-avatars.com/api/?name=${encodeURIComponent(symbol)}&background=22c55e&color=fff&size=128&bold=true`, // Generated avatar (last resort)
      ].filter(Boolean); // Remove null/undefined values
    }, [token.mint, token.logoURI, token.symbol]);
    
    useEffect(() => {
      // Reset when token changes
      const sources = getFallbackSources();
      setImgSrc(sources[0] || sources[1] || sources[sources.length - 1]);
      setErrorCount(0);
    }, [token.mint, token.logoURI, token.symbol, getFallbackSources]);
    
    const handleError = () => {
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
        crossOrigin="anonymous"
      />
    );
  });
  
  TokenImage.displayName = 'TokenImage';

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
        data-token-mint={token.mint}
        className="w-full md:w-80 flex-shrink-0 p-6"
      >
        {showRank && (
          <div className="flex justify-between items-start mb-4">
            <div className={`w-8 h-8 ${rankColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
              {index + 1}
        </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addToWatchlistUtil(token);
                // Force re-render to update star state
                setShowWatchlist(prev => !prev);
                setShowWatchlist(prev => !prev);
              }}
              className={`p-1.5 rounded transition-all ${
                isInWatchlist(token.mint)
                  ? 'text-yellow-400 bg-yellow-400/20'
                  : 'text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10'
              }`}
              title={isInWatchlist(token.mint) ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <Star size={16} fill={isInWatchlist(token.mint) ? 'currentColor' : 'none'} />
            </button>
      </div>
        )}
        
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-shrink-0">
            <TokenImage token={token} size="w-20 h-20" />
            {token.currentPrice > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#2a2a2a] animate-pulse" />
            )}
            {token.verified && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-[#2a2a2a] flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-2xl font-bold text-white truncate">{token.symbol || 'Unknown'}</h3>
              {token.currentPrice > 0 && (
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">
                  LIVE
                </span>
              )}
              {token.isWrapped && (
                <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                  Wrapped
                </span>
              )}
              {token.verified && (
                <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">
                  ✓ Verified
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm truncate" title={token.name}>{token.name || 'Unknown Token'}</p>
            {token.platform && token.platform !== 'Solana' && (
              <p className="text-gray-500 text-xs mt-0.5">Platform: {token.platform}</p>
            )}
            {/* Always show contract address in compact form */}
            <p className="text-gray-500 text-xs mt-1 font-mono truncate" title={token.mint}>
              CA: {token.mint.slice(0, 8)}...{token.mint.slice(-6)}
            </p>
          </div>
        </div>
        
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <p className="text-green-500 text-3xl font-bold">
              ${Math.round(token.missedGainsCurrent || token.whatIfCurrentValue || 0).toLocaleString()}
            </p>
            {token.currentPrice > 0 && token.avgBuyPrice > 0 && (
              <span className={`text-xs font-medium ${
                token.currentPrice >= token.avgBuyPrice ? 'text-green-400' : 'text-red-400'
              }`}>
                {token.currentPrice >= token.avgBuyPrice ? '↑' : '↓'}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            ({((token.roiIfHeldCurrent || 0).toFixed(2))}%)
          </p>
          {token.buyPrices && token.buyPrices.length > 1 && (
            <div className="mt-2 h-8">
              <Sparkline 
                data={token.buyPrices.concat(token.currentPrice || token.avgBuyPrice)} 
                positive={token.currentPrice >= token.avgBuyPrice}
              />
            </div>
          )}
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
            
            {/* Token Metadata Section */}
            <div className="pt-2 border-t border-[#404040]">
              <p className="text-gray-500 mb-2 font-semibold">Token Information</p>
              <div className="space-y-1.5 text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-24">Platform:</span>
                  <span className="text-white">{token.platform || 'Solana'}</span>
                  {token.isWrapped && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">Wrapped</span>
                  )}
                  {token.verified && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">✓ Verified</span>
                  )}
                </div>
                {token.developerWallet && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 w-24">Developer:</span>
                    <a 
                      href={`https://solscan.io/account/${token.developerWallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 hover:text-green-300 font-mono text-xs break-all"
                    >
                      {token.developerWallet.slice(0, 8)}...{token.developerWallet.slice(-6)}
                    </a>
                  </div>
                )}
                {token.creatorWallet && token.creatorWallet !== token.developerWallet && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 w-24">Creator:</span>
                    <a 
                      href={`https://solscan.io/account/${token.creatorWallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-400 hover:text-green-300 font-mono text-xs break-all"
                    >
                      {token.creatorWallet.slice(0, 8)}...{token.creatorWallet.slice(-6)}
                    </a>
                  </div>
                )}
                {token.wrappedTokenAddress && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 w-24">Wrapped From:</span>
                    <span className="text-white font-mono text-xs break-all">{token.wrappedTokenAddress}</span>
                  </div>
                )}
                {token.marketCap > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-24">Market Cap:</span>
                    <span className="text-white">${(token.marketCap / 1000000).toFixed(2)}M</span>
                  </div>
                )}
                {token.volume24h > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-24">24h Volume:</span>
                    <span className="text-white">${(token.volume24h / 1000).toFixed(2)}K</span>
                  </div>
                )}
                {token.liquidity > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-24">Liquidity:</span>
                    <span className="text-white">${(token.liquidity / 1000).toFixed(2)}K</span>
                  </div>
                )}
                {token.description && (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 w-24">Description:</span>
                    <span className="text-white text-xs">{token.description.substring(0, 100)}{token.description.length > 100 ? '...' : ''}</span>
                  </div>
                )}
              </div>
              
              {/* Social Links */}
              {(token.website || token.twitter || token.telegram) && (
                <div className="mt-2 pt-2 border-t border-[#404040]">
                  <p className="text-gray-500 mb-1.5 text-xs">Links:</p>
                  <div className="flex flex-wrap gap-2">
                    {token.website && (
                      <a 
                        href={token.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 text-xs"
                      >
                        🌐 Website
                      </a>
                    )}
                    {token.twitter && (
                      <a 
                        href={token.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 text-xs"
                      >
                        🐦 Twitter
                      </a>
                    )}
                    {token.telegram && (
                      <a 
                        href={token.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 text-xs"
                      >
                        💬 Telegram
                      </a>
                    )}
                  </div>
                </div>
              )}
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
        
        <div className="pt-3 border-t border-[#404040] text-xs">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-gray-500 mb-1">Contract Address (CA):</p>
              <p className="text-gray-300 font-mono break-all text-xs" title={token.mint}>
                {token.mint}
              </p>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(token.mint);
                  alert('Contract address copied to clipboard!');
                }}
                className="text-green-400 hover:text-green-300 text-xs px-2 py-1 border border-green-400/30 rounded hover:bg-green-400/10 transition"
                title="Copy contract address"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <a 
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 text-xs px-2 py-1 border border-green-400/30 rounded hover:bg-green-400/10 transition"
            >
              View on Solscan →
            </a>
            <a 
              href={`https://dexscreener.com/solana/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 text-xs px-2 py-1 border border-green-400/30 rounded hover:bg-green-400/10 transition"
            >
              DexScreener →
            </a>
            <a 
              href={`https://birdeye.so/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 text-xs px-2 py-1 border border-green-400/30 rounded hover:bg-green-400/10 transition"
            >
              BirdEye →
            </a>
          </div>
        </div>
      </GlassCard>
    );
  };

  const handleTokenClick = (token) => {
    setSelectedTokenFromDropdown(token.mint);
    setActiveTab('dashboard');
    // Scroll to token card
    setTimeout(() => {
      const element = document.querySelector(`[data-token-mint="${token.mint}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
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

      {/* Live Ticker */}
      {results && results.allTokens && results.allTokens.length > 0 && (
        <LiveTicker tokens={results.allTokens} onTokenClick={handleTokenClick} />
      )}

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
              <button
                onClick={() => {
                  setShowWatchlist(!showWatchlist);
                  setShowComparison(false);
                }}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  showWatchlist
                    ? 'text-yellow-400 border-yellow-400'
                    : 'text-gray-400 border-transparent hover:text-yellow-300'
                }`}
              >
                <Star size={16} className="inline mr-2" fill={showWatchlist ? 'currentColor' : 'none'} />
                Watchlist
              </button>
              <button
                onClick={() => {
                  setShowComparison(!showComparison);
                  setShowWatchlist(false);
                  setShowAlerts(false);
                }}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  showComparison
                    ? 'text-blue-400 border-blue-400'
                    : 'text-gray-400 border-transparent hover:text-blue-300'
                }`}
              >
                Compare
              </button>
              <button
                onClick={() => {
                  setShowAlerts(!showAlerts);
                  setShowWatchlist(false);
                  setShowComparison(false);
                }}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  showAlerts
                    ? 'text-purple-400 border-purple-400'
                    : 'text-gray-400 border-transparent hover:text-purple-300'
                }`}
              >
                <Bell size={16} className="inline mr-2" />
                Alerts
              </button>
                </div>

            {/* Watchlist Tab */}
            {showWatchlist && (
              <div className="mb-6">
                <Watchlist tokens={results.allTokens} />
              </div>
            )}

            {/* Comparison Tab */}
            {showComparison && (
              <div className="mb-6">
                <TokenComparison tokens={results.allTokens} />
            </div>
            )}

            {/* Price Alerts Tab */}
            {showAlerts && (
              <div className="mb-6">
                <PriceAlerts tokens={results.allTokens} />
              </div>
            )}

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Live Portfolio & Jitter Score */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <LivePortfolio tokens={results.allTokens} />
                  <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4">
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
                    <div className="flex gap-2 pt-4 border-t border-[#404040]">
                  <button 
                        onClick={() => exportService.exportToCSV(results.allTokens, `jitterhands-${walletAddress.slice(0, 8)}`)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#404040] hover:bg-[#505050] rounded-lg transition text-gray-300 text-sm"
                        title="Export to CSV"
                      >
                        <Download size={16} />
                        CSV
                  </button>
                      <button
                        onClick={() => exportService.exportToPDF(results, walletAddress)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#404040] hover:bg-[#505050] rounded-lg transition text-gray-300 text-sm"
                        title="Export to PDF"
                      >
                        <FileText size={16} />
                        PDF
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
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#404040] hover:bg-[#505050] rounded-lg transition text-gray-300 text-sm"
                        title="Copy shareable link"
                      >
                        <Share2 size={16} />
                        Share
                      </button>
              </div>
                  </GlassCard>
            </div>

                {/* P&L Summary */}
                <GlassCard className="p-6 hover:border-green-500 transition-all">
                  <h3 className="text-xl font-bold text-white mb-4">Profit & Loss Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="group relative">
                      <p className="text-gray-400 text-xs mb-2">Total Invested</p>
                      <p className="text-white text-2xl font-bold">
                        $<AnimatedCounter value={results.summary.totalCost || 0} decimals={0} />
                      </p>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                    </div>
                    <div className="group relative">
                      <p className="text-gray-400 text-xs mb-2">Total Proceeds</p>
                      <p className="text-white text-2xl font-bold">
                        $<AnimatedCounter value={results.summary.actualProceeds || 0} decimals={0} />
                      </p>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                    </div>
                    <div className="group relative">
                      <p className="text-gray-400 text-xs mb-2">Net P&L</p>
                      <p className={`text-2xl font-bold ${
                        (results.summary.actualProceeds - results.summary.totalCost) >= 0 
                          ? 'text-green-400' 
                          : 'text-red-400'
                      }`}>
                        $<AnimatedCounter 
                          value={(results.summary.actualProceeds || 0) - (results.summary.totalCost || 0)} 
                          decimals={0} 
                        />
                      </p>
                      <p className={`text-xs mt-1 ${
                        (results.summary.actualProceeds - results.summary.totalCost) >= 0 
                          ? 'text-green-400' 
                          : 'text-red-400'
                      }`}>
                        ({results.summary.totalCost > 0 
                          ? (((results.summary.actualProceeds - results.summary.totalCost) / results.summary.totalCost) * 100).toFixed(2)
                          : 0}%)
                      </p>
                      <div className={`absolute inset-0 bg-gradient-to-r from-transparent ${
                        (results.summary.actualProceeds - results.summary.totalCost) >= 0 
                          ? 'via-green-500/20' 
                          : 'via-red-500/20'
                      } to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg`} />
                  </div>
                    <div className="group relative">
                      <p className="text-gray-400 text-xs mb-2">Current Value</p>
                      <p className="text-green-400 text-2xl font-bold">
                        $<AnimatedCounter value={results.summary.totalCurrentValue || 0} decimals={0} />
                      </p>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                  </div>
                </div>
                </GlassCard>

                {/* Wallet Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Missed Gains</p>
                    <p className="text-red-400 text-lg font-semibold">
                      ${Math.round(results.summary.totalMissedGainsCurrent || 0).toLocaleString()}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">If Held to ATH</p>
                    <p className="text-green-400 text-lg font-semibold">
                      ${Math.round(results.summary.totalWhatIfATH || 0).toLocaleString()}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Avg ROI</p>
                    <p className={`text-lg font-semibold ${
                      (results.summary.avgROI || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(results.summary.avgROI || 0).toFixed(2)}%
                    </p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-gray-400 text-xs mb-2">Total Tokens</p>
                    <p className="text-white text-lg font-semibold">
                      {results.summary.totalTokens || 0}
                    </p>
                  </GlassCard>
                </div>

                {/* Currently Held Tokens */}
                <GlassCard className="p-6">
                  <h3 className="text-xl font-bold text-white mb-4">Currently Held Tokens</h3>
                  {results.currentlyHeld.length > 0 ? (
                    <div className="space-y-3">
                      {results.currentlyHeld.map((token) => (
                        <div key={token.mint} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg hover:bg-[#252525] transition">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="relative flex-shrink-0">
                              <TokenImage token={token} size="w-12 h-12" />
                              {token.verified && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border border-[#1a1a1a]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-white font-semibold truncate">{token.symbol || 'Unknown'}</p>
                                {token.isWrapped && (
                                  <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                                    Wrapped
                                  </span>
                                )}
                                {token.verified && (
                                  <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">
                                    ✓
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-400 text-xs truncate" title={token.name}>{token.name || 'Unknown Token'}</p>
                              <p className="text-gray-500 text-xs font-mono truncate mt-0.5" title={token.mint}>
                                {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-white font-semibold text-sm">
                              {(token.currentHeld || 0).toFixed(2)}
                            </p>
                            <p className="text-green-400 text-sm font-semibold">
                              ${Math.round(token.currentValue || 0).toLocaleString()}
                            </p>
                            {token.currentPrice > 0 && (
                              <p className="text-gray-500 text-xs mt-0.5">
                                ${(token.currentPrice || 0).toFixed(6)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                          </div>
                  ) : (
                    <p className="text-gray-400 text-center py-4">No tokens currently held</p>
                  )}
                </GlassCard>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* P&L Chart */}
                  <PLChart tokens={results.allTokens} />
                  
                  {/* Portfolio Timeline */}
                  <PortfolioTimeline tokens={results.allTokens} />
                  
                  {/* ROI Distribution */}
                  <ROIDistribution tokens={results.allTokens} />
                  
                  {/* Token Distribution */}
                  <TokenDistributionChart tokens={results.allTokens} />
                          </div>

                {/* Performance Chart - Full Width */}
                <PerformanceChart tokens={results.allTokens} />

                {/* Advanced Analytics & Trading Insights */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <AdvancedAnalytics tokens={results.allTokens} />
                  <TradingInsights tokens={results.allTokens} />
                          </div>

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
                {/* Search and Filter Controls */}
                <GlassCard className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                      <label className="text-gray-400 text-xs mb-2 block">Search Tokens</label>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by symbol, name, or address..."
                        className="w-full bg-[#1a1a1a] border border-[#404040] rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-all text-sm"
                      />
                          </div>
                          <div>
                      <label className="text-gray-400 text-xs mb-2 block">Sort By</label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#404040] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500 transition-all text-sm"
                      >
                        <option value="missedGains">Missed Gains</option>
                        <option value="roi">ROI If Held</option>
                        <option value="holdTime">Hold Time</option>
                        <option value="symbol">Symbol (A-Z)</option>
                      </select>
                          </div>
                          <div>
                      <label className="text-gray-400 text-xs mb-2 block">Date Range</label>
                      <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#404040] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500 transition-all text-sm"
                      >
                        <option value="all">All Time</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="1y">Last Year</option>
                      </select>
                          </div>
                  </div>
                </GlassCard>

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

                {/* Charts for filtered tokens */}
                {filteredAndSortedTokens.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <PLChart tokens={filteredAndSortedTokens} />
                    <ROIDistribution tokens={filteredAndSortedTokens} />
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
