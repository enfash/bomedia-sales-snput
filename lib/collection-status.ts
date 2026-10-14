// How well today's sales have been collected, as a colour and a short lead-in for the home card. Pure: no screen, no network.
export type CollectionTone = 'none' | 'red' | 'amber' | 'lime' | 'green';

export type CollectionLook = {
  tone: CollectionTone;
  /** The words before the amount, such as "Collect now". Empty when there is nothing to collect. */
  lead: string;
  /** How much of the bar to draw. A tiny stub stays visible once something was sold, so an empty bar still shows its colour. */
  barPercent: number;
};

/** Below 40% is red (collect now), 40-69% amber, 70-99% yellow-green, 100% green. Nothing sold yet is neutral. */
export function collectionLook(percent: number, sold: number, stillOwed: number): CollectionLook {
  if (!(sold > 0)) return { tone: 'none', lead: '', barPercent: 0 };
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const barPercent = Math.max(pct, 3);
  if (stillOwed <= 0 || pct >= 100) return { tone: 'green', lead: '', barPercent: 100 };
  if (pct >= 70) return { tone: 'lime', lead: 'Most collected,', barPercent };
  if (pct >= 40) return { tone: 'amber', lead: 'Follow up:', barPercent };
  return { tone: 'red', lead: 'Collect now:', barPercent };
}
