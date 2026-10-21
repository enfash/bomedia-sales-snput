"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Button, ButtonBase, IconButton, Typography, useMediaQuery } from '@mui/material';
import { LoadingState } from '@/components/loading-state';
import { useTheme } from '@mui/material/styles';
import { Check, CheckCircle2, Clock, MoreVertical, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { boardStyles as styles, stageStyles, settingsStyles } from '@/app/theme';
import { HomeBackLink } from '@/components/back-link';
import { useFloatingNotice } from '@/components/floating-notice';
import type { UnifiedRecord } from '@/components/manage-sale-action';
import { MaterialBadge } from '@/components/material-badge';
import { ResponsiveSheet } from '@/components/responsive-sheet';
import { dayFromText, shortDay } from '@/lib/expense-list';
import { STAGES, boardColumns, jobsFrom, jobsToMove, nextStage, stageById, stageOf, type Stage, type StageId } from '@/lib/job-board';
import { useSyncStore } from '@/lib/store';

interface JobBoardProps {
  isAdmin?: boolean;
  filterClient?: string | null;
}

const DELIVERED_PAGE = 20;
const dateOf = (job: UnifiedRecord) => { const day = dayFromText(job.date); return day ? shortDay(day) : job.date; };
const jobName = (job: UnifiedRecord) => `${job.description}, ${job.client}`;

function JobCardBody({ job, stage, showClient = true }: { job: UnifiedRecord; stage: StageId; showClient?: boolean }) {
  return <>
    <Box>
      {showClient && <Typography variant="body2" sx={styles.jobClient}>{job.client}</Typography>}
      <Typography variant="h6" component="p" title={job.description} sx={styles.jobTitle}>{job.description}</Typography>
    </Box>
    <Box sx={styles.jobMeta}>
      <Box>{job.material && <MaterialBadge material={job.material} />}</Box>
      {stage === 'Delivered'
        ? <Typography variant="body2" component="span" sx={styles.jobDone}><CheckCircle2 size={14} />Done</Typography>
        : <Typography variant="body2" component="span" sx={styles.jobDate}><Clock size={14} />{dateOf(job)}</Typography>}
    </Box>
  </>;
}

/** Phone: one job, with a one-tap move to the next stage. In select mode the whole card ticks instead. */
function PhoneCard({ job, selecting, selected, onToggle, onMoveNext, onMoveOther }: {
  job: UnifiedRecord; selecting: boolean; selected: boolean; onToggle: () => void; onMoveNext: (stage: Stage) => void; onMoveOther: () => void;
}) {
  const stage = stageOf(job);
  const next = nextStage(stage);
  return <Box sx={[styles.jobCard, selected && styles.jobCardSelected]}>
    {selecting && <ButtonBase aria-pressed={selected} aria-label={`Select ${jobName(job)}`} onClick={onToggle} sx={[styles.tick, selected && styles.tickOn]}>{selected && <Check size={16} />}</ButtonBase>}
    <Box sx={styles.jobBody} onClick={selecting ? onToggle : undefined}>
      {/* A delivered job has nowhere to go next, so its menu sits beside the customer name instead of taking a row of its own. */}
      {stage === 'Delivered' && !selecting && <Box sx={styles.jobMeta}>
        <Typography variant="body2" sx={styles.jobClient}>{job.client}</Typography>
        <IconButton aria-label={`Move ${jobName(job)} to another stage`} sx={styles.moveOther} onClick={onMoveOther}><MoreVertical size={18} /></IconButton>
      </Box>}
      <JobCardBody job={job} stage={stage} showClient={!(stage === 'Delivered' && !selecting)} />
      {!selecting && stage !== 'Delivered' && <Box sx={styles.jobActions}>
        {next && <Button variant="contained" sx={styles.moveNext} onClick={() => onMoveNext(next)}>Move to {next.id}</Button>}
        <IconButton aria-label={`Move ${jobName(job)} to another stage`} sx={styles.moveOther} onClick={onMoveOther}><MoreVertical size={18} /></IconButton>
      </Box>}
    </Box>
  </Box>;
}

/** Desktop: a card to drag between columns; a click selects it. */
function DeskCard({ job, selected, dragging, onToggle, onDragStart, onDragEnd, onMoveOther }: {
  job: UnifiedRecord; selected: boolean; dragging: boolean; onToggle: () => void; onDragStart: () => void; onDragEnd: () => void; onMoveOther: () => void;
}) {
  return <Box draggable onClick={onToggle} onDragStart={onDragStart} onDragEnd={onDragEnd} sx={[styles.jobCard, styles.deskCard, selected && styles.jobCardSelected, dragging && styles.dragging]}>
    {selected && <Box component="span" sx={styles.tickBadge}><Check size={12} /></Box>}
    <Box sx={styles.jobBody}>
      <Box sx={styles.jobMeta}>
        <Typography variant="body2" sx={styles.jobClient}>{job.client}</Typography>
        <IconButton size="small" aria-label={`Move ${jobName(job)} to another stage`} onClick={(event) => { event.stopPropagation(); onMoveOther(); }}><MoreVertical size={16} /></IconButton>
      </Box>
      <JobCardBody job={job} stage={stageOf(job)} showClient={false} />
    </Box>
  </Box>;
}

// False while the server renders and during hydration, true afterwards: what the board shows depends on saved browser data.
const noSubscription = () => () => {};
const useMounted = () => useSyncExternalStore(noSubscription, () => true, () => false);

export function JobBoard({ isAdmin = false, filterClient }: JobBoardProps) {
  const theme = useTheme();
  const mounted = useMounted();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const cachedSales = useSyncStore((s) => s.cachedSales);
  const updateSaleStatus = useSyncStore((s) => s.updateSaleStatus);

  const [chosen, setChosen] = useState<StageId | null>(null);
  const [deliveredShown, setDeliveredShown] = useState(DELIVERED_PAGE);
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const [moreChips, setMoreChips] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragged, setDragged] = useState<UnifiedRecord | null>(null);
  const [over, setOver] = useState<StageId | null>(null);
  const [moving, setMoving] = useState<UnifiedRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const jobs = jobsFrom(cachedSales, filterClient);
  const columns = boardColumns(jobs);
  const active: StageId = chosen ?? columns.find((c) => c.items.length > 0)?.stage.id ?? 'Quoted';
  const activeColumn = columns.find((c) => c.stage.id === active)!;
  // The phone list shows the newest delivered jobs first, a page at a time, so 200+ finished jobs never become one endless scroll.
  const ordered = active === 'Delivered' ? [...activeColumn.items].sort((a, b) => dayFromText(b.date).localeCompare(dayFromText(a.date))) : activeColumn.items;
  const visible = active === 'Delivered' ? ordered.slice(0, deliveredShown) : ordered;

  // Keeps the chosen stage chip in view and fades the right edge only while more chips are hidden there.
  useEffect(() => {
    const row = chipsRef.current;
    if (!row) return;
    const update = () => setMoreChips(row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    row.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    update();
    row.addEventListener('scroll', update, { passive: true });
    return () => row.removeEventListener('scroll', update);
  }, [active, mounted, desktop, jobs.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const res = await fetch('/api/sales');
      const json = await res.json();
      const store = useSyncStore.getState();
      store.setCachedData(json.data || [], store.cachedExpenses, store.cachedInventory, store.cachedPayments, store.cachedMaterials);
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const clearSelection = () => setSelected(new Set());

  /** Writes the new stage for each job that has to move; a selected job takes the whole selection with it. */
  const move = (moved: UnifiedRecord, to: Stage) => {
    const list = jobsToMove(jobs, selected, moved, to.id);
    list.forEach((job) => updateSaleStatus(job.salesId || '', job.rowIndex, to.dbStatus));
    if (selected.has(moved.id)) clearSelection();
    if (list.length) toast.success(list.length === 1 ? `Moved to ${to.label}` : `${list.length} jobs moved to ${to.label}`);
  };

  const dropOn = (stage: StageId) => {
    if (dragged) move(dragged, stageById(stage));
    setDragged(null);
    setOver(null);
  };

  useFloatingNotice('board-refresh', mounted && refreshFailed ? { tone: 'error', text: 'The board could not be refreshed. Check your connection. The jobs you see are the last ones saved.' } : null);
  useFloatingNotice('board-offline', mounted && !online ? { tone: 'warning', text: 'Showing the last saved board. Moves you make now are kept on this phone and sent when it is online.' } : null);

  const selectedJobs = jobs.filter((job) => selected.has(job.id));
  const empty = jobs.length === 0;

  return <Box sx={styles.screen}>
    <HomeBackLink />
    <Box sx={styles.heading}>
      <Typography variant="h3" component="h1">{isAdmin ? 'Production board' : 'Job board'}</Typography>
      <Typography color="text.secondary">{desktop ? 'Drag a job to the next stage, or select several and drag one of them.' : 'Move jobs through the stages as they are done.'}</Typography>
    </Box>

    <Button variant="outlined" color="primary" size="large" startIcon={<RefreshCw size={18} />} disabled={refreshing} onClick={() => void handleRefresh()}>
      {refreshing ? 'Refreshing…' : 'Refresh board'}
    </Button>


    {!mounted || (refreshing && empty) ? <LoadingState pieces={[{ k: 'cards', n: 3 }]} label="Loading the board" /> : empty ? <Box sx={styles.emptyBox}>
      <Typography sx={styles.emptyTitle}>No jobs on the board</Typography>
      <Typography variant="body2" sx={styles.emptyText}>Every sale shows up here as a job once it is logged.</Typography>
    </Box> : desktop ? <>
      {selected.size > 0 && <Box sx={styles.selection}>
        <Typography variant="body2" component="span" sx={styles.selectedPill}>{selected.size} selected</Typography>
        <Button color="inherit" size="small" onClick={clearSelection}>Clear</Button>
        <Typography variant="body2" color="text.secondary">Drag any selected card to move all of them.</Typography>
      </Box>}
      <Box sx={styles.columns}>
        {columns.map(({ stage, items }) => <Box key={stage.id} sx={[styles.column, over === stage.id && styles.columnOver]}
          onDragOver={(event) => { event.preventDefault(); if (over !== stage.id) setOver(stage.id); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
          onDrop={(event) => { event.preventDefault(); dropOn(stage.id); }}>
          <Box sx={styles.columnHead}>
            <Typography component="span" sx={styles.columnTitle}><Box component="span" sx={stageStyles[stage.id].dotLarge} />{stage.label}</Typography>
            <Typography variant="caption" component="span" sx={styles.columnCount}>{items.length}</Typography>
          </Box>
          <Box sx={styles.columnScroll}>
            {items.map((job) => <DeskCard key={job.id} job={job} selected={selected.has(job.id)} dragging={!!dragged && (dragged.id === job.id || (selected.has(dragged.id) && selected.has(job.id)))}
              onToggle={() => toggle(job.id)} onDragStart={() => setDragged(job)} onDragEnd={() => { setDragged(null); setOver(null); }} onMoveOther={() => setMoving([job])} />)}
            {items.length === 0 && <Box sx={styles.dropHint}><Typography variant="body2">Drop jobs here</Typography></Box>}
          </Box>
        </Box>)}
      </Box>
    </> : <>
      <Box ref={chipsRef} sx={[styles.stageChips, moreChips && styles.stageChipsMore]} role="group" aria-label="Stage">
        {columns.map(({ stage, items }) => <Button key={stage.id} variant="outlined" color="inherit" sx={[styles.stageChip, active === stage.id && stageStyles[stage.id].active]} aria-pressed={active === stage.id}
          startIcon={<Box component="span" sx={stageStyles[stage.id].dot} />} onClick={() => { setChosen(stage.id); setSelecting(false); clearSelection(); }}>
          {stage.id} · {items.length}
        </Button>)}
      </Box>
      <Box sx={styles.listHead}>
        <Typography variant="overline" sx={styles.dayLabel}>{activeColumn.stage.label.toUpperCase()} · {activeColumn.items.length} {activeColumn.items.length === 1 ? 'JOB' : 'JOBS'}</Typography>
        {activeColumn.items.length > 0 && <Button variant="outlined" color="inherit" onClick={() => { setSelecting(!selecting); clearSelection(); }}>{selecting ? 'Done' : 'Select'}</Button>}
      </Box>
      {activeColumn.items.length === 0 ? <Box sx={styles.emptyBox}>
        <Typography sx={styles.emptyTitle}>Nothing is {activeColumn.stage.id} yet</Typography>
        <Typography variant="body2" sx={styles.emptyText}>Jobs you move here will show up in this list.</Typography>
      </Box> : <Box sx={styles.jobList}>
        {visible.map((job) => <PhoneCard key={job.id} job={job} selecting={selecting} selected={selected.has(job.id)} onToggle={() => toggle(job.id)}
          onMoveNext={(stage) => move(job, stage)} onMoveOther={() => setMoving([job])} />)}
      </Box>}
      {visible.length < ordered.length && <Button variant="outlined" color="inherit" onClick={() => setDeliveredShown((n) => n + DELIVERED_PAGE)}>Show {Math.min(DELIVERED_PAGE, ordered.length - visible.length)} more · {ordered.length - visible.length} not shown</Button>}
      {!selecting && activeColumn.items.length > 1 && <Typography variant="body2" sx={styles.hint}>Tap <strong>Select</strong> to move several jobs to a stage at once.</Typography>}
      {selecting && selected.size > 0 && <Box sx={styles.selectBar}>
        <Box>
          <Typography sx={styles.amountValue}>{selected.size} selected</Typography>
          <Typography variant="caption" color="text.secondary">{selectedJobs.every((job) => stageOf(job) === active) ? `${selected.size === 1 ? 'It is' : selected.size === 2 ? 'Both are' : 'All are'} in ${active}` : 'In different stages'}</Typography>
        </Box>
        <Box sx={styles.selectActions}>
          <Button color="inherit" onClick={clearSelection}>Clear</Button>
          <Button variant="contained" onClick={() => setMoving(selectedJobs)}>Move to…</Button>
        </Box>
      </Box>}
    </>}

    <ResponsiveSheet open={!!moving} onClose={() => setMoving(null)} title={moving && moving.length > 1 ? `Move ${moving.length} jobs` : 'Move this job'} description={moving && moving.length === 1 ? jobName(moving[0]) : undefined}
      footer={<Box sx={settingsStyles.footer}><Button color="inherit" onClick={() => setMoving(null)}>Close</Button></Box>}>
      {moving && <Box sx={styles.sheetBody}>
        {STAGES.map((stage) => {
          const current = moving.length === 1 && stageOf(moving[0]) === stage.id;
          const look = stageStyles[stage.id];
          return current
            ? <Box key={stage.id} sx={[styles.stageChoiceCurrent, look.active]}><Box component="span" sx={look.dotLarge} />{stage.label}<Typography variant="caption" component="span" sx={styles.stageChoiceTag}>Current</Typography></Box>
            : <Button key={stage.id} color="inherit" sx={styles.stageChoice} startIcon={<Box component="span" sx={look.dotLarge} />} onClick={() => { move(moving[0], stage); setMoving(null); }}>{stage.label}</Button>;
        })}
        <Typography variant="body2" sx={styles.hint}>Tapping a stage moves the job straight away. The change saves with the other sales.</Typography>
      </Box>}
    </ResponsiveSheet>
  </Box>;
}
