import { changeExpense, readExpenseHistory } from '@/lib/server/expense-corrections-routes';
export const dynamic = 'force-dynamic';
export const GET = readExpenseHistory;
export const POST = changeExpense;
