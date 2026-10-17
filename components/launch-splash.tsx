"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Box } from "@mui/material";

import { launchSplashStyles as styles } from "@/app/theme";
import { LoadingAnimation } from "@/components/loading-animation";
import { LAUNCH_FADE_MS, LAUNCH_FLAG, LAUNCH_SHOW_MS } from "@/lib/launch";

/** The BOMedia animation, shown once when the app is first opened in a browser session. Every other loading moment uses LoadingState. */
export function LaunchSplash() {
  const [fading, setFading] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(LAUNCH_FLAG, "1"); } catch { /* private mode: the splash may show again, which is harmless */ }
    const fade = setTimeout(() => setFading(true), LAUNCH_SHOW_MS);
    const remove = setTimeout(() => setRemoved(true), LAUNCH_SHOW_MS + LAUNCH_FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(remove); };
  }, []);

  if (removed) return null;
  return <Box aria-hidden sx={[styles.splash, fading && styles.splashOut]}>
    <Box sx={styles.splashInner}>
      <Box sx={styles.splashLogo}><Image src="/bomedia-icon.svg" alt="" width={72} height={72} priority /></Box>
      <LoadingAnimation width={120} height={48} />
    </Box>
  </Box>;
}
