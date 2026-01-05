import React, { useState, useEffect } from 'react';
import { Heart, ExternalLink, Copy, Check } from 'lucide-react';
import GlassCard from './GlassCard';
import AnimatedCounter from './AnimatedCounter';

const DONATION_WALLET = '7sLkaFqXtv5SqmUDHS8aE3uCk79f5gEUjMEpER1stSbV';

const DonationSupport = ({ position = 'top' }) => {
  const [balance, setBalance] = useState({ sol: 0, usd: 0 });
  const [recentDonations, setRecentDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [solPrice, setSolPrice] = useState(150); // Default SOL price, will fetch real price

  // Fetch SOL price
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await response.json();
        if (data.solana?.usd) {
          setSolPrice(data.solana.usd);
        }
      } catch (e) {
        console.log('Error fetching SOL price:', e);
      }
    };
    fetchSolPrice();
    const priceInterval = setInterval(fetchSolPrice, 60000); // Update every minute
    return () => clearInterval(priceInterval);
  }, []);

  // Fetch wallet balance and recent transactions
  useEffect(() => {
    const fetchWalletData = async () => {
      setLoading(true);
      try {
        // Fetch balance from Solana RPC (try multiple endpoints for reliability)
        let lamports = 0;
        const rpcEndpoints = [
          'https://api.mainnet-beta.solana.com',
          'https://solana-api.projectserum.com',
          'https://rpc.ankr.com/solana',
        ];

        for (const endpoint of rpcEndpoints) {
          try {
            const balanceResponse = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [DONATION_WALLET],
              }),
            });
            const balanceData = await balanceResponse.json();
            if (balanceData.result?.value) {
              lamports = balanceData.result.value;
              break; // Success, exit loop
            }
          } catch (e) {
            console.log(`RPC endpoint ${endpoint} failed, trying next...`);
            continue;
          }
        }

        const sol = lamports / 1e9;
        const usd = sol * solPrice;

        setBalance({ sol, usd });

        // Fetch recent transactions using Helius or Solana RPC
        try {
          const backendUrl = process.env.REACT_APP_API_URL || 'https://jeeter-backend.vercel.app/api/proxy';
          const txResponse = await fetch(`${backendUrl}?endpoint=helius&wallet=${DONATION_WALLET}`);
          if (txResponse.ok) {
            const txData = await txResponse.json();
            if (txData.success && Array.isArray(txData.data)) {
              // Get recent incoming transactions (donations)
              const donations = txData.data
                .slice(0, 50) // Check more transactions to find donations
                .filter(tx => {
                  // Check if transaction has incoming SOL transfers to our wallet
                  if (tx.nativeTransfers && Array.isArray(tx.nativeTransfers)) {
                    return tx.nativeTransfers.some(transfer => {
                      const toAddr = (transfer.toUserAccount || transfer.to || '').toLowerCase();
                      return toAddr === DONATION_WALLET.toLowerCase();
                    });
                  }
                  return false;
                })
                .map(tx => {
                  const incomingTransfer = tx.nativeTransfers?.find(transfer => {
                    const toAddr = (transfer.toUserAccount || transfer.to || '').toLowerCase();
                    return toAddr === DONATION_WALLET.toLowerCase();
                  });
                  const solAmount = incomingTransfer ? (incomingTransfer.amount || 0) / 1e9 : 0;
                  const fromAddr = incomingTransfer?.fromUserAccount || incomingTransfer?.from || tx.signatures?.[0] || 'Unknown';
                  return {
                    from: fromAddr,
                    amount: solAmount,
                    timestamp: tx.timestamp || tx.blockTime || Date.now() / 1000,
                    signature: tx.signatures?.[0] || '',
                  };
                })
                .filter(d => d.amount > 0.001) // Only show donations > 0.001 SOL
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 5);

              setRecentDonations(donations);
            }
          }
        } catch (e) {
          console.log('Error fetching transactions:', e);
        }
      } catch (e) {
        console.log('Error fetching wallet data:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchWalletData();
    const interval = setInterval(fetchWalletData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [solPrice]);

  const copyAddress = () => {
    navigator.clipboard.writeText(DONATION_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCompact = position === 'top';

  if (isCompact) {
    // Compact version for top header
    return (
      <div className="bg-gradient-to-r from-green-500/10 via-green-600/10 to-green-500/10 border-b border-green-500/30 py-2">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-3">
              <Heart size={16} className="text-green-400 animate-pulse" fill="currentColor" />
              <span className="text-white font-semibold">Support JitterHands.fun</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-300">
                {loading ? 'Loading...' : `${balance.sol.toFixed(4)} SOL ($${balance.usd.toFixed(2)})`}
              </span>
            </div>
            <button
              onClick={copyAddress}
              className="flex items-center gap-2 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 rounded-lg transition text-green-400 text-xs"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Address'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full version for footer
  return (
    <div className="mt-12 border-t border-[#404040] pt-8">
      <GlassCard className="p-6 bg-gradient-to-br from-green-500/5 to-green-600/5 border-green-500/20">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left: QR Code and Address */}
          <div className="flex-shrink-0">
            <div className="bg-white p-4 rounded-lg inline-block">
              <img
                src="/solana-qr-code.png"
                alt="Solana Donation QR Code"
                className="w-48 h-48"
                onError={(e) => {
                  // Fallback: generate QR code if image not found
                  e.target.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=solana:${DONATION_WALLET}`;
                }}
              />
            </div>
            <div className="mt-4">
              <p className="text-gray-400 text-xs mb-2">Solana Wallet Address</p>
              <div className="flex items-center gap-2">
                <p className="text-white font-mono text-sm break-all">{DONATION_WALLET}</p>
                <button
                  onClick={copyAddress}
                  className="p-1.5 hover:bg-[#404040] rounded transition text-green-400"
                  title="Copy address"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Stats and Recent Donations */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Heart size={20} className="text-green-400" fill="currentColor" />
              <h3 className="text-xl font-bold text-white">Support JitterHands.fun</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              Your support helps ensure constant uptime and continued development of the platform. 
              Every donation goes directly to maintaining and improving JitterHands.fun.
            </p>

            {/* Current Balance */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#404040]">
                <p className="text-gray-400 text-xs mb-2">Total Raised (SOL)</p>
                <p className="text-green-400 text-2xl font-bold">
                  {loading ? '...' : <AnimatedCounter value={balance.sol} decimals={4} />}
                </p>
              </div>
              <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#404040]">
                <p className="text-gray-400 text-xs mb-2">Total Raised (USD)</p>
                <p className="text-white text-2xl font-bold">
                  ${loading ? '...' : <AnimatedCounter value={balance.usd} decimals={2} />}
                </p>
              </div>
            </div>

            {/* Recent Donations */}
            {recentDonations.length > 0 && (
              <div>
                <h4 className="text-white font-semibold mb-3 text-sm">Recent Supporters</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentDonations.map((donation, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                          <Heart size={12} className="text-green-400" fill="currentColor" />
                        </div>
                        <div>
                          <a
                            href={`https://solscan.io/account/${donation.from}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white font-mono hover:text-green-400 transition"
                          >
                            {donation.from.length > 20 
                              ? `${donation.from.slice(0, 8)}...${donation.from.slice(-6)}`
                              : donation.from}
                          </a>
                          <p className="text-gray-500 text-xs">
                            {new Date(donation.timestamp * 1000).toLocaleDateString()} {new Date(donation.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-semibold">
                          {donation.amount.toFixed(4)} SOL
                        </p>
                        <p className="text-gray-500 text-xs">
                          ${(donation.amount * solPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="flex flex-wrap gap-3 mt-6">
              <a
                href={`https://solscan.io/account/${DONATION_WALLET}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-[#404040] hover:bg-[#505050] rounded-lg transition text-white text-sm"
              >
                <ExternalLink size={14} />
                View on Solscan
              </a>
              <a
                href={`https://solscan.io/account/${DONATION_WALLET}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition text-white text-sm font-semibold"
              >
                <Heart size={14} fill="currentColor" />
                Donate with Solana
              </a>
            </div>
            
            {/* Refresh indicator */}
            <p className="text-gray-500 text-xs mt-4 text-center">
              Data updates every 30 seconds • Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default DonationSupport;

