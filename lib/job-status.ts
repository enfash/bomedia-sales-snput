/** The existing board's labels and the database use the same five stages. */
export const jobStatuses = ['Quoted', 'Printing', 'Finishing', 'Ready', 'Delivered'];

export function canonicalJobStatus(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (jobStatuses.includes(value)) return value;
  switch (value) {
    case 'Pending': return 'Quoted';
    case 'In Progress': return 'Finishing';
    case 'Completed': return 'Delivered';
    default: return undefined;
  }
}
