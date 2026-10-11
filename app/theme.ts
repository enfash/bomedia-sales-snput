"use client";

import { alpha, createTheme, keyframes, type Theme } from "@mui/material/styles";

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
  clients: {bgcolor:'primary.light',borderColor:'primary.main',display:'flex',alignItems:'center',gap:0.5},
  debt: {bgcolor:'error.main',borderColor:'error.main'},
} as const;

export const settingsStyles = {
  page: {p:{xs:2,md:4},pb:{xs:3,md:12},maxWidth:900,mx:'auto',minWidth:0},
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

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;
type Tone = "primary" | "success" | "info" | "warning" | "error";
const tint = (tone: Tone, opacity: number) => (theme: Theme) => alpha(theme.palette[tone].main, opacity);
const toneBox = (tone: Tone) => ({ bgcolor: tint(tone, 0.1), color: `${tone}.main` });

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
  quickCard: {
    flex: 1, p: 2, borderRadius: "16px", display: "flex", alignItems: "center", gap: 2, color: "text.primary", textDecoration: "none",
    bgcolor: tint("primary", 0.06), borderColor: tint("primary", 0.2), transition: "transform .15s, background-color .15s",
    "&:hover": { bgcolor: tint("primary", 0.12) }, "&:active": { transform: "scale(0.97)" },
    "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
  },
  quickIcon: { p: 1.25, borderRadius: 2, bgcolor: "background.paper", color: accent, display: "flex" },
  quickLabel: { display: "block", color: accent },
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
    p: { xs: 1.5, sm: 2.5 }, display: "flex", flexDirection: "column", justifyContent: "space-between", transition: "box-shadow 0.3s, transform 0.3s",
    "&:hover": { "@media (hover: hover)": { boxShadow: softShadow(0.08), transform: "translateY(-4px)" } },
  },
  cardHero: { bgcolor: tint("primary", 0.03), borderColor: tint("primary", 0.2) },
  cardAlert: { borderColor: "error.main", outline: "2px solid", outlineColor: tint("error", 0.2) },
  glow: { position: "absolute", right: -16, top: -16, height: 112, width: 112, borderRadius: "50%", bgcolor: tint("primary", 0.05), filter: "blur(24px)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", mb: { xs: 1, sm: 2 }, gap: 0.5 },
  titleRow: { display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 },
  alertDot: { width: { xs: 6, sm: 8 }, height: { xs: 6, sm: 8 }, borderRadius: "50%", bgcolor: "error.main", flexShrink: 0, boxShadow: (theme: Theme) => `0 0 4px ${alpha(theme.palette.error.main, 0.5)}` },
  title: { fontSize: { xs: "0.625rem", sm: "0.6875rem" }, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  icon: { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: { xs: 1.5, sm: 2 }, width: { xs: 24, sm: 40 }, height: { xs: 24, sm: 40 } },
  iconDefault: { bgcolor: "action.hover", color: "text.primary" },
  iconHero: { width: 40, height: 40, bgcolor: "primary.main", color: "primary.contrastText", boxShadow: (theme: Theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}` },
  iconAlert: { bgcolor: tint("error", 0.1), color: "error.main" },
  body: { display: "flex", flexDirection: "column", gap: 0.5 },
  value: { fontWeight: 700, letterSpacing: "-0.02em", color: "text.primary", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  valueDefault: { fontSize: { xs: "1rem", sm: "1.25rem", lg: "1.5rem" } },
  valueHero: { fontSize: { xs: "1.5rem", sm: "2.25rem" } },
  trendRow: { display: "flex", alignItems: "center", gap: 1, mt: { xs: 0.5, sm: 1 } },
  trendChip: { display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.6875rem", fontWeight: 700, px: 1, py: 0.25, borderRadius: 10, border: "1px solid" },
  trendUp: trendChip("success"),
  trendDown: trendChip("error"),
  spark: { mt: 1.5, opacity: 0.6, color: accent },
  footer: { mt: { xs: 1, sm: 2 }, pt: { xs: 1, sm: 2 }, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" },
  subLabel: { fontSize: { xs: "0.625rem", sm: "0.6875rem" }, color: "text.secondary" },
  change: { display: "flex", alignItems: "center", gap: { xs: 0.25, sm: 0.5 }, fontSize: { xs: "0.625rem", sm: "0.75rem" }, fontWeight: 700 },
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
        disabled:  mode === "light" ? "#94A3B8" : "#475569",
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
      // The admin indigo is too dark to read as "ticked" on the dark surface, so use the brighter accent there.
      MuiCheckbox: { styleOverrides: { root: { "&.Mui-checked": { color: mode === "dark" ? primaryLight : primaryColor } } } },
      MuiRadio:    { styleOverrides: { root: { "&.Mui-checked": { color: mode === "dark" ? primaryLight : primaryColor } } } },
      MuiBottomNavigationAction: { styleOverrides: { root: { "&.Mui-selected": { color: mode === "dark" ? primaryLight : primaryColor } } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: "12px",
            padding: "10px 22px",
            fontSize: "0.95rem",
            transition: "transform .2s ease, box-shadow .2s ease",
            "&:active": {
              transform: "scale(0.97) translateY(1px)",
            },
            // Outlined and text buttons draw the brand colour as text and border; the admin indigo is too dark for that on the dark surface.
            ...(mode === "dark" && {
              "&:where(.MuiButton-outlined.MuiButton-colorPrimary)": { color: primaryLight, borderColor: alpha(primaryLight, 0.5) },
              "&:where(.MuiButton-text.MuiButton-colorPrimary)": { color: primaryLight },
            }),
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
  tile: { p: 1.75, borderRadius: 4, border: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 },
  success: { bgcolor: tint("success", 0.12), borderColor: tint("success", 0.4) },
  warning: { bgcolor: tint("warning", 0.14), borderColor: tint("warning", 0.5) },
  primary: { borderColor: "primary.main", bgcolor: tint("primary", 0.08) },
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

