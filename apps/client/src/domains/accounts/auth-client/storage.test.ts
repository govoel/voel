import { describe, expect, it } from 'vitest';

import { makeMemoryAuthStorage } from '#src/domains/accounts/auth-client/storage.ts';

describe('credential storage', () => {
  it('keeps temporary authentication isolated and snapshots all storage entries', async () => {
    const first = makeMemoryAuthStorage();
    const second = makeMemoryAuthStorage();
    await first.storage.setItemAsync('voel_cookie', 'a cookie');
    const snapshot = first.snapshot();
    await first.storage.setItemAsync('voel_cookie', 'a rotated cookie');
    expect(snapshot).toEqual({ voel_cookie: 'a cookie' });
    expect(await second.storage.getItemAsync('voel_cookie')).toBeNull();
  });
});
