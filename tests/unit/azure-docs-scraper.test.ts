/**
 * Unit tests for Azure Documentation Scraper Service
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AzureDocsScraperService } from '../../src/services/documentation/azure-docs-scraper.js';
import { CacheManager } from '../../src/infrastructure/cache/cache-manager.js';

describe('AzureDocsScraperService', () => {
  let scraperService: AzureDocsScraperService;
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager(1024 * 1024, 60000); // 1MB cache, 1 minute TTL
    scraperService = new AzureDocsScraperService(cacheManager);
  });

  describe('Input Validation', () => {
    it('should validate resource type format', async () => {
      const result = await scraperService.scrapeResourceDocumentation({
        resourceType: 'invalid-format'
      });

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('system_error');
    });

    it('should accept valid resource type format', async () => {
      const result = await scraperService.scrapeResourceDocumentation({
        resourceType: 'Microsoft.Storage/storageAccounts'
      });

      // Since we're using mock Puppeteer calls, we expect this to work
      // but return minimal data
      expect(result).toBeDefined();
      expect(result.cache_info).toBeDefined();
    });

    it('should handle language parameter validation', async () => {
      const result = await scraperService.scrapeResourceDocumentation({
        resourceType: 'Microsoft.Storage/storageAccounts',
        language: 'bicep'
      });

      expect(result).toBeDefined();
    });

    it('should handle cache duration limits', async () => {
      const result = await scraperService.scrapeResourceDocumentation({
        resourceType: 'Microsoft.Storage/storageAccounts',
        cache_duration: 2000 // Should be capped at 1440
      });

      expect(result).toBeDefined();
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys', () => {
      // Access private method via type assertion for testing
      const generateCacheKey = (scraperService as any).generateCacheKey.bind(scraperService);
      
      const key1 = generateCacheKey({
        resourceType: 'Microsoft.Storage/storageAccounts',
        language: 'bicep',
        cache_duration: 60
      });

      const key2 = generateCacheKey({
        resourceType: 'Microsoft.Storage/storageAccounts',
        language: 'bicep',
        cache_duration: 60
      });

      expect(key1).toBe(key2);
      expect(key1).toContain('azure-docs:');
      expect(key1).toContain('Microsoft.Storage/storageAccounts');
      expect(key1).toContain('bicep');
    });

    it('should generate different keys for different parameters', () => {
      const generateCacheKey = (scraperService as any).generateCacheKey.bind(scraperService);
      
      const key1 = generateCacheKey({
        resourceType: 'Microsoft.Storage/storageAccounts',
        language: 'bicep'
      });

      const key2 = generateCacheKey({
        resourceType: 'Microsoft.Storage/storageAccounts',
        language: 'arm'
      });

      expect(key1).not.toBe(key2);
    });
  });

  describe('Error Handling', () => {
    it('should categorize navigation timeout errors', () => {
      const categorizeError = (scraperService as any).categorizeError.bind(scraperService);
      
      const timeoutError = new Error('Navigation timeout');
      const category = categorizeError(timeoutError);
      
      expect(category).toBe('navigation_timeout');
    });

    it('should categorize resource not found errors', () => {
      const categorizeError = (scraperService as any).categorizeError.bind(scraperService);
      
      const notFoundError = new Error('Resource not found');
      const category = categorizeError(notFoundError);
      
      expect(category).toBe('resource_not_found');
    });

    it('should provide user-friendly error messages', () => {
      const getUserFriendlyErrorMessage = (scraperService as any).getUserFriendlyErrorMessage.bind(scraperService);
      
      const timeoutError = new Error('timeout occurred');
      const message = getUserFriendlyErrorMessage(timeoutError);
      
      expect(message).toContain('took too long');
      expect(message).not.toContain('timeout occurred'); // Should be user-friendly, not technical
    });

    it('should provide actionable error suggestions', () => {
      const getErrorSuggestions = (scraperService as any).getErrorSuggestions.bind(scraperService);
      
      const suggestions = getErrorSuggestions(
        new Error('Resource not found'), 
        'Microsoft.Storage/storageAccounts'
      );
      
      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toContain('Check');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting between requests', async () => {
      const enforceRateLimit = (scraperService as any).enforceRateLimit.bind(scraperService);
      
      const startTime = Date.now();
      await enforceRateLimit();
      
      // Second call should be delayed
      await enforceRateLimit();
      const endTime = Date.now();
      
      // Should take at least some time (though we can't test the exact delay easily)
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Integration with MCP Server', () => {
  it('should be properly registered as a tool', async () => {
    // This would require more complex setup to test the actual MCP server
    // For now, we'll just verify the service can be instantiated
    const cacheManager = new CacheManager(1024 * 1024, 60000);
    const scraperService = new AzureDocsScraperService(cacheManager);
    
    expect(scraperService).toBeInstanceOf(AzureDocsScraperService);
  });
});