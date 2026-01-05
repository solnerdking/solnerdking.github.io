import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import GlassCard from './GlassCard';
import priceService from '../services/priceService';

const Watchlist = ({ tokens = [] }) => {
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});

  // Load watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('jitterhands_watchlist');
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading watchlist:', e);
      }
    }
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem('jitterhands_watchlist', JSON.stringify(watchlist));
    }
  }, [watchlist]);

  // Subscribe to price updates for watchlist tokens
  useEffect(() => {
    const unsubscribes = watchlist.map(({ mint }) => {
      return priceService.subscribe(mint, (price) => {
        setPrices(prev => ({
          ...prev,
          [mint]: price,
        }));
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [watchlist]);

  // Note: addToWatchlist function is exported below for use in App.js

  const removeFromWatchlist = (mint) => {
    setWatchlist(prev => prev.filter(w => w.mint !== mint));
    setPrices(prev => {
      const updated = { ...prev };
      delete updated[mint];
      return updated;
    });
  };

  if (watchlist.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Watchlist</h3>
        <p className="text-gray-400 text-center py-8">
          No tokens in watchlist. Click the star icon on any token card to add it.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Watchlist</h3>
        <span className="text-gray-400 text-sm">{watchlist.length} tokens</span>
      </div>
      
      <div className="space-y-2">
        {watchlist.map((item) => {
          const token = tokens.find(t => t.mint === item.mint);
          const currentPrice = prices[item.mint] || token?.currentPrice || 0;
          const priceChange = token && token.avgBuyPrice && currentPrice
            ? ((currentPrice - token.avgBuyPrice) / token.avgBuyPrice) * 100
            : 0;

          return (
            <div
              key={item.mint}
              className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg hover:bg-[#2a2a2a] transition-all"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Token Image */}
                <div className="relative flex-shrink-0">
                  <img
                    src={token?.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${item.mint}/logo.png`}
                    alt={item.symbol}
                    className="w-10 h-10 rounded object-cover bg-[#404040]"
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.symbol || item.mint.slice(0, 2))}&background=22c55e&color=fff&size=64&bold=true`;
                    }}
                  />
                  {token?.verified && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border border-[#1a1a1a]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold truncate">{item.symbol || 'Unknown'}</span>
                    {token?.isWrapped && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                        Wrapped
                      </span>
                    )}
                    {token?.verified && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs truncate" title={item.name}>{item.name || 'Unknown Token'}</p>
                  <p className="text-gray-500 text-xs font-mono truncate mt-0.5" title={item.mint}>
                    CA: {item.mint.slice(0, 6)}...{item.mint.slice(-4)}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-gray-400 text-xs">
                      ${currentPrice > 0 ? currentPrice.toFixed(6) : 'N/A'}
                    </span>
                    {priceChange !== 0 && (
                      <span className={`text-xs font-medium ${
                        priceChange >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeFromWatchlist(item.mint)}
                className="p-1 hover:bg-[#404040] rounded transition-all flex-shrink-0 ml-2"
                title="Remove from watchlist"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

// Export function to add token to watchlist
export const addToWatchlist = (token, setWatchlist) => {
  const saved = localStorage.getItem('jitterhands_watchlist');
  const watchlist = saved ? JSON.parse(saved) : [];
  
  if (!watchlist.find(w => w.mint === token.mint)) {
    const updated = [...watchlist, {
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      addedAt: Date.now(),
    }];
    localStorage.setItem('jitterhands_watchlist', JSON.stringify(updated));
    if (setWatchlist) setWatchlist(updated);
    return true;
  }
  return false;
};

// Export function to check if token is in watchlist
export const isInWatchlist = (mint) => {
  const saved = localStorage.getItem('jitterhands_watchlist');
  if (!saved) return false;
  const watchlist = JSON.parse(saved);
  return watchlist.some(w => w.mint === mint);
};

export default Watchlist;

