import os from "os";

/** First private IPv4 address of this machine (e.g. 192.168.1.20) — what phones on the same Wi-Fi can reach. */
export function lanAddress(): string | null {
  const nets = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list ?? []) {
      if (n.family !== "IPv4" || n.internal) continue;
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)) candidates.push({ name, address: n.address });
    }
  }
  // prefer Wi-Fi / Ethernet (macOS en0/en1, Linux wlan/eth) over VPN / Docker bridges
  candidates.sort((a, b) => rank(a.name) - rank(b.name));
  return candidates[0]?.address ?? null;
}

function rank(name: string) {
  if (/^en\d|^eth|^wl|^wlan/.test(name)) return 0;
  if (/^(utun|tun|tap|docker|br-|veth|bridge|vmnet|vboxnet)/.test(name)) return 9;
  return 5;
}

/** Replace localhost / 127.0.0.1 in a base URL with the LAN address so a QR code works on phones. */
export function phoneReachable(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    if (!["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(u.hostname)) return baseUrl;
    const ip = lanAddress();
    if (!ip) return baseUrl;
    u.hostname = ip;
    return u.toString().replace(/\/$/, "");
  } catch {
    return baseUrl;
  }
}
