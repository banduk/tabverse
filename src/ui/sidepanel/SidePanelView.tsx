import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TabSpaceOp, isTabSpaceManagerPage } from '../../global';
import type { TabSpace } from '../../data/tabSpace/TabSpace';
import { tabverseUrl } from '../../data/tabSpace/chromeUtil';
import {
  queryOpenTabSpaces,
  switchToOpenTabSpace,
} from '../../data/tabSpace/openTabverses';
import { queryRecentSavedTabSpaces } from '../../data/tabSpace/util';
import { VAULT_SESSION_KEY } from '../../vault/keyring';

interface GroupDetails {
  title: string;
  color: string;
}

const NO_GROUP = -1;

function normalized(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function hostOf(url: string | undefined): string {
  if (!url) return 'Chrome';
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol.replace(':', '') || 'Chrome';
  } catch {
    return 'Chrome';
  }
}

export function SidePanelView() {
  const [windowId, setWindowId] = useState<number | null>(null);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [groups, setGroups] = useState<Record<number, GroupDetails>>({});
  const [saved, setSaved] = useState<TabSpace[]>([]);
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<'tabs' | 'saved'>('tabs');
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const searchInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const currentRevision = ++revision;
      void (async () => {
        try {
          const current = await chrome.windows.getCurrent();
          if (current.id === undefined)
            throw new Error('Janela não encontrada');
          const currentTabs = await chrome.tabs.query({ windowId: current.id });
          const groupIds = Array.from(
            new Set(
              currentTabs
                .map((tab) => tab.groupId)
                .filter((id) => id !== NO_GROUP),
            ),
          );
          const groupRows = await Promise.all(
            groupIds.map(async (id) => {
              try {
                const group = await chrome.tabGroups.get(id);
                return [
                  id,
                  { title: group.title || 'Grupo de abas', color: group.color },
                ] as const;
              } catch {
                return [id, { title: 'Grupo de abas', color: 'grey' }] as const;
              }
            }),
          );
          const recent = await queryRecentSavedTabSpaces(8);
          if (!active || currentRevision !== revision) return;
          setWindowId(current.id);
          setTabs(currentTabs.filter((tab) => !isTabSpaceManagerPage(tab)));
          setGroups(Object.fromEntries(groupRows));
          setSaved(recent);
          setError(null);
        } catch (reason) {
          if (!active || currentRevision !== revision) return;
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })();
    };
    refresh();
    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.tabs.onMoved.addListener(refresh);
    chrome.tabs.onAttached.addListener(refresh);
    chrome.tabs.onDetached.addListener(refresh);
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabGroups.onUpdated.addListener(refresh);
    window.addEventListener('focus', refresh);
    const storageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (
        areaName === 'session' &&
        changes[VAULT_SESSION_KEY] &&
        !changes[VAULT_SESSION_KEY].newValue
      ) {
        setLocked(true);
      }
    };
    chrome.storage.onChanged.addListener(storageChanged);
    return () => {
      active = false;
      ++revision;
      chrome.tabs.onCreated.removeListener(refresh);
      chrome.tabs.onRemoved.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
      chrome.tabs.onMoved.removeListener(refresh);
      chrome.tabs.onAttached.removeListener(refresh);
      chrome.tabs.onDetached.removeListener(refresh);
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabGroups.onUpdated.removeListener(refresh);
      chrome.storage.onChanged.removeListener(storageChanged);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const matches = normalized(search);
  const displayedTabs = useMemo(
    () =>
      tabs.filter(
        (tab) =>
          !matches ||
          normalized((tab.title || '') + ' ' + (tab.url || '')).includes(
            matches,
          ),
      ),
    [tabs, matches],
  );
  const displayedSaved = useMemo(
    () =>
      saved.filter(
        (space) => !matches || normalized(space.name).includes(matches),
      ),
    [saved, matches],
  );
  const sortedGroupIds = useMemo(() => {
    const found = Array.from(new Set(displayedTabs.map((tab) => tab.groupId)));
    return found.sort((a, b) => {
      if (a === NO_GROUP) return 1;
      if (b === NO_GROUP) return -1;
      return a - b;
    });
  }, [displayedTabs]);

  async function openManager(): Promise<void> {
    try {
      if (windowId === null) return;
      const existing = await chrome.tabs.query({ windowId });
      const manager = existing.find((tab) => isTabSpaceManagerPage(tab));
      if (manager?.id !== undefined) {
        await chrome.tabs.update(manager.id, { active: true });
      } else {
        await chrome.tabs.create({
          windowId,
          url: chrome.runtime.getURL(tabverseUrl(TabSpaceOp.New)),
          active: true,
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function openSaved(space: TabSpace): Promise<void> {
    try {
      const existing = (await queryOpenTabSpaces()).find(
        (item) => item.tabSpaceId === space.id,
      );
      if (existing) {
        await switchToOpenTabSpace(existing);
      } else {
        // A saved workspace gets its own window: never replace the user's current work.
        await chrome.windows.create({
          url: chrome.runtime.getURL(
            tabverseUrl(TabSpaceOp.LoadSaved, space.id),
          ),
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  if (locked) {
    return (
      <main className="tv-side-locked" role="status">
        <h1>Cofre bloqueado</h1>
        <p>Desbloqueie o Tabverse no gerenciador para acessar dados salvos.</p>
        <button
          className="tv-side-primary"
          type="button"
          onClick={() => void openManager()}
        >
          Abrir gerenciador
        </button>
      </main>
    );
  }

  return (
    <main className="tv-side-shell">
      <header className="tv-side-header">
        <div className="tv-side-brand">
          <span className="tv-side-brand-icon" aria-hidden="true">
            ▦
          </span>
          <strong>Tabverse</strong>
        </div>
        <button
          type="button"
          className="tv-side-icon-button"
          title="Abrir gerenciador completo"
          aria-label="Abrir gerenciador completo"
          onClick={() => void openManager()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M13 4h7v7M20 4l-10 10M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
          </svg>
        </button>
      </header>
      <div className="tv-side-search">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          ref={searchInput}
          aria-label="Pesquisar abas e espaços salvos"
          placeholder="Pesquisar abas e espaços…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search ? (
          <button
            type="button"
            aria-label="Limpar pesquisa"
            onClick={() => setSearch('')}
          >
            ×
          </button>
        ) : (
          <kbd>⌘ K</kbd>
        )}
      </div>
      <nav className="tv-side-tabs" aria-label="Navegação do painel">
        <button
          type="button"
          className={section === 'tabs' ? 'selected' : ''}
          onClick={() => setSection('tabs')}
          aria-current={section === 'tabs' ? 'page' : undefined}
        >
          Abas <span>{displayedTabs.length}</span>
        </button>
        <button
          type="button"
          className={section === 'saved' ? 'selected' : ''}
          onClick={() => setSection('saved')}
          aria-current={section === 'saved' ? 'page' : undefined}
        >
          Salvos <span>{displayedSaved.length}</span>
        </button>
      </nav>
      <div className="tv-side-content">
        {error ? (
          <p role="alert" className="tv-side-error">
            {error}
          </p>
        ) : null}
        {section === 'tabs' ? (
          displayedTabs.length ? (
            sortedGroupIds.map((groupId) => {
              const rows = displayedTabs.filter(
                (tab) => tab.groupId === groupId,
              );
              const group = groups[groupId];
              return (
                <section key={groupId} aria-label={group?.title || 'Sem grupo'}>
                  <h2 className="tv-side-group">
                    <span
                      className="tv-side-group-dot"
                      data-color={group?.color || 'grey'}
                    />
                    {group?.title || 'Sem grupo'}
                    <span className="tv-side-count">{rows.length}</span>
                  </h2>
                  {rows.map((tab) => (
                    <button
                      className={'tv-side-row' + (tab.active ? ' active' : '')}
                      key={tab.id}
                      type="button"
                      title={tab.title || tab.url || ''}
                      onClick={() =>
                        tab.id !== undefined &&
                        void chrome.tabs
                          .update(tab.id, { active: true })
                          .catch((reason) => setError(String(reason)))
                      }
                    >
                      <span className="tv-side-favicon" aria-hidden="true">
                        {(tab.title || '•').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="tv-side-row-text">
                        <strong>{tab.title || 'Nova aba'}</strong>
                        <small>
                          {tab.url ? hostOf(tab.url) : 'Chrome'}
                        </small>
                      </span>
                      {tab.pinned ? (
                        <span
                          className="tv-side-pinned"
                          title="Fixada"
                          role="img"
                          aria-label="Fixada"
                        >
                          ●
                        </span>
                      ) : null}
                    </button>
                  ))}
                </section>
              );
            })
          ) : (
            <p className="tv-side-empty">Nenhuma aba encontrada.</p>
          )
        ) : displayedSaved.length ? (
          <section aria-label="Espaços salvos">
            <h2 className="tv-side-group">
              Espaços recentes{' '}
              <span className="tv-side-count">{displayedSaved.length}</span>
            </h2>
            {displayedSaved.map((space) => (
              <button
                key={space.id}
                className="tv-side-row"
                type="button"
                onClick={() => void openSaved(space)}
              >
                <span
                  className="tv-side-favicon tv-side-folder"
                  aria-hidden="true"
                >
                  ▤
                </span>
                <span className="tv-side-row-text">
                  <strong>{space.name || 'Sem nome'}</strong>
                  <small>{space.tabs.size} abas salvas</small>
                </span>
                <span className="tv-side-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </section>
        ) : (
          <p className="tv-side-empty">Nenhum espaço salvo encontrado.</p>
        )}
      </div>
      <footer className="tv-side-footer">
        <span className="tv-side-privacy">
          <span aria-hidden="true" className="tv-side-status-dot" />
          Cofre desbloqueado
        </span>
        <button
          type="button"
          className="tv-side-primary"
          onClick={() => void openManager()}
        >
          Abrir gerenciador completo
        </button>
      </footer>
    </main>
  );
}
