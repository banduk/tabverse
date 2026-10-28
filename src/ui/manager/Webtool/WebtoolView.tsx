import React from 'react';

/** Never load developer-operated remote pages in the offline build. */
export function WebtoolView() {
  return <p>External web tools are disabled in this private build.</p>;
}
