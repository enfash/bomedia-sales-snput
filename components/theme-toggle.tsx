"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { IconButton } from "@mui/material"
import { useColorMode } from "@/app/mui-providers"

export function ThemeToggle() {
  const { mode, toggleColorMode } = useColorMode()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const isAppearanceTransition =
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (!isAppearanceTransition) {
      toggleColorMode()
      return
    }

    const x = event.clientX ?? window.innerWidth / 2
    const y = event.clientY ?? window.innerHeight / 2
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    const transition = (document as any).startViewTransition(() => {
      toggleColorMode()
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      document.documentElement.animate(
        { clipPath },
        {
          duration: 450,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    })
  }

  if (!mounted) {
    return (
      <IconButton
        sx={{
          width: 36,
          height: 36,
          opacity: 0,
          border: "1px solid",
          borderColor: "divider",
        }}
      />
    )
  }

  return (
    <IconButton
      onClick={handleToggle}
      sx={{
        width: 36,
        height: 36,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        backdropFilter: "blur(4px)",
        boxShadow: 1,
        position: "relative",
        transition: "background-color 0.2s, box-shadow 0.2s",
        "&:active": { transform: "scale(0.95)" },
        "& .sun-icon": {
          transition: "transform 0.3s, opacity 0.3s",
        },
        "& .moon-icon": {
          position: "absolute",
          transition: "transform 0.3s, opacity 0.3s",
        },
      }}
    >
      <Sun
        className="sun-icon"
        size={19}
        style={{
          color: "#f59e0b",
          transform: mode === "dark" ? "rotate(-90deg) scale(0)" : "rotate(0deg) scale(1)",
          opacity: mode === "dark" ? 0 : 1,
        }}
      />
      <Moon
        className="moon-icon"
        size={19}
        style={{
          color: "#C8472E",
          transform: mode === "dark" ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(0)",
          opacity: mode === "dark" ? 1 : 0,
        }}
      />
      <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0 }}>Toggle theme</span>
    </IconButton>
  )
}
