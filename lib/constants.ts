export const STORAGE_KEYS = {
  USER_NAME: "userName",
} as const;

export const SYSTEM_DEFAULTS = {
  PAGINATION_ITEMS_PER_PAGE: 50,
  MAX_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
} as const;

export const PAYMENT_METHODS = ["Bank Transfer", "POS", "Cash"] as const;

export const MATERIAL_TYPES = ["Flex", "SAV", "Window Graphics", "Solite", "Clear Stickers"] as const;

export const JOB_STATUSES = ["Quoted", "Printing", "Finishing", "Ready", "Delivered"] as const;

export const EXPENSE_CATEGORIES = [
  "Raw Materials",
  "SAV 3ft",
  "SAV 4ft",
  "SAV 5ft",
  "SAV 7ft",
  "Flex 3ft",
  "Flex 4ft",
  "Flex 5ft",
  "Flex 6ft",
  "Flex 7ft",
  "Flex 8ft",
  "Flex 10ft",
  "Ink",
  "Equipment",
  "Utilities",
  "Salaries",
  "Transport",
  "Maintenance",
  "Marketing",
  "Office Supplies",
  "Miscellaneous",
] as const;

export const WASTE_REASONS = [
  "Print head calibration run",
  "Colour alignment test strip",
  "Media edge trim / setup",
  "Misprinted job — reprint needed",
  "Customer proof",
  "Roll leader / tail damage",
  "Machine jam — damaged section",
  "Other (see description)",
] as const;

export const RECORD_STATUSES = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  PART_PAYMENT: "Part-payment",
  SETTLED: "Settled",
  IN_PROGRESS: "In Progress",
  SYNCING: "Syncing",
} as const;

/**
 * Business details printed on the customer invoice.
 *
 * The owner now edits these under Settings → Business details (stored in the
 * database and read by lib/business-details.ts). This object stays as the
 * last-resort fallback and as the seed for the database row: if the database is
 * unreachable and nothing was saved on the device, an invoice must still print
 * with real payment details rather than blanks. Keep it in step with the account
 * the business actually uses. These values are meant to be on the document;
 * there is no secrecy concern.
 */
export const BUSINESS_DETAILS = {
  accountName: "Broad Options Media / Fasugba Elijah Niyi",
  accountNumber: "5236650819",
  bank: "Moniepoint MFB",

  // Contact block printed in the invoice footer. `phone` is spaced for
  // readability on the printed page; `phoneRaw` is the dialable form, kept
  // separate so a tel:/wa.me link never inherits the spacing.
  phone: "+234 802 224 7567",
  phoneRaw: "+2348022247567",
  email: "info@bomedia.com.ng",
  address: "65, New Ipaja Road, Alaguntan BRT Bus Stop, Alimosho, Lagos.",
} as const;
