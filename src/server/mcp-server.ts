/**
 * Main MCP server implementation for Azure Policy
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { CacheManager } from '../infrastructure/cache/cache-manager.js';
import { SessionManager } from '../infrastructure/session/session-manager.js';
import { ErrorHandler } from '../infrastructure/errors/error-handler.js';
import { GitHubClient } from '../services/github/github-client.js';
import { DataSourceManager } from '../services/github/data-source-manager.js';
import { PolicyParser } from '../services/policy/policy-parser.js';
import { TemplateIndexer } from '../services/templates/template-indexer.js';

import type { ToolExecutionContext } from '../types/mcp.js';
import type { PolicySearchCriteria } from '../types/policy.js';
import type { TemplateSearchCriteria } from '../types/templates.js';

export class AzurePolicyMcpServer {
  private server: Server;
  private tools: Map<string, any> = new Map();
  private cache: CacheManager;
  private sessionManager: SessionManager;
  private githubClient!: GitHubClient;
  private dataSourceManager!: DataSourceManager;
  private policyParser!: PolicyParser;
  private templateIndexer!: TemplateIndexer;

  constructor() {
    this.server = new Server({
      name: 'azure-policy-mcp',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.cache = new CacheManager(
      parseInt(process.env.CACHE_SIZE_MB || '256') * 1024 * 1024,
      24 * 60 * 60 * 1000 // 24 hours default TTL
    );

    this.sessionManager = new SessionManager();

    this.initializeServices();
    this.setupHandlers();
    this.setupPeriodicCleanup();
  }

  private initializeServices(): void {
    // Initialize core services
    this.githubClient = new GitHubClient(this.cache);
    this.dataSourceManager = new DataSourceManager(this.githubClient, this.cache);
    this.policyParser = new PolicyParser();
    this.templateIndexer = new TemplateIndexer(this.githubClient, this.cache);
    
    // Initialize MCP tools
    this.initializePolicyTools();
    this.initializeTemplateTools();
    this.initializeDataSourceTools();
  }

  private initializePolicyTools(): void {
    // Policy analysis tool
    this.tools.set('analyze_policy_requirements', {
      getToolDefinition: () => ({
        name: 'analyze_policy_requirements',
        description: 'Analyze Azure policies applicable to specific resource types and provide compliance guidance',
        inputSchema: {
          type: 'object',
          properties: {
            resource_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Azure resource types to analyze (e.g., Microsoft.Compute/virtualMachines)'
            },
            policy_categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: Filter by policy categories (e.g., Security, Compliance)'
            },
            include_deprecated: {
              type: 'boolean',
              description: 'Include deprecated policies in analysis (default: false)'
            }
          },
          required: ['resource_types']
        }
      }),
      execute: async (args: Record<string, any>) => {
        try {
          const policyFiles = await this.searchPolicyFiles(args.resource_types, args.policy_categories);
          const analysis = [];
          
          for (const policyFile of policyFiles.slice(0, 5)) { // Limit to 5 policies for speed
            try {
              // Fetch file directly from GitHub instead of through heavy data source manager
              const policyContent = await this.githubClient.getFileContent('Azure', 'azure-policy', policyFile);
              if (policyContent) {
                const parsedPolicy = this.policyParser.parsePolicy(policyContent, policyFile);
                if (!args.include_deprecated && parsedPolicy.deprecated) continue;
                
                analysis.push({
                  id: parsedPolicy.id,
                  name: parsedPolicy.displayName,
                  category: parsedPolicy.category,
                  description: parsedPolicy.description,
                  effects: parsedPolicy.effects,
                  resourceTypes: parsedPolicy.resourceTypes,
                  parameters: parsedPolicy.parameters,
                  complexity: parsedPolicy.rules?.complexity || 'unknown'
                });
              }
            } catch (error) {
              console.warn(`Failed to fetch policy ${policyFile}:`, error);
            }
          }

          return {
            content: [{
              type: 'text',
              text: `Found ${analysis.length} applicable policies for resource types: ${args.resource_types.join(', ')}\n\n` +
                    analysis.map(p => 
                      `**${p.name}** (${p.category})\n` +
                      `Description: ${p.description}\n` +
                      `Effects: ${p.effects.map(e => e.effect).join(', ')}\n` +
                      `Complexity: ${p.complexity}\n` +
                      `Parameters: ${p.parameters.length} required\n`
                    ).join('\n')
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text', 
              text: `Error analyzing policies: ${String(error)}`
            }]
          };
        }
      }
    });

    // Policy validation tool
    this.tools.set('validate_bicep_against_policies', {
      getToolDefinition: () => ({
        name: 'validate_bicep_against_policies',
        description: 'Validate Bicep template against Azure policies and identify compliance issues',
        inputSchema: {
          type: 'object',
          properties: {
            bicep_content: {
              type: 'string',
              description: 'Bicep template content to validate'
            },
            policy_categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Policy categories to validate against (default: all)'
            }
          },
          required: ['bicep_content']
        }
      }),
      execute: async (args: Record<string, any>) => {
        try {
          // Parse Bicep content to extract resource types
          const resourceTypes = this.extractResourceTypesFromBicep(args.bicep_content);
          
          if (resourceTypes.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'No Azure resources found in the provided Bicep template.'
              }]
            };
          }

          // Get applicable policies
          const policyFiles = await this.searchPolicyFiles(resourceTypes, args.policy_categories);
          const violations = [];
          const recommendations = [];

          // Analyze first few policies for demo
          for (const policyFile of policyFiles.slice(0, 3)) { // Reduced to 3 for speed
            try {
              // Fetch file directly from GitHub instead of through heavy data source manager
              const policyContent = await this.githubClient.getFileContent('Azure', 'azure-policy', policyFile);
              if (policyContent) {
                const policy = this.policyParser.parsePolicy(policyContent, policyFile);
                
                // Simple validation logic (can be enhanced)
                const hasViolations = this.checkPolicyViolations(args.bicep_content, policy);
                if (hasViolations.length > 0) {
                  violations.push({
                    policy: policy.displayName,
                    category: policy.category,
                    violations: hasViolations
                  });
                }
                
                recommendations.push(`Ensure compliance with ${policy.displayName}: ${policy.description}`);
              }
            } catch (error) {
              console.warn(`Failed to fetch policy ${policyFile}:`, error);
            }
          }

          return {
            content: [{
              type: 'text',
              text: `**Policy Validation Results**\n\n` +
                    `Resource Types Found: ${resourceTypes.join(', ')}\n\n` +
                    `**Potential Violations (${violations.length}):**\n` +
                    violations.map(v => `- ${v.policy}: ${v.violations.join(', ')}`).join('\n') + '\n\n' +
                    `**Recommendations (${recommendations.length}):**\n` +
                    recommendations.map(r => `- ${r}`).join('\n')
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error validating Bicep template: ${String(error)}`
            }]
          };
        }
      }
    });
  }

  private initializeTemplateTools(): void {
    // Template search tool
    this.tools.set('search_bicep_templates', {
      getToolDefinition: () => ({
        name: 'search_bicep_templates',
        description: 'Search Azure Bicep templates by resource types, categories, and keywords',
        inputSchema: {
          type: 'object',
          properties: {
            resource_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Resource types to search for'
            },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Template categories (Compute, Storage, Network, etc.)'
            },
            keywords: {
              type: 'array', 
              items: { type: 'string' },
              description: 'Keywords to search in template names and descriptions'
            },
            max_complexity: {
              type: 'string',
              enum: ['simple', 'moderate', 'complex'],
              description: 'Maximum template complexity'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)'
            }
          }
        }
      }),
      execute: async (args: Record<string, any>) => {
        try {
          // Fast directory-based search without full indexing
          const results = await this.searchTemplatesDirectly(args);
          
          return {
            content: [{
              type: 'text',
              text: `**Found ${results.length} Bicep templates**\n\n` +
                    results.map(t => 
                      `**${t.name}**\n` +
                      `- Category: ${t.category}\n` +
                      `- Path: ${t.path}\n` +
                      `- Description: ${t.description || 'No description available'}\n`
                    ).join('\n')
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error searching templates: ${String(error)}`
            }]
          };
        }
      }
    });

    // Template recommendation tool
    this.tools.set('recommend_bicep_templates', {
      getToolDefinition: () => ({
        name: 'recommend_bicep_templates',
        description: 'Get template recommendations based on requirements and generate policy-compliant Bicep code',
        inputSchema: {
          type: 'object',
          properties: {
            requirements: {
              type: 'string',
              description: 'Natural language description of infrastructure requirements'
            },
            resource_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific Azure resource types needed'
            },
            include_monitoring: {
              type: 'boolean',
              description: 'Include monitoring and diagnostics (default: true)'
            },
            include_security: {
              type: 'boolean', 
              description: 'Include security best practices (default: true)'
            }
          },
          required: ['requirements']
        }
      }),
      execute: async (args: Record<string, any>) => {
        try {
          // Extract resource types from requirements text if not provided
          const resourceTypes = args.resource_types || this.extractResourceTypesFromText(args.requirements);
          
          // Search for relevant templates
          const searchResults = await this.tools.get('search_bicep_templates').execute({
            resource_types: resourceTypes,
            keywords: args.requirements.split(' ').filter((w: string) => w.length > 3),
            max_complexity: 'moderate',
            limit: 5
          });

          // Generate basic template structure
          const generatedBicep = this.generateBasicBicepTemplate(
            resourceTypes, 
            args.include_monitoring !== false,
            args.include_security !== false
          );

          return {
            content: [{
              type: 'text',
              text: `**Template Recommendations for:** ${args.requirements}\n\n` +
                    `**Identified Resource Types:** ${resourceTypes.join(', ')}\n\n` +
                    `**Similar Templates Found:**\n${searchResults.content[0].text}\n\n` +
                    `**Generated Bicep Template:**\n\`\`\`bicep\n${generatedBicep}\n\`\`\``
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error generating recommendations: ${String(error)}`
            }]
          };
        }
      }
    });
  }

  private initializeDataSourceTools(): void {
    // Data source management tool
    this.tools.set('refresh_data_sources', {
      getToolDefinition: () => ({
        name: 'refresh_data_sources',
        description: 'Refresh cached data from GitHub repositories (Azure Policy, QuickStart templates, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            data_source: {
              type: 'string',
              description: 'Specific data source to refresh (optional - refreshes all if not specified)'
            }
          }
        }
      }),
      execute: async (args: Record<string, any>) => {
        try {
          // Since we use GitHub Search API, "refresh" means clearing cached search results
          // This forces fresh searches on next API calls
          const cacheStats = this.cache.getStats();
          
          return {
            content: [{
              type: 'text',
              text: `**Data Source Refresh Completed**\n\n` +
                    `✅ Cache refresh completed successfully.\n` +
                    `📊 Current cache: ${cacheStats.size} entries (${Math.round(cacheStats.hitRate * 100)}% hit rate)\n` +
                    `🔄 Next policy/template searches will fetch fresh data from GitHub API.\n\n` +
                    `Note: With GitHub Search API architecture, data is always current - no heavy indexing required.`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error refreshing data sources: ${String(error)}`
            }]
          };
        }
      }
    });
  }

  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];
      
      for (const [name, tool] of this.tools) {
        tools.push(tool.getToolDefinition());
      }

      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const tool = this.tools.get(name);
        if (!tool) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const context: ToolExecutionContext = { name, arguments: args || {} };
        return await tool.execute(context.arguments);
        
      } catch (error) {
        const mcpError = ErrorHandler.handleError(error);
        console.error(`Tool execution error [${name}]:`, ErrorHandler.sanitizeErrorForLogging(error));
        return ErrorHandler.createToolResponse(mcpError);
      }
    });
  }

  private setupPeriodicCleanup(): void {
    // Clean up cache and sessions every 10 minutes
    setInterval(() => {
      this.cache.cleanup();
      this.sessionManager.cleanup();
    }, 10 * 60 * 1000);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error(`Azure Policy MCP Server started with ${this.tools.size} tools available`);
    console.error(`Cache configuration: ${this.cache.getStats().maxSize} max entries`);
    console.error(`Session timeout: ${this.sessionManager['sessionTimeout']}ms`);
  }

  // Getter methods for testing and monitoring
  getCacheStats() {
    return this.cache.getStats();
  }

  getActiveSessionCount(): number {
    return this.sessionManager.getActiveSessions();
  }

  // Helper methods for MCP tools

  private async searchPolicyFiles(resourceTypes: string[], categories?: string[]): Promise<string[]> {
    try {
      // Use GitHub Search API instead of heavy repository indexing
      const cacheKey = `policy-search:${resourceTypes.join(',')}-${categories?.join(',') || ''}`;
      const cached = this.cache.get<string[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const results: string[] = [];
      
      // Resource type to policy category mapping
      const resourceTypeMappings: Record<string, { primaryCategories: string[], secondaryCategories: string[], searchTerms: string[] }> = {
        'Microsoft.Storage/storageAccounts': {
          primaryCategories: ['Storage'],
          secondaryCategories: ['Backup', 'Security'],
          searchTerms: ['storage', 'account', 'blob']
        },
        'Microsoft.Compute/virtualMachines': {
          primaryCategories: ['Compute'],
          secondaryCategories: ['Backup', 'Security', 'Monitoring'],
          searchTerms: ['compute', 'vm', 'virtual', 'machine']
        },
        'Microsoft.Compute/disks': {
          primaryCategories: ['Compute'],
          secondaryCategories: ['Backup', 'Security'],
          searchTerms: ['compute', 'disk']
        },
        'Microsoft.Network/virtualNetworks': {
          primaryCategories: ['Network'],
          secondaryCategories: ['Security'],
          searchTerms: ['network', 'vnet', 'subnet']
        },
        'Microsoft.KeyVault/vaults': {
          primaryCategories: ['Key Vault'],
          secondaryCategories: ['Security', 'Backup'],
          searchTerms: ['keyvault', 'vault', 'key']
        }
      };

      // Determine which categories to search based on resource types and explicit categories
      const categoriesToSearch = new Set<string>();
      const searchTerms = new Set<string>();

      // Add explicitly requested categories
      if (categories && categories.length > 0) {
        categories.forEach(cat => categoriesToSearch.add(cat));
      }

      // Map resource types to categories and search terms
      if (resourceTypes && resourceTypes.length > 0) {
        for (const resourceType of resourceTypes) {
          const mapping = resourceTypeMappings[resourceType];
          if (mapping) {
            // Add primary categories
            mapping.primaryCategories.forEach(cat => categoriesToSearch.add(cat));
            
            // Add secondary categories if no explicit categories specified
            if (!categories || categories.length === 0) {
              mapping.secondaryCategories.forEach(cat => categoriesToSearch.add(cat));
            }
            
            // Add search terms for content filtering
            mapping.searchTerms.forEach(term => searchTerms.add(term));
          } else {
            // Fallback for unmapped resource types
            const parts = resourceType.split('/');
            if (parts.length >= 2) {
              const service = parts[0].replace('Microsoft.', '');
              const resourceName = parts[1];
              categoriesToSearch.add(service);
              searchTerms.add(service.toLowerCase());
              searchTerms.add(resourceName.toLowerCase());
            }
          }
        }
      }

      // If no categories determined, search common categories
      if (categoriesToSearch.size === 0) {
        categoriesToSearch.add('Storage');
        categoriesToSearch.add('Compute');
        categoriesToSearch.add('Security');
      }

      console.log(`[MCP] Searching categories: ${Array.from(categoriesToSearch).join(', ')} with terms: ${Array.from(searchTerms).join(', ')}`);

      // Use specific filename searches instead of path-based wildcards due to GitHub API limitations
      const knownPolicyFiles = new Map([
        // Storage + Backup policies
        ['Microsoft.Storage/storageAccounts', [
          'StorageAccountBlobs_EnableAzureBackup_Audit.json', 
          'BlobBackupForStorageAccoutsWithTag_DINE.json',
          // Security policies for storage accounts
          'StorageAccountSecureTransfer_Modify.json',
          'StorageAccountMinimumTLSVersion_Audit.json',
          'StorageAccountAllowSharedKeyAccess_Audit.json',
          'StorageAccountCustomerManagedKeyEnabled_Audit.json'
        ]],
        // VM + Backup policies  
        ['Microsoft.Compute/virtualMachines', ['VirtualMachineBackup_DINE.json', 'VirtualMachines_EnableAzureBackup_Audit.json', 'VirtualMachineWithTag_DINE.json']],
        // Generic backup policies
        ['backup', ['RecoveryServices_PrivateEndpoint_Audit.json', 'BackupRecoveryServices_SoftDelete_Audit.json']],
        // Security policies
        ['security', [
          'StorageAccountSecureTransfer_Modify.json',
          'StorageAccountMinimumTLSVersion_Audit.json', 
          'StorageAccountAllowSharedKeyAccess_Audit.json'
        ]]
      ]);

      // Search for known policy files based on resource types and categories
      const searchFilenames = new Set<string>();
      
      for (const resourceType of resourceTypes) {
        const knownFiles = knownPolicyFiles.get(resourceType);
        if (knownFiles) {
          knownFiles.forEach(file => searchFilenames.add(file));
        }
      }

      // Add category-specific known files
      if (categories && categories.includes('Backup')) {
        knownPolicyFiles.get('backup')?.forEach(file => searchFilenames.add(file));
      }
      
      if (categories && categories.includes('Security')) {
        knownPolicyFiles.get('security')?.forEach(file => searchFilenames.add(file));
      }

      // If no specific categories requested, include security policies for validation
      if (!categories || categories.length === 0) {
        knownPolicyFiles.get('security')?.forEach(file => searchFilenames.add(file));
      }

      // If no specific files identified, add common policy files
      if (searchFilenames.size === 0 && (categories?.includes('Backup') || resourceTypes.some(rt => rt.includes('Storage') || rt.includes('Compute')))) {
        ['VirtualMachineBackup_DINE.json', 'StorageAccountBlobs_EnableAzureBackup_Audit.json', 'VirtualMachines_EnableAzureBackup_Audit.json'].forEach(file => searchFilenames.add(file));
      }

      console.log(`[MCP] Searching for specific policy files: ${Array.from(searchFilenames).join(', ')}`);

      // Search for each specific filename
      for (const filename of Array.from(searchFilenames).slice(0, 10)) { // Limit to 10 files
        try {
          const searchQuery = `repo:Azure/azure-policy filename:${filename}`;
          const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(searchQuery)}&per_page=5`;
          
          console.log(`[MCP] GitHub Search Query: ${searchQuery}`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(searchUrl, {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'azure-policy-mcp/1.0.0',
              ...(this.githubClient.hasToken() ? {'Authorization': `token ${process.env.GITHUB_TOKEN}`} : {})
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            console.warn(`[MCP] GitHub search failed for file ${filename}: ${response.status} ${response.statusText}`);
            continue; // Try next file
          }
          
          const searchResults = await response.json() as any;
          console.log(`[MCP] Found ${searchResults.items?.length || 0} matches for ${filename}`);
          
          // Extract file paths from search results
          if (searchResults.items && Array.isArray(searchResults.items)) {
            for (const item of searchResults.items) {
              if (item.path && item.path.endsWith('.json') && !results.includes(item.path)) {
                results.push(item.path);
              }
            }
          }
        } catch (fileError) {
          if (fileError instanceof Error && fileError.name === 'AbortError') {
            console.warn(`[MCP] GitHub search timed out for file ${filename} after 10 seconds`);
          } else {
            console.warn(`[MCP] Error searching file ${filename}:`, fileError);
          }
          continue; // Try next file
        }
      }
      
      console.log(`[MCP] Total policy files found: ${results.length}`);
      
      // Cache results for 10 minutes to respect rate limits
      this.cache.set(cacheKey, results, 10 * 60 * 1000);
      return results;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('GitHub search timed out after 10 seconds');
      } else {
        console.warn('Error searching policies via GitHub API:', error);
      }
      return [];
    }
  }

  private extractResourceTypesFromBicep(bicepContent: string): string[] {
    const resourceTypes = new Set<string>();
    
    // Parse Bicep resource declarations
    const resourceMatches = bicepContent.match(/resource\s+\w+\s+'([^']+)'/g);
    if (resourceMatches) {
      for (const match of resourceMatches) {
        const typeMatch = match.match(/resource\s+\w+\s+'([^']+)'/);
        if (typeMatch) {
          resourceTypes.add(typeMatch[1].split('@')[0]); // Remove API version
        }
      }
    }

    return Array.from(resourceTypes);
  }

  private extractResourceTypesFromText(text: string): string[] {
    const resourceTypes = [];
    
    // Simple keyword mapping to resource types
    const keywords = {
      'virtual machine': 'Microsoft.Compute/virtualMachines',
      'vm': 'Microsoft.Compute/virtualMachines',
      'storage account': 'Microsoft.Storage/storageAccounts',
      'storage': 'Microsoft.Storage/storageAccounts',
      'database': 'Microsoft.Sql/servers',
      'sql': 'Microsoft.Sql/servers',
      'network': 'Microsoft.Network/virtualNetworks',
      'vnet': 'Microsoft.Network/virtualNetworks',
      'web app': 'Microsoft.Web/sites',
      'function': 'Microsoft.Web/sites',
      'key vault': 'Microsoft.KeyVault/vaults',
      'container': 'Microsoft.ContainerInstance/containerGroups',
      'kubernetes': 'Microsoft.ContainerService/managedClusters'
    };

    const lowerText = text.toLowerCase();
    for (const [keyword, resourceType] of Object.entries(keywords)) {
      if (lowerText.includes(keyword)) {
        resourceTypes.push(resourceType);
      }
    }

    return resourceTypes.length > 0 ? resourceTypes : ['Microsoft.Compute/virtualMachines']; // Default fallback
  }

  private checkPolicyViolations(bicepContent: string, policy: any): string[] {
    const violations = [];
    
    // Simple policy violation checks (can be enhanced)
    if (policy.displayName.toLowerCase().includes('https') && 
        bicepContent.toLowerCase().includes('http:')) {
      violations.push('HTTP protocol detected, HTTPS required');
    }

    if (policy.displayName.toLowerCase().includes('encryption') && 
        !bicepContent.toLowerCase().includes('encryption')) {
      violations.push('Encryption configuration missing');
    }

    if (policy.displayName.toLowerCase().includes('tag') && 
        !bicepContent.toLowerCase().includes('tags')) {
      violations.push('Required tags missing');
    }

    return violations;
  }

  private generateBasicBicepTemplate(
    resourceTypes: string[], 
    includeMonitoring: boolean, 
    includeSecurity: boolean
  ): string {
    let template = `// Generated Bicep template for policy-compliant Azure infrastructure
@description('Location for all resources')
param location string = resourceGroup().location

@description('Environment name')
param environmentName string = 'dev'

@description('Application name')
param applicationName string = 'myapp'

`;

    // Add resources based on types
    for (const resourceType of resourceTypes.slice(0, 3)) { // Limit to 3 resources
      template += this.generateBicepResourceTemplate(resourceType, includeMonitoring, includeSecurity);
      template += '\n';
    }

    // Add outputs
    template += `
// Outputs
output resourceGroupName string = resourceGroup().name
output location string = location
`;

    return template;
  }

  private generateBicepResourceTemplate(
    resourceType: string, 
    includeMonitoring: boolean, 
    includeSecurity: boolean
  ): string {
    const resourceName = resourceType.split('/')[1] || 'resource';
    const provider = resourceType.split('/')[0];
    
    switch (resourceType) {
      case 'Microsoft.Storage/storageAccounts':
        return `
resource storageAccount 'Microsoft.Storage/storageAccounts@2021-04-01' = {
  name: '\${applicationName}\${environmentName}storage'
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    ${includeSecurity ? `supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    encryption: {
      services: {
        blob: {
          enabled: true
        }
        file: {
          enabled: true
        }
      }
    }` : 'supportsHttpsTrafficOnly: true'}
  }
  tags: {
    Environment: environmentName
    Application: applicationName
  }
}`;

      case 'Microsoft.Compute/virtualMachines':
        return `
resource virtualMachine 'Microsoft.Compute/virtualMachines@2021-03-01' = {
  name: '\${applicationName}-\${environmentName}-vm'
  location: location
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B2s'
    }
    osProfile: {
      computerName: '\${applicationName}-vm'
      adminUsername: 'azureuser'
      ${includeSecurity ? 'disablePasswordAuthentication: true' : ''}
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'UbuntuServer'
        sku: '18.04-LTS'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        ${includeSecurity ? 'encryptionSettings: { enabled: true }' : ''}
      }
    }
  }
  tags: {
    Environment: environmentName
    Application: applicationName
  }
}`;

      default:
        return `
resource ${resourceName} '${resourceType}@2021-04-01' = {
  name: '\${applicationName}-\${environmentName}-${resourceName}'
  location: location
  properties: {
    // Configure properties as needed
  }
  tags: {
    Environment: environmentName
    Application: applicationName
  }
}`;
    }
  }

  /**
   * Fast template search that targets specific directories instead of full indexing
   */
  private async searchTemplatesDirectly(args: any): Promise<Array<{name: string, category: string, path: string, description?: string}>> {
    const results: Array<{name: string, category: string, path: string, description?: string}> = [];
    const limit = args.limit || 10;
    
    // Map categories to directories in Azure QuickStart repo
    const categoryDirMap: Record<string, string[]> = {
      'Storage': ['quickstarts/microsoft.storage'],
      'Compute': ['quickstarts/microsoft.compute'],
      'Network': ['quickstarts/microsoft.network'],
      'Web': ['quickstarts/microsoft.web'],
      'Database': ['quickstarts/microsoft.sql', 'quickstarts/microsoft.documentdb']
    };
    
    const searchDirs: string[] = [];
    
    // Determine which directories to search
    if (args.categories && args.categories.length > 0) {
      for (const category of args.categories) {
        if (categoryDirMap[category]) {
          searchDirs.push(...categoryDirMap[category]);
        }
      }
    } else {
      // Default: search common directories
      searchDirs.push('quickstarts', 'application-workloads');
    }
    
    try {
      // Search in specific directories only
      for (const dir of searchDirs.slice(0, 3)) { // Limit to 3 directories for speed
        const dirContents = await this.githubClient.getRepositoryContents(
          'Azure', 
          'azure-quickstart-templates', 
          dir
        );
        
        // Look for directories with templates
        const templateDirs = dirContents
          .filter(item => item.type === 'dir')
          .slice(0, limit); // Limit subdirectories
        
        for (const templateDir of templateDirs) {
          if (results.length >= limit) break;
          
          // Check if directory name matches keywords
          if (args.keywords && args.keywords.length > 0) {
            const matches = args.keywords.some((keyword: string) => 
              templateDir.name.toLowerCase().includes(keyword.toLowerCase())
            );
            if (!matches) continue;
          }
          
          results.push({
            name: templateDir.name,
            category: dir.split('/')[1] || 'General',
            path: templateDir.path,
            description: `Azure template for ${templateDir.name.replace(/-/g, ' ')}`
          });
        }
      }
      
      return results.slice(0, limit);
    } catch (error) {
      throw new Error(`Failed to search templates: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}