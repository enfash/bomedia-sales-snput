// The first-start splash shows once per browser session. This tiny script runs in <head> before anything paints and marks sessions that already
// showed it, so a reload never flashes the splash again.
export const LAUNCH_FLAG = 'bomedia-launched';
export const LAUNCH_SHOW_MS = 1200;
export const LAUNCH_FADE_MS = 400;
export const LAUNCH_HEAD_SCRIPT = `try{if(sessionStorage.getItem('${LAUNCH_FLAG}'))document.documentElement.setAttribute('data-launched','1')}catch(e){}`;
