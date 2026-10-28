/** Never load a remote favicon from an extension/console UI. */
export const OFFLINE_FAVICON =
  'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2032%2032%22%3E%3Crect%20width=%2232%22%20height=%2232%22%20rx=%226%22%20fill=%22%2394a3b8%22/%3E%3Cpath%20d=%22M10%209h12v14H10z%22%20fill=%22white%22/%3E%3C/svg%3E';

export function offlineFaviconSrc(source: string | undefined | null): string {
  if (
    source &&
    source.length <= 100_000 &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)
  ) {
    return source;
  }
  return OFFLINE_FAVICON;
}
