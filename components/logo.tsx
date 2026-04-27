import React from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  showText?: boolean;
  className?: string;
}

export function Logo({ showText = true, className, ...props }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} {...props}>
      <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 group overflow-hidden border border-gray-100 dark:border-zinc-800">
        <Image 
          src="/bomedia-icon.svg" 
          alt="BOMedia Logo" 
          width={40} 
          height={40} 
          className="object-contain" 
          priority
        />
      </span>

      {showText && (
        <span className="flex flex-col gap-0">
          <span className="text-lg font-extrabold tracking-tight text-foreground leading-tight">
            <span className="text-primary">BOMedia</span>
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none">
            Sales Logs
          </span>
        </span>
      )}
    </span>
  );
}

