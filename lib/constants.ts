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
  "Flex 3ft",
  "Flex 4ft",
  "Flex 5ft",
  "Flex 6ft",
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
