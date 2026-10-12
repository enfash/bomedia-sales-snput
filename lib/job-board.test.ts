import { describe, expect, it } from 'vitest';
import { STAGES, boardColumns, jobsFrom, jobsToMove, mapJob, nextStage, stageById, stageOf } from './job-board';

const row = (over: Record<string, string> = {}) => ({
  DATE: '2026-10-08', 'CLIENT NAME': 'new user', 'JOB DESCRIPTION': 'Flex print job [10x2ft]', Material: 'Flex', 'AMOUNT (₦)': '₦14,000',
  'JOB STATUS': 'Printing', 'Sales ID': '', _rowIndex: '4', 'AMOUNT DIFFERENCES': '0', 'Logged By': 'Ada', ...over,
});

describe('stages', () => {
  it('has the five stages in order, writing the sheet wording for Finishing', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['Quoted', 'Printing', 'Finishing', 'Ready', 'Delivered']);
    expect(stageById('Finishing').dbStatus).toBe('In Progress');
    expect(stageById('Delivered').dbStatus).toBe('Delivered');
    expect(stageById('Quoted').dbStatus).toBe('Quoted');
  });
  it('offers the next stage, and none after Delivered', () => {
    expect(nextStage('Printing')?.id).toBe('Finishing');
    expect(nextStage('Ready')?.id).toBe('Delivered');
    expect(nextStage('Delivered')).toBeUndefined();
  });
});

describe('mapJob and stageOf', () => {
  it('reads the sale into a job', () => {
    const job = mapJob(row({ 'Sales ID': 'BOM-1', _rowIndex: '9' }));
    expect(job).toMatchObject({ id: 'BOM-1-9', client: 'new user', description: 'Flex print job [10x2ft]', material: 'Flex', jobStatus: 'Printing', salesId: 'BOM-1', rowIndex: 9, amount: 14000, type: 'Sale' });
  });
  it('fills defaults and builds an id without a sales ID', () => {
    const job = mapJob({});
    expect(job).toMatchObject({ client: 'N/A', description: '—', jobStatus: 'Quoted', date: 'N/A' });
    expect(mapJob(row()).id).toBe('sale-2026-10-08-new user-4');
  });
  it('treats the sheet\'s old words as the new stages, and anything unknown as Quoted', () => {
    expect(stageOf(mapJob(row({ 'JOB STATUS': 'In Progress' })))).toBe('Finishing');
    expect(stageOf(mapJob(row({ 'JOB STATUS': 'Pending' })))).toBe('Quoted');
    expect(stageOf(mapJob(row({ 'JOB STATUS': 'Completed' })))).toBe('Delivered');
    expect(stageOf(mapJob(row({ 'JOB STATUS': 'Something odd' })))).toBe('Quoted');
    expect(stageOf(mapJob(row({ 'JOB STATUS': '' })))).toBe('Quoted');
  });
});

describe('jobsFrom and boardColumns', () => {
  const rows = [row({ 'CLIENT NAME': 'Adeola Stores', 'JOB STATUS': 'Ready', _rowIndex: '2' }), row({ 'JOB STATUS': 'Printing', _rowIndex: '3' }), row({ 'JOB STATUS': 'Printing', _rowIndex: '4', 'CLIENT NAME': 'Zed' })];
  it('filters by client name, ignoring case', () => {
    expect(jobsFrom(rows, 'ADEOLA')).toHaveLength(1);
    expect(jobsFrom(rows, null)).toHaveLength(3);
  });
  it('puts each job in its stage and keeps every stage, even an empty one', () => {
    const columns = boardColumns(jobsFrom(rows));
    expect(columns.map((c) => c.items.length)).toEqual([0, 2, 0, 1, 0]);
  });
});

describe('jobsToMove', () => {
  const jobs = jobsFrom([
    row({ 'JOB STATUS': 'Printing', _rowIndex: '1', 'Sales ID': 'A' }),
    row({ 'JOB STATUS': 'Printing', _rowIndex: '2', 'Sales ID': 'B' }),
    row({ 'JOB STATUS': 'Ready', _rowIndex: '3', 'Sales ID': 'C' }),
  ]);
  const [a, b, c] = jobs;
  it('moves an unselected job on its own', () => {
    expect(jobsToMove(jobs, new Set(), a, 'Ready')).toEqual([a]);
  });
  it('does nothing when the job is already in that stage', () => {
    expect(jobsToMove(jobs, new Set(), a, 'Printing')).toEqual([]);
  });
  it('takes the whole selection along with a selected job, leaving ones already there', () => {
    const picked = new Set([a.id, b.id, c.id]);
    expect(jobsToMove(jobs, picked, a, 'Ready')).toEqual([a, b]);
  });
  it('moves a job that is not selected alone, even when others are selected', () => {
    expect(jobsToMove(jobs, new Set([b.id]), a, 'Finishing')).toEqual([a]);
  });
});
