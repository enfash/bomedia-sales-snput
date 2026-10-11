import { recordScreenExpense } from '@/lib/server/screen-expenses';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>recordScreenExpense(request);
