"use client";

import { useLayoutEffect, useRef } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

import { caretFor, cleanMoney, formatMoney, settleMoney, significantBefore } from "@/lib/money-input";

type MoneyFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type" | "multiline" | "select"> & {
  /** The plain amount the screen stores, such as "1500000.5". The box shows it with commas. */
  value: string;
  /** Called with the plain amount (no commas) after every change. */
  onChange: (value: string) => void;
};

/**
 * A money box that shows thousands commas while you type. Screens keep the plain value, so saving and calculations do not change.
 * It is a text box with the decimal keypad, so the mouse wheel can never change an amount by accident.
 */
export function MoneyField({ value, onChange, onBlur, slotProps, ...rest }: MoneyFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const shown = formatMoney(value);

  // After the text changes, put the cursor back after the digit it was after, because commas may have moved.
  useLayoutEffect(() => {
    if (caret.current === null || !input.current || document.activeElement !== input.current) return;
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const htmlInput = { ...(slotProps?.htmlInput as object | undefined), inputMode: "decimal" as const, autoComplete: "off" };

  return (
    <TextField
      {...rest}
      value={shown}
      inputRef={input}
      slotProps={{ ...slotProps, htmlInput }}
      onBlur={(event) => {
        const settled = settleMoney(value);
        if (settled !== value) onChange(settled);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const typed = event.target.value;
        const clean = cleanMoney(typed);
        caret.current = caretFor(formatMoney(clean), significantBefore(typed, event.target.selectionStart ?? typed.length));
        onChange(clean);
      }}
    />
  );
}
