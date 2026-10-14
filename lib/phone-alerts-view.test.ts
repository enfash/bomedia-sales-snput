import { describe, expect, it } from 'vitest';

import { deviceLabel, keyBytes, needsHomeScreen } from './phone-alerts-view';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';

describe('phone alerts helpers', () => {
  it('names the device', () => {
    expect(deviceLabel(iphone)).toBe('iPhone · Safari');
    expect(deviceLabel(android)).toBe('Android · Chrome');
    expect(deviceLabel(desktop)).toBe('Computer · Edge');
    expect(deviceLabel('')).toBe('Computer · Browser');
  });
  it('asks an iPhone to add the app to the Home Screen first, nobody else', () => {
    expect(needsHomeScreen(iphone, false)).toBe(true);
    expect(needsHomeScreen(iphone, true)).toBe(false);
    expect(needsHomeScreen(android, false)).toBe(false);
    expect(needsHomeScreen(desktop, false)).toBe(false);
  });
  it('turns the public key into bytes', () => {
    expect(Array.from(keyBytes('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(keyBytes('_-8'))).toEqual([255, 239]);
  });
});
