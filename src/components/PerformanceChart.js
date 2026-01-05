import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import GlassCard from './GlassCard';

const PerformanceChart = ({ tokens, className = '' }) => {
  // Generate top/bottom performers data
  const generatePerformanceData = () => {
    if (!tokens || tokens.length === 0) return [];
    
    // Get top 10 and bottom 10 by missed gains
    const sorted = [...tokens].sort((a, b) => {
      const aVal = a.missedGainsCurrent || 0;
      const bVal = b.missedGainsCurrent || 0;
      return bVal - aVal;
    });
    
    const top10 = sorted.slice(0, 10).reverse(); // Reverse for chart display
    
    const topData = top10.map((token, index) => ({
      name: token.symbol || 'Unknown',
      value: Math.round(token.missedGainsCurrent || 0),
      roi: (token.roiIfHeldCurrent || 0).toFixed(1),
      color: token.missedGainsCurrent >= 0 ? '#22c55e' : '#f87171',
    }));
    
    return topData;
  };

  const data = generatePerformanceData();

  if (data.length === 0) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <h3 className="text-xl font-bold text-white mb-4">Token Performance</h3>
        <p className="text-gray-400 text-sm text-center">No performance data available</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      <h3 className="text-xl font-bold text-white mb-4">Top 10 Token Performance</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            type="number"
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <YAxis 
            type="category"
            dataKey="name"
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value, name, props) => {
              if (name === 'value') {
                return [`$${value.toLocaleString()}`, 'Missed Gains'];
              }
              return [`${props.payload.roi}%`, 'ROI If Held'];
            }}
            labelFormatter={(label) => `Token: ${label}`}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default PerformanceChart;

