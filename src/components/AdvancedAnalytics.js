import React, { useMemo } from 'react';
import GlassCard from './GlassCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const AdvancedAnalytics = ({ tokens = [] }) => {
  const analytics = useMemo(() => {
    if (!tokens || tokens.length === 0) return null;

    // Win rate calculation
    const profitableTrades = tokens.filter(t => (t.roi || 0) > 0).length;
    const winRate = (profitableTrades / tokens.length) * 100;

    // Average hold time by token
    const avgHoldTime = tokens.reduce((sum, t) => sum + (t.timeHeldDays || 0), 0) / tokens.length;

    // Best/worst trading times (simplified - would need transaction timestamps)
    const tradesByHour = {};
    tokens.forEach(token => {
      if (token.firstBuyDate) {
        const hour = token.firstBuyDate.getHours();
        tradesByHour[hour] = (tradesByHour[hour] || 0) + 1;
      }
    });
    const bestTradingHour = Object.entries(tradesByHour)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Hold time distribution - define before use
    const holdTimeRanges = [
      { name: '< 1 day', min: 0, max: 1, count: 0 },
      { name: '1-7 days', min: 1, max: 7, count: 0 },
      { name: '7-30 days', min: 7, max: 30, count: 0 },
      { name: '30-90 days', min: 30, max: 90, count: 0 },
      { name: '> 90 days', min: 90, max: Infinity, count: 0 },
    ];

    // Correlation analysis (tokens traded together)
    const tokenPairs = {};
    tokens.forEach((token, i) => {
      tokens.slice(i + 1).forEach(otherToken => {
        const pairKey = [token.symbol, otherToken.symbol].sort().join('-');
        if (!tokenPairs[pairKey]) {
          tokenPairs[pairKey] = {
            token1: token.symbol,
            token2: otherToken.symbol,
            count: 0,
            avgROI1: 0,
            avgROI2: 0,
          };
        }
        tokenPairs[pairKey].count++;
        tokenPairs[pairKey].avgROI1 += token.roiIfHeldCurrent || 0;
        tokenPairs[pairKey].avgROI2 += otherToken.roiIfHeldCurrent || 0;
      });
    });

    // Risk metrics with validation
    const rois = tokens
      .map(t => parseFloat(t.roiIfHeldCurrent) || 0)
      .filter(r => isFinite(r));
    
    if (rois.length === 0) {
      return {
        winRate: 0,
        avgHoldTime: 0,
        bestTradingHour: null,
        tokenPairs: [],
        sharpeRatio: 0,
        maxDrawdown: 0,
        holdTimeDistribution: holdTimeRanges,
      };
    }
    
    const avgROI = rois.reduce((sum, r) => sum + r, 0) / rois.length;
    const variance = rois.reduce((sum, r) => sum + Math.pow(r - avgROI, 2), 0) / rois.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 && isFinite(avgROI) && isFinite(stdDev) 
      ? avgROI / stdDev 
      : 0;

    // Max drawdown with validation
    let maxDrawdown = 0;
    let peak = 0;
    tokens.forEach(token => {
      const value = Math.max(0, parseFloat(token.whatIfCurrentValue) || 0);
      if (isFinite(value) && value > peak) peak = value;
      const drawdown = peak > 0 && isFinite(value) 
        ? ((peak - value) / peak) * 100 
        : 0;
      if (isFinite(drawdown) && drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    tokens.forEach(token => {
      const days = token.timeHeldDays || 0;
      holdTimeRanges.forEach(range => {
        if (days >= range.min && days < range.max) {
          range.count++;
        }
      });
    });

    return {
      winRate,
      avgHoldTime,
      bestTradingHour,
      tokenPairs: Object.values(tokenPairs).slice(0, 5),
      sharpeRatio,
      maxDrawdown,
      holdTimeDistribution: holdTimeRanges,
    };
  }, [tokens]);

  if (!analytics || !tokens || tokens.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Advanced Analytics</h3>
        <p className="text-gray-400 text-center py-8">No analytics data available</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Advanced Analytics</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-gray-400 text-xs mb-2">Win Rate</p>
            <p className="text-green-400 text-2xl font-bold">
              {analytics.winRate.toFixed(1)}%
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {tokens.filter(t => (t.roi || 0) > 0).length} / {tokens.length} profitable
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-2">Avg Hold Time</p>
            <p className="text-white text-2xl font-bold">
              {Math.round(analytics.avgHoldTime)} days
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-2">Sharpe Ratio</p>
            <p className="text-white text-2xl font-bold">
              {analytics.sharpeRatio.toFixed(2)}
            </p>
            <p className="text-gray-500 text-xs mt-1">Risk-adjusted return</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-2">Max Drawdown</p>
            <p className="text-red-400 text-2xl font-bold">
              {analytics.maxDrawdown.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Hold Time Distribution Chart */}
        <div className="mb-6">
          <h4 className="text-white font-semibold mb-3">Hold Time Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics.holdTimeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="rgba(255,255,255,0.5)"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.5)"
                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {analytics.holdTimeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="#22c55e" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Best Trading Hour */}
        {analytics.bestTradingHour !== null && (
          <div className="pt-4 border-t border-[#404040]">
            <p className="text-gray-400 text-sm mb-2">Most Active Trading Hour</p>
            <p className="text-white text-lg font-semibold">
              {analytics.bestTradingHour}:00 - {parseInt(analytics.bestTradingHour) + 1}:00
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default AdvancedAnalytics;

