# What If Analyzer - Crypto Trading Analysis

A comprehensive Solana wallet analyzer that shows "what if" scenarios for your trading history. Discover how much you would have made if you held tokens instead of selling them.

## Features

- **Complete Token Analysis**: Analyzes all tokens ever traded, not just sold ones
- **What If Scenarios**: Calculate potential gains if tokens were held to current price or ATH
- **Detailed Metrics**: ROI, missed gains, transaction history, and more
- **Paperhands.gm.ai Style**: Modern dark theme with horizontal scrolling token cards
- **Real-time Data**: Powered by Helius API for transactions and BirdEye API for token prices

## Getting Started

### Prerequisites

- Node.js and npm installed
- A Solana wallet address to analyze

### Installation

```bash
npm install
```

### Development

```bash
npm start
```

Runs the app in development mode at [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
```

Builds the app for production to the `build` folder.

### Deploy

```bash
npm run deploy
```

Deploys the app to GitHub Pages at `https://solnerdking.github.io`.

## Tech Stack

- React.js
- Tailwind CSS
- Helius API (Solana transactions)
- BirdEye API (Token prices and ATH)
- Vercel (Backend serverless functions)

## Data Sources

- **Transactions**: Helius API
- **Token Data**: BirdEye API (prices, ATH, historical data)

## License

See LICENSE file for details.
