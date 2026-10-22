import { readExpenseReceipt } from '@/lib/server/expense-receipts';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {return readExpenseReceipt((await params).id);}
