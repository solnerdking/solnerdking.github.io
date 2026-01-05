import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import GlassCard from './GlassCard';

const ROIDistribution = ({ tokens, className = '' }) => {
  // Categorize tokens by ROI ranges
  const categorizeByROI = () => {
    if (!tokens || tokens.length === 0) return [];
    
    const categories = [
      { name: '<-50%', min: -Infinity, max: -50, count: 0, color: '#f87171' },
      { name: '-50% to 0%', min: -50, max: 0, count: 0, color: '#fb923c' },
      { name: '0% to 50%', min: 0, max: 50, count: 0, color: '#fbbf24' },
      { name: '50% to 100%', min: 50, max: 100, count: 0, color: '#60a5fa' },
      { name: '100% to 500%', min: 100, max: 500, count: 0, color: '#34d399' },
      { name: '>500%', min: 500, max: Infinity, count: 0, color: '#10b981' },
    ];
    
    tokens.forEach(token => {
      const roi = token.roiIfHeldCurrent || token.roi || 0;
      categories.forEach(cat => {
        if (roi >= cat.min && roi < cat.max) {
          cat.count++;
        }
      });
    });
    
    return categories;
  };

  const data = categorizeByROI();

  if (data.length === 0 || data.every(d => d.count === 0)) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <h3 className="text-xl font-bold text-white mb-4">ROI Distribution</h3>
        <p className="text-gray-400 text-sm text-center">No ROI data available</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      <h3 className="text-xl font-bold text-white mb-4">ROI Distribution (If Held)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="name" 
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={80}
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
            formatter={(value) => [`${value} tokens`, 'Count']}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default ROIDistribution;

