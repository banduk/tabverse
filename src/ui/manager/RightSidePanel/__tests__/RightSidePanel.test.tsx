import { expect, test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RightSidePanelShell } from '../RightSidePanel';

const render = (view: 'ai' | null) =>
  renderToStaticMarkup(
    <RightSidePanelShell
      view={view}
      onSelectView={() => undefined}
      onCollapse={() => undefined}
    />,
  );

test('offline rail offers AI history but no remote console', () => {
  const html = render(null);
  expect(html).toContain('Open the AI history');
  expect(html).not.toContain('Server console');
  expect(html).not.toContain('<iframe');
});

test('offline rail opens local AI history', () => {
  const html = render('ai');
  expect(html).toContain('AI history');
  expect(html).toContain('Collapse the right panel');
});
