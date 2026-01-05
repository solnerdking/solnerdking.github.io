import React, { useState, useEffect, useRef } from 'react';
import tickerService from '../services/tickerService';
import { formatPrice, formatPercentage } from '../utils/numberFormatter';

const LiveTicker = ({ tokens = [], onTokenClick }) => {
  const [prices, setPrices] = useState({});
  const tickerRef = useRef(null);
  const animationRef = useRef(null);

  // Subscribe to ticker service
  useEffect(() => {
    if (!tokens || tokens.length === 0) return;

    tickerService.setTokens(tokens);

    const unsubscribe = tickerService.subscribe((newPrices) => {
      setPrices(newPrices);
    });

    return () => {
      unsubscribe();
      tickerService.stop();
    };
  }, [tokens]);

  // Smooth scrolling animation - slowed down significantly
  useEffect(() => {
    if (!tickerRef.current) return;

    const ticker = tickerRef.current;
    let scrollPosition = 0;
    let lastTime = 0;
    const scrollSpeed = 0.5; // Pixels per frame (reduced from 1)
    const targetFPS = 60;
    const frameTime = 1000 / targetFPS;

    const scroll = (currentTime) => {
      if (!lastTime) lastTime = currentTime;
      
      const deltaTime = currentTime - lastTime;
      
      // Only scroll if enough time has passed (throttle to ~60fps)
      if (deltaTime >= frameTime) {
        scrollPosition += scrollSpeed;
        if (scrollPosition >= ticker.scrollWidth - ticker.clientWidth) {
          scrollPosition = 0;
        }
        ticker.scrollLeft = scrollPosition;
        lastTime = currentTime;
      }
      
      animationRef.current = requestAnimationFrame(scroll);
    };

    animationRef.current = requestAnimationFrame(scroll);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [prices]);

  if (!tokens || tokens.length === 0) return null;

  const tickerTokens = tokens.slice(0, 20).map(token => ({
    ...token,
    livePrice: prices[token.mint]?.price || token.currentPrice || 0,
    priceChange: token.currentPrice && token.avgBuyPrice 
      ? ((token.currentPrice - token.avgBuyPrice) / token.avgBuyPrice) * 100 
      : 0,
  }));

  return (
    <div className="w-full bg-[#1a1a1a] border-b border-[#404040] overflow-hidden">
      <div 
        ref={tickerRef}
        className="flex gap-4 py-2 overflow-x-hidden"
        style={{ scrollBehavior: 'auto' }}
      >
        {tickerTokens.map((token) => {
          const isPositive = token.priceChange >= 0;
          const priceDisplay = token.livePrice > 0 
            ? formatPrice(token.livePrice)
            : 'N/A';
          const changeDisplay = token.priceChange !== 0 
            ? formatPercentage(token.priceChange)
            : '0%';

          return (
            <div
              key={token.mint}
              onClick={() => onTokenClick && onTokenClick(token)}
              className="flex items-center gap-3 px-4 py-2 bg-[#2a2a2a] border border-[#404040] rounded-lg cursor-pointer hover:border-green-500 transition-all flex-shrink-0 min-w-[240px]"
            >
              {/* Token Image */}
              <div className="relative flex-shrink-0">
                <img
                  src={token.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`}
                  alt={token.symbol}
                  className="w-8 h-8 rounded object-cover bg-[#404040]"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(token.symbol || token.mint.slice(0, 2))}&background=22c55e&color=fff&size=64&bold=true`;
                  }}
                />
                {token.verified && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-[#2a2a2a]" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm truncate">{token.symbol || 'Unknown'}</span>
                  <span className={`text-xs font-medium flex-shrink-0 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {changeDisplay}
                  </span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5 truncate">{priceDisplay}</div>
                <div className="text-gray-500 text-xs font-mono truncate mt-0.5" title={token.mint}>
                  {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPositive ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LiveTicker;

