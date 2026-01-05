import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import GlassCard from './GlassCard';

const TokenDistributionChart = ({ tokens, className = '' }) => {
  // Generate token distribution data by value
  const generateDistributionData = () => {
    if (!tokens || tokens.length === 0) return [];
    
    // Get top 10 tokens by current value or missed gains
    const sorted = [...tokens].sort((a, b) => {
      const aVal = a.currentValue || a.missedGainsCurrent || 0;
      const bVal = b.currentValue || b.missedGainsCurrent || 0;
      return bVal - aVal;
    }).slice(0, 10);
    
    const total = sorted.reduce((sum, t) => sum + (t.currentValue || t.missedGainsCurrent || 0), 0);
    
    if (total === 0) return [];
    
    const colors = [
      '#22c55e', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899',
      '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f43f5e'
    ];
    
    return sorted.map((token, index) => ({
      name: token.symbol || 'Unknown',
      value: Math.round(token.currentValue || token.missedGainsCurrent || 0),
      percentage: ((token.currentValue || token.missedGainsCurrent || 0) / total * 100).toFixed(1),
      color: colors[index % colors.length],
    }));
  };

  const data = generateDistributionData();

  if (data.length === 0) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <h3 className="text-xl font-bold text-white mb-4">Token Distribution</h3>
        <p className="text-gray-400 text-sm text-center">No distribution data available</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      <h3 className="text-xl font-bold text-white mb-4">Token Value Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percentage }) => `${name}: ${percentage}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value) => `$${value.toLocaleString()}`}
          />
          <Legend 
            wrapperStyle={{ color: 'rgba(255,255,255,0.7)' }}
            formatter={(value) => value}
          />
        </PieChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default TokenDistributionChart;

