// How full a roll or a material looks as a progress bar. Pure: no styling, no data access.
export type StockTone = 'success' | 'warning' | 'error';
export type StockMeter = { percent: number; tone: StockTone };

/**
 * The bar for stock left out of what there was. A status the sheet or books already gave ("Out of Stock", "Low Stock") wins; otherwise
 * empty is red, 20% or less is amber and anything else is green. With no known total the bar is empty and the colour follows the status.
 */
export function stockMeter(remaining: number, capacity: number, status = ''): StockMeter {
  const left = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const percent = capacity > 0 ? Math.max(0, Math.min(100, Math.round((left / capacity) * 100))) : 0;
  const out = left <= 0 || /^(out of stock|depleted)$/i.test(status), low = /^low stock$/i.test(status);
  const tone: StockTone = out ? 'error' : low ? 'warning' : capacity > 0 && percent <= 20 ? 'warning' : 'success';
  return { percent, tone };
}
