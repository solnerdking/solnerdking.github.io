import React from 'react';

const GlassCard = ({ children, className = '', hover = true, selected = false, ...props }) => {
  return (
    <div
      className={`
        bg-[#2a2a2a]
        border ${selected ? 'border-green-500' : 'border-[#404040]'}
        rounded-xl
        ${hover ? 'glass-hover' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassCard;
