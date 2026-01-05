import Papa from 'papaparse';

class ExportService {
  // Export transactions to CSV
  exportToCSV(tokens, filename = 'jitterhands-analysis') {
    const data = tokens.map(token => ({
      Symbol: token.symbol,
      Name: token.name,
      'Contract Address': token.mint,
      'Total Bought': token.totalBought || 0,
      'Total Sold': token.totalSold || 0,
      'Currently Held': token.currentHeld || 0,
      'Avg Buy Price': token.avgBuyPrice || 0,
      'Avg Sell Price': token.avgSellPrice || 0,
      'Current Price': token.currentPrice || 0,
      'Total Cost': token.totalCost || 0,
      'Actual Proceeds': token.actualProceeds || 0,
      'Current Value': token.currentValue || 0,
      'ROI': `${(token.roi || 0).toFixed(2)}%`,
      'ROI If Held': `${(token.roiIfHeldCurrent || 0).toFixed(2)}%`,
      'Missed Gains': token.missedGainsCurrent || 0,
      'What If ATH Value': token.whatIfATHValue || 0,
      'Held For (Days)': token.timeHeldDays || 0,
      'First Buy Date': token.firstBuyDate ? token.firstBuyDate.toISOString().split('T')[0] : '',
      'Last Sell Date': token.lastSellDate ? token.lastSellDate.toISOString().split('T')[0] : '',
      Status: token.status || '',
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Generate shareable link
  generateShareableLink(walletAddress, results) {
    const data = {
      wallet: walletAddress,
      summary: {
        jitterScore: results.summary.jitterScore,
        totalCost: results.summary.totalCost,
        actualProceeds: results.summary.actualProceeds,
        totalMissedGainsCurrent: results.summary.totalMissedGainsCurrent,
        totalTokens: results.summary.totalTokens,
      },
      timestamp: Date.now(),
    };
    
    // Encode data as base64 URL parameter
    const encoded = btoa(JSON.stringify(data));
    const baseUrl = window.location.origin || 'https://solnerdking.github.io';
    return `${baseUrl}?share=${encoded}`;
  }

  // Export to PDF (simplified - would need jsPDF and html2canvas for full implementation)
  async exportToPDF(results, walletAddress) {
    // This is a simplified version - full implementation would require jsPDF and html2canvas
    const content = `
JitterHands.fun Analysis Report
Generated: ${new Date().toLocaleString()}
Wallet: ${walletAddress}

SUMMARY
Jitter Score: ${results.summary.jitterScore || 0}
Total Invested: $${(results.summary.totalCost || 0).toLocaleString()}
Total Proceeds: $${(results.summary.actualProceeds || 0).toLocaleString()}
Net P&L: $${((results.summary.actualProceeds || 0) - (results.summary.totalCost || 0)).toLocaleString()}
Missed Gains: $${(results.summary.totalMissedGainsCurrent || 0).toLocaleString()}
Total Tokens: ${results.summary.totalTokens || 0}

TOP TOKENS
${results.allTokens.slice(0, 10).map((token, i) => `
${i + 1}. ${token.symbol} (${token.name})
   Missed Gains: $${Math.round(token.missedGainsCurrent || 0).toLocaleString()}
   ROI If Held: ${(token.roiIfHeldCurrent || 0).toFixed(2)}%
   Held For: ${token.timeHeldDays || 0} days
`).join('')}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `jitterhands-report-${walletAddress.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Note: Full PDF export would require jsPDF library
    alert('Text report downloaded. Full PDF export coming soon!');
  }

  // Copy shareable link to clipboard
  async copyShareableLink(walletAddress, results) {
    const link = this.generateShareableLink(walletAddress, results);
    try {
      await navigator.clipboard.writeText(link);
      return { success: true, link };
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return { success: true, link };
      } catch (e) {
        document.body.removeChild(textArea);
        return { success: false, link, error: e };
      }
    }
  }
}

const exportService = new ExportService();

export default exportService;

