import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import GlassCard from './GlassCard';

const TokenPriceChart = ({ token, className = '' }) => {
  // Generate mock price data points if we don't have historical data
  // In a real implementation, this would come from BirdEye API or similar
  const generatePriceData = () => {
    if (!token.firstBuyDate) return [];
    
    const data = [];
    const startDate = token.firstBuyDate;
    const endDate = new Date();
    const days = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
    const steps = Math.min(days, 30); // Max 30 data points
    
    for (let i = 0; i <= steps; i++) {
      const date = new Date(startDate.getTime() + (i / steps) * (endDate - startDate));
      // Simulate price movement (in real app, use actual historical data)
      const progress = i / steps;
      const price = token.avgBuyPrice * (1 + (token.priceChange / 100) * progress);
      data.push({
        date: date.toISOString().split('T')[0],
        price: Math.max(0, price),
        value: price * (token.totalBought || 0),
      });
    }
    
    return data;
  };

  const chartData = generatePriceData();

  if (chartData.length === 0) {
    return (
      <GlassCard className={`p-4 ${className}`}>
        <p className="text-gray-400 text-sm text-center">No price history available</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-4 ${className}`}>
      <h4 className="text-sm font-semibold text-white mb-3">Price History</h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
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
            tickFormatter={(value) => `$${value.toFixed(4)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value) => [`$${value.toFixed(6)}`, 'Price']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke={token.priceChange >= 0 ? '#10b981' : '#ef4444'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default TokenPriceChart;

