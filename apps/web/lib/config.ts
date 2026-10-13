export function apiBaseUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/api/v1' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid local API address. Check apps/web/.env.example.');
  }
  return value;
}
