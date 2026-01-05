import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const Sparkline = ({ data, positive = true, height = 30 }) => {
  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const normalizedData = data.map((value, index) => ({
    value: ((value - min) / range) * 100,
    index,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={normalizedData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={positive ? '#22c55e' : '#f87171'}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default Sparkline;

