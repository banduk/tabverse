import React, { useState } from 'react';
import { Button } from '@blueprintjs/core';
import { lockVault } from './keyring';

export function VaultSettingsPanel() {
  const [busy, setBusy] = useState(false);
  async function lockNow() {
    setBusy(true);
    try {
      await lockVault();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Local vault security">
      <h3>Encrypted local vault</h3>
      <p>
        IndexedDB records and sensitive Chrome storage are encrypted using
        a per-installation key protected by your passphrase.
      </p>
      <p>
        The key remains in Chrome session memory until the browser
        restarts or you lock the vault. Chrome's normal browsing history
        is outside Tabverse and is not protected by this vault.
      </p>
      <Button
        intent="warning"
        disabled={busy}
        onClick={() => void lockNow()}
        text="Lock local vault now"
      />
    </section>
  );
}
