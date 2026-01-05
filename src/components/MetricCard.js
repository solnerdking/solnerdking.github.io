import React from 'react';
import GlassCard from './GlassCard';
import { TrendingUp, TrendingDown } from 'lucide-react';

const MetricCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  color = 'purple',
  className = '' 
}) => {
  const colorConfig = {
    purple: {
      icon: 'text-purple-400',
      iconBg: 'bg-purple-500/20',
      value: 'text-purple-300',
      subtitle: 'text-purple-200/80',
      gradient: 'from-purple-500/10 to-transparent'
    },
    green: {
      icon: 'text-emerald-400',
      iconBg: 'bg-emerald-500/20',
      value: 'text-emerald-300',
      subtitle: 'text-emerald-200/80',
      gradient: 'from-emerald-500/10 to-transparent'
    },
    red: {
      icon: 'text-rose-400',
      iconBg: 'bg-rose-500/20',
      value: 'text-rose-300',
      subtitle: 'text-rose-200/80',
      gradient: 'from-rose-500/10 to-transparent'
    },
    blue: {
      icon: 'text-blue-400',
      iconBg: 'bg-blue-500/20',
      value: 'text-blue-300',
      subtitle: 'text-blue-200/80',
      gradient: 'from-blue-500/10 to-transparent'
    },
    cyan: {
      icon: 'text-cyan-400',
      iconBg: 'bg-cyan-500/20',
      value: 'text-cyan-300',
      subtitle: 'text-cyan-200/80',
      gradient: 'from-cyan-500/10 to-transparent'
    },
  };

  const config = colorConfig[color] || colorConfig.purple;

  return (
    <GlassCard className={`p-6 relative overflow-hidden group ${className}`}>
      {/* Animated background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          {Icon && (
            <div className={`p-2.5 rounded-xl ${config.iconBg} ${config.icon}`}>
              <Icon size={24} />
            </div>
          )}
          <h3 className="text-lg font-semibold text-white/90">{title}</h3>
        </div>
        
        <div className={`text-5xl font-bold mb-3 ${config.value} tracking-tight`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {value}
        </div>
        
        {subtitle && (
          <p className={`${config.subtitle} text-sm font-medium mb-3`}>
            {subtitle}
          </p>
        )}
        
        {trend !== undefined && (
          <div className="flex items-center gap-2 mt-3">
            {trend > 0 ? (
              <TrendingUp className="text-emerald-400" size={18} />
            ) : (
              <TrendingDown className="text-rose-400" size={18} />
            )}
            <span className={`text-sm font-semibold ${trend > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default MetricCard;
