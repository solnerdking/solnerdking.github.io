import React, { useState, useEffect } from 'react';
import GlassCard from './GlassCard';
import { Bell, X, Check } from 'lucide-react';
import priceService from '../services/priceService';

const PriceAlerts = ({ tokens = [] }) => {
  const [alerts, setAlerts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAlert, setNewAlert] = useState({ mint: '', targetPrice: '', type: 'above' });

  // Load alerts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('jitterhands_alerts');
    if (saved) {
      try {
        setAlerts(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading alerts:', e);
      }
    }
  }, []);

  // Save alerts to localStorage
  useEffect(() => {
    if (alerts.length > 0) {
      localStorage.setItem('jitterhands_alerts', JSON.stringify(alerts));
    }
  }, [alerts]);

  // Subscribe to price updates for alerts
  useEffect(() => {
    const unsubscribes = alerts.map((alert) => {
      return priceService.subscribe(alert.mint, (price) => {
        checkAlert(alert, price);
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [alerts]);

  const checkAlert = (alert, currentPrice) => {
    if (!currentPrice || currentPrice === 0) return;

    const targetPrice = parseFloat(alert.targetPrice);
    const triggered = alert.type === 'above' 
      ? currentPrice >= targetPrice
      : currentPrice <= targetPrice;

    if (triggered && !alert.triggered) {
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Price Alert: ${alert.symbol}`, {
          body: `${alert.symbol} is now ${alert.type === 'above' ? 'above' : 'below'} $${targetPrice}`,
          icon: '/favicon.ico',
        });
      }

      // Update alert
      setAlerts(prev => prev.map(a => 
        a.id === alert.id ? { ...a, triggered: true, triggeredAt: Date.now() } : a
      ));
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const addAlert = () => {
    if (!newAlert.mint || !newAlert.targetPrice) return;

    const token = tokens.find(t => t.mint === newAlert.mint);
    if (!token) return;

    const alert = {
      id: Date.now().toString(),
      mint: newAlert.mint,
      symbol: token.symbol,
      name: token.name,
      targetPrice: newAlert.targetPrice,
      type: newAlert.type,
      triggered: false,
      createdAt: Date.now(),
    };

    setAlerts(prev => [...prev, alert]);
    setNewAlert({ mint: '', targetPrice: '', type: 'above' });
    setShowAddForm(false);
    requestNotificationPermission();
  };

  const removeAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Price Alerts</h3>
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            requestNotificationPermission();
          }}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-sm flex items-center gap-2"
        >
          <Bell size={16} />
          Add Alert
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#404040]">
          <div className="space-y-3">
            <div>
              <label className="text-gray-400 text-xs mb-2 block">Token</label>
              <select
                value={newAlert.mint}
                onChange={(e) => setNewAlert({ ...newAlert, mint: e.target.value })}
                className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500 transition-all text-sm"
              >
                <option value="">Select a token...</option>
                {tokens.map(token => (
                  <option key={token.mint} value={token.mint}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-2 block">Alert Type</label>
                <select
                  value={newAlert.type}
                  onChange={(e) => setNewAlert({ ...newAlert, type: e.target.value })}
                  className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500 transition-all text-sm"
                >
                  <option value="above">Price Above</option>
                  <option value="below">Price Below</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-2 block">Target Price ($)</label>
                <input
                  type="number"
                  value={newAlert.targetPrice}
                  onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                  placeholder="0.00"
                  step="0.000001"
                  className="w-full bg-[#2a2a2a] border border-[#404040] rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-all text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addAlert}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-sm"
              >
                Create Alert
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-[#404040] hover:bg-[#505050] text-white rounded-lg transition-all text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {alerts.length === 0 ? (
        <p className="text-gray-400 text-center py-8">
          No price alerts set. Click "Add Alert" to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const token = tokens.find(t => t.mint === alert.mint);
            const currentPrice = token?.currentPrice || 0;
            const isTriggered = alert.triggered || 
              (currentPrice > 0 && (
                (alert.type === 'above' && currentPrice >= parseFloat(alert.targetPrice)) ||
                (alert.type === 'below' && currentPrice <= parseFloat(alert.targetPrice))
              ));

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border ${
                  isTriggered 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : 'bg-[#1a1a1a] border-[#404040]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">{alert.symbol}</span>
                      {isTriggered && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                          <Check size={12} className="inline mr-1" />
                          Triggered
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs mt-1">
                      Alert when price is {alert.type === 'above' ? 'above' : 'below'} ${parseFloat(alert.targetPrice).toFixed(6)}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Current: ${currentPrice > 0 ? currentPrice.toFixed(6) : 'N/A'}
                    </p>
                  </div>
                  <button
                    onClick={() => removeAlert(alert.id)}
                    className="p-1 hover:bg-[#404040] rounded transition-all"
                    title="Remove alert"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
};

export default PriceAlerts;

