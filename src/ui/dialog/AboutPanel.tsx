import React from 'react';

import { TABSPACE_VERSION } from '../../global';
import { t } from '../../i18n';
import { TabSpaceLogo } from '../common/TabSpaceLogo';
import classes from './AboutPanel.module.scss';

/**
 * The About panel: the brand surface, as a section of the settings dialog.
 *
 * It used to be its own `Dialog` (and before that, the panel *was* the whole
 * dialog surface - a magic `min-height` a couple of pixels taller than its
 * content, whose leftover sliver was the white strip under the logo). As a
 * panel it keeps the same three blocks: the logo, the version, the links.
 */
export function AboutPanel() {
  return (
    <div className={classes.panel}>
      <div className={classes.logoContainer}>
        <TabSpaceLogo />
      </div>
      <div className={classes.otherContainer}>
        <p className={classes.aboutText1}>
          {t('aboutTagline')}
          <br />
          <sub>{TABSPACE_VERSION}</sub>
        </p>
        <p className={classes.aboutText2}>{t('aboutCreatedIn')}</p>
        <p className={classes.aboutText2}>
          Private offline build. No third-party background connections.
        </p>
      </div>
    </div>
  );
}
