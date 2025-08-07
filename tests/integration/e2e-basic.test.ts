/**
 * Basic end-to-end tests for MCP server functionality
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AzurePolicyMcpServer } from '../../src/server/mcp-server.js';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Azure Policy MCP Server - Basic E2E Tests', () => {
  let server: AzurePolicyMcpServer;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    server = new AzurePolicyMcpServer();
    mockFetch.mockClear();
    
    // Setup default mock response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);
  });

  test('should initialize server successfully', () => {
    expect(server).toBeDefined();
    expect(server.getCacheStats()).toBeDefined();
  });

  test('should register all expected MCP tools', () => {
    const tools = (server as any).tools;
    const expectedTools = [
      'analyze_policy_requirements',
      'validate_bicep_against_policies', 
      'search_bicep_templates',
      'recommend_bicep_templates',
      'refresh_data_sources'
    ];

    expectedTools.forEach(toolName => {
      expect(tools.has(toolName)).toBe(true);
    });
    expect(tools.size).toBe(5);
  });

  test('should execute policy analysis tool without errors', async () => {
    const tools = (server as any).tools;
    const policyTool = tools.get('analyze_policy_requirements');

    const result = await policyTool.execute({
      resource_types: ['Microsoft.Storage/storageAccounts']
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('applicable policies');
  });

  test('should execute Bicep validation tool successfully', async () => {
    const tools = (server as any).tools;
    const validationTool = tools.get('validate_bicep_against_policies');

    const result = await validationTool.execute({
      bicep_content: `
        resource storageAccount 'Microsoft.Storage/storageAccounts@2021-04-01' = {
          name: 'teststorage'
          location: 'eastus'
        }`
    });

    expect(result.content[0].text).toContain('Policy Validation Results');
  });

  test('should execute template search tool successfully', async () => {
    const tools = (server as any).tools;
    const searchTool = tools.get('search_bicep_templates');

    const result = await searchTool.execute({
      resource_types: ['Microsoft.Storage/storageAccounts']
    });

    expect(result.content[0].text).toContain('Bicep templates');
  });

  test('should execute template recommendation tool successfully', async () => {
    const tools = (server as any).tools;
    const recommendTool = tools.get('recommend_bicep_templates');

    // Mock search tool for recommendations
    const searchTool = tools.get('search_bicep_templates');
    jest.spyOn(searchTool, 'execute').mockResolvedValue({
      content: [{ type: 'text', text: 'Found 0 Bicep templates' }]
    });

    const result = await recommendTool.execute({
      requirements: 'I need a storage account'
    });

    expect(result.content[0].text).toContain('Template Recommendations');
    expect(result.content[0].text).toContain('Generated Bicep Template');
  });

  test('should execute data source refresh tool successfully', async () => {
    const tools = (server as any).tools;
    const refreshTool = tools.get('refresh_data_sources');

    const result = await refreshTool.execute({});

    expect(result.content[0].text).toContain('Data Source Refresh Results');
  });

  test('should generate valid Bicep templates', () => {
    const template = (server as any).generateBasicBicepTemplate(
      ['Microsoft.Storage/storageAccounts'], 
      true, 
      true
    );

    expect(template).toContain('@description');
    expect(template).toContain('param location');
    expect(template).toContain('resource storageAccount');
    expect(template).toContain('Microsoft.Storage/storageAccounts');
    expect(template).toContain('supportsHttpsTrafficOnly: true');
    expect(template).toContain('output');
  });

  test('should extract resource types from Bicep content', () => {
    const bicepContent = `
      resource vm 'Microsoft.Compute/virtualMachines@2021-03-01' = {
        name: 'testvm'
      }
      resource storage 'Microsoft.Storage/storageAccounts@2021-04-01' = {
        name: 'teststorage'
      }`;

    const resourceTypes = (server as any).extractResourceTypesFromBicep(bicepContent);
    
    expect(resourceTypes).toContain('Microsoft.Compute/virtualMachines');
    expect(resourceTypes).toContain('Microsoft.Storage/storageAccounts');
  });

  test('should extract resource types from natural language', () => {
    const text = 'I need a virtual machine and storage account';
    const resourceTypes = (server as any).extractResourceTypesFromText(text);
    
    expect(resourceTypes).toContain('Microsoft.Compute/virtualMachines');
    expect(resourceTypes).toContain('Microsoft.Storage/storageAccounts');
  });

  test('should handle invalid inputs gracefully', async () => {
    const tools = (server as any).tools;
    const policyTool = tools.get('analyze_policy_requirements');

    // Test with invalid resource types
    const result = await policyTool.execute({
      resource_types: []
    });

    expect(result.content[0].text).toContain('applicable policies');
  });

  test('should provide tool definitions with correct schemas', () => {
    const tools = (server as any).tools;
    
    // Test policy analysis tool definition
    const policyTool = tools.get('analyze_policy_requirements');
    const policyDef = policyTool.getToolDefinition();
    
    expect(policyDef.name).toBe('analyze_policy_requirements');
    expect(policyDef.inputSchema.properties.resource_types).toBeDefined();
    expect(policyDef.inputSchema.required).toContain('resource_types');

    // Test recommendation tool definition  
    const recommendTool = tools.get('recommend_bicep_templates');
    const recommendDef = recommendTool.getToolDefinition();
    
    expect(recommendDef.name).toBe('recommend_bicep_templates');
    expect(recommendDef.inputSchema.properties.requirements).toBeDefined();
    expect(recommendDef.inputSchema.required).toContain('requirements');
  });
});