import React, { useState, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Brush } from 'recharts';
import { Download, Maximize2 } from 'lucide-react';
import GlassCard from './GlassCard';

const PLChart = ({ tokens, className = '' }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeframe, setTimeframe] = useState('ALL');
  
  // Generate P&L data over time
  const generatePLData = useCallback(() => {
    if (!tokens || tokens.length === 0) return [];
    
    // Collect all transaction dates
    const dates = new Set();
    tokens.forEach(token => {
      if (token.firstBuyDate) dates.add(token.firstBuyDate.toISOString().split('T')[0]);
      if (token.lastSellDate) dates.add(token.lastSellDate.toISOString().split('T')[0]);
    });
    
    const sortedDates = Array.from(dates).sort();
    if (sortedDates.length === 0) return [];
    
    const data = [];
    let cumulativePL = 0;
    let cumulativeCost = 0;
    let cumulativeProceeds = 0;
    
    sortedDates.forEach((date) => {
      let dayCost = 0;
      let dayProceeds = 0;
      
      tokens.forEach(token => {
        // Check if this token had activity on this date
        const isBuyDate = token.firstBuyDate && token.firstBuyDate.toISOString().split('T')[0] === date;
        const isSellDate = token.lastSellDate && token.lastSellDate.toISOString().split('T')[0] === date;
        
        if (isBuyDate) {
          const cost = parseFloat(token.totalCost) || 0;
          dayCost += isFinite(cost) ? cost : 0;
        }
        if (isSellDate) {
          const proceeds = parseFloat(token.actualProceeds) || 0;
          dayProceeds += isFinite(proceeds) ? proceeds : 0;
        }
      });
      
      cumulativeCost += dayCost;
      cumulativeProceeds += dayProceeds;
      cumulativePL = cumulativeProceeds - cumulativeCost;
      
      // Validate all values are finite before adding to chart
      data.push({
        date,
        pl: isFinite(cumulativePL) ? Math.round(cumulativePL) : 0,
        cost: isFinite(cumulativeCost) ? Math.round(cumulativeCost) : 0,
        proceeds: isFinite(cumulativeProceeds) ? Math.round(cumulativeProceeds) : 0,
      });
    });
    
    return data;
  }, [tokens]);

  const chartData = useMemo(() => {
    return generatePLData();
  }, [generatePLData]);

  const filteredData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    if (timeframe === 'ALL') return chartData;
    const now = new Date();
    const daysAgo = timeframe === '1D' ? 1 : timeframe === '7D' ? 7 : 30;
    const cutoff = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return chartData.filter(d => new Date(d.date) >= cutoff);
  }, [chartData, timeframe]);

  if (!chartData || chartData.length === 0) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <h3 className="text-xl font-bold text-white mb-4">Profit & Loss</h3>
        <p className="text-gray-400 text-sm text-center">No P&L data available</p>
      </GlassCard>
    );
  }

  const handleExport = () => {
    // This would require chart-to-image library - simplified for now
    alert('Export feature coming soon!');
  };

  return (
    <GlassCard className={`p-6 ${className} ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Profit & Loss Over Time</h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-[#1a1a1a] rounded-lg p-1">
            {['1D', '7D', '30D', 'ALL'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs rounded transition-all ${
                  timeframe === tf
                    ? 'bg-green-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            className="p-2 hover:bg-[#404040] rounded transition-all"
            title="Export Chart"
          >
            <Download size={16} className="text-gray-400" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-[#404040] rounded transition-all"
            title="Toggle Fullscreen"
          >
            <Maximize2 size={16} className="text-gray-400" />
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={isFullscreen ? 600 : 300}>
        <LineChart data={filteredData}>
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
            formatter={(value, name) => {
              const formatted = `$${value.toLocaleString()}`;
              const labels = {
                pl: 'P&L',
                cost: 'Total Cost',
                proceeds: 'Total Proceeds'
              };
              return [formatted, labels[name] || name];
            }}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Legend 
            wrapperStyle={{ color: 'rgba(255,255,255,0.7)' }}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="2 2" />
          <Brush 
            dataKey="date"
            height={30}
            stroke="rgba(255,255,255,0.3)"
            fill="rgba(34,197,94,0.1)"
          />
          <Line 
            type="monotone" 
            dataKey="pl" 
            stroke="#22c55e" 
            strokeWidth={2}
            dot={false}
            name="P&L"
          />
          <Line 
            type="monotone" 
            dataKey="cost" 
            stroke="#f87171" 
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
            name="Total Cost"
          />
          <Line 
            type="monotone" 
            dataKey="proceeds" 
            stroke="#60a5fa" 
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
            name="Total Proceeds"
          />
        </LineChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default PLChart;

