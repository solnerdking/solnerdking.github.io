/**
 * Utility functions for formatting numbers with proper decimals and thousands separators
 * Ensures accuracy and consistency across the application
 */

/**
 * Format a number with proper decimals and thousands separators
 * @param {number} value - The number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @param {boolean} showThousands - Whether to show thousands separators (default: true)
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, decimals = 2, showThousands = true) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '0.00';
  }

  // Round to specified decimals
  const rounded = Math.round(numValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
  
  // Format with thousands separators
  if (showThousands) {
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } else {
    return rounded.toFixed(decimals);
  }
};

/**
 * Format currency (USD) with proper decimals and thousands separators
 * @param {number} value - The amount in USD
 * @param {number} decimals - Number of decimal places (default: 2)
 * @param {boolean} showSymbol - Whether to show $ symbol (default: true)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, decimals = 2, showSymbol = true) => {
  if (value === null || value === undefined || isNaN(value)) {
    return showSymbol ? '$0.00' : '0.00';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return showSymbol ? '$0.00' : '0.00';
  }

  // For very large numbers, use abbreviated format
  if (Math.abs(numValue) >= 1000000) {
    const millions = numValue / 1000000;
    return showSymbol 
      ? `$${formatNumber(millions, 2, false)}M`
      : `${formatNumber(millions, 2, false)}M`;
  }
  
  if (Math.abs(numValue) >= 1000) {
    const thousands = numValue / 1000;
    return showSymbol 
      ? `$${formatNumber(thousands, 2, false)}K`
      : `${formatNumber(thousands, 2, false)}K`;
  }

  // Round to specified decimals
  const rounded = Math.round(numValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
  
  // Format with thousands separators
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return showSymbol ? `$${formatted}` : formatted;
};

/**
 * Format token price with appropriate decimals based on value
 * @param {number} value - The price value
 * @returns {string} Formatted price string
 */
export const formatPrice = (value) => {
  if (value === null || value === undefined || isNaN(value) || value === 0) {
    return '$0.00';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue) || numValue === 0) {
    return '$0.00';
  }

  // Determine appropriate decimals based on price magnitude
  let decimals = 6; // Default for small prices
  
  if (numValue >= 1) {
    decimals = 2;
  } else if (numValue >= 0.01) {
    decimals = 4;
  } else if (numValue >= 0.0001) {
    decimals = 6;
  } else {
    decimals = 8;
  }

  const rounded = Math.round(numValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
  
  return `$${rounded.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

/**
 * Format percentage with proper decimals
 * @param {number} value - The percentage value (e.g., 25.5 for 25.5%)
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00%';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '0.00%';
  }

  const rounded = Math.round(numValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
  
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(decimals)}%`;
};

/**
 * Format large numbers with abbreviations (K, M, B)
 * @param {number} value - The number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number with abbreviation
 */
export const formatLargeNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '0';
  }

  const absValue = Math.abs(numValue);
  
  if (absValue >= 1000000000) {
    return `${(numValue / 1000000000).toFixed(decimals)}B`;
  } else if (absValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(decimals)}M`;
  } else if (absValue >= 1000) {
    return `${(numValue / 1000).toFixed(decimals)}K`;
  } else {
    return numValue.toFixed(decimals);
  }
};

/**
 * Safely parse a number, returning 0 if invalid
 * @param {any} value - The value to parse
 * @returns {number} Parsed number or 0
 */
export const safeParseNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Round a number to specified decimals, ensuring accuracy
 * @param {number} value - The number to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded number
 */
export const roundToDecimals = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return 0;
  }

  const multiplier = Math.pow(10, decimals);
  return Math.round(numValue * multiplier) / multiplier;
};

