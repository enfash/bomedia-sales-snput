import { nairaToKobo } from './accounting-entry';
export type ShiftRow = Record<string,string>;
export type ShiftData = {date:string;sales:ShiftRow[];payments:ShiftRow[];expenses:ShiftRow[];staff:{id:string;name:string}[]};
const amount = (row: ShiftRow) => {
  const value = row._amountKobo;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error('Invalid report amount');
  return BigInt(value);
};
export function shiftTotals(data: Pick<ShiftData,'sales'|'payments'|'expenses'>, staff = 'All') {
  const mine = (row:ShiftRow) => staff === 'All' || row._staffId === staff;
  const sales=data.sales.filter(mine), payments=data.payments.filter(mine), expenses=data.expenses.filter(mine);
  const receipts=payments.reduce((sum,r)=>sum+amount(r),BigInt('0')), spent=expenses.reduce((sum,r)=>sum+amount(r),BigInt('0'));
  const method = (rows:ShiftRow[], name:string) => rows.filter(r=>(r._method ?? r['PAYMENT METHOD']?.toLowerCase())===name).reduce((sum,r)=>sum+amount(r),BigInt('0'));
  const revenue=sales.reduce((sum,r)=>sum+BigInt(nairaToKobo(r['AMOUNT (₦)']) ?? '0'),BigInt('0'));
  const debt=sales.reduce((sum,r)=>{const n=BigInt(nairaToKobo(r['AMOUNT DIFFERENCES']) ?? '0');return sum+(n>BigInt('0')?n:BigInt('0'));},BigInt('0'));
  return {sales,payments,expenses,receipts,spent,revenue,debt,net:receipts-spent,cash:method(payments,'cash'),transfer:method(payments,'transfer'),pos:method(payments,'pos'),netCash:method(payments,'cash')-method(expenses,'cash')};
}
export const formatKobo = (amount:bigint) => `${amount<BigInt('0')?'-':''}₦${( (amount<BigInt('0')?-amount:amount)/BigInt('100')).toLocaleString('en-NG')}.${((amount<BigInt('0')?-amount:amount)%BigInt('100')).toString().padStart(2,'0')}`;
export async function fetchShiftData(date:string, send:typeof fetch=fetch):Promise<ShiftData> {
  const response=await send(`/api/accounting/shift-report?date=${encodeURIComponent(date)}`,{cache:'no-store'});
  const data=await response.json();
  if (!response.ok || data.date!==date || !['sales','payments','expenses','staff'].every(k=>Array.isArray(data[k]))) throw new Error('The report could not be loaded completely. Retry before exporting.');
  shiftTotals(data); // Reject malformed money rather than silently treating it as zero.
  return data;
}
