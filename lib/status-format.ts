// Lagos wall-clock wording for the System status page ("Today, 4:06 am", "8 Oct, 12:25 pm").
const TZ = 'Africa/Lagos';
const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
const clock = (date: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(date).toLowerCase();

export function formatWhen(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Nothing saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  if (day(date) === day(now)) return `Today, ${clock(date)}`;
  if (day(date) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${clock(date)}`;
  const short = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }).format(date);
  return `${short}, ${clock(date)}`;
}
export const formatClock = (value: string | Date) => clock(new Date(value));
