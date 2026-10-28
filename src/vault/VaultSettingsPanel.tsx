import React, { useState } from 'react';
import { Button, InputGroup } from '@blueprintjs/core';
import { changeVaultPassphrase, lockVault } from './keyring';

export function VaultSettingsPanel() {
  const [busy, setBusy] = useState(false);
  const [oldPassphrase, setOldPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [message, setMessage] = useState('');

  async function lockNow() {
    setBusy(true);
    try {
      await lockVault();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    setMessage('');
    try {
      await changeVaultPassphrase(oldPassphrase, newPassphrase);
      setOldPassphrase('');
      setNewPassphrase('');
      setMessage('Passphrase updated without rewriting the encrypted records.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Local vault security">
      <h3>Encrypted local vault</h3>
      <p>
        IndexedDB records and sensitive Chrome storage are encrypted using a
        per-installation key protected by your passphrase.
      </p>
      <p>
        The key remains in Chrome session memory until the browser restarts or
        you lock the vault. Chrome's normal browsing history is outside Tabverse
        and is not protected by this vault.
      </p>
      <Button
        intent="warning"
        disabled={busy}
        onClick={() => void lockNow()}
        text="Lock local vault now"
      />
      <h4>Change vault passphrase</h4>
      <label htmlFor="old-vault-password">Current passphrase</label>
      <InputGroup
        id="old-vault-password"
        type="password"
        autoComplete="current-password"
        value={oldPassphrase}
        onChange={(event) => setOldPassphrase(event.target.value)}
        disabled={busy}
      />
      <label htmlFor="new-vault-password">New passphrase</label>
      <InputGroup
        id="new-vault-password"
        type="password"
        autoComplete="new-password"
        value={newPassphrase}
        onChange={(event) => setNewPassphrase(event.target.value)}
        disabled={busy}
      />
      <Button
        disabled={busy || !oldPassphrase || newPassphrase.length < 12}
        onClick={() => void changePassword()}
        text="Update vault passphrase"
      />
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
