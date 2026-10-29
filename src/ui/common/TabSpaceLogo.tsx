import { Tooltip } from '@blueprintjs/core';
import React from 'react';

import { t } from '../../i18n';
import { useSidebarActions } from './SidebarContainer';
import classes from './TabSpaceLogo.module.scss';

export interface TabSpaceLogoProps {
  collapsed?: boolean;
  universeShapeStyles?: React.CSSProperties;
  textStyles?: React.CSSProperties;
  text?: string;
}

export const TabSpaceLogo = (props: TabSpaceLogoProps) => {
  const { expandSidebar } = useSidebarActions();
  if (props.collapsed) {
    return (
      <div className={classes.collapsedContainer}>
        <Tooltip content={t('commonExpandSidebar')} placement="right">
          <button
            type="button"
            className={classes.collapsedMarkButton}
            onClick={expandSidebar}
            aria-label={t('commonExpandSidebar')}
          >
            <img
              alt=""
              aria-hidden="true"
              className={classes.collapsedMark}
              src="icons/icon48.png"
            />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={classes.brand}>
      <img
        alt=""
        aria-hidden="true"
        className={classes.mark}
        src="icons/icon48.png"
      />
      <h1 className={classes.logo} style={props.textStyles}>
        {props.text ?? 'Tabverse'}
      </h1>
    </div>
  );
};
