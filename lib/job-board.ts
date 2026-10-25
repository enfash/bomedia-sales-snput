// What the Job board shows and how a move works, moved out of components/job-board.tsx unchanged.
import type { UnifiedRecord } from '@/components/manage-sale-action';
import { canonicalJobStatus } from '@/lib/job-status';

export type StageId = 'Quoted' | 'Printing' | 'Finishing' | 'Ready' | 'Delivered';
/** `dbStatus` is the JOB STATUS string a move writes: the sheet's old wording for two of the stages. */
export type Stage = { id: StageId; label: string; dbStatus: string };

export const STAGES: Stage[] = [
  { id: 'Quoted', label: 'Quoted / Pending', dbStatus: 'Quoted' },
  { id: 'Printing', label: 'Printing', dbStatus: 'Printing' },
  { id: 'Finishing', label: 'Finishing / In Progress', dbStatus: 'In Progress' },
  { id: 'Ready', label: 'Ready', dbStatus: 'Ready' },
  { id: 'Delivered', label: 'Delivered / Completed', dbStatus: 'Delivered' },
];

const parseAmount = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const str = val.toString().replace(/[₦, \s]/g, '');
  return parseFloat(str) || 0;
};

export const stageOf = (job: UnifiedRecord): StageId => (canonicalJobStatus(job.jobStatus || 'Quoted') ?? 'Quoted') as StageId;
export const stageById = (id: StageId): Stage => STAGES.find((stage) => stage.id === id)!;

/** The stage after this one, or nothing for the last. */
export const nextStage = (id: StageId): Stage | undefined => STAGES[STAGES.findIndex((stage) => stage.id === id) + 1];

export const mapJob = (r: any): UnifiedRecord => {
  const amount = parseAmount(r['AMOUNT (₦)'] || r['Amount (₦)']);
  const sId = r['Sales ID'] || r['Sales Id'] || r['SALES ID'] || '';
  const rowIndexStr = r._rowIndex !== undefined ? r._rowIndex.toString() : '';
  return {
    id: sId ? `${sId}-${rowIndexStr}` : `sale-${r.DATE || r.Date || ''}-${r['CLIENT NAME'] || r['Client Name'] || ''}-${rowIndexStr}`,
    date: r.DATE || r.Date || 'N/A',
    type: 'Sale',
    client: r['CLIENT NAME'] || r['Client Name'] || 'N/A',
    description: r['JOB DESCRIPTION'] || r['Job Description'] || '—',
    amount,
    status: 'In Progress',
    loggedBy: r['Logged By'] || 'Unknown',
    isPending: false,
    rowIndex: r._rowIndex ? parseInt(r._rowIndex.toString()) : undefined,
    jobStatus: r['JOB STATUS'] || r['Job Status'] || 'Quoted',
    material: r['Material'] || r['MATERIAL'] || r['material'] || '',
    balance: parseAmount(r['AMOUNT DIFFERENCES'] || r['Amount Differences']),
    salesId: sId,
    raw: r,
  };
};

export function jobsFrom(rows: any[], filterClient?: string | null): UnifiedRecord[] {
  let mapped = (rows || []).map((r) => mapJob(r));
  if (filterClient) mapped = mapped.filter((r) => r.client.toLowerCase().includes(filterClient.toLowerCase()));
  return mapped;
}

export const boardColumns = (jobs: UnifiedRecord[]) => STAGES.map((stage) => ({
  stage,
  items: jobs.filter((r) => r.type === 'Sale' && stageOf(r) === stage.id),
}));

/**
 * Which jobs a drop or a "move to" changes. A job that is part of the selection takes the whole selection with it
 * (the ones already in that stage stay put); an unselected job moves alone.
 */
export function jobsToMove(jobs: UnifiedRecord[], selectedIds: Set<string>, moved: UnifiedRecord, to: StageId): UnifiedRecord[] {
  if (stageOf(moved) === to && !selectedIds.has(moved.id)) return [];
  if (selectedIds.has(moved.id)) return jobs.filter((r) => selectedIds.has(r.id) && stageOf(r) !== to);
  return stageOf(moved) !== to ? [moved] : [];
}
