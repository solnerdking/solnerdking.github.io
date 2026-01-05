import React, { useState } from 'react';
import GlassCard from './GlassCard';
import { X } from 'lucide-react';

const TokenComparison = ({ tokens = [] }) => {
  const [selectedTokens, setSelectedTokens] = useState([]);

  const addToken = (token) => {
    if (!selectedTokens.find(t => t.mint === token.mint) && selectedTokens.length < 5) {
      setSelectedTokens([...selectedTokens, token]);
    }
  };

  const removeToken = (mint) => {
    setSelectedTokens(selectedTokens.filter(t => t.mint !== mint));
  };

  if (selectedTokens.length === 0) {
    return (
      <GlassCard className="p-6">
        <h3 className="text-xl font-bold text-white mb-4">Token Comparison</h3>
        <p className="text-gray-400 text-center py-8">
          Select up to 5 tokens from your analysis to compare side-by-side.
        </p>
        <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
          {tokens.slice(0, 10).map((token) => (
            <button
              key={token.mint}
              onClick={() => addToken(token)}
              className="w-full text-left p-2 bg-[#1a1a1a] rounded hover:bg-[#2a2a2a] transition-all"
            >
              <div className="flex items-center gap-3">
                {/* Token Image */}
                <img
                  src={token.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`}
                  alt={token.symbol}
                  className="w-8 h-8 rounded object-cover bg-[#404040] flex-shrink-0"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || token.mint.slice(0, 2))}&background=22c55e&color=fff&size=64&bold=true`;
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold truncate">{token.symbol || 'Unknown'}</span>
                    {token.verified && (
                      <span className="text-xs px-1 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">✓</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs truncate" title={token.name}>{token.name || 'Unknown Token'}</p>
                  <p className="text-gray-500 text-xs font-mono truncate" title={token.mint}>
                    {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                  </p>
                </div>
                <span className="text-green-400 text-sm font-semibold flex-shrink-0">
                  ${Math.round(token.missedGainsCurrent || 0).toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Token Comparison</h3>
        <button
          onClick={() => setSelectedTokens([])}
          className="text-gray-400 hover:text-white text-sm transition-all"
        >
          Clear All
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {selectedTokens.map((token) => (
          <div
            key={token.mint}
            className="p-4 bg-[#1a1a1a] rounded-lg border border-[#404040] relative"
          >
            <button
              onClick={() => removeToken(token.mint)}
              className="absolute top-2 right-2 p-1 hover:bg-[#404040] rounded transition-all"
            >
              <X size={14} className="text-gray-400" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              {/* Token Image */}
              <img
                src={token.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`}
                alt={token.symbol}
                className="w-12 h-12 rounded object-cover bg-[#404040] flex-shrink-0"
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || token.mint.slice(0, 2))}&background=22c55e&color=fff&size=128&bold=true`;
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-white font-bold text-lg truncate">{token.symbol || 'Unknown'}</h4>
                  {token.verified && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded flex-shrink-0">✓</span>
                  )}
                </div>
                <p className="text-gray-400 text-xs truncate" title={token.name}>{token.name || 'Unknown Token'}</p>
                <p className="text-gray-500 text-xs font-mono truncate mt-0.5" title={token.mint}>
                  CA: {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Missed Gains</span>
                <span className="text-green-400 font-semibold">
                  ${Math.round(token.missedGainsCurrent || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ROI If Held</span>
                <span className={`font-semibold ${
                  (token.roiIfHeldCurrent || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(token.roiIfHeldCurrent || 0).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Current Price</span>
                <span className="text-white font-semibold">
                  ${(token.currentPrice || 0).toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Held For</span>
                <span className="text-white font-semibold">
                  {token.timeHeldDays || 0} days
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedTokens.length < 5 && (
        <div className="mt-4">
          <p className="text-gray-400 text-sm mb-2">Add more tokens to compare:</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tokens
              .filter(t => !selectedTokens.find(st => st.mint === t.mint))
              .slice(0, 5)
              .map((token) => (
                <button
                  key={token.mint}
                  onClick={() => addToken(token)}
                  className="w-full text-left p-2 bg-[#1a1a1a] rounded hover:bg-[#2a2a2a] transition-all text-sm"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={token.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`}
                      alt={token.symbol}
                      className="w-6 h-6 rounded object-cover bg-[#404040] flex-shrink-0"
                      onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || token.mint.slice(0, 2))}&background=22c55e&color=fff&size=48&bold=true`;
                      }}
                    />
                    <span className="text-white font-semibold">{token.symbol || 'Unknown'}</span>
                    <span className="text-gray-400 text-xs ml-auto">
                      ${Math.round(token.missedGainsCurrent || 0).toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Comparison Summary */}
      {selectedTokens.length > 1 && (
        <div className="mt-6 pt-6 border-t border-[#404040]">
          <h4 className="text-white font-semibold mb-3">Comparison Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Total Missed</p>
              <p className="text-green-400 font-bold text-lg">
                ${Math.round(
                  selectedTokens.reduce((sum, t) => sum + (t.missedGainsCurrent || 0), 0)
                ).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Best Performer</p>
              <p className="text-white font-semibold">
                {selectedTokens.reduce((best, token) => 
                  (token.roiIfHeldCurrent || 0) > (best.roiIfHeldCurrent || 0) ? token : best,
                  selectedTokens[0]
                ).symbol}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Avg ROI</p>
              <p className="text-white font-semibold">
                {(
                  selectedTokens.reduce((sum, t) => sum + (t.roiIfHeldCurrent || 0), 0) / selectedTokens.length
                ).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-gray-500">Avg Hold Time</p>
              <p className="text-white font-semibold">
                {Math.round(
                  selectedTokens.reduce((sum, t) => sum + (t.timeHeldDays || 0), 0) / selectedTokens.length
                )} days
              </p>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
};

export default TokenComparison;

