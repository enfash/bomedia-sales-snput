"use client";

import type {} from "@mui/x-date-pickers/themeAugmentation";
import { alpha, createTheme, darken, keyframes, lighten, type Components, type Theme } from "@mui/material/styles";

export const dateRangeStyles = {
  periods: {
    bgcolor: 'action.hover', borderRadius: 3, p: 0.5,
    '& .MuiToggleButton-root': {
      minWidth: 0, minHeight: 44, px: 1.5, border: 0, borderRadius: '8px !important',
      fontWeight: 700, color: 'text.primary',
      '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText',
        '&:hover': { bgcolor: 'primary.dark' } },
    },
  },
  fields: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))',
    gap: 1.5, width: '100%', minWidth: 0, maxWidth: 560,
  },
  field: { minWidth: 0, width: '100%', '& .MuiPickersInputBase-root': { minWidth: 0 },
    '& .MuiPickersSectionList-root': { minWidth: 0 },
  },
  dialog: { '& .MuiDialog-paper': { m: 2, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100dvh - 32px)' } },
} as const;

// White at a given strength, for controls that sit on the brand gradient or the always-dark side panel.
export const whiteTint = (opacity: number) => (theme: Theme) => alpha(theme.palette.common.white, opacity);

// Sync-status icons in the side panel (cloud icons take their colour from the text colour).
export const syncIconStyles = {
  waiting: { display: "flex", color: "warning.main" },
  synced: { display: "flex", color: "success.light" },
  dot: { width: 8, height: 8, borderRadius: "50%", bgcolor: "warning.main" },
} as const;

// The side panel (desktop sidebar and mobile drawer) is dark in both modes.
const SIDE_PANEL = "#111827";

export const quickActionStyles = {
  container: { containerType: 'inline-size', width: '100%', minWidth: 0, flex: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1,
    '@container (min-width: 36rem)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
  },
  button: {
    minWidth: 0, minHeight: 44, px: 1, fontSize: '0.75rem', fontWeight: 700,
    bgcolor: whiteTint(0.1),
    // Doubled selector: beats the dark-mode brand colour that outlined primary buttons get from the theme.
    '&&': { color: 'common.white', borderColor: whiteTint(0.35) },
    borderRadius: 100, whiteSpace: 'normal', lineHeight: 1.4,
    '& .MuiButton-startIcon': { flexShrink: 0 },
    '&&:hover': { bgcolor: whiteTint(0.2), borderColor: whiteTint(0.5) },
  },
} as const;

export const chartCountBadgeStyles = {
  base: {color:'common.white',fontSize:'0.75rem',fontWeight:700,px:1.5,py:0.5,borderRadius:100,border:'1px solid'},
  clients: {bgcolor:'primary.main',borderColor:'primary.light',display:'flex',alignItems:'center',gap:0.5},
  debt: {bgcolor:'error.main',borderColor:'error.main'},
} as const;

export const settingsStyles = {
  page: {p:{xs:2,md:4},pb:{xs:3,md:12},minWidth:0},
  heading: {mt:2,mb:3},
  sections: {overflow:'hidden'},
  sectionLink: {display:'flex',alignItems:'center',gap:2,p:{xs:2,sm:3},textDecoration:'none',color:'text.primary',borderBottom:'1px solid',borderColor:'divider',
    '&:last-child':{borderBottom:0},'&:hover':{bgcolor:'action.hover'},'&:focus-visible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-2}},
  icon: {display:'flex',alignItems:'center',color:'primary.main',flexShrink:0},
  grow: {flex:1,minWidth:0,overflowWrap:'anywhere'},
  toolbar: {display:'flex',flexWrap:'wrap',gap:1,justifyContent:'space-between',mb:2},
  row: {p:2,display:'flex',alignItems:'center',justifyContent:'space-between',gap:2},
  hiddenRow: {bgcolor:'action.hover',borderStyle:'dashed'},
  form: {p:{xs:2,sm:3}},
  footer: {p:2,display:'flex',gap:1,justifyContent:'flex-end'},
  fieldset: {border:0,m:0,p:0,minWidth:0},
  legend: {mb:1,fontWeight:600},
  orderNumber: {width:22,fontWeight:700,color:'text.disabled',flexShrink:0},
  moveButtons: {display:'flex',gap:1,flexShrink:0},
  moveButton: {width:44,height:44,border:'1px solid',borderColor:'divider',borderRadius:2.5,color:'text.primary','&.Mui-disabled':{color:'text.disabled',bgcolor:'action.hover'}},
  removedHeading: {mt:2,fontWeight:700,letterSpacing:'0.08em'},
  removeZone: {display:'flex',flexDirection:'column',gap:1.25,borderTop:'1px solid',borderColor:'divider',pt:2},
  pricingToggle: {'& .MuiToggleButton-root.Mui-selected':{bgcolor:'primary.main',color:'primary.contrastText','&:hover':{bgcolor:'primary.dark'}}},
} as const;

// Settings > Business details: form beside a live preview of what prints on invoices.
export const businessDetailsStyles = {
  layout: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) minmax(0, 380px)" }, gap: 3, alignItems: "start" },
  card: { p: { xs: 2, sm: 3 }, borderRadius: 3 },
  fields: { display: "flex", flexDirection: "column", gap: 2.5, mt: 2.5 },
  digitsInput: { letterSpacing: "0.08em" },
  previewTitle: { fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 1.5 },
  previewBox: { bgcolor: "action.hover", borderRadius: 2, p: 2, mb: 2.5 },
  previewLabel: { fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 },
  previewRow: { display: "flex", justifyContent: "space-between", gap: 1.5, fontSize: "0.75rem", py: 0.5 },
  previewValue: { fontWeight: 700, textAlign: "right", overflowWrap: "anywhere" },
  previewFooter: { borderTop: "1px solid", borderColor: "divider", pt: 2, textAlign: "center" },
  actions: { position: { xs: "sticky", md: "static" }, bottom: { xs: "calc(96px + env(safe-area-inset-bottom, 0px))", md: 0 }, zIndex: 1, display: "flex", gap: 1.5, justifyContent: "flex-end", mt: 3, py: { xs: 1.5, md: 0 }, bgcolor: { xs: "background.paper", md: "transparent" }, borderTop: { xs: "1px solid", md: 0 }, borderColor: "divider", mx: { xs: -2, md: 0 }, px: { xs: 2, md: 0 } },
  saveButton: { flex: { xs: 1, md: "0 0 auto" }, minHeight: 48 },
  resetButton: { minHeight: 48 },
} as const;

// Settings > Payment methods: list of methods with their fixed ledger account.
export const paymentMethodStyles = {
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  row: { p: 2.5, display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", gap: 2 },
  rowOff: { bgcolor: "action.hover", borderStyle: "dashed" },
  grow: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  top: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 },
  pill: { flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.5, px: 1.25, py: 0.25, borderRadius: 100 },
  pillOn: { bgcolor: (theme: Theme) => alpha(theme.palette.success.main, 0.12), color: (theme: Theme) => theme.palette.mode === "dark" ? theme.palette.success.light : theme.palette.success.dark },
  pillOff: { bgcolor: (theme: Theme) => alpha(theme.palette.warning.main, 0.14), color: (theme: Theme) => theme.palette.mode === "dark" ? theme.palette.warning.light : theme.palette.warning.dark },
  account: { bgcolor: "action.hover", borderRadius: 2, p: 1.5 },
  accountLabel: { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled", mb: 0.5 },
  switchRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 },
  footer: { p: 2, display: "flex", gap: 1, justifyContent: "flex-end" },
  form: { p: { xs: 2, sm: 3 } },
} as const;

// Settings > Approvals: one row per rule, a switch and (for date and price) a small number box.
export const approvalRuleStyles = {
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  row: { p: 2.5, display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { xs: "stretch", md: "center" }, gap: 2 },
  rowLater: { bgcolor: "action.hover", borderStyle: "dashed" },
  grow: { flex: 1, minWidth: 0 },
  limit: { display: "flex", alignItems: "center", gap: 1, color: "text.secondary", fontSize: "0.875rem", flexWrap: "wrap" },
  number: { width: 88 },
  numberWide: { width: 150 },
  laterPill: { alignSelf: { xs: "flex-start", md: "center" }, flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100, bgcolor: "action.selected", color: "text.secondary" },
} as const;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;
type Tone = "primary" | "success" | "info" | "warning" | "error";
const tint = (tone: Tone, opacity: number) => (theme: Theme) => alpha(theme.palette[tone].main, opacity);
const toneBox = (tone: Tone) => ({ bgcolor: tint(tone, 0.1), color: `${tone}.main` });

// The cashier's "needs the owner's approval" sheet.
export const approvalPromptStyles = {
  body: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 },
  changes: { display: "flex", flexDirection: "column", gap: 1 },
  change: { px: 1.5, py: 1.25, borderRadius: 2, border: "1px solid", borderColor: tint("warning", 0.5), bgcolor: tint("warning", 0.12), fontSize: "0.875rem" },
  changeTitle: { fontWeight: 700, mr: 1 },
  footer: { p: 2, display: "flex", flexDirection: "column", gap: 1 },
} as const;

// Staff Manager (Settings > Staff). Colours come from palette tokens only, so the
// admin/cashier themes and dark mode all stay consistent.
export const staffManagerStyles = {
  loading: { minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" },
  toolbar: { display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", justifyContent: "space-between", mb: 3 },
  iconSpan: { display: "inline-flex" },
  refreshing: { animation: `${spin} 1s linear infinite` },
  tabs: { mb: 3 },
  viewFilter: { mb: 3, width: { xs: "100%", sm: 240 } },
  periods: dateRangeStyles.periods,
  toggleContent: { display: "flex", alignItems: "center", gap: 0.75 },
  summaryGrid: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5, mb: 3 },
  summaryCard: { p: 2, borderRadius: 3 },
  summaryIcon: { width: 32, height: 32, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5 },
  tone: {
    primary: toneBox("primary"),
    success: toneBox("success"),
    info: toneBox("info"),
    error: toneBox("error"),
    neutral: { bgcolor: "action.hover", color: "text.disabled" },
  },
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  card: { borderRadius: 3, overflow: "hidden" },
  empty: { textAlign: "center", py: 8, borderRadius: 3 },
  emptyIcon: { color: "text.disabled", mb: 1.5 },
  block: { display: "block" },
  bold: { fontWeight: 700 },
  grow: { flex: 1, minWidth: 0 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  nameRow: { display: "flex", alignItems: "center", gap: 1, minWidth: 0 },
  right: { textAlign: "right", flexShrink: 0 },
  avatar: { width: 48, height: 48, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: "common.white", fontSize: "0.8125rem", fontWeight: 800, flexShrink: 0 },
  avatarSmall: { width: 40, height: 40, fontSize: "0.75rem" },
  pill: { display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.25, borderRadius: 100, flexShrink: 0, fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.5 },
  pillOnline: toneBox("success"),
  pillOffline: { bgcolor: "action.hover", color: "text.secondary" },
  dot: { width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor", display: "inline-block" },
  cardHeader: { width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 2, p: 2.5, textAlign: "left", "&:hover": { bgcolor: "action.hover" }, "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } },
  chevron: { display: "flex", color: "text.disabled", flexShrink: 0, ml: 0.5, transition: "transform 0.2s ease-out" },
  chevronOpen: { transform: "rotate(180deg)" },
  statsGrid: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: "1px", bgcolor: "divider", borderTop: "1px solid", borderColor: "divider" },
  statCell: { p: 1.5, textAlign: "center", bgcolor: "background.paper", minWidth: 0 },
  statIcon: { display: "flex", justifyContent: "center", mb: 0.5 },
  expand: { display: "grid", gridTemplateRows: "0fr", transition: "grid-template-rows 0.2s ease-in" },
  expandOpen: { gridTemplateRows: "1fr", transition: "grid-template-rows 0.3s ease-out" },
  expandInner: { minHeight: 0, overflow: "hidden" },
  expandBody: { borderTop: "1px solid", borderColor: "divider", p: 2, bgcolor: "action.hover" },
  todayGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 },
  todayCell: { p: 1.5, borderRadius: 2, textAlign: "center", bgcolor: "background.paper" },
  jobs: { display: "flex", flexDirection: "column", gap: 0.75, mt: 1 },
  jobRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, p: 1.25, borderRadius: 2, bgcolor: "background.paper" },
  jobMeta: { display: "flex", alignItems: "center", gap: 1, flexShrink: 0 },
  jobStatus: { px: 0.75, py: 0.25, borderRadius: 1, fontSize: "0.75rem", fontWeight: 700 },
  jobPaid: toneBox("success"),
  jobPart: { bgcolor: tint("warning", 0.15), color: "warning.dark" },
  jobUnpaid: toneBox("error"),
  lastLogin: { display: "flex", alignItems: "center", gap: 0.5, mt: 1.5, color: "text.disabled" },
  manage: { display: "flex", flexDirection: "column", gap: 2 },
  manageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 },
  formCard: { p: 2, borderRadius: 3 },
  formFields: { display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1.5, mb: 1.5 },
  formName: { flex: 1 },
  formPin: { width: { xs: "100%", md: 144 } },
  formSubmit: { flexShrink: 0 },
  userRow: { display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } },
  userMeta: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5, mt: 0.25 },
  pinSet: { color: "warning.dark", fontWeight: 700 },
  pinNone: { color: "warning.dark", bgcolor: tint("warning", 0.12), borderRadius: 1, px: 0.75, fontWeight: 700 },
  pinAction: { color: "text.disabled", flexShrink: 0, "&:hover": { color: "warning.main", bgcolor: tint("warning", 0.08) } },
  hideAction: { color: "text.disabled", flexShrink: 0, "&:hover": { color: "primary.light", bgcolor: tint("primary", 0.08) } },
  hiddenTag: { fontSize: "0.7rem", fontWeight: 700, px: 0.75, py: 0.125, borderRadius: 100, bgcolor: tint("primary", 0.12), color: "primary.light" },
  removeAction: { color: "text.disabled", flexShrink: 0, "&:hover": { color: "error.main", bgcolor: tint("error", 0.08) } },
  rulesCard: { p: 2, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 },
  rulesLabel: { display: "block", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" },
  sessionRow: { display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1, mt: 0.25 },
  signOutButton: { minHeight: { xs: 44, md: 32 }, px: 1, ml: -1, fontWeight: 600 },
  sectionHeading: { display: "block", fontWeight: 700, color: "text.secondary", mt: 1 },
  removedAvatar: { opacity: 0.55 },
  note: { display: "flex", alignItems: "flex-start", gap: 1, p: 1.5, borderRadius: 2, bgcolor: tint("info", 0.06), border: "1px solid", borderColor: tint("info", 0.2), color: "info.main" },
  noteIcon: { display: "flex", flexShrink: 0, mt: 0.25 },
  dialogPaper: { borderRadius: 3, maxWidth: 400, width: "100%" },
  dialogContent: { p: 3 },
  dialogIcon: { width: 48, height: 48, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5 },
  dialogIconWarning: toneBox("warning"),
  dialogIconError: toneBox("error"),
  dialogTitle: { p: 0, mb: 0.5, fontSize: "1.125rem", fontWeight: 700 },
  dialogText: { mb: 2 },
  dialogActions: { px: 3, pb: 3, gap: 1, "& .MuiButton-root": { flex: 1 } },
  pinInput: { "& input": { textAlign: "center", fontSize: "1.125rem", fontWeight: 700, letterSpacing: "0.25em" } },
} as const;

/** Brand text colour that stays readable in both modes: the bright indigo on dark surfaces, the normal one on light. */
export const accent = (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette.primary.light : theme.palette.primary.main);
const onBrand = (opacity: number) => (theme: Theme) => alpha(theme.palette.common.white, opacity);

// Admin dashboard (/bom03). Brand colours come from the palette, so a theme change reaches every card.
export const dashboardStyles = {
  bold: { fontWeight: 700 },
  iconSpan: { display: "inline-flex" },
  refreshing: { animation: `${spin} 1s linear infinite` },
  summaryBanner: { mt: 2, mb: 3, px: 2.5, py: 1.5, borderRadius: "16px", bgcolor: "primary.main", backgroundImage: "none", display: "flex", alignItems: "flex-start", gap: 1.5 },
  summaryEmoji: { fontSize: "1rem", mt: "2px" },
  summaryText: { fontWeight: 600, color: "primary.contrastText", lineHeight: 1.6 },
  alertCard: { display: "flex", flexDirection: "column", overflow: "hidden" },
  alertHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" },
  alertIcon: { width: 32, height: 32, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center" },
  alertList: { overflowY: "auto", maxHeight: 260, p: 2 },
  emptyState: { alignItems: "center", justifyContent: "center", py: 4, color: "text.disabled" },
  emptyIcon: { display: "flex", opacity: 0.4, mb: 1 },
  emptyLink: { fontWeight: 700, color: accent, mt: 0.5, textDecoration: "none", "&:hover": { textDecoration: "underline" } },
  healthyIcon: { width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", mb: 1, ...toneBox("success") },
  materialRow: { p: 1.5, borderRadius: 2, bgcolor: "action.hover", "&:hover": { bgcolor: "action.selected" }, transition: "background-color .15s" },
  restock: { ml: 1.5, flexShrink: 0 },
  stockBar: { height: 6, borderRadius: 3, bgcolor: "grey.200" },
  alertsAndShortcuts: { display: "flex", flexDirection: "column", gap: 2, mt: 2 },
  quickRow: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 },
  quickCard: {
    p: 1.5, borderRadius: "16px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, minWidth: 0, color: "text.primary", textDecoration: "none",
    bgcolor: tint("primary", 0.06), borderColor: tint("primary", 0.2), transition: "transform .15s, background-color .15s",
    "&:hover": { bgcolor: tint("primary", 0.12) }, "&:active": { transform: "scale(0.97)" },
    "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
  },
  quickIcon: { p: 0.75, borderRadius: 2, bgcolor: "background.paper", color: accent, display: "flex", "& svg": { width: 18, height: 18 } },
  quickHead: { display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "100%" },
  quickDesc: { display: "block", width: "100%" },
  quickTitle: { fontWeight: 700, lineHeight: 1.25, fontSize: "0.9375rem" },
  voiceBanner: {
    mt: 2, p: 2.5, borderRadius: "16px", display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { md: "center" }, justifyContent: "space-between", gap: 3,
    background: (theme: Theme) => `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    boxShadow: (theme: Theme) => `0 8px 24px ${alpha(theme.palette.primary.main, 0.35)}`,
  },
  voiceIcon: { width: 44, height: 44, borderRadius: 2.5, bgcolor: onBrand(0.2), color: "common.white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  voiceTitle: { fontWeight: 700, color: "common.white", lineHeight: 1.3 },
  voiceHint: { color: onBrand(0.8) },
  voiceExample: { fontStyle: "normal", fontWeight: 600 },
} as const;

const softShadow = (opacity: number) => (theme: Theme) => `0 8px 24px ${alpha(theme.palette.common.black, opacity)}`;
const trendChip = (tone: "success" | "error") => ({
  bgcolor: tint(tone, 0.1), color: `${tone}.main`, borderColor: tint(tone, 0.2),
});

// Dashboard KPI cards (components/dashboard-metrics.tsx).
export const metricsStyles = {
  sparkSvg: { width: "100%", height: 32, overflow: "visible" },
  grid: { display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", lg: "repeat(6, 1fr)" }, gap: { xs: 0.75, sm: 2 } },
  heroCell: { gridColumn: { xs: "span 2", lg: "span 2" } },
  cell: { gridColumn: "span 1" },
  card: {
    position: "relative", overflow: "hidden", height: "100%", bgcolor: "background.paper", borderRadius: "16px", border: "1px solid", borderColor: "divider",
    p: { xs: 1.25, lg: 2.5 }, display: "flex", flexDirection: "column", justifyContent: "space-between", transition: "box-shadow 0.3s, transform 0.3s",
    "&:hover": { "@media (hover: hover)": { boxShadow: softShadow(0.08), transform: "translateY(-4px)" } },
  },
  cardHero: { bgcolor: tint("primary", 0.03), borderColor: tint("primary", 0.2) },
  cardAlert: { borderColor: "error.main", outline: "2px solid", outlineColor: tint("error", 0.2) },
  glow: { position: "absolute", right: -16, top: -16, height: 112, width: 112, borderRadius: "50%", bgcolor: tint("primary", 0.05), filter: "blur(24px)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", mb: { xs: 0.5, lg: 2 }, gap: 0.5 },
  titleRow: { display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 },
  alertDot: { width: { xs: 6, sm: 8 }, height: { xs: 6, sm: 8 }, borderRadius: "50%", bgcolor: "error.main", flexShrink: 0, boxShadow: (theme: Theme) => `0 0 4px ${alpha(theme.palette.error.main, 0.5)}` },
  title: { fontSize: { xs: "0.625rem", lg: "0.6875rem" }, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  icon: { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: { xs: 1.5, lg: 2 }, width: { xs: 24, lg: 40 }, height: { xs: 24, lg: 40 } },
  iconDefault: { bgcolor: "action.hover", color: "text.primary" },
  iconHero: { width: 40, height: 40, bgcolor: "primary.main", color: "primary.contrastText", boxShadow: (theme: Theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}` },
  iconAlert: { bgcolor: tint("error", 0.1), color: "error.main" },
  body: { display: "flex", flexDirection: "column", gap: 0.5 },
  value: { fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  valueDefault: { fontSize: { xs: "1.0625rem", lg: "1.5rem" } },
  valueHero: { fontSize: { xs: "1.5rem", sm: "2.25rem" } },
  trendRow: { display: "flex", alignItems: "center", gap: 1, mt: { xs: 0.5, sm: 1 } },
  trendChip: { display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.6875rem", fontWeight: 700, px: 1, py: 0.25, borderRadius: 10, border: "1px solid" },
  trendUp: trendChip("success"),
  trendDown: trendChip("error"),
  spark: { mt: 1.5, opacity: 0.6, color: accent },
  footer: { mt: { xs: 0.75, lg: 2 }, pt: { xs: 0.75, lg: 2 }, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" },
  subLabel: { fontSize: { xs: "0.625rem", lg: "0.6875rem" }, color: "text.secondary" },
  change: { display: "flex", alignItems: "center", gap: { xs: 0.25, sm: 0.5 }, fontSize: { xs: "0.625rem", lg: "0.75rem" }, fontWeight: 700 },
} as const;

const tileTone = (color: (theme: Theme) => string) => ({
  root: { borderColor: (theme: Theme) => alpha(color(theme), 0.15) },
  stripe: { bgcolor: color },
  blob: { bgcolor: (theme: Theme) => alpha(color(theme), 0.06) },
  label: { color },
});

// "Today at a glance" banner (components/today-banner.tsx).
export const todayStyles = {
  root: { mb: 3 },
  heading: { display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 },
  date: { color: "text.secondary", display: "block", mb: 0.5 },
  title: { lineHeight: 1, fontSize: { xs: "1.5rem", sm: "1.875rem" } },
  badge: { display: "flex", alignItems: "center", gap: 0.75, px: 1.5, py: 0.75, borderRadius: 99, fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: "1px solid", transition: "all 0.2s ease" },
  badgeSyncing: { bgcolor: tint("info", 0.1), color: "info.main", borderColor: tint("info", 0.2) },
  badgePending: { bgcolor: tint("warning", 0.12), color: "warning.dark", borderColor: tint("warning", 0.3) },
  badgeLive: { bgcolor: tint("primary", 0.1), color: accent, borderColor: tint("primary", 0.2) },
  badgeDot: { width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 },
  tile: { position: "relative", bgcolor: "background.paper", border: "1px solid", borderRadius: "16px", p: 2, display: "flex", flexDirection: "column", gap: 0.5, overflow: "hidden", transition: "box-shadow 0.2s", "&:hover": { boxShadow: softShadow(0.06) } },
  stripe: { position: "absolute", top: 0, left: 0, width: 4, height: "100%" },
  blob: { position: "absolute", top: -16, right: -16, width: 56, height: 56, borderRadius: "50%" },
  label: { position: "relative", zIndex: 1 },
  number: { position: "relative", zIndex: 1, lineHeight: 1, color: "text.primary", fontSize: { xs: "1.5rem", sm: "1.875rem" } },
  money: { position: "relative", zIndex: 1, lineHeight: 1, color: "text.primary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  trend: { display: "flex", alignItems: "center", gap: 0.5, color: "success.main", fontWeight: 700 },
  sales: tileTone((theme) => theme.palette.primary.light),
  jobs: tileTone(accent),
  revenue: tileTone((theme) => theme.palette.success.main),
} as const;

// Recharts needs real colour strings (it cannot read palette tokens like "primary.main"),
// so every chart colour is derived from the active theme here. Nothing else defines chart colours.
const CHART_EXTRA = { violet: "#7C5CD6", teal: "#1B998B" } as const;
export function getChartKit(theme: Theme) {
  const { palette } = theme;
  const brand = palette.mode === "dark" ? palette.primary.light : palette.primary.main;
  const tooltipText = palette.text.primary;
  return {
    sales: brand,
    expenses: palette.error.main,
    grid: palette.divider,
    tick: palette.text.secondary,
    tickStrong: palette.text.primary,
    aging: { critical: palette.error.dark, warning: palette.warning.main, normal: palette.error.main },
    series: [brand, palette.success.main, palette.warning.main, palette.error.main, palette.info.main, CHART_EXTRA.violet, CHART_EXTRA.teal, palette.warning.dark],
    tooltip: {
      contentStyle: {
        backgroundColor: palette.background.paper, color: tooltipText, borderRadius: "14px", border: `1px solid ${palette.divider}`,
        boxShadow: `0 10px 30px -10px ${alpha(palette.common.black, 0.15)}`, fontSize: "12px", padding: "12px",
      },
      itemStyle: { fontWeight: 700, color: tooltipText },
      labelStyle: { fontWeight: 700, marginBottom: "6px", color: tooltipText },
    },
  } as const;
}

// Dashboard chart cards (components/dashboard-charts.tsx).
export const chartStyles = {
  card: { overflow: "hidden", transition: "box-shadow 300ms", minWidth: 0 },
  header: { px: 2.5, pt: 2.5, pb: 1 },
  headerLoose: { px: 2.5, pt: 2.5, pb: 1.5 },
  content: { px: 1, pb: 2 },
  contentPadded: { px: 2.5, pb: 2.5 },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 },
  subtitle: { display: "block", color: "text.secondary" },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  emptyWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", py: 6, textAlign: "center" },
  emptyIcon: { width: 64, height: 64, mb: 2, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "grey.100", color: "text.secondary", border: "1px solid", borderColor: "divider" },
  emptyText: { maxWidth: 180, lineHeight: 1.5 },
  legendRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider", flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 1 },
  legendLine: { width: 16, height: 4, borderRadius: 100, display: "inline-block" },
  legendSales: { bgcolor: accent },
  legendExpenses: { bgcolor: "error.main" },
  legendAvg: { width: 16, borderTop: "2px dashed", borderColor: accent, opacity: 0.6, display: "inline-block" },
  donutCenter: { position: "absolute", left: 0, right: 0, top: "35%", pointerEvents: "none", textAlign: "center" },
  donutValue: { lineHeight: 1.2 },
  agingLegend: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 1.5, px: 1 },
  agingItem: { display: "flex", alignItems: "center", gap: 0.75 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  statusBar: { width: "100%", height: 12, borderRadius: 100, overflow: "hidden", display: "flex", mb: 2.5 },
  statusSegment: { height: "100%", transition: "width 500ms ease-out" },
  statusGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 },
  statusCell: { textAlign: "center" },
  statusHead: { display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, mb: 0.5 },
  statusCount: { lineHeight: 1 },
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  clientRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.5 },
  clientName: { display: "flex", alignItems: "center", gap: 1, minWidth: 0 },
  medal: { flexShrink: 0, fontSize: "0.875rem" },
  clientTrack: { height: 6, borderRadius: 100, bgcolor: "grey.200", overflow: "hidden" },
  clientFill: { height: "100%", borderRadius: 100, bgcolor: accent, opacity: 0.7, transition: "width 500ms ease-out" },
} as const;

// Material Profitability card. Margin bands map to a theme tone; "none" means no cost data.
export const profitabilityStyles = {
  card: { minWidth: 0 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2.5 },
  title: { display: "flex", alignItems: "center", gap: 1, color: accent },
  list: { display: "flex", flexDirection: "column", gap: 2 },
  item: { display: "flex", flexDirection: "column", gap: 1 },
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  nameRow: { display: "flex", alignItems: "center", gap: 1, minWidth: 0 },
  figures: { display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 },
  name: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  noShrink: { flexShrink: 0 },
  margin: { minWidth: 46, textAlign: "right" },
  icon: { display: "flex" },
  track: { height: 8, borderRadius: 100, bgcolor: "action.hover", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 100, transition: "width 500ms ease-out" },
  detailRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" },
  hint: { fontStyle: "italic" },
  legend: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider" },
  legendItem: { display: "flex", alignItems: "center", gap: 0.75 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  empty: { textAlign: "center", py: 4, color: "text.secondary" },
  emptyIcon: { mb: 1 },
  tone: {
    good: { text: "success.dark", bar: "success.main" },
    ok: { text: "warning.dark", bar: "warning.main" },
    bad: { text: "error.dark", bar: "error.main" },
    none: { text: "text.disabled", bar: "action.disabled" },
  },
} as const;

const violet = "#7C5CD6"; // same extra hue as the chart palette: a sixth distinguishable payment type
const paymentChip = (bg: (theme: Theme) => string, color: string | ((theme: Theme) => string)) => ({ bgcolor: bg, color });

// Colour per payment type; keys are looked up by the Recent Payments feed.
export const paymentTypeStyles = {
  initial: paymentChip(tint("info", 0.12), "info.main"),
  addl1: paymentChip(tint("warning", 0.18), "warning.dark"),
  addl2: paymentChip(() => alpha(violet, 0.12), violet),
  settlement: paymentChip(tint("success", 0.12), "success.main"),
  rounding: paymentChip(() => "transparent", "text.secondary"),
  lumpSum: paymentChip(tint("primary", 0.1), accent),
} as const;

// Recent Payments Pulse card (components/recent-payments-pulse.tsx).
export const pulseStyles = {
  card: { overflow: "hidden", height: 420, display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", gap: 1, px: 2.5, pt: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" },
  headerIcon: { p: 0.75, borderRadius: 2, display: "flex", bgcolor: tint("primary", 0.1), color: accent },
  content: { p: 0, flexGrow: 1, overflowY: "auto", "&:last-child": { pb: 0 } },
  empty: { alignItems: "center", justifyContent: "center", height: 200, textAlign: "center", px: 2 },
  emptyIcon: { width: 48, height: 48, borderRadius: "50%", bgcolor: "action.hover", color: "text.disabled", display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5 },
  block: { display: "block" },
  row: { p: 2, transition: "background 0.2s", "&:not(:last-child)": { borderBottom: "1px solid", borderColor: "divider" }, "&:hover": { bgcolor: "action.hover" } },
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5 },
  who: { display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "common.white", fontSize: "0.75rem", fontWeight: 700, lineHeight: 1 },
  minZero: { minWidth: 0 },
  typeChip: { display: "inline-block", mt: 0.25, px: 0.75, py: 0.25, borderRadius: 1, fontSize: "0.6875rem", fontWeight: 700 },
  mono: { fontFamily: "monospace" },
  amount: { fontWeight: 700, color: "success.main", flexShrink: 0, fontFamily: "monospace" },
  indent: { pl: 6 },
  batchToggle: { display: "flex", alignItems: "center", gap: 0.5, p: 0, color: "text.secondary", borderRadius: 1, "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } },
  subList: { display: "flex", flexDirection: "column", gap: 0.5, mt: 0.75 },
  subRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, bgcolor: "action.hover", borderRadius: 1.5, px: 1, py: 0.5 },
  subChip: { flexShrink: 0, px: 0.5, borderRadius: 0.75, fontSize: "0.6875rem", fontWeight: 700 },
  subText: { color: "text.secondary", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  debtRow: { display: "flex", alignItems: "center", gap: 0.5, mt: 1 },
  iconMuted: { display: "flex", color: "text.disabled" },
  notes: { display: "block", mt: 0.75, color: "text.secondary", fontStyle: "italic" },
  meta: { display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", mt: 1 },
} as const;

// Debtor payment sheet body + footer (components/debtor-payment-modal.tsx).
export const debtorModalStyles = {
  body: { p: 3 },
  clientIcon: { width: 40, height: 40, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  clientText: { minWidth: 0, flex: 1 },
  wrapName: { overflowWrap: "anywhere" },
  debtBlock: { ml: "auto", textAlign: "right", minWidth: 0 },
  cleared: { display: "flex", alignItems: "center", justifyContent: "center", gap: 1, p: 3, borderRadius: 3, border: "1px solid", bgcolor: tint("success", 0.08), borderColor: tint("success", 0.3), color: "success.dark" },
  label: { display: "block", color: "text.secondary", mb: 0.75 },
  amountInput: { "& input": { fontWeight: 700, fontSize: "1.125rem" } },
  previewHead: { display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 },
  previewList: { maxHeight: 200, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 3 },
  previewRow: { display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } },
  previewLead: { display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 },
  badge: { width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, bgcolor: tint("primary", 0.1), color: accent, fontSize: "0.6875rem", fontWeight: 700 },
  previewAmount: { textAlign: "right", ml: 1, flexShrink: 0 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  note: { display: "flex", alignItems: "center", gap: 0.5, mt: 1, color: "success.main" },
  footer: { p: 3, bgcolor: "grey.50", display: "flex", gap: 1.5, borderTop: "1px solid", borderColor: "divider", "& .MuiButton-root": { flex: 1 } },
} as const;

// WhatsApp's own green for the share button. It is a third-party brand colour, so it is named here
// once instead of being typed into a component.
const WHATSAPP = { main: "#22c55e", dark: "#16a34a" } as const;
const softTone = (tone: Tone) => ({
  bgcolor: tint(tone, 0.12),
  // Dark surfaces need the lighter shade of each tone to keep the icon/text readable.
  color: (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette[tone].light : tone === "warning" ? theme.palette.warning.dark : theme.palette[tone].main),
});

// Shift report modal (components/shift-report-modal.tsx).
export const shiftReportStyles = {
  root: { position: "fixed", inset: 0, zIndex: "modal", display: "flex", alignItems: { xs: "flex-end", md: "center" }, justifyContent: "center" },
  backdrop: { position: "absolute", inset: 0, backdropFilter: "blur(4px)", bgcolor: (theme: Theme) => alpha(theme.palette.common.black, 0.6) },
  sheet: {
    position: "relative", width: "100%", maxWidth: { md: "42rem" }, bgcolor: "background.paper", borderRadius: { xs: "2.5rem 2.5rem 0 0", md: 4 },
    border: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", maxHeight: { xs: "92dvh", md: "85dvh" }, overflow: "hidden",
    boxShadow: (theme: Theme) => `0 25px 50px ${alpha(theme.palette.common.black, 0.25)}`,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", p: 2.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 },
  headerLead: { display: "flex", alignItems: "center", gap: 1.5 },
  headerIcon: { width: 36, height: 36, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center" },
  closeButton: { color: "text.secondary", "&:hover": { color: "text.primary" } },
  controls: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, p: 2, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 },
  dateRow: { display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 180 },
  muted: { display: "flex", color: "text.disabled" },
  datePicker: { flex: 1, "& .MuiInputBase-root": { height: 36, borderRadius: 2, bgcolor: "action.hover", fontSize: "0.8125rem", fontWeight: 600 } },
  selectWrap: { position: "relative" },
  select: { height: 36, pl: 1.5, pr: 4, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "action.hover", color: "text.primary", fontSize: "0.8125rem", fontWeight: 600, appearance: "none", fontFamily: "inherit", cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } },
  selectChevron: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", color: "text.disabled" },
  body: { overflowY: "auto", flex: 1, p: 2.5 },
  loading: { display: "flex", alignItems: "center", justifyContent: "center", height: 128, color: "primary.light" },
  statGrid: { display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" }, gap: 1.5 },
  statCard: { p: 1.5, borderRadius: 3 },
  statCardHighlight: { bgcolor: tint("primary", 0.06), borderColor: tint("primary", 0.25) },
  statIcon: { width: 24, height: 24, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", mb: 1 },
  statLabel: { display: "block", color: "text.secondary" },
  tone: {
    primary: softTone("primary"), success: softTone("success"), info: softTone("info"), warning: softTone("warning"), error: softTone("error"),
    neutral: { bgcolor: "action.hover", color: "text.disabled" },
  },
  section: { display: "flex", alignItems: "center", gap: 1, mb: 1.5 },
  sectionIcon: { width: 24, height: 24, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: tint("primary", 0.1), color: accent },
  countChip: { ml: "auto", bgcolor: tint("primary", 0.1), color: accent, fontWeight: 700 },
  list: { display: "flex", flexDirection: "column", gap: 0.75 },
  materialRow: { display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, bgcolor: "action.hover", borderRadius: 2 },
  materialName: { display: "flex", alignItems: "center", gap: 1 },
  dot: { width: 8, height: 8, borderRadius: "50%", bgcolor: accent },
  jobRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", p: 1.5, gap: 1.5, borderRadius: 2 },
  jobLead: { display: "flex", alignItems: "flex-start", gap: 1.5, minWidth: 0 },
  jobNumber: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25, bgcolor: tint("primary", 0.1), color: accent, fontSize: "0.75rem", fontWeight: 700 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  right: { textAlign: "right", flexShrink: 0 },
  expenseRow: { display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, borderRadius: 2 },
  empty: { alignItems: "center", justifyContent: "center", py: 8, color: "text.disabled", gap: 1 },
  pill: { display: "inline-block", px: 0.75, py: 0.25, borderRadius: 1, fontSize: "0.6875rem", fontWeight: 700 },
  pillPaid: softTone("success"),
  pillPart: softTone("warning"),
  pillUnpaid: softTone("error"),
  pillNeutral: { bgcolor: "action.hover", color: "text.secondary" },
  footer: { display: "flex", gap: 1.5, p: 2, pb: "max(16px, env(safe-area-inset-bottom))", borderTop: "1px solid", borderColor: "divider", flexShrink: 0, bgcolor: "background.paper" },
  share: { flex: 1, bgcolor: WHATSAPP.main, color: "common.white", "&:hover": { bgcolor: WHATSAPP.dark } },
} as const;

export const headerHomeLinkStyles = {
  display: "flex", flexDirection: "column", justifyContent: "center",
  minHeight: 44, textDecoration: "none", borderRadius: 1,
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 },
} as const;

// Shared sheet geometry stays here so every consumer uses the same mobile layout.
export const responsiveSheetStyles = {
  dialog: {
    "@media (max-width: 768px)": {
      top: "var(--sheet-viewport-top, 0px)", bottom: "auto",
      height: "var(--sheet-viewport-height, 100dvh)",
      "& .MuiDialog-container": { alignItems: "flex-end" },
    },
  },
  paper: {
    borderRadius: 4, overflow: "hidden", display: "flex", flexDirection: "column",
    minHeight: 0, maxHeight: "calc(100dvh - 64px)",
    "@media (max-width: 768px)": {
      m: 0, width: "100%", maxWidth: "100%", minHeight: 0,
      height: "var(--sheet-height, 82%)", maxHeight: "96%",
      borderRadius: "24px 24px 0 0",
    },
  },
  handle: {
    display: "none", flexShrink: 0, width: "100%", minHeight: 44,
    touchAction: "none", cursor: "ns-resize",
    "@media (max-width: 768px)": { display: "flex" },
    "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -4 },
  },
  handleBar: { width: 48, height: 5, borderRadius: 3, bgcolor: "text.secondary" },
  header: { display: "flex", alignItems: "flex-start", gap: 1, px: 2, py: 1.5, flexShrink: 0, borderBottom: "1px solid", borderColor: "divider" },
  heading: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  title: { p: 0, fontSize: "1.125rem", fontWeight: 700 },
  content: { flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain" },
  footer: {
    flexShrink: 0, maxHeight: "40%", overflowY: "auto", bgcolor: "background.paper",
    pb: "env(safe-area-inset-bottom, 0px)",
    "& > *": { width: "100%" },
    "@media (max-width: 768px)": {
      "& > *": { p: 1.5, gap: 1 },
      "& .MuiButton-root": { px: 1.5, fontSize: "0.8125rem", whiteSpace: "nowrap" },
    },
  },
  customerSummary: {
    display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) auto", alignItems: "center",
    gap: 1.5, p: 2, bgcolor: "grey.50", borderRadius: 3, border: "1px solid", borderColor: "grey.100",
    "@media (max-width: 480px)": {
      gridTemplateColumns: "40px minmax(0, 1fr)",
      "& > :last-child": { gridColumn: "2", textAlign: "left", ml: 0 },
      "& > :nth-child(2) > :last-child": { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
    },
  },
} as const;

export function getAppTheme(mode: "light" | "dark", role: "admin" | "cashier") {
  const primaryColor = role === "admin" ? "#2e388d" : "#f76808";
  const primaryDark  = role === "admin" ? "#1e2460" : "#cc5506";
  // In dark mode "light" is the accent used for text, lines and dots, so the admin shade must be bright enough to read on the dark surface.
  const primaryLight = role === "admin" ? (mode === "dark" ? "#8c97ee" : "#4a56b0") : "#fa8b3e";
  const primary50    = role === "admin" ? "#eef0fb" : "#fef0e6"; // Light primary tint background

  const buttonVariants: NonNullable<Components<Theme>["MuiButton"]>["variants"] = [
          ...(mode === "dark" ? [
            { props: { variant: "outlined", color: "primary" } as const, style: { color: primaryLight, borderColor: alpha(primaryLight, 0.5) } },
            { props: { variant: "text", color: "primary" } as const, style: { color: primaryLight } },
          ] : []),
          // Neutral outlined buttons: a soft border instead of MUI's near-white one on dark surfaces.
          { props: { variant: "outlined", color: "inherit" } as const, style: { borderColor: mode === "dark" ? alpha("#f8fafc", 0.2) : alpha("#0F172A", 0.2) } },
        ];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primaryColor,
        dark: primaryDark,
        light: primaryLight,
        contrastText: "#ffffff",
        "50": primary50,
      },
      secondary: {
        main: mode === "light" ? "#1F2933" : "#f1f5f9",
      },
      warning: {
        main: "#E8A13A",
        light: "#f0bd6e",
        dark: "#b57d2d",
        contrastText: "#1a1410",
      },
      success: { main: "#2E7D5B", light: "#4caf85", dark: "#1f5a40" },
      error:   { main: "#C0392B", light: "#d9534f", dark: "#8b2a1f" },
      info:    { main: "#0369a1" },
      background: {
        default: mode === "light" ? "#F8F9FA" : "#020817",
        paper:   mode === "light" ? "#FFFFFF"  : "#0f172a",
      },
      text: {
        primary:   mode === "light" ? "#0F172A" : "#F8FAFC",
        secondary: mode === "light" ? "#64748B" : "#94A3B8",
        disabled:  mode === "light" ? "#94A3B8" : "#64748B", // dark: readable as a placeholder dash or zero, still clearly dimmer than secondary
      },
      divider: mode === "light" ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.1)",
      ...(mode === "dark" && {
        grey: {
          50:  "#0f172a",
          100: "#1e293b",
          200: "#334155",
          300: "#475569",
          400: "#64748b",
          500: "#94a3b8",
          600: "#cbd5e1",
          700: "#e2e8f0",
          800: "#f1f5f9",
          900: "#f8fafc",
        },
      }),
    },
    typography: {
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      h1: { fontWeight: 700, fontSize: "2.25rem", letterSpacing: "-0.02em" },
      h2: { fontWeight: 700, fontSize: "1.75rem", letterSpacing: "-0.01em" },
      h3: { fontWeight: 600, fontSize: "1.375rem" },
      h4: { fontWeight: 600, fontSize: "1.125rem" },
      h5: { fontWeight: 600, fontSize: "1rem" },
      h6: { fontWeight: 600, fontSize: "0.875rem" },
      subtitle1: { fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.01em" },
      subtitle2: { fontWeight: 500, fontSize: "0.875rem", color: mode === "light" ? "#64748B" : "#94A3B8" },
      body1:  { fontSize: "0.95rem" },
      body2:  { fontSize: "0.875rem" },
      caption: { fontSize: "0.75rem", letterSpacing: "0.02em" },
      overline: { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" },
      button: { fontWeight: 600, textTransform: "none" },
    },
    shape: { borderRadius: 10 },
    components: {
      // A bare <button> otherwise draws black text from the browser, unreadable on the dark surface.
      MuiCssBaseline: { styleOverrides: { button: { color: "inherit" } } },
      // The admin indigo is too dark to read as "ticked" on the dark surface, so use the brighter accent there.
      MuiCheckbox: { styleOverrides: { root: { "&.Mui-checked": { color: mode === "dark" ? primaryLight : primaryColor } } } },
      MuiRadio:    { styleOverrides: { root: { "&.Mui-checked": { color: mode === "dark" ? primaryLight : primaryColor } } } },
      MuiBottomNavigationAction: { styleOverrides: { root: { "&.Mui-selected": { color: mode === "dark" ? primaryLight : primaryColor } } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        // Outlined and text buttons draw the brand colour as text and border; the admin indigo is too dark for that on the dark surface.
        // Variants apply before a component's own sx, so any button that sets its own colour or fill still wins.
        variants: buttonVariants,
        styleOverrides: {
          root: {
            borderRadius: "12px",
            padding: "10px 22px",
            fontSize: "0.95rem",
            transition: "transform .2s ease, box-shadow .2s ease",
            "&:active": {
              transform: "scale(0.97) translateY(1px)",
            },
            "&.MuiButton-sizeSmall":  { borderRadius: "12px", padding: "5px 14px" },
            "&.MuiButton-sizeMedium": { borderRadius: "12px" },
            "&.MuiButton-sizeLarge":  { borderRadius: "12px" },
            "&.MuiButton-containedPrimary": {
              boxShadow: mode === "light"
                ? `0 4px 14px ${primaryColor}40`
                : `0 4px 14px ${primaryColor}80`,
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: mode === "light"
                  ? `0 10px 24px ${primaryColor}52`
                  : `0 10px 24px ${primaryColor}99`,
              },
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: "16px",
            border: "1px solid",
            minWidth: 0,
            borderColor: mode === "light" ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)",
            boxShadow: mode === "light"
              ? "0 2px 4px rgba(15,23,42,.02), 0 8px 24px rgba(15,23,42,.02)"
              : "0 1px 2px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,0.02)",
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            // Remove MUI's extra bottom padding on last-child
            "&:last-child": { paddingBottom: 16 },
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined", size: "small" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: "10px",
          },
        },
      },
      // Date pickers draw their own input, which ignores the compact size every TextField uses. Match it, so a date sits level with the fields beside it.
      MuiPickersOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: "10px" },
          sectionsContainer: { paddingTop: "8.5px", paddingBottom: "8.5px" },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "0.75rem",
          },
          sizeSmall: {
            height: 22,
            fontSize: "0.6875rem",
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: "10px",
            transition: "transform 0.15s ease",
            "&:active": {
              transform: "scale(0.98)",
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            // Minimum 44×44 touch target per Material Design guidelines
            minWidth: 44,
            minHeight: 44,
            transition: "transform 0.15s ease",
            "&:active": {
              transform: "scale(0.95)",
            },
          },
          sizeSmall: {
            minWidth: 36,
            minHeight: 36,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          enterDelay: 400,
          enterNextDelay: 200,
          arrow: true,
        },
      },
      // Dialogs and sheets keep the paper colour in dark mode instead of MUI's grey elevation overlay.
      MuiDialog: { styleOverrides: { paper: { backgroundImage: "none" } } },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: SIDE_PANEL,
            backgroundImage: "none", // no dark-mode elevation overlay: the panel is the same navy in both modes
            color: "#ffffff",
            border: "none",
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: mode === "light" ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.1)",
          },
        },
      },
    },
  });
}

// Audit log (Settings > Audit log). Read-only list; tones come from palette tokens only.
const auditTag = (tone: "primary" | "success" | "info" | "warning" | "secondary") => ({
  bgcolor: (theme: Theme) => alpha(theme.palette[tone].main, 0.12),
  color: (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette[tone].light : theme.palette[tone].dark),
});
// Settings > System status. Status colours come from the palette so dark mode and both role themes stay consistent.
export const systemStatusStyles = {
  banner: { display: "flex", alignItems: "center", gap: 1.5, p: 2, borderRadius: 4, border: 1 },
  bannerOk: { bgcolor: tint("success", 0.12), borderColor: tint("success", 0.4) },
  bannerWarn: { bgcolor: tint("warning", 0.14), borderColor: tint("warning", 0.5) },
  bannerIconOk: { display: "flex", color: "success.main" },
  bannerIconWarn: { display: "flex", color: "warning.main" },
  card: { p: 2, borderRadius: 4, display: "flex", flexDirection: "column", gap: 1.5 },
  cardWarn: { borderColor: tint("warning", 0.6) },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  label: { fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary" },
  line: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 },
  lineTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 },
  lineLeft: { display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 },
  right: { textAlign: "right", flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  dotOk: { bgcolor: "success.main" },
  dotWarn: { bgcolor: "warning.main" },
  dotBad: { bgcolor: "error.main" },
  chip: { fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.5, borderRadius: 100, whiteSpace: "nowrap" },
  chipInfo: { bgcolor: tint("primary", 0.14), color: (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette.primary.light : theme.palette.primary.main) },
  chipWarn: { bgcolor: tint("warning", 0.16), color: (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette.warning.light : theme.palette.warning.dark) },
  testNote: { color: (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette.warning.light : theme.palette.warning.dark) },
  counts: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  count: { p: 1.5, borderRadius: 3, bgcolor: "action.hover", display: "flex", flexDirection: "column", gap: 0.25 },
  queueRow: { display: "flex", justifyContent: "space-between", gap: 1.5, p: 1.5, borderRadius: 3, bgcolor: "action.hover" },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 },
  stack: { display: "flex", flexDirection: "column", gap: 2 },
  alert: { mb: 2 },
  note: { px: 0.5 },
  strong: { fontWeight: 600 },
  big: { fontWeight: 700 },
} as const;

// Settings > Materials. Cards, chips and lines come from systemStatusStyles; these are the extras.
export const materialsStyles = {
  sizeMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 },
  sizeRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" },
  sizeOff: { opacity: 0.7 },
  sizeActions: { display: "flex", alignItems: "center", gap: 1 },
  chipOn: { bgcolor: tint("success", 0.14), color: (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette.success.light : theme.palette.success.dark) },
  chipOff: { bgcolor: "action.selected", color: "text.secondary" },
  pricePanel: { p: 1.5, borderRadius: 3, bgcolor: "action.hover", display: "flex", flexDirection: "column", gap: 0.25 },
  sectionLabel: { fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary", display: "block" },
  cardOff: { borderStyle: "dashed" },
  sizeList: { display: "flex", flexDirection: "column", gap: 1 },
  sheetNote: { p: 1.5, borderRadius: 3, bgcolor: "action.hover", display: "flex", flexDirection: "column", gap: 0.75 },
} as const;

// Radio choices drawn as bordered cards (roll unit and length). Used wherever one option must be picked from a few.
export const choiceStyles = {
  wrap: { display: "flex", flexDirection: "column", gap: 2 },
  fieldset: { border: 0, m: 0, p: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 },
  legend: { p: 0, mb: 0.5, fontSize: "0.8125rem", color: "text.secondary" },
  group: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 1 },
  choice: { flex: "1 1 0", minWidth: 96, m: 0, px: 1.5, minHeight: 48, border: 1, borderColor: "divider", borderRadius: 3, "&:hover": { bgcolor: "action.hover" } },
  choiceOn: { borderWidth: 2, borderColor: "primary.main", bgcolor: tint("primary", 0.08) },
  label: { fontWeight: 600 },
  hint: { color: "text.secondary" },
} as const;

// The restock, waste and count forms (Stock entry and the Inventory popups).
export const stockFormStyles = {
  form: { display: "flex", flexDirection: "column", gap: 2.5 },
  row: { display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 2 },
  grow: { flex: 1, minWidth: 0 },
  actions: { display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" },
  appSays: { p: 1.5, flex: 1, bgcolor: "action.hover" },
  appSaysValue: { fontWeight: 800, fontSize: 20 },
  strong: { fontWeight: 700 },
  panel: { p: { xs: 2, md: 3 } },
} as const;

// A small labelled number (stock health, money totals). Colours come from the palette so dark mode and both role themes agree.
export const statTileStyles = {
  tile: { p: 1.75, borderRadius: "14px", border: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 },
  success: { bgcolor: tint("success", 0.12), borderColor: tint("success", 0.4) },
  warning: { bgcolor: tint("warning", 0.14), borderColor: tint("warning", 0.5) },
  primary: { borderColor: "primary.main", bgcolor: tint("primary", 0.08) },
  error: { bgcolor: tint("error", 0.12), borderColor: tint("error", 0.4) },
  label: { fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary" },
  value: { fontWeight: 700 },
  wide: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 2 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  grid4: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.25 },
} as const;

// Settings-style owner Inventory page.
export const inventoryStyles = {
  page: { display: "flex", flexDirection: "column", gap: 2 },
  head: { display: "flex", flexDirection: "column", gap: 1 },
  actions: { display: "flex", gap: 1.25, flexWrap: "wrap" },
  grow: { flex: 1, minWidth: 140 },
  cards: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 1.5, alignItems: "start" },
  cardOff: { borderStyle: "dashed", opacity: 0.85 },
  cardOut: { opacity: 0.85 },
  stockNote: { color: "text.secondary" },
  cardOpen: { borderColor: "primary.main" },
  titleLine: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5 },
  chips: { display: "flex", gap: 0.75, flexWrap: "wrap", justifyContent: "flex-end" },
  code: { color: "text.secondary" },
  name: { fontWeight: 700 },
  width: { fontWeight: 500, color: "text.secondary" },
  twoUp: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 },
  priceLine: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" },
  roll: { p: 1.5, borderRadius: 3, border: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 1 },
  rollOut: { opacity: 0.75 },
  rollHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 },
  progressRow: { display: "flex", alignItems: "center", gap: 1.5 },
  progress: { flex: 1, height: 8, borderRadius: 100 },
  nowrap: { whiteSpace: "nowrap" },
  rollActions: { display: "flex", gap: 1, flexWrap: "wrap" },
  rollButton: { flex: 1, minWidth: 100 },
  label: { fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary" },
  strong: { fontWeight: 600 },
  sheetBody: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 },
} as const;

// The "back to the previous screen" link at the top of a page. alignSelf keeps it at the left edge even inside a flex column,
// where an unstyled button would stretch across the page and centre its text.
export const backLinkStyles = {
  link: { alignSelf: "flex-start", justifyContent: "flex-start", minHeight: 44, px: 0, minWidth: 44, "& .MuiButton-startIcon": { ml: 0 } },
} as const;

export const auditLogStyles = {
  filters: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(2, 200px)" }, gap: 1.5, mb: 1.5 },
  chips: { display: "flex", gap: 1, flexWrap: { xs: "nowrap", sm: "wrap" }, overflowX: { xs: "auto", sm: "visible" }, mx: { xs: -2, sm: 0 }, px: { xs: 2, sm: 0 }, pb: 0.5, mb: 2 },
  chip: { flexShrink: 0, minHeight: 44, px: 2, borderRadius: 100, whiteSpace: "nowrap" },
  dayHeading: { display: "block", fontWeight: 700, color: "text.secondary", mt: 2, mb: 1, ml: 0.25 },
  card: { borderRadius: 3, overflow: "hidden" },
  row: { px: { xs: 2, sm: 2.5 }, py: 1.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } },
  rowOpen: { bgcolor: "action.hover" },
  rowTop: { display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 }, flexWrap: { xs: "wrap", sm: "nowrap" } },
  time: { width: { xs: "auto", sm: 72 }, flexShrink: 0, color: "text.secondary", fontVariantNumeric: "tabular-nums" },
  text: { flex: { xs: "1 1 100%", sm: 1 }, minWidth: 0, overflowWrap: "anywhere", order: { xs: 3, sm: 0 } },
  tag: { flexShrink: 0, fontSize: "0.6875rem", fontWeight: 700, lineHeight: 1.5, px: 1.25, py: 0.25, borderRadius: 100, ml: { xs: "auto", sm: 0 } },
  tagSignins: { bgcolor: "action.hover", color: "text.secondary" },
  tagStaff: auditTag("primary"),
  tagSales: auditTag("success"),
  tagExpenses: auditTag("warning"),
  tagStock: auditTag("info"),
  tagSettings: auditTag("secondary"),
  tagApprovals: auditTag("warning"),
  tagOther: { bgcolor: "action.hover", color: "text.secondary" },
  toggle: { minWidth: 44, minHeight: 44, color: "text.secondary" },
  togglePlaceholder: { width: 44, flexShrink: 0, display: { xs: "none", sm: "block" } },
  details: { mt: 1, ml: { xs: 0, sm: 11 }, p: 1.5, borderRadius: 2, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" },
  detailLabel: { color: "text.disabled", mr: 1 },
  more: { display: "flex", justifyContent: "center", mt: 2.5 },
  empty: { p: 4, textAlign: "center", borderRadius: 3 },
} as const;

export const expenseCategoryStyles = {
  head: { display: "flex", alignItems: { xs: "stretch", sm: "flex-end" }, flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", gap: 2 },
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  row: { px: { xs: 2, sm: 2.5 }, py: 2, display: "flex", flexDirection: "column", gap: 1.5 },
  rowTop: { display: "flex", alignItems: "center", gap: 2 },
  rowOff: { bgcolor: "action.hover", borderStyle: "dashed" },
  accessGroup: { width: "100%", "& .MuiToggleButton-root": { flex: 1, minHeight: 44, textTransform: "none", fontWeight: 600 } },
  chosenLine: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" },
  staffList: { display: "flex", flexDirection: "column", gap: 0.5 },
  staffItem: { m: 0, minHeight: 44, px: 1, borderRadius: 2, border: 1, borderColor: "divider", width: "100%" },
  grow: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  pill: { flexShrink: 0, display: { xs: "none", sm: "inline-block" }, fontSize: "0.75rem", fontWeight: 700, lineHeight: 1.5, px: 1.25, py: 0.25, borderRadius: 100 },
  kindOption: { display: "flex", alignItems: "flex-start", gap: 1, m: 0, px: 1.5, py: 1, borderRadius: 3, border: 1, borderColor: "divider", width: "100%" },
  kindOptionOn: { borderColor: "primary.main", borderWidth: 2, bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.06) },
  footer: { p: 2, display: "flex", gap: 1, justifyContent: "flex-end" },
  form: { p: { xs: 2, sm: 3 } },
} as const;


// Status pills and tinted actions are built from a palette tone, so the same red, green, amber and blue are used everywhere
// and both modes stay readable (soft tinted fill, the dark shade of the tone on light, the light shade on dark).
type StatusTone = "success" | "error" | "warning" | "info";
// Amber is the one tone whose "dark" shade is still too pale for small text on its own tint in light mode, so it is darkened further.
const toneText = (tone: StatusTone) => (theme: Theme) => {
  if (theme.palette.mode === "dark") return theme.palette[tone].light;
  return tone === "warning" ? darken(theme.palette.warning.dark, 0.4) : theme.palette[tone].dark;
};
export const tonePill = (tone: StatusTone) => ({ bgcolor: tint(tone, 0.14), color: toneText(tone) }) as const;
export const toneNeutralPill = { bgcolor: "action.hover", color: "text.secondary" } as const;
const toneAction = (tone: StatusTone) => ({
  ...tonePill(tone), border: "1px solid", borderColor: tint(tone, 0.3), boxShadow: "none",
  "&:hover": { bgcolor: tint(tone, 0.24), boxShadow: "none" },
}) as const;

// Status badge (components/status-badge.tsx): the Paid/Unpaid pill on expenses and the status pill on sales and records.
export const statusBadgeStyles = {
  expense: { fontWeight: 800, fontSize: "0.6875rem", height: 22, "& .MuiChip-icon": { color: "inherit" } },
  sale: { fontWeight: 700, fontSize: "0.625rem", height: 20, borderRadius: 99 },
  pulse: { animation: "pulse 2s infinite" },
  tone: { success: tonePill("success"), error: tonePill("error"), warning: tonePill("warning"), info: tonePill("info") },
} as const;

// Expenses (owner list and sheets, cashier entry page). Icons take their colour from a wrapper, because they cannot read palette tokens.
const expenseClip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const expenseIconButton = { bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 } as const;
const expenseHeaderStart = { display: "flex", alignItems: "center", gap: 1.5 } as const;
const expenseAmountBox = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, p: 2, borderRadius: "16px", border: "1px solid" } as const;
export const expenseStyles = {
  // Cashier entry page.
  page: { p: { xs: 3, md: 4 }, pb: { xs: 3, md: 4 }, minHeight: "100vh" },
  header: { mb: 2.5 },
  headerStart: expenseHeaderStart,
  headerSolo: { ...expenseHeaderStart, mb: 0.5 },
  backButton: { display: { md: "none" }, ...expenseIconButton },
  titleBox: { display: "flex", alignItems: "center", gap: 1 },
  headerIcon: { display: "flex", color: accent },
  title: { fontWeight: 800 },
  subtitle: { color: "text.secondary" },
  // Owner list.
  screen: { p: { xs: 2, md: 4 }, pb: { xs: 3, md: 12 }, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  heading: { display: "flex", flexDirection: "column", gap: 0.75 },
  summary: { display: "flex", flexDirection: "column", gap: 1 },
  pair: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(auto-fit, minmax(200px, 1fr))" }, gap: 1 },
  chips: { display: "flex", gap: 1, flexWrap: "wrap" },
  chip: { borderRadius: 100, minHeight: 40, px: 2, fontWeight: 700 },
  day: { display: "flex", flexDirection: "column", gap: 1 },
  dayHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", px: 0.5 },
  dayLabel: { fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary" },
  dayTotal: { color: "text.secondary" },
  group: { borderRadius: "16px", overflow: "hidden" },
  row: { display: "flex", flexDirection: "column", gap: 1.5, p: 1.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } },
  rowButton: {
    display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 1.5, width: "100%", textAlign: "left", borderRadius: "12px",
    "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
  },
  iconTile: { width: 40, height: 40, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, bgcolor: tint("primary", 0.14), color: accent },
  iconTileOwed: { bgcolor: tint("error", 0.14), color: toneText("error") },
  rowMain: { flex: 1, minWidth: 0 },
  category: { display: "block", fontWeight: 700, ...expenseClip },
  meta: { color: "text.secondary", display: "block", ...expenseClip },
  rowEnd: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0 },
  amount: { fontWeight: 700 },
  payButton: { minHeight: 44 },
  emptyBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25, py: 3.5, px: 2, borderRadius: "16px", border: "1px dashed", borderColor: "divider", textAlign: "center" },
  emptyIcon: { width: 48, height: 48, borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: tint("primary", 0.14), color: accent },
  emptyTitle: { fontWeight: 700 },
  emptyText: { color: "text.secondary" },
  // Sheets.
  sheetBody: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 },
  amountOwed: { ...expenseAmountBox, bgcolor: tint("error", 0.12), borderColor: tint("error", 0.35) },
  amountPaid: { ...expenseAmountBox, bgcolor: tint("success", 0.1), borderColor: tint("success", 0.3) },
  amountLabel: { fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary" },
  amountLabelOwed: { fontWeight: 700, letterSpacing: "0.08em", color: toneText("error") },
  amountValue: { fontWeight: 700 },
  facts: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2 },
  factLabel: { display: "block", fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary" },
  factValue: { fontWeight: 600, overflowWrap: "anywhere" },
  factMuted: { fontWeight: 600, color: "text.secondary" },
  receiptRow: { display: "flex", alignItems: "center", gap: 1.5, minHeight: 56, px: 1.75, borderRadius: "12px", border: "1px solid", borderColor: "divider", textDecoration: "none", color: "text.primary", "&:hover": { bgcolor: "action.hover" } },
  receiptLabel: { flex: 1, fontWeight: 600 },
  receiptView: { fontWeight: 700, color: accent },
  hint: { color: "text.secondary", textAlign: "center" },
  // Expense entry form (components/expense-entry.tsx), shown on the cashier page and inside the New expense sheet.
  entryWrap: { width: "100%", p: { xs: 1, md: 2 } },
  entryWrapSheet: { width: "100%", p: 0 },
  entryCardSheet: { border: 0, boxShadow: "none", bgcolor: "transparent", backgroundImage: "none" },
  sessionIcon: { display: "flex", color: "text.secondary" },
  receiptPreview: { maxHeight: 160, mx: "auto", display: "block", borderRadius: "8px", border: "1px solid", borderColor: "divider" },
} as const;

// Material badge (components/material-badge.tsx): one hue per material family, readable on both surfaces.
const hueBadge = (base: string) => ({
  bgcolor: alpha(base, 0.14),
  color: (theme: Theme) => (theme.palette.mode === "dark" ? lighten(base, 0.45) : darken(base, 0.25)),
  borderColor: alpha(base, 0.3),
}) as const;
const toneBadge = (tone: StatusTone) => ({ ...tonePill(tone), borderColor: tint(tone, 0.3) }) as const;
export const materialBadgeStyles = {
  chip: { fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", borderRadius: "6px", height: "18px", minWidth: "32px", "& .MuiChip-label": { px: "6px", py: 0 } },
  flex: toneBadge("info"),
  sav: toneBadge("error"),
  vinyl: { bgcolor: tint("primary", 0.12), color: accent, borderColor: tint("primary", 0.3) },
  window: hueBadge(CHART_EXTRA.teal),
  sticker: hueBadge(CHART_EXTRA.violet),
  reflective: toneBadge("warning"),
  neutral: { ...toneNeutralPill, borderColor: "divider" },
} as const;

// Records (owner and cashier share one page). The list, tiles, pills and sheets reuse expenseStyles; these are the extras.
export const recordsStyles = {
  ...expenseStyles,
  iconTileExpense: { bgcolor: "action.hover", color: "text.secondary" },
  owes: { color: toneText("error"), fontWeight: 600 },
  expenseAmount: { fontWeight: 700, color: "text.secondary" },
  sortRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  sortNote: { color: "text.secondary" },
  dateFields: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 },
  choices3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  choices2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 },
  choice: { minHeight: 44, borderRadius: "12px", fontWeight: 700 },
  pager: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 },
  pagerButton: { width: 44, height: 44, borderRadius: "12px", border: "1px solid", borderColor: "divider" },
  pagerText: { color: "text.secondary", textAlign: "center" },
  miniTiles: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 },
  itemRow: { display: "flex", alignItems: "center", gap: 1.5, p: 1.5, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } },
  actions: { display: "flex", flexDirection: "column", gap: 1 },
  actionPair: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 },
  fullWidth: { minHeight: 48, width: "100%" },
  // The WhatsApp reminder is an existing compact button; stretch it to match the buttons beside it.
  whatsapp: { display: "flex", "& > a": { display: "block", width: "100%" }, "& button": { width: "100%", height: 48, fontSize: "0.875rem" } },
} as const;

// Job board (components/job-board.tsx). One look per production stage, from palette tones, readable in both modes.
const stageColor = (tone: "warning" | "info" | "success") => (theme: Theme) => (theme.palette.mode === "dark" ? theme.palette[tone].light : theme.palette[tone].main);
const stageLook = (color: string | ((theme: Theme) => string), fill: string | ((theme: Theme) => string), text: string | ((theme: Theme) => string)) => ({
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: color },
  dotLarge: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, bgcolor: color },
  active: { bgcolor: fill, borderColor: color, color: text, "&:hover": { bgcolor: fill } },
}) as const;
export const stageStyles = {
  Quoted: stageLook("text.secondary", "action.hover", "text.primary"),
  Printing: stageLook(stageColor("warning"), tint("warning", 0.18), toneText("warning")),
  Finishing: stageLook(stageColor("info"), tint("info", 0.18), toneText("info")),
  Ready: stageLook(stageColor("success"), tint("success", 0.18), toneText("success")),
  Delivered: stageLook(accent, tint("primary", 0.18), accent),
} as const;

export const boardStyles = {
  ...recordsStyles,
  screen: { ...recordsStyles.screen, maxWidth: "none" },
  stageChips: { display: "flex", gap: 1, overflowX: "auto", pb: 0.5, scrollSnapType: "x proximity" },
  stageChip: { minHeight: 44, borderRadius: 100, px: 1.75, fontWeight: 700, whiteSpace: "nowrap", gap: 1, flexShrink: 0 },
  listHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  jobList: { display: "flex", flexDirection: "column", gap: 1.5 },
  jobCard: { display: "flex", gap: 1.5, p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", bgcolor: "background.paper", textAlign: "left" },
  jobCardSelected: { bgcolor: tint("primary", 0.1), outline: "2px solid", outlineColor: accent, outlineOffset: -1 },
  jobBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.25 },
  jobClient: { color: "text.secondary" },
  jobTitle: { fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" },
  jobMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  jobDate: { display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" },
  jobDone: { display: "flex", alignItems: "center", gap: 0.5, fontWeight: 700, color: toneText("success") },
  jobActions: { display: "flex", gap: 1 },
  moveNext: { flex: 1, minHeight: 44 },
  moveOther: { width: 44, height: 44, borderRadius: "12px", border: "1px solid", borderColor: "divider" },
  tick: { width: 28, height: 28, borderRadius: "8px", border: "2px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.25 },
  tickOn: { bgcolor: "primary.main", borderColor: "primary.main", color: "primary.contrastText" },
  selectBar: {
    position: "fixed", left: 0, right: 0, bottom: { xs: 96, md: 0 }, zIndex: 1100, px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5,
    bgcolor: "background.paper", borderTop: "1px solid", borderColor: "divider",
  },
  selectActions: { display: "flex", gap: 1 },
  stageChoice: { minHeight: 56, borderRadius: "14px", justifyContent: "flex-start", gap: 1.5, px: 2, fontWeight: 600, fontSize: "1rem", border: "1px solid", borderColor: "divider", textAlign: "left", width: "100%" },
  stageChoiceCurrent: { minHeight: 56, borderRadius: "14px", display: "flex", alignItems: "center", gap: 1.5, px: 2, fontWeight: 700, border: "1px solid" },
  stageChoiceTag: { ml: "auto", fontWeight: 700 },
  columns: { display: "grid", gridTemplateColumns: "repeat(5, minmax(170px, 1fr))", gap: 2, overflowX: "auto", pb: 2, alignItems: "start" },
  column: { display: "flex", flexDirection: "column", gap: 1.5, p: 1.5, borderRadius: "16px", bgcolor: "action.hover", border: "1px solid", borderColor: "divider", minWidth: 0 },
  columnOver: { borderStyle: "dashed", borderColor: accent, bgcolor: tint("primary", 0.06) },
  columnHead: { display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5, pb: 0.5 },
  columnTitle: { display: "flex", alignItems: "center", gap: 1, fontWeight: 700 },
  columnCount: { fontWeight: 700, px: 1, py: 0.25, borderRadius: 100, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" },
  columnScroll: { display: "flex", flexDirection: "column", gap: 1.25, maxHeight: "calc(100vh - 22rem)", overflowY: "auto", p: 0.5 },
  deskCard: { cursor: "grab", "&:active": { cursor: "grabbing" }, flexDirection: "column", gap: 1, p: 1.75, position: "relative", overflow: "visible" },
  dragging: { opacity: 0.5 },
  tickBadge: { position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%", bgcolor: "primary.main", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center" },
  dropHint: { minHeight: 96, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "14px", border: "1px dashed", borderColor: "divider", color: "text.secondary", textAlign: "center", px: 1 },
  selection: { display: "flex", alignItems: "center", gap: 1.5, minHeight: 44, flexWrap: "wrap" },
  selectedPill: { fontWeight: 700, px: 1.75, py: 0.75, borderRadius: 100, bgcolor: tint("primary", 0.12), color: accent, border: "1px solid", borderColor: tint("primary", 0.3) },
} as const;

// A panel that slides in from the right (notifications and the like). On a phone it leaves a strip of the page visible, so a tap there closes it.
export const sidePanelStyles = {
  paper: {
    width: { xs: "calc(100% - 56px)", sm: 420 }, maxWidth: "100%", display: "flex", flexDirection: "column", bgcolor: "background.paper", color: "text.primary",
    borderLeft: "1px solid", borderColor: "divider", backgroundImage: "none",
  },
  header: { display: "flex", alignItems: "flex-start", gap: 1.5, p: 3, pr: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "grey.50", flexShrink: 0 },
  headerText: { flex: 1, minWidth: 0 },
  titleLine: { display: "flex", alignItems: "center", gap: 1, mb: 0.5 },
  titleIcon: { display: "flex", color: accent },
  title: { fontWeight: 900, letterSpacing: "-0.02em", color: "text.primary" },
  subtitle: { fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "text.secondary" },
  closeButton: { width: 44, height: 44, flexShrink: 0, color: "text.secondary", border: "1px solid", borderColor: "divider", borderRadius: "12px" },
  body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
} as const;

// Notifications (components/activity-feed.tsx): recent updates and system alerts.
const monoTag = { px: 1, py: 0.5, borderRadius: "6px", fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", fontFamily: "monospace" } as const;
const sectionPill = { display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", px: 1.5, py: 0.5, borderRadius: 100, mb: 1.5 } as const;
const stockLook = (tone: "error" | "warning") => ({
  card: { p: 2, borderRadius: "16px", border: "1px solid", borderColor: tint(tone, 0.3), bgcolor: tint(tone, 0.04) },
  dot: { width: 8, height: 8, borderRadius: "50%", bgcolor: `${tone}.main`, ...(tone === "error" && { animation: "ping 1s infinite" }) },
  tag: { mt: 1.5, display: "inline-block", px: 1, py: 0.25, borderRadius: "6px", fontSize: "0.55rem", fontWeight: 900, textTransform: "uppercase", ...tonePill(tone) },
  button: {
    flexShrink: 0, height: 32, px: 1.5, borderRadius: "8px", fontSize: "0.6rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em",
    borderColor: tint(tone, 0.4), color: toneText(tone), "&:hover": { bgcolor: `${tone}.main`, color: `${tone}.contrastText`, borderColor: "transparent" },
  },
}) as const;
export const activityStyles = {
  bell: {
    position: "relative", width: 40, height: 40, borderRadius: "50%", color: "text.secondary",
    "&:hover": { color: accent, bgcolor: tint("primary", 0.1) }, transition: "background-color 0.2s, color 0.2s, transform 0.2s", "&:active": { transform: "scale(0.97)" },
  },
  bellCount: { position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, px: 0.5, borderRadius: 9, bgcolor: "warning.main", color: "warning.contrastText", fontSize: "0.6875rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid", borderColor: "background.paper", boxSizing: "content-box" },
  bellDot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: "50%", bgcolor: "error.main", border: "2px solid", borderColor: "background.paper", animation: "bounce 1s infinite" },
  tabsWrap: { px: 2, pt: 2, flexShrink: 0 },
  tabs: {
    bgcolor: "grey.100", borderRadius: "16px", p: 0.5, minHeight: 0, "& .MuiTabs-indicator": { display: "none" },
    "& .MuiTab-root": {
      minHeight: 36, borderRadius: "12px", fontSize: "0.7rem", fontWeight: 900, textTransform: "uppercase", color: "text.secondary",
      "&.Mui-selected": { bgcolor: "background.paper", color: "text.primary", boxShadow: softShadow(0.1) },
    },
  },
  tabLabel: { display: "flex", alignItems: "center", gap: 0.5 },
  countChip: { height: 16, fontSize: "0.55rem", fontWeight: 900, "& .MuiChip-label": { px: 0.75 } },
  countCritical: { bgcolor: "error.main", color: "error.contrastText", animation: "pulse 2s infinite" },
  countWarning: { bgcolor: "warning.main", color: "warning.contrastText" },
  scroll: { flex: 1, overflowY: "auto", p: 2 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", p: 4, mt: 6 },
  emptyIcon: { width: 64, height: 64, borderRadius: "50%", bgcolor: "action.hover", color: "text.disabled", display: "flex", alignItems: "center", justifyContent: "center", mb: 2 },
  emptyIconOk: { bgcolor: tint("success", 0.1), color: "success.main" },
  emptyTitle: { fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", color: "text.primary" },
  emptyText: { color: "text.secondary", mt: 1, fontWeight: 500 },
  day: { mb: 3 },
  dayHead: { display: "flex", alignItems: "center", gap: 1, position: "sticky", top: 0, zIndex: 10, bgcolor: "background.paper", py: 0.5 },
  dayRule: { flex: 1, height: 1, bgcolor: "divider" },
  dayLabel: { fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.2em", color: "text.disabled", whiteSpace: "nowrap", fontSize: "0.6rem" },
  list: { display: "flex", flexDirection: "column", gap: 1.5, mt: 1 },
  openLink: { flexShrink: 0, alignSelf: "center", fontWeight: 700, color: accent },
  itemTap: { width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } },
  item: { display: "flex", gap: 2, p: 2, borderRadius: "16px", border: "1px solid", borderColor: "divider", bgcolor: "background.paper", transition: "box-shadow 0.2s", "&:hover": { boxShadow: softShadow(0.08) } },
  itemIcon: { width: 48, height: 48, borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemIconSale: { bgcolor: tint("success", 0.1), color: toneText("success") },
  itemIconExpense: { bgcolor: tint("warning", 0.1), color: toneText("warning") },
  itemBody: { flex: 1, minWidth: 0 },
  itemTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  metaLabel: { fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.disabled", fontSize: "0.6rem" },
  userPill: { display: "flex", alignItems: "center", gap: 0.5, bgcolor: tint("primary", 0.06), color: accent, px: 1, py: 0.25, borderRadius: 100 },
  userName: { fontWeight: 700, fontSize: "0.6rem", color: "inherit" },
  itemTitle: { fontWeight: 900, fontSize: "0.875rem", mt: 0.5, lineHeight: 1.3, letterSpacing: "-0.01em", color: "text.primary" },
  itemNote: { color: "text.secondary", mt: 0.5, display: "block", fontStyle: "italic", fontWeight: 500 },
  tags: { display: "flex", alignItems: "center", gap: 1, mt: 1.5 },
  tagOk: { ...monoTag, ...tonePill("success") },
  tagWarn: { ...monoTag, ...tonePill("warning") },
  sections: { display: "flex", flexDirection: "column", gap: 3 },
  pillWarn: { ...sectionPill, ...tonePill("warning") },
  pillError: { ...sectionPill, ...tonePill("error") },
  stack1: { display: "flex", flexDirection: "column", gap: 1 },
  stack15: { display: "flex", flexDirection: "column", gap: 1.5 },
  pendingRow: { display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.75, borderRadius: "16px", border: "1px solid", borderColor: tint("warning", 0.3), bgcolor: tint("warning", 0.04) },
  pendingTitle: { fontSize: "0.75rem", fontWeight: 700, color: "text.primary" },
  pendingTime: { fontSize: "0.55rem", fontFamily: "monospace", color: "text.disabled", mt: 0.25 },
  pendingBadge: { ...tonePill("warning"), fontSize: "0.55rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", px: 1, py: 0.25, borderRadius: 100, animation: "pulse 2s infinite" },
  stockRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 },
  stockName: { display: "flex", alignItems: "center", gap: 1 },
  stockTitle: { fontSize: "0.75rem", fontWeight: 900, color: "text.primary" },
  stockDesc: { fontSize: "0.7rem", color: "text.secondary", fontWeight: 500, mt: 0.5, lineHeight: 1.5 },
  stock: { critical: stockLook("error"), low: stockLook("warning") },
} as const;

// The floating "entries failed to sync" card (components/sync-manager.tsx). It sits above the bottom nav on a phone.
export const syncFailureStyles = {
  card: {
    position: "fixed", bottom: { xs: 104, md: 16 }, left: { xs: 12, md: "auto" }, right: { xs: 12, md: 16 }, width: { md: 380 }, zIndex: 1400,
    borderRadius: "16px", bgcolor: "error.main", color: "error.contrastText", p: 2, boxShadow: (theme: Theme) => `0 20px 40px ${alpha(theme.palette.error.main, 0.3)}`,
  },
  row: { display: "flex", alignItems: "flex-start", gap: 1.5 },
  icon: { mt: 0.25, flexShrink: 0, opacity: 0.9, display: "flex" },
  body: { flex: 1, minWidth: 0 },
  title: { fontWeight: 900, lineHeight: 1.3, color: "inherit" },
  errors: { mt: 1, maxHeight: 80, overflowY: "auto" },
  error: { color: whiteTint(0.9), display: "block", mb: 0.5, lineHeight: 1.2 },
  errorLabel: { opacity: 0.8 },
  note: { color: whiteTint(0.7), display: "block", mt: 1, fontStyle: "italic" },
  retry: {
    mt: 1.5, height: 32, px: 2, borderRadius: "12px", bgcolor: "common.white", color: "error.main", fontWeight: 900, fontSize: "0.6875rem", textTransform: "uppercase",
    letterSpacing: 1, "&:hover": { bgcolor: whiteTint(0.9) },
  },
  dismiss: { color: "common.white", flexShrink: 0, "&:hover": { bgcolor: whiteTint(0.2) } },
} as const;

// Owner's Approvals inbox: one card per held sale. Pills and the change rows come from the shared tones.
export const approvalInboxStyles = {
  page: { p: { xs: 2, md: 4 }, pb: { xs: 12, md: 12 }, minWidth: 0 },
  tabs: { display: "flex", gap: 1, mb: 2, flexWrap: "wrap" },
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  card: { p: { xs: 2, sm: 2.5 }, display: "flex", flexDirection: "column", gap: 1.5 },
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 },
  amount: { fontWeight: 700, fontFamily: "monospace", flexShrink: 0 },
  amountOut: { color: toneText("error") },
  titleRow: { display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" },
  kindSale: { ...toneNeutralPill, fontSize: "0.6875rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  kindChange: { ...tonePill("warning"), fontSize: "0.6875rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  kindExpense: { ...tonePill("info"), fontSize: "0.6875rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  sub: { color: "text.secondary", fontSize: "0.8125rem", mt: 0.25, overflowWrap: "anywhere" },
  changes: { display: "flex", flexDirection: "column", gap: 1 },
  reason: { px: 1.5, py: 1.25, borderRadius: 1, borderLeft: "3px solid", borderColor: "divider", bgcolor: "action.hover", fontSize: "0.875rem" },
  actions: { display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, alignItems: { sm: "center" } },
  note: { flex: 1 },
  pillApproved: { ...tonePill("success"), fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  pillDeclined: { ...tonePill("error"), fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  pillWaiting: { ...tonePill("warning"), fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  pillExpired: { ...toneNeutralPill, fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  pillRow: { display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" },
} as const;

// The "waiting for your approval" card on the dashboard and at the top of the notification drawer.
export const approvalsWaitingStyles = {
  card: { display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.5, mb: 2, borderRadius: 3, border: "1px solid", borderColor: tint("warning", 0.5), bgcolor: tint("warning", 0.12) },
  text: { flex: 1, minWidth: 0 },
  title: { fontWeight: 700, fontSize: "0.9375rem" },
  sub: { color: "text.secondary", fontSize: "0.8125rem" },
} as const;

// The cashier's held sales at the top of Records.
export const heldSalesStyles = {
  list: { display: "flex", flexDirection: "column", gap: 1.5 },
  card: { p: 2, borderRadius: 3, border: "1px solid", display: "flex", flexDirection: "column", gap: 1, bgcolor: "background.paper" },
  cardWaiting: { borderColor: tint("warning", 0.5) },
  cardDeclined: { borderColor: tint("error", 0.4) },
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 },
  client: { fontWeight: 700 },
  sub: { color: "text.secondary", fontSize: "0.8125rem", overflowWrap: "anywhere" },
  amount: { fontWeight: 700, fontFamily: "monospace", flexShrink: 0, color: "text.secondary" },
  note: { px: 1.5, py: 1, borderRadius: 1, borderLeft: "3px solid", borderColor: "error.main", bgcolor: "action.hover", fontSize: "0.875rem" },
  dismiss: { alignSelf: "flex-start" },
} as const;

// New Sale (cashier and owner share one page): cards, the order list, the floating total and the review sheet.
export const newSaleStyles = {
  screen: { p: { xs: 2, md: 4 }, pb: { xs: 24, lg: 12 }, minWidth: 0 },
  heading: { mt: 2, mb: 3 },
  page: { minWidth: 0 },
  tabs: { display: "flex", gap: 1, mb: 2, flexWrap: "wrap" },
  layout: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 380px" }, gap: 3, alignItems: "start" },
  stack: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  card: { p: { xs: 2, sm: 2.5 }, display: "flex", flexDirection: "column", gap: 2, overflow: "visible" },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" },
  customerGrid: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 },
  grid2: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 },
  suggestWrap: { position: "relative" },
  suggestions: { position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, mt: 0.5, overflow: "hidden" },
  suggestion: { display: "block", width: "100%", px: 2, py: 1.5, minHeight: 44, textAlign: "left", fontFamily: "inherit", fontSize: "0.875rem", fontWeight: 600, color: "text.primary", bgcolor: "transparent", border: 0, borderBottom: "1px solid", borderColor: "divider", cursor: "pointer", "&:last-child": { borderBottom: 0 }, "&:hover": { bgcolor: "action.hover" } },
  quoteRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, px: 1.5, py: 1, borderRadius: 2, bgcolor: "action.hover", flexWrap: "wrap" },
  collapseHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, width: "100%", p: 0, textAlign: "left", fontFamily: "inherit", color: "text.primary", bgcolor: "transparent", border: 0, cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 4 } },
  quoteForm: { display: "flex", gap: 1, alignItems: "center" },
  stockLine: { color: "text.secondary", fontSize: "0.75rem", fontWeight: 600 },
  totalTile: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, px: 1.5, py: 1.5, borderRadius: 2, bgcolor: "action.hover" },
  amount: { fontWeight: 700, fontFamily: "monospace" },
  hint: { color: "text.secondary", fontSize: "0.8125rem" },
  noticeWarn: { px: 1.5, py: 1.25, borderRadius: 2, border: "1px solid", borderColor: tint("warning", 0.5), bgcolor: tint("warning", 0.12), fontSize: "0.8125rem" },
  noticeError: { px: 1.5, py: 1.25, borderRadius: 2, border: "1px solid", borderColor: tint("error", 0.4), bgcolor: tint("error", 0.08), fontSize: "0.8125rem" },
  noticeRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" },
  side: { position: { lg: "sticky" }, top: { lg: 24 } },
  orderRow: { display: "flex", gap: 1.5, alignItems: "flex-start", py: 1.5, borderTop: "1px solid", borderColor: "divider" },
  orderTile: { width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, bgcolor: tint("primary", 0.1), color: "primary.main" },
  orderTileService: { bgcolor: "action.hover", color: "text.secondary" },
  orderMain: { flex: 1, minWidth: 0 },
  orderName: { fontWeight: 600, overflowWrap: "anywhere" },
  orderEnd: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0 },
  orderFlag: { ...tonePill("warning"), alignSelf: "flex-start", mt: 0.75, fontSize: "0.6875rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100 },
  orderFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", pt: 1.5, borderTop: "1px solid", borderColor: "divider" },
  orderTotal: { fontWeight: 700, fontFamily: "monospace", fontSize: "1.375rem" },
  reviewButtonDesktop: { display: { xs: "none", lg: "inline-flex" } },
  bar: { display: { xs: "flex", lg: "none" }, position: "fixed", left: 12, right: 12, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", zIndex: "appBar", alignItems: "center", gap: 1.5, px: 2, py: 1.25, borderRadius: "16px", border: "1px solid", borderColor: "divider", bgcolor: "background.paper" },
  barMain: { flex: 1, minWidth: 0 },
  reviewBody: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 },
  reviewSummary: { p: 2, borderRadius: 2, bgcolor: "action.hover", display: "flex", flexDirection: "column", gap: 0.75 },
  reviewLine: { display: "flex", justifyContent: "space-between", gap: 2, fontSize: "0.875rem" },
  reviewTotal: { pt: 1, mt: 0.5, borderTop: "1px solid", borderColor: "divider", fontSize: "1rem" },
  reviewFooter: { p: 2, display: "flex", flexDirection: "column", gap: 1 },
  stageChips: { display: "flex", gap: 1, flexWrap: "wrap" },
  aiBox: { display: "flex", flexDirection: "column", gap: 2 },
} as const;

// The material picker: a field-like button, and the sheet of materials with a stock meter on each.
export const materialPickerStyles = {
  trigger: { width: "100%", minHeight: 56, px: 1.75, py: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, textAlign: "left", fontFamily: "inherit", color: "text.primary", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", cursor: "pointer", "&:hover": { borderColor: "text.secondary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 } },
  triggerText: { display: "flex", flexDirection: "column", minWidth: 0 },
  triggerLabel: { fontSize: "0.75rem", color: "text.secondary" },
  triggerValue: { fontSize: "0.9375rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  triggerSub: { fontSize: "0.75rem", color: "text.secondary" },
  triggerPlaceholder: { fontSize: "0.9375rem", color: "text.secondary" },
  search: { px: 2, pt: 1, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" },
  list: { overflowY: "auto", flex: 1, p: 2, display: "flex", flexDirection: "column", gap: 2.5 },
  group: { fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", mb: 1, px: 0.5 },
  options: { display: "flex", flexDirection: "column", gap: 1 },
  option: { width: "100%", p: 2, textAlign: "left", fontFamily: "inherit", color: "text.primary", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", cursor: "pointer", "&:hover:not(:disabled)": { borderColor: "primary.main" }, "&:disabled": { opacity: 0.45, cursor: "not-allowed" } },
  optionSelected: { borderColor: "primary.main", bgcolor: tint("primary", 0.08) },
  optionTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1 },
  optionName: { fontSize: "0.9375rem", fontWeight: 700 },
  optionSub: { fontSize: "0.75rem", color: "text.secondary", mt: 0.25 },
  stock: { fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100, flexShrink: 0 },
  stock_success: tonePill("success"),
  stock_warning: tonePill("warning"),
  stock_error: tonePill("error"),
  meter: { height: 6, borderRadius: 100, bgcolor: "action.selected", overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 100 },
  fill_success: { bgcolor: "success.main" },
  fill_warning: { bgcolor: "warning.main" },
  fill_error: { bgcolor: "error.main" },
  empty: { textAlign: "center", py: 6, color: "text.secondary", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 },
} as const;

// Customers: the list rows reuse the Records row look; these are the profile sheet's own parts.
export const customerStyles = {
  tag: { fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.25, borderRadius: 100, whiteSpace: "nowrap" },
  tagOwes: tonePill("error"),
  tagPaid: tonePill("success"),
  ref: { fontFamily: "monospace", fontWeight: 600 },
  noPhone: { color: toneText("error"), fontWeight: 600 },
  actions: { display: "flex", gap: 1, flexWrap: "wrap" },
  actionGrow: { flex: 1, minWidth: 140 },
  tiles: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  details: { p: 1.5, borderRadius: 2, bgcolor: "action.hover", display: "flex", flexDirection: "column", gap: 0.75 },
  detailLine: { display: "flex", justifyContent: "space-between", gap: 2 },
  detailValue: { fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" },
  line: { display: "flex", justifyContent: "space-between", gap: 1.5, py: 1.25, borderTop: "1px solid", borderColor: "divider" },
  lineMain: { minWidth: 0, flex: 1 },
  lineName: { fontWeight: 600, overflowWrap: "anywhere" },
  lineEnd: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0 },
  change: { p: 1.75, borderRadius: "16px", border: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", gap: 1 },
  changeHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 },
  diff: { display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" },
  diffOld: { ...tonePill("error"), px: 1.25, py: 0.25, borderRadius: 2, textDecoration: "line-through", overflowWrap: "anywhere" },
  diffNew: { ...tonePill("success"), px: 1.25, py: 0.25, borderRadius: 2, fontWeight: 600, overflowWrap: "anywhere" },
  diffEmpty: { ...toneNeutralPill, px: 1.25, py: 0.25, borderRadius: 2 },
  note: { p: 1.5, borderRadius: 2, bgcolor: "action.hover", color: "text.secondary" },
  formBody: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 },
  formFooter: { p: 2, display: "flex", flexDirection: "column", gap: 1 },
} as const;

// Correct and cancel a sale: the "what this will do" box, the form body and the cancel warning.
export const saleChangeStyles = {
  strong: { fontWeight: 700 },
  historyList: { display: "flex", flexDirection: "column", gap: 1.25 },
  body: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 2 },
  row3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 },
  row2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 },
  effect: { p: 1.75, borderRadius: "16px", border: "1px solid", borderColor: tint("warning", 0.5), bgcolor: tint("warning", 0.12), display: "flex", flexDirection: "column", gap: 1 },
  effectCancel: { borderColor: tint("error", 0.4), bgcolor: tint("error", 0.08) },
  effectLine: { display: "flex", justifyContent: "space-between", gap: 2, alignItems: "baseline", fontSize: "0.875rem" },
  effectValue: { fontWeight: 700, textAlign: "right", overflowWrap: "anywhere" },
  was: { color: toneText("error"), textDecoration: "line-through", mr: 0.75, fontWeight: 400 },
  footer: { p: 2, display: "flex", flexDirection: "column", gap: 1 },
  actionsRow: { display: "flex", gap: 1, flexWrap: "wrap" },
  historyHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  corrected: { ...tonePill("warning"), alignSelf: "flex-start", fontSize: "0.75rem", fontWeight: 700, px: 1.5, py: 0.5, borderRadius: 100 },
  cancelled: { ...toneNeutralPill, alignSelf: "flex-start", fontSize: "0.75rem", fontWeight: 700, px: 1.5, py: 0.5, borderRadius: 100 },
} as const;

// Price Estimator (owner and cashier): item cards, size controls, result tiles and the quote summary.
const estimatorNote = (tone: StatusTone) => ({
  display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: 2, border: "1px solid", borderColor: tint(tone, 0.3),
  bgcolor: tint(tone, 0.1), color: toneText(tone), fontSize: "0.8125rem", fontWeight: 600,
}) as const;
export const estimatorStyles = {
  page: { p: { xs: 2, md: 4 }, pb: { xs: 3, md: 12 }, minWidth: 0 },
  heading: { mt: 2, mb: 3, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 },
  refresh: { flexShrink: 0 },
  iconBox: { display: "flex" },
  itemText: { flex: 1, minWidth: 0 },
  labelFlush: { display: "flex", alignItems: "center", gap: 0.75, fontSize: "0.75rem", fontWeight: 700, color: "text.secondary" },
  spinning: { display: "flex", animation: `${spin} 1s linear infinite` },
  stack: { display: "flex", flexDirection: "column", gap: 2 },
  card: { p: 2 },
  empty: { p: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, textAlign: "center", color: "text.secondary" },
  label: { display: "flex", alignItems: "center", gap: 0.75, mb: 0.75, fontSize: "0.75rem", fontWeight: 700, color: "text.secondary" },
  labelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 },
  itemCard: { overflow: "hidden" },
  itemHead: { display: "flex", alignItems: "center", gap: 1.5, p: 2, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } },
  itemBadge: { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, bgcolor: tint("primary", 0.14), color: "primary.main", fontSize: "0.8125rem", fontWeight: 700 },
  strong: { fontWeight: 700 },
  itemTitle: { fontWeight: 700 },
  itemSummary: { color: "text.secondary" },
  itemSummaryValue: { color: "primary.main", fontWeight: 700 },
  itemMoney: { color: "primary.main", fontWeight: 700 },
  itemChevron: { display: "flex", color: "text.disabled" },
  removeButton: { color: "text.disabled", "&:hover": { color: "error.main", bgcolor: tint("error", 0.1) } },
  itemBody: { p: 2, borderTop: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", gap: 3 },
  unitToggle: { display: "flex", bgcolor: "action.hover", borderRadius: 2, p: 0.25 },
  unitButton: { minWidth: 0, px: 1.5, py: 0.25, borderRadius: 1.5, fontWeight: 700, color: "text.secondary" },
  unitButtonOn: { minWidth: 0, px: 1.5, py: 0.25, borderRadius: 1.5, fontWeight: 700, bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } },
  shortcuts: { display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.5 },
  shortcut: { borderRadius: 2, minWidth: 0, px: 1.25, py: 0.25, fontWeight: 700, color: "text.secondary", borderColor: "divider", "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: tint("primary", 0.06) } },
  fields3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  fields4: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1 },
  fieldNumber: { "& input": { fontWeight: 700 } },
  noteWarning: estimatorNote("warning"),
  noteError: estimatorNote("error"),
  noteSuccess: estimatorNote("success"),
  noteIcon: { display: "flex", flexShrink: 0 },
  noteSpace: { mt: 1.5 },
  tiles3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  tiles4: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1 },
  tile: { p: 1.5, textAlign: "center", bgcolor: "background.default" },
  tileAccent: { p: 1.5, textAlign: "center", bgcolor: "primary.main", borderColor: "primary.main", color: "primary.contrastText" },
  tileLabel: { fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", mb: 0.5 },
  tileLabelAccent: { fontSize: "0.75rem", fontWeight: 600, color: "primary.contrastText", opacity: 0.85, mb: 0.5 },
  tileValue: { fontWeight: 700 },
  profit: { flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 },
  dotOut: { bgcolor: "error.main" },
  dotLow: { bgcolor: "warning.main" },
  dotOk: { bgcolor: "success.main" },
  rolls: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }, gap: 1 },
  rollGroup: { display: "flex", flexDirection: "column", gap: 1 },
  roll: { p: 1.5, textAlign: "left", cursor: "pointer", bgcolor: "background.paper", transition: "border-color 0.15s", "&:hover": { borderColor: "primary.main" }, "&:disabled": { cursor: "not-allowed", opacity: 0.5 } },
  rollOn: { borderColor: "primary.main", bgcolor: tint("primary", 0.08) },
  rollStatus: { display: "flex", alignItems: "center", gap: 0.5, mt: 1 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  addItem: { py: 1.5, borderStyle: "dashed", borderWidth: 2, "&:hover": { borderWidth: 2, bgcolor: tint("primary", 0.06) } },
  summary: { p: 2.5, display: "flex", flexDirection: "column", gap: 2 },
  summaryTotal: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 },
  summaryAmount: { color: "primary.main", fontWeight: 700 },
  breakdown: { display: "flex", flexDirection: "column", gap: 1, pt: 1.5, borderTop: "1px solid", borderColor: "divider" },
  breakdownRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 },
  actions: { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1 },
  actionsTwo: { display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1 },
  cta: { p: 2, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, width: "100%", textAlign: "left", bgcolor: "primary.main", color: "primary.contrastText", border: 0, cursor: "pointer", "&:hover": { bgcolor: "primary.dark" } },
  ctaNote: { opacity: 0.85 },
} as const;

// Quick-Check (owner and cashier): does this roll cover a print job.
const quickResult = (tone: StatusTone) => ({ p: 3, display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 3, border: "1px solid", borderColor: tint(tone, 0.3), bgcolor: tint(tone, 0.1), color: toneText(tone) }) as const;
export const quickCheckStyles = {
  page: { p: { xs: 2, md: 4 }, pb: { xs: 3, md: 12 }, minWidth: 0 },
  heading: { mt: 2, mb: 3, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 },
  stack: { display: "flex", flexDirection: "column", gap: 2 },
  form: { p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 3 },
  pair: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 },
  lengthRow: { display: "flex", gap: 1 },
  grow: { flex: 1 },
  unitButton: { minWidth: 56, fontWeight: 700 },
  resultOk: quickResult("success"),
  resultTight: quickResult("warning"),
  resultNo: quickResult("error"),
  resultMain: { display: "flex", alignItems: "center", gap: 2 },
  resultIcon: { display: "flex", flexShrink: 0 },
  resultTitle: { fontWeight: 700 },
  resultNeed: { textAlign: "center", p: 2, minWidth: 160, flexShrink: 0, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", color: "text.primary" },
  resultNeedValue: { fontWeight: 700 },
  sectionTitle: { display: "flex", alignItems: "center", gap: 1, mb: 1.5, px: 0.5 },
  sectionIcon: { display: "flex", color: "primary.main" },
  alternatives: { display: "flex", flexDirection: "column", gap: 1 },
  alternative: { p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 },
  alternativeMain: { display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 },
  alternativeIcon: { display: "flex", p: 1, borderRadius: 2, bgcolor: tint("primary", 0.1), color: "primary.main" },
  stockPill: { ...tonePill("success"), fontWeight: 700 },
  loading: { minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: "text.secondary" },
  spinning: { display: "flex", animation: `${spin} 1s linear infinite` },
  iconBox: { display: "flex" },
} as const;

// The stock progress bar (components/stock-bar.tsx), the same on every screen that shows how much of a roll or material is left.
export const stockBarStyles = {
  bar: { width: "100%", minWidth: 0 },
  compact: { width: "100%", minWidth: 48 },
  track: { height: 8, borderRadius: 100, bgcolor: "action.hover" },
  trackCompact: { height: 5, borderRadius: 100, bgcolor: "action.hover" },
  menuItem: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0.5, whiteSpace: "normal" },
  menuTop: { display: "flex", justifyContent: "space-between", gap: 2 },
  menuSub: { color: "text.secondary", flexShrink: 0 },
} as const;

// Customer changes by staff, shown in the owner's bell.
export const customerChangeCardStyles = {
  card: { mx: 2, mt: 2, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 0.5 },
  head: { display: "flex", alignItems: "center", gap: 1, mb: 0.5 },
  icon: { display: "flex", color: "primary.main" },
  title: { fontWeight: 700 },
  row: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.25, p: 1, textAlign: "left", fontFamily: "inherit", color: "text.primary", bgcolor: "transparent", border: 0, borderRadius: 2, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } },
  text: { fontSize: "0.875rem", fontWeight: 600 },
} as const;

// Cashier home (app/cashier/page.tsx): greeting, today's numbers, the three main actions, who to collect from, today's jobs and who still owes.
const onOrange = (opacity: number) => (theme: Theme) => alpha(theme.palette.common.white, opacity);
export const cashierHomeStyles = {
  hero: {
    position: "relative", overflow: "hidden", borderRadius: 5, p: { xs: 2.5, md: 3 }, bgcolor: "primary.main", color: "primary.contrastText", display: "flex", flexDirection: "column", gap: 2.5,
    "&::before": { content: '""', position: "absolute", top: -48, right: -40, width: 180, height: 180, borderRadius: "50%", bgcolor: onOrange(0.12), pointerEvents: "none" },
    "&::after": { content: '""', position: "absolute", bottom: -64, left: -32, width: 160, height: 160, borderRadius: "50%", bgcolor: (theme: Theme) => alpha(theme.palette.common.black, 0.1), pointerEvents: "none" },
    "& > *": { position: "relative", zIndex: 1 },
  },
  heroTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 },
  heroSoft: { opacity: 0.85 },
  heroRefresh: { color: "primary.contrastText", bgcolor: onOrange(0.16), "&:hover": { bgcolor: onOrange(0.26) } },
  heroPill: { fontSize: "0.75rem", fontWeight: 700, px: 1.25, py: 0.5, borderRadius: 100, bgcolor: onOrange(0.2), border: "1px solid", borderColor: onOrange(0.3) },
  heroTiles: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 },
  heroTile: { p: 1.5, textAlign: "center", borderRadius: 3, bgcolor: onOrange(0.18), border: "1px solid", borderColor: onOrange(0.25) },
  heroTileValue: { fontWeight: 700 },
  heroTrack: { height: 8, borderRadius: 100, bgcolor: onOrange(0.28), "& .MuiLinearProgress-bar": { bgcolor: "primary.contrastText" } },
  heroCollect: { display: "flex", flexDirection: "column", gap: 0.75 },
  strong: { fontWeight: 700 },
  page: { p: { xs: 2, md: 4 }, pb: { xs: 3, md: 12 }, minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 },
  heading: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" },
  headingActions: { display: "flex", alignItems: "center", gap: 1 },
  tiles: { display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 },
  collect: { p: 2, display: "flex", flexDirection: "column", gap: 1 },
  collectTop: { display: "flex", justifyContent: "space-between", gap: 2 },
  collectTrack: { height: 8, borderRadius: 100, bgcolor: "action.hover" },
  actions: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 },
  action: { minHeight: 84, p: 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, textAlign: "center", textDecoration: "none", color: "text.primary", fontWeight: 700, "&:hover": { borderColor: "primary.main", bgcolor: tint("primary", 0.04) } },
  actionPrimary: { minHeight: 84, p: 1.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, textAlign: "center", textDecoration: "none", color: "primary.contrastText", bgcolor: "primary.main", borderColor: "primary.main", fontWeight: 700, "&:hover": { bgcolor: "primary.dark" } },
  actionIcon: { display: "flex", color: "primary.main" },
  actionIconPrimary: { display: "flex" },
  columns: { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 3fr) minmax(0, 2fr)" }, gap: 2.5, alignItems: "start" },
  column: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  sectionHead: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, mb: 1 },
  sectionLink: { fontWeight: 700, color: "primary.main", textDecoration: "none" },
  card: { overflow: "hidden" },
  empty: { p: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, textAlign: "center", color: "text.secondary" },
  jobRow: { p: 1.75, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } },
  jobMain: { minWidth: 0 },
  jobEnd: { textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 },
  money: { fontFamily: "monospace", fontWeight: 700 },
  pill: { fontSize: "0.75rem", fontWeight: 700, px: 1, py: 0.25, borderRadius: 100 },
  pillPaid: tonePill("success"),
  pillPart: tonePill("warning"),
  pillUnpaid: tonePill("error"),
  pillNeutral: toneNeutralPill,
  owe: { width: "100%", p: 1.75, display: "flex", flexDirection: "column", gap: 0.75, textAlign: "left", fontFamily: "inherit", color: "text.primary", bgcolor: "transparent", border: 0, borderBottom: "1px solid", borderColor: "divider", cursor: "pointer", "&:last-child": { borderBottom: 0 }, "&:hover": { bgcolor: "action.hover" } },
  oweTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 },
  oweName: { fontWeight: 700, minWidth: 0 },
  oweTrack: { height: 8, borderRadius: 100, bgcolor: "action.hover" },
  oweNote: { px: 2, py: 1.5, color: "text.secondary" },
  collectRow: { p: 1.75, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 }, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } },
  reminder: { color: "success.main", bgcolor: tint("success", 0.1), "&:hover": { bgcolor: tint("success", 0.2) } },
  links: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 },
  lowRow: { p: 1.75, display: "flex", flexDirection: "column", gap: 0.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } },
  lowTop: { display: "flex", justifyContent: "space-between", gap: 1 },
  spinning: { display: "flex", animation: `${spin} 1s linear infinite` },
  iconBox: { display: "flex" },
  loading: { minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" },
} as const;

// Sign-in pages (cashier and owner).
export const loginStyles = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default", p: 2 },
  card: { width: "100%", maxWidth: 448, p: { xs: 3, sm: 4 }, display: "flex", flexDirection: "column", gap: 3 },
  brand: { display: "flex", flexDirection: "column", alignItems: "center", gap: 1, textAlign: "center" },
  logo: { p: 1.25, display: "flex", borderRadius: 3 },
  form: { display: "flex", flexDirection: "column", gap: 2.5 },
  label: { color: "text.secondary", mb: 0.75, display: "block" },
  notice: { display: "flex", gap: 1, p: 1.5, borderRadius: 2, bgcolor: tint("warning", 0.1), border: "1px solid", borderColor: tint("warning", 0.3), color: toneText("warning") },
  noticeIcon: { display: "flex", flexShrink: 0, mt: 0.25 },
  back: { alignSelf: "flex-start", color: "text.secondary", fontWeight: 600 },
  greeting: { textAlign: "center" },
  greetingName: { color: "primary.main", fontWeight: 700 },
  dots: { display: "flex", justifyContent: "center", gap: 2.5 },
  dot: { width: 20, height: 20, borderRadius: "50%", border: "2px solid", borderColor: "divider" },
  dotOn: { width: 20, height: 20, borderRadius: "50%", border: "2px solid", borderColor: "primary.main", bgcolor: "primary.main" },
  keypad: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5, maxWidth: 300, mx: "auto", width: "100%" },
  key: { height: 56, fontSize: "1.25rem", fontWeight: 700, color: "text.primary", borderColor: "divider", "&:hover": { borderColor: "primary.main", bgcolor: tint("primary", 0.06) } },
  keyDelete: { height: 56, color: "text.secondary" },
  keySpace: { height: 56, display: "flex", alignItems: "center", justifyContent: "center" },
  spinner: { display: "flex", animation: `${spin} 1s linear infinite`, color: "primary.main" },
  footer: { pt: 2, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", gap: 2 },
  footerLink: { fontWeight: 600, color: "text.secondary", textDecoration: "none", "&:hover": { color: "primary.main" } },
} as const;
