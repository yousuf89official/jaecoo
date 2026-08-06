import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPasscode, validatePasscode, verifyPasscode } from '../../api/_lib/client-auth.js';

describe('client passcode security', () => {
  const previous = process.env.CLIENT_PASSCODE_PEPPER;
  beforeEach(() => { process.env.CLIENT_PASSCODE_PEPPER = 'test-pepper-that-is-at-least-thirty-two-characters'; });
  afterEach(() => { if (previous === undefined) delete process.env.CLIENT_PASSCODE_PEPPER; else process.env.CLIENT_PASSCODE_PEPPER = previous; });

  it('accepts exactly four digits', () => {
    expect(validatePasscode('0427')).toBe(true);
    expect(validatePasscode('427')).toBe(false);
    expect(validatePasscode('12a4')).toBe(false);
  });

  it('stores a salted one-way digest and verifies in constant-time-safe form', () => {
    const hash = hashPasscode('0427');
    expect(hash).not.toContain('0427');
    expect(verifyPasscode('0427', hash)).toBe(true);
    expect(verifyPasscode('0428', hash)).toBe(false);
    expect(hashPasscode('0427')).not.toBe(hash);
  });
});
