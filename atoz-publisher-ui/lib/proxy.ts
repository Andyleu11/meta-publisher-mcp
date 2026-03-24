export function buildProxyUrl(
  apiBase: string,
  pathSegments: string[],
  search: string,
): string {
  const normalizedBase = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const normalizedSearch = search.startsWith("?") || search === "" ? search : `?${search}`;
  return `${normalizedBase}/api/${pathSegments.join("/")}${normalizedSearch}`;
}
