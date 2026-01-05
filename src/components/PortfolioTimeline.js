import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import GlassCard from './GlassCard';

const PortfolioTimeline = ({ tokens, className = '' }) => {
  // Generate portfolio timeline data
  const generateTimelineData = () => {
    if (!tokens || tokens.length === 0) return [];
    
    // Collect all transaction dates
    const dates = new Set();
    tokens.forEach(token => {
      if (token.firstBuyDate) dates.add(token.firstBuyDate.toISOString().split('T')[0]);
      if (token.lastBuyDate) dates.add(token.lastBuyDate.toISOString().split('T')[0]);
      if (token.firstSellDate) dates.add(token.firstSellDate.toISOString().split('T')[0]);
      if (token.lastSellDate) dates.add(token.lastSellDate.toISOString().split('T')[0]);
    });
    
    const sortedDates = Array.from(dates).sort();
    if (sortedDates.length === 0) return [];
    
    const data = [];
    sortedDates.forEach((date, index) => {
      // Calculate portfolio value at this date
      let actualValue = 0;
      let whatIfValue = 0;
      
      tokens.forEach(token => {
        const tokenDate = new Date(date);
        if (token.firstBuyDate && tokenDate >= token.firstBuyDate) {
          const heldAtDate = token.lastSellDate && tokenDate > token.lastSellDate 
            ? 0 
            : (token.currentHeld || 0);
          const priceAtDate = token.currentPrice || token.avgBuyPrice || 0;
          actualValue += heldAtDate * priceAtDate;
          whatIfValue += (token.totalBought || 0) * priceAtDate;
        }
      });
      
      data.push({
        date,
        actual: Math.round(actualValue),
        whatIf: Math.round(whatIfValue),
      });
    });
    
    return data;
  };

  const chartData = generateTimelineData();

  if (chartData.length === 0) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <h3 className="text-xl font-bold text-white mb-4">Portfolio Timeline</h3>
        <p className="text-gray-400 text-sm text-center">No timeline data available</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      <h3 className="text-xl font-bold text-white mb-4">Portfolio Value Timeline</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorWhatIf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="date" 
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value) => [`$${value.toLocaleString()}`, '']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend 
            wrapperStyle={{ color: 'rgba(255,255,255,0.7)' }}
          />
          <Area 
            type="monotone" 
            dataKey="actual" 
            stroke="#8b5cf6" 
            fillOpacity={1} 
            fill="url(#colorActual)"
            name="Actual Value"
          />
          <Area 
            type="monotone" 
            dataKey="whatIf" 
            stroke="#10b981" 
            fillOpacity={1} 
            fill="url(#colorWhatIf)"
            name="What If Held"
          />
        </AreaChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default PortfolioTimeline;

