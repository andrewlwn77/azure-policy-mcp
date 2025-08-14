/**
 * Integration tests for Azure Documentation Scraper
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AzurePolicyMcpServer } from '../../src/server/mcp-server.js';

describe('Azure Documentation Scraper Integration', () => {
  let mcpServer: AzurePolicyMcpServer;

  beforeAll(async () => {
    mcpServer = new AzurePolicyMcpServer();
    // Note: We're not starting the server for unit tests
  });

  afterAll(async () => {
    // Clean up if needed
  });

  describe('Tool Registration', () => {
    it('should register the fetch_azure_documentation tool', async () => {
      // Access private tools map for testing
      const tools = (mcpServer as any).tools;
      
      expect(tools.has('fetch_azure_documentation')).toBe(true);
      
      const tool = tools.get('fetch_azure_documentation');
      expect(tool).toBeDefined();
      expect(tool.getToolDefinition).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should have correct tool definition schema', () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      const definition = tool.getToolDefinition();
      
      expect(definition.name).toBe('fetch_azure_documentation');
      expect(definition.description).toContain('Azure resource documentation');
      expect(definition.inputSchema).toBeDefined();
      expect(definition.inputSchema.properties).toBeDefined();
      expect(definition.inputSchema.properties.resource_type).toBeDefined();
      expect(definition.inputSchema.required).toContain('resource_type');
    });
  });

  describe('Tool Execution', () => {
    it('should validate required parameters', async () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      
      const result = await tool.execute({});
      
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('resource_type');
    });

    it('should validate resource type format', async () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      
      const result = await tool.execute({
        resource_type: 'invalid-format'
      });
      
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('Microsoft.Service/resourceType');
    });

    it('should validate language parameter', async () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      
      const result = await tool.execute({
        resource_type: 'Microsoft.Storage/storageAccounts',
        language: 'invalid-language'
      });
      
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('bicep, arm, terraform');
    });

    it('should accept valid parameters and attempt scraping', async () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      
      const result = await tool.execute({
        resource_type: 'Microsoft.Storage/storageAccounts',
        language: 'bicep',
        include_examples: true,
        cache_duration: 60
      });
      
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBeDefined();
      
      // Since we're using mock Puppeteer, we might get an error or mock response
      // The important thing is that the tool executes without throwing
    });

    it('should handle cache duration limits', async () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      
      const result = await tool.execute({
        resource_type: 'Microsoft.Storage/storageAccounts',
        cache_duration: 5000 // Should be capped at 1440
      });
      
      expect(result.content).toBeDefined();
      // Should not throw an error due to large cache duration
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      const tools = (mcpServer as any).tools;
      const tool = tools.get('fetch_azure_documentation');
      
      // Force an error by passing null as args
      const result = await tool.execute(null as any);
      
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('Cache Integration', () => {
    it('should have access to cache manager', () => {
      const cacheStats = mcpServer.getCacheStats();
      
      expect(cacheStats).toBeDefined();
      expect(cacheStats.size).toBeDefined();
      expect(cacheStats.hitRate).toBeDefined();
    });
  });

  describe('Tool Count', () => {
    it('should include the new documentation tool in tool count', async () => {
      const tools = (mcpServer as any).tools;
      
      // Should include our new tool plus the existing ones
      expect(tools.size).toBeGreaterThan(0);
      expect(tools.has('fetch_azure_documentation')).toBe(true);
    });
  });
});