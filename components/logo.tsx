import React from 'react';
import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  showText?: boolean;
  className?: string;
}

export function Logo({ showText = true, className, ...props }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 group">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-primary-foreground drop-shadow-sm"
          {...props}
        >
          {/* Stylized 'B' representing print layers */}
          <path
            d="M6 4H14.5C16.9853 4 19 6.01472 19 8.5C19 10.9853 16.9853 13 14.5 13H6V4Z"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <path
            d="M6 13H15.5C17.9853 13 20 15.0147 20 17.5C20 19.9853 17.9853 22 15.5 22H6V13Z"
            fill="currentColor"
          />
          <path
            d="M6 3V22"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M6 4H14.5C16.9853 4 19 6.01472 19 8.5C19 10.9853 16.9853 13 14.5 13H6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 13L15.5 13C17.9853 13 20 15.0147 20 17.5C20 19.9853 17.9853 22 15.5 22H6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>
      
      {showText && (
        <div className="flex flex-col -gap-1">
          <span className="text-xl font-black tracking-tighter text-foreground leading-tight">
            BO<span className="text-primary">Media</span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 leading-none ml-0.5">
            Sales & Print
          </span>
        </div>
      )}
    </div>
  );
}
