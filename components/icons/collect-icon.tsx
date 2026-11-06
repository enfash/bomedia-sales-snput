/** A wallet with a down arrow going in: a payment being taken. Drawn in currentColor, so the button's colour sets it. */
export function CollectIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="10" width="18" height="10" rx="2.5" />
      <path d="M16 15h.01" />
      <path d="M12 2.5v6.5" />
      <path d="M9.5 6.5 12 9l2.5-2.5" />
    </svg>
  );
}
