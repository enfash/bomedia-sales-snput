import { listExpenseCategorySettings,saveExpenseCategorySetting } from '@/lib/server/expense-category-settings-routes';
export const dynamic = 'force-dynamic';
export const GET = listExpenseCategorySettings;
export const POST = saveExpenseCategorySetting;
