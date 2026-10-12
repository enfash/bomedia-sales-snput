import { decideApproval, readApprovals } from '@/lib/server/approvals-routes';
export const dynamic = 'force-dynamic';
export const GET = readApprovals;
export const POST = decideApproval;
