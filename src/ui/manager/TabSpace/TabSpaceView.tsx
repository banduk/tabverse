import React, { useState } from 'react';
import SimpleBarReact from 'simplebar-react';
import { TabSpaceListView } from './TabSpaceListView';
import { TabSpaceRightSideView } from '../TabSpaceRightSide/TabSpaceRightSideView';
import classes from './TabSpaceView.module.scss';

export function TabSpaceView() {
  const [showTools, setShowTools] = useState(false);
  return (
    <div className={classes.container}>
      <nav className={classes.mobileSwitch} aria-label="Visualização do espaço">
        <button type="button" aria-pressed={!showTools} onClick={() => setShowTools(false)}>
          Abas
        </button>
        <button type="button" aria-pressed={showTools} onClick={() => setShowTools(true)}>
          Ferramentas
        </button>
      </nav>
      <div className={showTools ? `${classes.columns} ${classes.showTools}` : classes.columns}>
        <div className={classes.mainContainer}>
        <SimpleBarReact autoHide={true} style={{ height: '100%' }}>
          <TabSpaceListView />
        </SimpleBarReact>
      </div>
      <div className={classes.rightSideContainer}>
        <SimpleBarReact autoHide={true} style={{ height: '100%' }}>
          <TabSpaceRightSideView />
        </SimpleBarReact>
      </div>
      </div>
    </div>
  );
}
