export type PaymentMethod = 'cash' | 'transfer' | 'pos';
export const PAYMENT_METHODS: ReadonlyArray<{value:PaymentMethod;label:string}> = [
  {value:'cash',label:'Cash'}, {value:'transfer',label:'Transfer'}, {value:'pos',label:'POS'},
];
export function normalizePaymentMethod(value:unknown):PaymentMethod|null {
  if(typeof value!=='string')return null;
  const method=value.trim().toLowerCase();
  return method==='cash' || method==='transfer' || method==='pos' ? method : null;
}
