// The "saved on this device, waiting to sync" notice. While an entry is only waiting for the server (no error yet), the notice is held back
// briefly, so the normal one-or-two-second confirmation never flashes an alarming Retry button. A real problem shows straight away.
export const WAITING_TEXT = 'Waiting to sync.';
/** How long a plain "waiting" message is held back before it is shown, in milliseconds. */
export const CALM_DELAY_MS = 8000;

/** True when the message only says the entry is waiting, with no error attached. */
export const isCalmWaiting = (message: string) => message.endsWith(WAITING_TEXT);
