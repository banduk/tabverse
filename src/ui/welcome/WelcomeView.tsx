import React from 'react';

import { TABSPACE_VERSION } from '../../global';
import { t } from '../../i18n';
import { TabSpaceLogo } from '../common/TabSpaceLogo';
import classes from './WelcomeView.module.scss';

export const WelcomeView = () => {
  const openManager = () => {
    void chrome.tabs.create({
      url: chrome.runtime.getURL('manager.html?op=new'),
    });
  };

  return (
    <div className={classes.shell}>
      <div className={classes.card}>
        <header className={classes.header}>
          <div className={classes.logoContainer}>
            <TabSpaceLogo />
          </div>
          <p className={classes.tagline}>
            {t('aboutTagline')} <span>{TABSPACE_VERSION}</span>
          </p>
        </header>
        <main className={classes.body}>
          <h2 className={classes.heading}>Get started</h2>
          <ol className={classes.steps}>
            <li>
              <strong>Set up your private vault.</strong> Create a local
              passphrase in the Tabverse manager. Your tabs and notes remain
              encrypted on this device.
            </li>
            <li>
              <strong>Use Chrome’s Side Panel.</strong> Pin Tabverse to the
              Chrome toolbar and click its icon to browse current tabs, groups
              and saved workspaces while keeping your page visible.
            </li>
            <li>
              <strong>Manage your workspace.</strong> Open the full manager to
              organize tabs, take notes, save bookmarks and manage tasks.
            </li>
          </ol>
          <button
            className={classes.action}
            type="button"
            onClick={openManager}
          >
            Open manager and unlock vault
          </button>
          <div className={classes.demoPlaceholder}>
            <img
              className={classes.demoMedia}
              src="/static/tabverse-welcome-intro.gif"
              alt="Demonstration of Tabverse tab management"
              loading="lazy"
            />
          </div>
        </main>
      </div>
    </div>
  );
};
