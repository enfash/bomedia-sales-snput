import React from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  showText?: boolean;
  className?: string;
}

export function Logo({ showText = true, className, ...props }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} {...props}>
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 group overflow-hidden border border-gray-100 dark:border-zinc-800">
        <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={40} height={40} className="object-contain" />
        <div className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {showText && (
        <div className="flex flex-col -gap-1">
          <span className="text-lg font-extrabold tracking-tight text-foreground leading-tight">
            BO<span className="text-primary">Media</span>
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 leading-none">
            Print & Sales
          </span>
        </div>
      )}
    </div>
  );
}
