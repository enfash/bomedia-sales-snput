"use client";

import { useEffect, useState } from "react";
import { BUSINESS_DETAILS } from "@/lib/constants";

export type BusinessDetails = {
  accountName: string;
  accountNumber: string;
  bank: string;
  /** As printed, e.g. "+234 802 224 7567". */
  phone: string;
  /** Dialable form for tel:/wa.me links. */
  phoneRaw: string;
  email: string;
  address: string;
};

// The code constants are the last resort, so an invoice can never print with blank payment details.
export const FALLBACK_BUSINESS_DETAILS: BusinessDetails = BUSINESS_DETAILS;

const ENDPOINT = "/api/accounting/business-details";
const STORAGE_KEY = "bomedia:business-details";
const FRESH_MS = 30_000;

let cache: { at: number; value: BusinessDetails } | null = null;
let inflight: Promise<BusinessDetails> | null = null;

export function parseBusinessDetails(json: unknown): BusinessDetails | null {
  if (!json || typeof json !== "object") return null;
  const r = json as Record<string, unknown>;
  const text = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string) : null);
  const accountName = text("account_name"), accountNumber = text("account_number"), bank = text("bank"),
    phone = text("phone"), email = text("email"), address = text("address");
  if (!accountName || !accountNumber || !bank || !phone || !email || !address) return null;
  return { accountName, accountNumber, bank, phone, phoneRaw: text("phone_dial") ?? phone, email, address };
}

function lastKnownGood(): BusinessDetails {
  try {
    const stored = parseBusinessDetails(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
    if (stored) return stored;
  } catch { /* storage unavailable or corrupt: use the code constants */ }
  return FALLBACK_BUSINESS_DETAILS;
}

/** Call after the owner saves so the next receipt reads the new values straight away. */
export function clearBusinessDetailsCache() {
  cache = null;
}

async function load(): Promise<BusinessDetails> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.value;
  inflight ??= (async () => {
    let value: BusinessDetails;
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      const parsed = res.ok ? parseBusinessDetails(await res.json()) : null;
      if (parsed) {
        value = parsed;
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          account_name: parsed.accountName, account_number: parsed.accountNumber, bank: parsed.bank,
          phone: parsed.phone, phone_dial: parsed.phoneRaw, email: parsed.email, address: parsed.address })); } catch { /* ignore */ }
      } else value = lastKnownGood();
    } catch { value = lastKnownGood(); }
    cache = { at: Date.now(), value };
    return value;
  })().finally(() => { inflight = null; });
  return inflight;
}

/**
 * Business details for printing. `ready` turns true once the server answered or failed,
 * so a download can wait for it instead of capturing the fallback by accident.
 */
export function useBusinessDetails(enabled = true) {
  const [state, setState] = useState<{ details: BusinessDetails; ready: boolean }>(() =>
    cache ? { details: cache.value, ready: true } : { details: FALLBACK_BUSINESS_DETAILS, ready: false });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then((details) => { if (active) setState({ details, ready: true }); });
    return () => { active = false; };
  }, [enabled]);
  return state;
}
