// PostgreSQL API amounts are integer-kobo strings. Keep them exact in the UI;
// never reuse the legacy Sheets helper's half-naira settlement tolerance.
export function parseKobo(value: string): bigint {
  if(typeof value!=='string' || !/^-?(0|[1-9][0-9]*)$/.test(value))throw new Error('Expected integer kobo');
  return BigInt(value);
}
export function formatKobo(value: string): string {
  const amount=parseKobo(value),absolute=amount<BigInt(0) ? -amount : amount;
  const whole=(absolute/BigInt(100)).toLocaleString('en-NG');
  return `${amount<BigInt(0) ? '-' : ''}₦${whole}.${(absolute%BigInt(100)).toString().padStart(2,'0')}`;
}
export function describeKoboBalance(value: string,subtle=false) {
  const amount=parseKobo(value);
  if(amount>BigInt(0))return {tone:'debt' as const,label:formatKobo(value),color:subtle ? 'error.light' : 'error.main'};
  if(amount<BigInt(0))return {tone:'credit' as const,label:`${formatKobo((-amount).toString())} credit`,color:'success.main'};
  return {tone:'settled' as const,label:formatKobo('0'),color:'text.disabled'};
}
export const hasOutstandingKobo=(value:string)=>parseKobo(value)>BigInt(0);
export const collectableKobo=(value:string)=>{const amount=parseKobo(value);return amount>BigInt(0) ? amount.toString() : '0';};
