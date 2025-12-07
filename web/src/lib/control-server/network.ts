/**
 * Network Utilities
 *
 * Handles IP address validation, internal network detection, and client IP extraction.
 */

import os from 'os';
import { IncomingMessage } from 'http';

class NetworkUtils {
  private static localIPs: Set<string> = new Set();
  private static privateRanges: Array<{ start: number; end: number }>;
  private static initialized = false;

  private static initialize() {
    if (this.initialized) return;

    this.privateRanges = [
      { start: this.ipToNumber('10.0.0.0'), end: this.ipToNumber('10.255.255.255') },
      { start: this.ipToNumber('172.16.0.0'), end: this.ipToNumber('172.31.255.255') },
      { start: this.ipToNumber('192.168.0.0'), end: this.ipToNumber('192.168.255.255') },
      { start: this.ipToNumber('127.0.0.0'), end: this.ipToNumber('127.255.255.255') },
      { start: this.ipToNumber('169.254.0.0'), end: this.ipToNumber('169.254.255.255') }, // Link-local
    ];

    this.refreshLocalIPs();
    // Refresh local IPs every minute
    setInterval(() => this.refreshLocalIPs(), 60000);
    this.initialized = true;
  }

  private static ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  }

  private static refreshLocalIPs(): void {
    this.localIPs.clear();
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const addrs = interfaces[name];
      if (addrs) {
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            this.localIPs.add(addr.address);
          }
        }
      }
    }
    // Always include localhost variants
    this.localIPs.add('127.0.0.1');
    this.localIPs.add('::1');
  }

  /**
   * Check if an IP address is on the internal/private network
   */
  static isInternalIP(ip: string): boolean {
    this.initialize();

    // Check localhost variants
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }

    // Handle IPv6-mapped IPv4 addresses
    let cleanIP = ip;
    if (ip.startsWith('::ffff:')) {
      cleanIP = ip.substring(7);
    }

    // Remove port if present
    cleanIP = cleanIP.split(':')[0];

    // Check if it's in our local IPs cache
    if (this.localIPs.has(cleanIP)) {
      return true;
    }

    // Check if it's in private IP ranges
    const ipNum = this.ipToNumber(cleanIP);
    if (isNaN(ipNum)) return false;

    for (const range of this.privateRanges) {
      if (ipNum >= range.start && ipNum <= range.end) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract client IP from request, handling proxies
   */
  static getClientIP(req: IncomingMessage): string {
    // Check X-Forwarded-For header (for proxies)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        .split(',')
        .map((ip: string) => ip.trim());
      return ips[0];
    }

    // Check X-Real-IP header
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
      return Array.isArray(realIP) ? realIP[0] : realIP;
    }

    // Fallback to socket remote address
    return req.socket?.remoteAddress || 'unknown';
  }

  /**
   * Get all local network IPs
   */
  static getLocalIPs(): string[] {
    this.initialize();
    return Array.from(this.localIPs).filter(ip => ip !== '::1');
  }
}

export { NetworkUtils };
