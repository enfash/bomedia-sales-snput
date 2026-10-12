import { readApprovalRules, saveApprovalRule } from '@/lib/server/approvals-routes';
export const dynamic = 'force-dynamic';
export const GET = readApprovalRules;
export const POST = saveApprovalRule;
