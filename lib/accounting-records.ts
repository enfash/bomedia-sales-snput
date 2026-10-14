// Loads every page of one accounting list (customers, materials, payment methods, ...) from /api/accounting/records.
// Moved here, unchanged, from the retired Accounting entry screen; the stock screens still use it.
export async function records<T>(resource:string,customerId?:string):Promise<T[]> {
  const result:T[]=[];let cursor:string|null=null;
  const seen=new Set<string>();
  do {
    const params=new URLSearchParams({resource});
    if(customerId)params.set('customer_id',customerId);
    if(cursor)params.set('after_id',cursor);
    const response=await fetch(`/api/accounting/records?${params}`,{cache:'no-store'});
    const page=await response.json();
    if(!response.ok || !Array.isArray(page.data))throw new Error(page.error || 'Records could not be loaded.');
    result.push(...page.data);cursor=page.next_after_id;
    if(cursor) {if(seen.has(cursor))throw new Error('Records could not be completely loaded.');seen.add(cursor);}
  }while(cursor);
  return result;
}
