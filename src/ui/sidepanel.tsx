import 'normalize.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import './theme.scss';
import './sidepanel/sidepanel.scss';

import React from 'react';
import { renderPage } from './common/base';
import { SidePanelView } from './sidepanel/SidePanelView';
import { isVaultUnlocked, readVaultMetadata } from '../vault/keyring';
import { migrateLocalVault } from '../vault/migrate';
import { VaultUnlock } from '../vault/VaultUnlock';

async function bootstrap(): Promise<void> {
  const meta = await readVaultMetadata();
  if (!meta || !(await isVaultUnlocked())) {
    renderPage({
      pageComponent: <VaultUnlock onReady={() => void bootstrap()} />,
    });
    return;
  }
  await migrateLocalVault();
  renderPage({ pageComponent: <SidePanelView /> });
}

void bootstrap().catch((error: unknown) => {
  renderPage({
    pageComponent: (
      <VaultUnlock
        onReady={() => void bootstrap()}
        initialError={error instanceof Error ? error.message : String(error)}
      />
    ),
  });
});
