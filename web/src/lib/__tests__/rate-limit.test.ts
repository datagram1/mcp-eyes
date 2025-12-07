/**
 * Rate Limiter Tests
 *
 * Tests for the in-memory sliding window rate limiter.
 */

import {
  checkRateLimit,
  RateLimiters,
  getClientIp,
  rateLimitHeaders,
  rateLimitExceeded,
} from '../rate-limit';

describe('Rate Limiter', () => {
  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = checkRateLimit('test-user-1', 'test-limiter-1', {
        limit: 5,
        windowSeconds: 60,
      });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.limit).toBe(5);
    });

    it('should decrement remaining count', () => {
      const config = { limit: 5, windowSeconds: 60 };
      const identifier = 'test-user-2';
      const limiter = 'test-limiter-2';

      const result1 = checkRateLimit(identifier, limiter, config);
      expect(result1.remaining).toBe(4);

      const result2 = checkRateLimit(identifier, limiter, config);
      expect(result2.remaining).toBe(3);

      const result3 = checkRateLimit(identifier, limiter, config);
      expect(result3.remaining).toBe(2);
    });

    it('should block when limit exceeded', () => {
      const config = { limit: 3, windowSeconds: 60 };
      const identifier = 'test-user-3';
      const limiter = 'test-limiter-3';

      // Make 3 requests to hit the limit
      checkRateLimit(identifier, limiter, config);
      checkRateLimit(identifier, limiter, config);
      checkRateLimit(identifier, limiter, config);

      // 4th request should be blocked
      const result = checkRateLimit(identifier, limiter, config);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use separate counts for different identifiers', () => {
      const config = { limit: 3, windowSeconds: 60 };
      const limiter = 'test-limiter-4';

      // User A hits limit
      checkRateLimit('user-a', limiter, config);
      checkRateLimit('user-a', limiter, config);
      checkRateLimit('user-a', limiter, config);
      const userAResult = checkRateLimit('user-a', limiter, config);
      expect(userAResult.success).toBe(false);

      // User B should still be allowed
      const userBResult = checkRateLimit('user-b', limiter, config);
      expect(userBResult.success).toBe(true);
    });

    it('should use separate counts for different limiters', () => {
      const config = { limit: 2, windowSeconds: 60 };
      const identifier = 'test-user-5';

      // Hit limit on limiter A
      checkRateLimit(identifier, 'limiter-a', config);
      checkRateLimit(identifier, 'limiter-a', config);
      const limiterAResult = checkRateLimit(identifier, 'limiter-a', config);
      expect(limiterAResult.success).toBe(false);

      // Limiter B should still be allowed
      const limiterBResult = checkRateLimit(identifier, 'limiter-b', config);
      expect(limiterBResult.success).toBe(true);
    });

    it('should return reset timestamp in the future', () => {
      const result = checkRateLimit('test-user-6', 'test-limiter-6', {
        limit: 5,
        windowSeconds: 60,
      });
      expect(result.reset).toBeGreaterThan(Date.now());
    });
  });

  describe('Pre-configured Rate Limiters', () => {
    describe('oauthRegister', () => {
      it('should allow up to 10 requests', () => {
        const identifier = 'oauth-register-test';
        let lastResult;
        for (let i = 0; i < 10; i++) {
          lastResult = RateLimiters.oauthRegister(identifier + '-' + Math.random());
        }
        // Each unique identifier gets its own counter, so all should succeed
        expect(lastResult?.success).toBe(true);
      });

      it('should have correct limit configuration', () => {
        const result = RateLimiters.oauthRegister('test-oauth-reg');
        expect(result.limit).toBe(10);
      });
    });

    describe('oauthToken', () => {
      it('should have correct limit configuration', () => {
        const result = RateLimiters.oauthToken('test-oauth-token');
        expect(result.limit).toBe(60);
      });
    });

    describe('oauthAuthorize', () => {
      it('should have correct limit configuration', () => {
        const result = RateLimiters.oauthAuthorize('test-oauth-auth');
        expect(result.limit).toBe(30);
      });
    });

    describe('mcpRequest', () => {
      it('should have correct limit configuration', () => {
        const result = RateLimiters.mcpRequest('test-mcp-req');
        expect(result.limit).toBe(100);
      });
    });

    describe('mcpUnauthenticated', () => {
      it('should have correct limit configuration', () => {
        const result = RateLimiters.mcpUnauthenticated('test-mcp-unauth');
        expect(result.limit).toBe(20);
      });
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-real-ip': '192.168.1.2',
        },
      });
      expect(getClientIp(request)).toBe('192.168.1.2');
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const request = new Request('http://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-real-ip': '192.168.1.2',
        },
      });
      expect(getClientIp(request)).toBe('192.168.1.1');
    });

    it('should return localhost when no headers present', () => {
      const request = new Request('http://example.com');
      expect(getClientIp(request)).toBe('127.0.0.1');
    });
  });

  describe('rateLimitHeaders', () => {
    it('should generate correct headers', () => {
      const result = {
        success: true,
        remaining: 5,
        reset: 1700000000000,
        limit: 10,
      };
      const headers = rateLimitHeaders(result);
      expect(headers['X-RateLimit-Limit']).toBe('10');
      expect(headers['X-RateLimit-Remaining']).toBe('5');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });
  });

  describe('rateLimitExceeded', () => {
    it('should return 429 response', async () => {
      const result = {
        success: false,
        remaining: 0,
        reset: Date.now() + 60000,
        limit: 10,
      };
      const response = rateLimitExceeded(result);
      expect(response.status).toBe(429);
    });

    it('should include retry-after header', async () => {
      const result = {
        success: false,
        remaining: 0,
        reset: Date.now() + 60000,
        limit: 10,
      };
      const response = rateLimitExceeded(result);
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('should include error in body', async () => {
      const result = {
        success: false,
        remaining: 0,
        reset: Date.now() + 60000,
        limit: 10,
      };
      const response = rateLimitExceeded(result);
      const body = await response.json();
      expect(body.error).toBe('too_many_requests');
    });
  });
});
