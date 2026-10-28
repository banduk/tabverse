import { expect, test } from 'vitest';
import { OFFLINE_FAVICON, offlineFaviconSrc } from '../offlineFavicon';

test('does not embed external favicon URLs', () => {
  expect(offlineFaviconSrc('https://internal.example/favicon.ico')).toBe(OFFLINE_FAVICON);
  expect(offlineFaviconSrc('http://localhost:3000/icon')).toBe(OFFLINE_FAVICON);
  expect(offlineFaviconSrc('javascript:alert(1)')).toBe(OFFLINE_FAVICON);
  expect(offlineFaviconSrc('')).toBe(OFFLINE_FAVICON);
});
test('allows small inline raster icons', () => {
  expect(offlineFaviconSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
});
