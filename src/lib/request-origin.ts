export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') || 
    (request.headers.get('referer') ? new URL(request.headers.get('referer')!).origin : null);

  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const directOrigin = new URL(request.url).origin;

    // Direct match with internal request.url
    if (origin === directOrigin) return true;

    // Match with forwarded protocol & host
    const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
    if (hostHeader && (origin === `${proto}://${hostHeader}` || origin === `http://${hostHeader}` || origin === `https://${hostHeader}`)) {
      return true;
    }

    // Match host / hostname (handles reverse-proxy port mapping / SSL termination)
    if (hostHeader) {
      const forwardedHostWithoutPort = hostHeader.split(':')[0];
      const originHostWithoutPort = originUrl.hostname;
      if (originUrl.host === hostHeader || originHostWithoutPort === forwardedHostWithoutPort) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function getClientBaseUrl(request: Request): URL {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  if (host) {
    try {
      return new URL(`${proto}://${host}`);
    } catch {}
  }
  return new URL(request.url);
}
