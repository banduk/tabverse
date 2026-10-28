import React from 'react';
import { ReactElement } from 'react';
import { defaults } from 'lodash';
import { createRoot, type Root } from 'react-dom/client';

export interface IBasePageOptions {
  pageComponent?: ReactElement | null;
  containerDivId?: string;
}

const defaultPageOptions = {
  containerDivId: 'root',
  pageComponent: null,
};

const roots = new WeakMap<Element, Root>();

export function renderPage(props: IBasePageOptions = defaultPageOptions): void {
  const p = defaults(props, defaultPageOptions);
  const container = document.getElementById(p.containerDivId);
  if (p.pageComponent && container) {
    let root = roots.get(container);
    if (!root) {
      root = createRoot(container);
      roots.set(container, root);
    }
    root.render(<>{p.pageComponent}</>);
  } else {
    console.error('PageComponent not provided! Skip render!');
  }
}
