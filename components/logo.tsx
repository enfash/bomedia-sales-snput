import Image from "next/image";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface LogoProps {
  showText?: boolean;
}

export function Logo({ showText = true }: LogoProps) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1.25 }}>
      <Box
        sx={{
          position: "relative",
          display: "flex",
          height: 40,
          width: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          bgcolor: "background.paper",
          boxShadow: "0 4px 14px rgba(200,71,46,.2)",
          transition: "transform 0.2s",
          overflow: "hidden",
          border: 1,
          borderColor: "divider",
          "&:hover": { transform: "scale(1.05)" },
          "&:active": { transform: "scale(0.97)" },
        }}
      >
        <Image 
          src="/bomedia-icon.svg" 
          alt="BOMedia Logo" 
          width={40} 
          height={40} 
          style={{ objectFit: "contain" }}
          priority
        />
      </Box>

      {showText && (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            <Box component="span" sx={{ color: "primary.main" }}>BOMedia</Box>
          </Typography>
          <Typography sx={{ fontSize: "0.5625rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary", lineHeight: 1, mt: 0.25 }}>
            Sales Logs
          </Typography>
        </Box>
      )}
    </Box>
  );
}
