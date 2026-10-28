import { expect, test } from 'vitest';
import { pageReadOriginPattern } from '../pagePermission';

test('requests only the chosen webpage origin', () => {
  expect(pageReadOriginPattern('https://example.com/private?token=x')).toBe(
    'https://example.com/*',
  );
  expect(pageReadOriginPattern('http://localhost:8223/a')).toBe(
    'http://localhost/*',
  );
});
test('rejects non-web URLs', () => {
  expect(pageReadOriginPattern('javascript:alert(1)')).toBeNull();
  expect(pageReadOriginPattern('file:///etc/passwd')).toBeNull();
  expect(pageReadOriginPattern('garbage')).toBeNull();
});
