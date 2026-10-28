import React, { useEffect, useState } from 'react';
import { Button, InputGroup } from '@blueprintjs/core';
import { createVault, readVaultMetadata, unlockVault } from './keyring';
import { migrateLocalVault } from './migrate';

export interface VaultUnlockProps {
  onReady: () => void;
  initialError?: string;
}

export function VaultUnlock(props: VaultUnlockProps) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(props.initialError ?? '');

  useEffect(() => {
    void readVaultMetadata()
      .then((meta) => setExists(Boolean(meta)))
      .catch((err) => setError(String(err)));
  }, []);

  async function submit() {
    if (busy || exists === null) return;
    setBusy(true);
    setError('');
    try {
      if (exists) {
        await unlockVault(password);
      } else {
        if (password !== confirm) {
          throw new Error('Passwords do not match.');
        }
        await createVault(password);
      }
      await migrateLocalVault();
      // Start the worker's change feed after key unlock and migration.
      await chrome.runtime
        .sendMessage({ type: 'tabverse_vault_unlocked' })
        .catch(() => undefined);
      props.onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        margin: '10vh auto',
        maxWidth: '480px',
        padding: '24px',
      }}
      aria-label="Local encrypted vault"
    >
      <h1>Tabverse Private Vault</h1>
      <p>
        {exists
          ? 'Unlock encrypted local tabs, notes, history and AI transcripts.'
          : 'Set up encryption for local data before using Tabverse.'}
      </p>
      {!exists ? (
        <p>
          Existing records will be converted to encrypted records. Keep
          FileVault enabled: Chrome may retain old disk pages after migration.
          Losing the vault passphrase makes your local data unrecoverable.
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="vault-password">Vault passphrase</label>
        <InputGroup
          id="vault-password"
          type="password"
          autoComplete={exists ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 12 characters"
          disabled={busy}
        />
        {!exists ? (
          <>
            <label htmlFor="vault-confirm">Confirm passphrase</label>
            <InputGroup
              id="vault-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              disabled={busy}
            />
          </>
        ) : null}
        <Button
          type="submit"
          intent="primary"
          loading={busy}
          disabled={exists === null}
          text={exists ? 'Unlock vault' : 'Create and encrypt local vault'}
        />
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
