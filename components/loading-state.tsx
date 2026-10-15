"use client";

import { Box, Paper, Skeleton } from "@mui/material";
import { loadingStyles as styles } from "@/app/theme";

/**
 * The building blocks of every loading look. A whole screen is a list of these pieces (see screen-loading.tsx, which picks the list that
 * matches the screen and the signed-in role). Sizes and colours live in the theme (loadingStyles, MuiSkeleton), never here.
 */
export type Piece =
  | { k: "heading" } | { k: "eyebrow" } | { k: "pills"; n?: number } | { k: "banner" } | { k: "search" } | { k: "wide" }
  | { k: "tiles"; n?: number; cols?: 2 | 3 | 4 | "wide-first" } | { k: "chart" } | { k: "list"; n?: number } | { k: "cards"; n?: number }
  | { k: "form"; n?: number } | { k: "hero" } | { k: "actions" };

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

function Render({ piece }: { piece: Piece }) {
  switch (piece.k) {
    case "heading":
      return <Box sx={styles.heading}><Skeleton sx={styles.titleLine} /><Skeleton sx={styles.subLine} /></Box>;
    case "eyebrow":
      return <Box sx={styles.eyebrow}><Skeleton sx={styles.eyebrowLine} /><Skeleton sx={styles.titleLine} /></Box>;
    case "pills":
      return <Box sx={styles.pills}>{range(piece.n ?? 4).map((i) => <Skeleton key={i} sx={styles.pill} />)}</Box>;
    case "banner":
      return <Skeleton sx={styles.banner} />;
    case "search":
      return <Skeleton sx={styles.search} />;
    case "wide":
      return <Skeleton sx={styles.wide} />;
    case "chart":
      return <Skeleton sx={styles.chart} />;
    case "tiles": {
      const grid = piece.cols === "wide-first" ? styles.tilesWideFirst : piece.cols === 2 ? styles.tilesTwo : piece.cols === 3 ? styles.tilesThree : styles.tiles;
      return <Box sx={grid}>{range(piece.n ?? 4).map((i) => <Skeleton key={i} sx={styles.tile} />)}</Box>;
    }
    case "list":
      return <Paper variant="outlined" sx={styles.list}>
        {range(piece.n ?? 5).map((i) => <Box key={i} sx={styles.listRow}>
          <Skeleton sx={styles.rowIcon} />
          <Box sx={styles.rowText}><Skeleton sx={styles.rowLine} /><Skeleton sx={styles.rowSub} /></Box>
          <Skeleton sx={styles.rowAmount} />
        </Box>)}
      </Paper>;
    case "cards":
      return <Box sx={styles.cards}>{range(piece.n ?? 3).map((i) => <Skeleton key={i} sx={styles.card} />)}</Box>;
    case "form":
      return <Box sx={styles.form}>{range(piece.n ?? 4).map((i) => <Skeleton key={i} sx={styles.field} />)}<Skeleton sx={styles.formButton} /></Box>;
    case "hero":
      return <Skeleton sx={styles.hero} />;
    case "actions":
      return <Box sx={styles.actions}>{range(3).map((i) => <Skeleton key={i} sx={styles.action} />)}</Box>;
  }
}

/** Draws a list of pieces as a loading state. Use this for a section or a sheet; use ScreenLoading for a whole screen. */
export function LoadingState({ pieces, label = "Loading" }: { pieces: Piece[]; label?: string }) {
  return <Box role="status" aria-busy="true" aria-label={label} sx={styles.root}>
    {pieces.map((piece, index) => <Render key={index} piece={piece} />)}
  </Box>;
}
