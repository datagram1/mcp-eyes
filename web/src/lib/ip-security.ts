/**
 * IP Security Utilities
 *
 * Provides IP-based access control for sensitive endpoints
 */

import { NextRequest } from 'next/server';

/**
 * Allowed LAN subnets for debug API access
 */
const ALLOWED_SUBNETS = [
  '192.168.10.',
  '192.168.11.',
  '127.0.0.1',
  '::1', // IPv6 localhost
  '::ffff:127.0.0.1', // IPv6-mapped IPv4 localhost
];

/**
 * Extract client IP address from Next.js request
 */
export function getClientIP(request: NextRequest): string | null {
  // Check various headers that might contain the real IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, use the first one
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback to connection remote address
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // For local development
  if (request.ip) {
    return request.ip;
  }

  return null;
}

/**
 * Check if an IP address is within allowed LAN subnets
 */
export function isAllowedLANIP(ip: string | null): boolean {
  if (!ip) {
    console.warn('[IP Security] No IP address provided');
    return false;
  }

  // Normalize the IP (remove IPv6 prefix if present)
  const normalizedIP = ip.replace('::ffff:', '');

  // Check if IP matches any allowed subnet
  const isAllowed = ALLOWED_SUBNETS.some(subnet => normalizedIP.startsWith(subnet));

  if (!isAllowed) {
    console.warn(`[IP Security] Blocked access from IP: ${ip} (normalized: ${normalizedIP})`);
  }

  return isAllowed;
}

/**
 * Check if request is from allowed LAN network
 */
export function isLANRequest(request: NextRequest): boolean {
  const clientIP = getClientIP(request);
  return isAllowedLANIP(clientIP);
}
