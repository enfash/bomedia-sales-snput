import { uploadExpenseReceipt } from '@/lib/server/expense-receipts';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>uploadExpenseReceipt(request);
