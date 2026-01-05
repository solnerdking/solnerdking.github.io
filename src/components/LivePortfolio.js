import React, { useState, useEffect } from 'react';
import GlassCard from './GlassCard';
import AnimatedCounter from './AnimatedCounter';
import priceService from '../services/priceService';

const LivePortfolio = ({ tokens = [] }) => {
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [priceUpdates, setPriceUpdates] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    if (!tokens || tokens.length === 0) return;

    // Calculate initial portfolio value
    const calculateValue = () => {
      let total = 0;
      tokens.forEach(token => {
        const price = priceUpdates[token.mint] || token.currentPrice || 0;
        const held = token.currentHeld || 0;
        total += price * held;
      });
      setPortfolioValue(total);
      setLastUpdate(new Date());
    };

    calculateValue();

    // Subscribe to price updates for all held tokens
    const unsubscribes = tokens
      .filter(token => (token.currentHeld || 0) > 0)
      .map(token => {
        return priceService.subscribe(token.mint, (price) => {
          setPriceUpdates(prev => ({
            ...prev,
            [token.mint]: price,
          }));
        });
      });

    // Recalculate value when prices update
    const interval = setInterval(calculateValue, 1000);

    return () => {
      unsubscribes.forEach(unsub => unsub());
      clearInterval(interval);
    };
  }, [tokens, priceUpdates]);

  // Calculate P&L with validation
  const totalCost = tokens.reduce((sum, token) => {
    const bought = Math.max(0, parseFloat(token.totalBought) || 0);
    const price = Math.max(0, parseFloat(token.avgBuyPrice) || 0);
    const cost = bought * price;
    return sum + (isFinite(cost) ? cost : 0);
  }, 0);

  const currentPL = portfolioValue - totalCost;
  const plPercentage = totalCost > 0 && isFinite(currentPL) && isFinite(totalCost)
    ? (currentPL / totalCost) * 100 
    : 0;

  if (tokens.length === 0) return null;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">Live Portfolio Value</h3>
          <p className="text-gray-400 text-xs">
            {lastUpdate && `Updated ${lastUpdate.toLocaleTimeString()}`}
          </p>
        </div>
        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-400 text-xs mb-2">Total Value</p>
          <p className="text-green-400 text-3xl font-bold">
            $<AnimatedCounter value={portfolioValue} decimals={0} />
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-2">P&L</p>
          <p className={`text-3xl font-bold ${currentPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            $<AnimatedCounter value={currentPL} decimals={0} />
          </p>
          <p className={`text-sm mt-1 ${currentPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ({plPercentage >= 0 ? '+' : ''}{plPercentage.toFixed(2)}%)
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#404040]">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Held Tokens</span>
          <span className="text-white font-semibold">
            {tokens.filter(t => (t.currentHeld || 0) > 0).length}
          </span>
        </div>
      </div>
    </GlassCard>
  );
};

export default LivePortfolio;

