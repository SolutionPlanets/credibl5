export function getAuthCookieDomain(hostOrHostname: string): string | undefined {
  const rawHost = hostOrHostname.split(":")[0].toLowerCase();

  if (!rawHost || rawHost === "localhost") {
    return undefined;
  }

  // Skip explicit IP hosts in local/dev environments.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rawHost)) {
    return undefined;
  }

  if (rawHost === "replypulse.com" || rawHost.endsWith(".replypulse.com")) {
    return ".replypulse.com";
  }

  return undefined;
}
