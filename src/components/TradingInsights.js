import React, { useMemo } from 'react';
import GlassCard from './GlassCard';
import { TrendingUp, TrendingDown, Clock, Target } from 'lucide-react';

const TradingInsights = ({ tokens = [] }) => {
  const insights = useMemo(() => {
    if (!tokens || tokens.length === 0) return [];

    const insightsList = [];

    // Find biggest "what if" scenarios with validation
    const biggestMiss = tokens.reduce((biggest, token) => {
      const currentGains = Math.max(0, parseFloat(token.missedGainsCurrent) || 0);
      const biggestGains = Math.max(0, parseFloat(biggest.missedGainsCurrent) || 0);
      return (isFinite(currentGains) && currentGains > biggestGains) ? token : biggest;
    }, tokens[0] || {});

    if (biggestMiss.missedGainsCurrent > 0) {
      insightsList.push({
        type: 'missed_opportunity',
        icon: TrendingDown,
        title: 'Biggest Missed Opportunity',
        description: `If you held ${biggestMiss.symbol} instead of selling, you would have made $${Math.round(biggestMiss.missedGainsCurrent).toLocaleString()} more.`,
        value: `$${Math.round(biggestMiss.missedGainsCurrent).toLocaleString()}`,
        color: 'text-red-400',
      });
    }

    // Find best performer if held with validation
    const bestPerformer = tokens.reduce((best, token) => {
      const currentROI = parseFloat(token.roiIfHeldCurrent) || 0;
      const bestROI = parseFloat(best.roiIfHeldCurrent) || 0;
      return (isFinite(currentROI) && currentROI > bestROI) ? token : best;
    }, tokens[0] || {});

    if (bestPerformer.roiIfHeldCurrent > 100) {
      insightsList.push({
        type: 'best_performer',
        icon: TrendingUp,
        title: 'Best Performer (If Held)',
        description: `${bestPerformer.symbol} would have returned ${bestPerformer.roiIfHeldCurrent.toFixed(0)}% if held to current price.`,
        value: `${bestPerformer.roiIfHeldCurrent.toFixed(0)}%`,
        color: 'text-green-400',
      });
    }

    // Pattern: Selling winners too early with validation
    const earlySells = tokens.filter(t => {
      const roi = parseFloat(t.roi) || 0;
      const roiIfHeld = parseFloat(t.roiIfHeldCurrent) || 0;
      const holdDays = Math.max(0, parseFloat(t.timeHeldDays) || 0);
      return isFinite(roi) && isFinite(roiIfHeld) && isFinite(holdDays) &&
             roi > 0 && 
             roiIfHeld > roi * 2 &&
             holdDays < 7;
    });

    if (earlySells.length > 0) {
      const totalMissed = earlySells.reduce((sum, t) => {
        const gains = parseFloat(t.missedGainsCurrent) || 0;
        return sum + (isFinite(gains) ? gains : 0);
      }, 0);
      const avgMissed = totalMissed / earlySells.length;
      insightsList.push({
        type: 'pattern',
        icon: Clock,
        title: 'Pattern Detected: Selling Winners Too Early',
        description: `You sold ${earlySells.length} profitable tokens within 7 days, missing an average of $${Math.round(avgMissed).toLocaleString()} per token.`,
        value: `${earlySells.length} tokens`,
        color: 'text-yellow-400',
      });
    }

    // Optimal exit point analysis with validation
    const tokensWithATH = tokens.filter(t => {
      const ath = parseFloat(t.ath) || 0;
      const buyPrice = parseFloat(t.avgBuyPrice) || 0;
      return isFinite(ath) && isFinite(buyPrice) && ath > 0 && buyPrice > 0;
    });
    
    if (tokensWithATH.length > 0) {
      const totalATHROI = tokensWithATH.reduce((sum, t) => {
        const ath = parseFloat(t.ath) || 0;
        const buyPrice = parseFloat(t.avgBuyPrice) || 0;
        if (buyPrice > 0 && isFinite(ath) && isFinite(buyPrice)) {
          const athROI = ((ath - buyPrice) / buyPrice) * 100;
          return sum + (isFinite(athROI) ? athROI : 0);
        }
        return sum;
      }, 0);
      const avgATHROI = totalATHROI / tokensWithATH.length;

      const totalActualROI = tokensWithATH.reduce((sum, t) => {
        const roi = parseFloat(t.roi) || 0;
        return sum + (isFinite(roi) ? roi : 0);
      }, 0);
      const avgActualROI = totalActualROI / tokensWithATH.length;

      if (avgATHROI > avgActualROI * 2) {
        insightsList.push({
          type: 'exit_timing',
          icon: Target,
          title: 'Exit Timing Analysis',
          description: `Your tokens reached an average ATH ROI of ${avgATHROI.toFixed(0)}%, but you realized only ${avgActualROI.toFixed(0)}% on average.`,
          value: `${avgATHROI.toFixed(0)}% vs ${avgActualROI.toFixed(0)}%`,
          color: 'text-blue-400',
        });
      }
    }

    // "If you held X instead of Y" comparison
    if (tokens.length >= 2) {
      const sortedByMissed = [...tokens].sort((a, b) => 
        (b.missedGainsCurrent || 0) - (a.missedGainsCurrent || 0)
      );
      const topMiss = sortedByMissed[0];
      const secondMiss = sortedByMissed[1];

      if (topMiss && secondMiss && topMiss.missedGainsCurrent > secondMiss.missedGainsCurrent * 1.5) {
        insightsList.push({
          type: 'comparison',
          icon: TrendingUp,
          title: 'Opportunity Cost',
          description: `If you had held ${topMiss.symbol} instead of ${secondMiss.symbol}, you would have made $${Math.round(topMiss.missedGainsCurrent - secondMiss.missedGainsCurrent).toLocaleString()} more.`,
          value: `$${Math.round(topMiss.missedGainsCurrent - secondMiss.missedGainsCurrent).toLocaleString()}`,
          color: 'text-green-400',
        });
      }
    }

    return insightsList;
  }, [tokens]);

  if (!insights || insights.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Trading Insights</h3>
        <p className="text-gray-400 text-center py-8">No insights available</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <h3 className="text-xl font-bold text-white mb-4">Trading Insights</h3>
      <div className="space-y-4">
        {insights.map((insight, index) => {
          const Icon = insight.icon;
          return (
            <div
              key={index}
              className="p-4 bg-[#1a1a1a] rounded-lg border border-[#404040] hover:border-green-500 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${insight.color.replace('text-', 'bg-').replace('-400', '-400/20')}`}>
                  <Icon size={20} className={insight.color} />
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-semibold mb-1">{insight.title}</h4>
                  <p className="text-gray-400 text-sm mb-2">{insight.description}</p>
                  <p className={`text-lg font-bold ${insight.color}`}>{insight.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

export default TradingInsights;

