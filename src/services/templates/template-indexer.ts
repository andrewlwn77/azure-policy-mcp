/**
 * Template Indexing System for Azure Bicep templates
 */

import { GitHubClient } from '../github/github-client.js';
import { CacheManager } from '../../infrastructure/cache/cache-manager.js';
import type { 
  DataSourceConfig, 
  GitHubRepositoryContent 
} from '../../types/github.js';
import type {
  BicepTemplate,
  TemplateIndex,
  TemplateMetadata,
  TemplateSearchCriteria,
  TemplateCategory,
  ResourceTypeInfo
} from '../../types/templates.js';

export class TemplateIndexer {
  private readonly bicepExtensions = ['.bicep', '.json'];
  private readonly metadataFiles = ['README.md', 'metadata.json', 'azuredeploy.parameters.json'];
  
  constructor(
    private githubClient: GitHubClient,
    private cache: CacheManager
  ) {}

  /**
   * Index templates from a data source
   */
  async indexTemplates(config: DataSourceConfig): Promise<TemplateIndex> {
    const cacheKey = `template-index:${config.owner}/${config.repo}/${config.branch || 'master'}`;
    const cached = this.cache.get<TemplateIndex>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const repositoryIndex = await this.githubClient.indexRepository(config);
    const templates: BicepTemplate[] = [];
    const categories = new Map<string, number>();
    const resourceTypes = new Map<string, ResourceTypeInfo>();

    // Filter for template files
    const templateFiles = repositoryIndex.files.filter(file => 
      this.bicepExtensions.some(ext => file.name.endsWith(ext)) ||
      file.name === 'azuredeploy.json' ||
      file.name === 'mainTemplate.json'
    );

    // Process templates in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < templateFiles.length; i += batchSize) {
      const batch = templateFiles.slice(i, i + batchSize);
      const batchPromises = batch.map(file => 
        this.processTemplateFile(config, file, repositoryIndex.files)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          templates.push(result.value);
          
          // Update categories count
          const category = result.value.metadata.category;
          categories.set(category, (categories.get(category) || 0) + 1);
          
          // Update resource types
          for (const resourceType of result.value.resourceTypes) {
            const existing = resourceTypes.get(resourceType.type);
            if (existing) {
              existing.templateCount++;
            } else {
              resourceTypes.set(resourceType.type, {
                type: resourceType.type,
                templateCount: 1,
                commonProperties: new Set(resourceType.properties),
                provider: resourceType.provider
              });
            }
          }
        }
      }

      // Add delay between batches to be respectful to GitHub API
      if (i + batchSize < templateFiles.length) {
        await this.sleep(500);
      }
    }

    const index: TemplateIndex = {
      lastUpdated: Date.now(),
      totalTemplates: templates.length,
      templates,
      categories: Object.fromEntries(categories),
      resourceTypes: Object.fromEntries(
        Array.from(resourceTypes.entries()).map(([key, value]) => [
          key, 
          { ...value, commonProperties: Array.from(value.commonProperties) }
        ])
      ),
      dataSource: {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch || 'master',
        ...(config.basePath && { basePath: config.basePath })
      }
    };

    // Cache for 4 hours
    this.cache.set(cacheKey, index, 4 * 3600000);
    return index;
  }

  /**
   * Process a single template file
   */
  private async processTemplateFile(
    config: DataSourceConfig,
    file: GitHubRepositoryContent,
    allFiles: GitHubRepositoryContent[]
  ): Promise<BicepTemplate | null> {
    try {
      const content = await this.githubClient.getRawFileContent(
        config.owner,
        config.repo,
        file.path,
        config.branch
      );

      const metadata = await this.extractTemplateMetadata(
        config, 
        file, 
        allFiles, 
        content
      );

      const resourceTypes = await this.extractResourceTypes(content, file.name);
      const parameters = await this.extractParameters(content, file.name);
      const outputs = await this.extractOutputs(content, file.name);

      return {
        id: this.generateTemplateId(config, file.path),
        name: this.extractTemplateName(file.path),
        path: file.path,
        fileName: file.name,
        size: file.size,
        content: content,
        metadata,
        resourceTypes,
        parameters,
        outputs,
        lastModified: Date.now(), // GitHub doesn't provide this in contents API
        complexity: this.assessComplexity(resourceTypes, parameters, outputs)
      };

    } catch (error) {
      console.warn(`Failed to process template ${file.path}:`, error);
      return null;
    }
  }

  /**
   * Extract template metadata from README, metadata files, and template content
   */
  private async extractTemplateMetadata(
    config: DataSourceConfig,
    templateFile: GitHubRepositoryContent,
    allFiles: GitHubRepositoryContent[],
    templateContent: string
  ): Promise<TemplateMetadata> {
    const directory = templateFile.path.substring(0, templateFile.path.lastIndexOf('/'));
    
    // Look for metadata files in the same directory
    const metadataFile = allFiles.find(f => 
      f.path.startsWith(directory) && 
      this.metadataFiles.some(name => f.name.toLowerCase() === name.toLowerCase())
    );

    let description = '';
    let category: TemplateCategory = 'General';
    const tags: string[] = [];

    if (metadataFile) {
      try {
        const metadataContent = await this.githubClient.getRawFileContent(
          config.owner,
          config.repo,
          metadataFile.path,
          config.branch
        );

        if (metadataFile.name.toLowerCase().includes('readme')) {
          // Extract description from README
          const match = metadataContent.match(/^#\s+(.+)$/m);
          if (match) description = match[1];
          
          // Extract tags from README
          const tagMatch = metadataContent.match(/(?:tags?|keywords?):\s*(.+)/i);
          if (tagMatch) {
            tags.push(...tagMatch[1].split(/[,\s]+/).filter(t => t.length > 0));
          }
        } else if (metadataFile.name.includes('metadata.json')) {
          // Parse JSON metadata
          const metadata = JSON.parse(metadataContent);
          description = metadata.description || description;
          if (metadata.tags) tags.push(...metadata.tags);
        }
      } catch (error) {
        console.warn(`Failed to parse metadata file ${metadataFile.path}:`, error);
      }
    }

    // Infer category from path or content
    category = this.inferCategory(templateFile.path, templateContent, description);

    // Extract description from template content if not found
    if (!description) {
      description = this.extractDescriptionFromTemplate(templateContent, templateFile.name);
    }

    return {
      description: description || `Template: ${templateFile.name}`,
      category,
      tags,
      author: 'Microsoft', // Most Azure templates are from Microsoft
      version: '1.0.0', // Default version
      createdDate: Date.now(),
      updatedDate: Date.now()
    };
  }

  /**
   * Extract resource types from template content
   */
  private async extractResourceTypes(content: string, fileName: string): Promise<Array<{
    type: string;
    provider: string;
    properties: string[];
  }>> {
    const resourceTypes: Array<{
      type: string;
      provider: string;
      properties: string[];
    }> = [];

    try {
      if (fileName.endsWith('.bicep')) {
        // Parse Bicep resources
        const resourceMatches = content.match(/resource\s+\w+\s+'([^']+)'[^{]*{([^}]*)}/g);
        if (resourceMatches) {
          for (const match of resourceMatches) {
            const typeMatch = match.match(/resource\s+\w+\s+'([^']+)'/);
            if (typeMatch) {
              const resourceType = typeMatch[1];
              const provider = resourceType.split('/')[0];
              const properties = this.extractBicepProperties(match);
              
              resourceTypes.push({
                type: resourceType,
                provider,
                properties
              });
            }
          }
        }
      } else {
        // Parse JSON ARM template
        const template = JSON.parse(content);
        if (template.resources && Array.isArray(template.resources)) {
          for (const resource of template.resources) {
            if (resource.type) {
              const provider = resource.type.split('/')[0];
              const properties = resource.properties ? Object.keys(resource.properties) : [];
              
              resourceTypes.push({
                type: resource.type,
                provider,
                properties
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse resource types from ${fileName}:`, error);
    }

    return resourceTypes;
  }

  /**
   * Extract parameters from template
   */
  private async extractParameters(content: string, fileName: string): Promise<Array<{
    name: string;
    type: string;
    description?: string;
    defaultValue?: any;
    allowedValues?: any[];
  }>> {
    const parameters: Array<{
      name: string;
      type: string;
      description?: string;
      defaultValue?: any;
      allowedValues?: any[];
    }> = [];

    try {
      if (fileName.endsWith('.bicep')) {
        // Parse Bicep parameters
        const paramMatches = content.match(/param\s+(\w+)\s+(\w+)(?:\s*=\s*([^'\n]+))?/g);
        if (paramMatches) {
          for (const match of paramMatches) {
            const parts = match.match(/param\s+(\w+)\s+(\w+)(?:\s*=\s*([^'\n]+))?/);
            if (parts) {
              parameters.push({
                name: parts[1],
                type: parts[2],
                defaultValue: parts[3] ? parts[3].trim() : undefined
              });
            }
          }
        }
      } else {
        // Parse JSON ARM template parameters
        const template = JSON.parse(content);
        if (template.parameters) {
          for (const [name, param] of Object.entries(template.parameters as Record<string, any>)) {
            parameters.push({
              name,
              type: param.type,
              description: param.metadata?.description,
              defaultValue: param.defaultValue,
              allowedValues: param.allowedValues
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse parameters from ${fileName}:`, error);
    }

    return parameters;
  }

  /**
   * Extract outputs from template
   */
  private async extractOutputs(content: string, fileName: string): Promise<Array<{
    name: string;
    type: string;
    description?: string;
  }>> {
    const outputs: Array<{
      name: string;
      type: string;
      description?: string;
    }> = [];

    try {
      if (fileName.endsWith('.bicep')) {
        // Parse Bicep outputs
        const outputMatches = content.match(/output\s+(\w+)\s+(\w+)\s*=/g);
        if (outputMatches) {
          for (const match of outputMatches) {
            const parts = match.match(/output\s+(\w+)\s+(\w+)/);
            if (parts) {
              outputs.push({
                name: parts[1],
                type: parts[2]
              });
            }
          }
        }
      } else {
        // Parse JSON ARM template outputs
        const template = JSON.parse(content);
        if (template.outputs) {
          for (const [name, output] of Object.entries(template.outputs as Record<string, any>)) {
            outputs.push({
              name,
              type: output.type,
              description: output.metadata?.description
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to parse outputs from ${fileName}:`, error);
    }

    return outputs;
  }

  /**
   * Search templates based on criteria
   */
  async searchTemplates(
    templateIndex: TemplateIndex, 
    criteria: TemplateSearchCriteria
  ): Promise<BicepTemplate[]> {
    let results = templateIndex.templates;

    // Filter by categories
    if (criteria.categories && criteria.categories.length > 0) {
      results = results.filter(t => criteria.categories!.includes(t.metadata.category));
    }

    // Filter by resource types
    if (criteria.resourceTypes && criteria.resourceTypes.length > 0) {
      results = results.filter(t => 
        t.resourceTypes.some(rt => 
          criteria.resourceTypes!.some(searchType => 
            rt.type.includes(searchType) || searchType.includes(rt.type)
          )
        )
      );
    }

    // Filter by keywords
    if (criteria.keywords && criteria.keywords.length > 0) {
      results = results.filter(t => {
        const searchText = `${t.name} ${t.metadata.description} ${t.metadata.tags.join(' ')}`.toLowerCase();
        return criteria.keywords!.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );
      });
    }

    // Filter by complexity
    if (criteria.maxComplexity) {
      const complexityOrder = { 'simple': 1, 'moderate': 2, 'complex': 3 };
      const maxLevel = complexityOrder[criteria.maxComplexity];
      results = results.filter(t => complexityOrder[t.complexity] <= maxLevel);
    }

    // Sort results
    if (criteria.sortBy) {
      results = this.sortTemplates(results, criteria.sortBy);
    }

    // Limit results
    if (criteria.limit && criteria.limit > 0) {
      results = results.slice(0, criteria.limit);
    }

    return results;
  }

  // Helper methods

  private generateTemplateId(config: DataSourceConfig, path: string): string {
    return `${config.owner}/${config.repo}/${path}`;
  }

  private extractTemplateName(path: string): string {
    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(bicep|json)$/, '');
  }

  private inferCategory(path: string, content: string, description: string): TemplateCategory {
    const text = `${path} ${content} ${description}`.toLowerCase();
    
    const categoryKeywords = {
      'Compute': ['vm', 'virtual machine', 'compute', 'scale set'],
      'Storage': ['storage', 'blob', 'file', 'queue', 'table'],
      'Network': ['network', 'vnet', 'subnet', 'nsg', 'load balancer'],
      'Database': ['sql', 'database', 'cosmos', 'mysql', 'postgresql'],
      'Web': ['web', 'app service', 'function', 'logic app'],
      'Identity': ['active directory', 'identity', 'rbac', 'managed identity'],
      'Security': ['key vault', 'security', 'certificate', 'firewall'],
      'Monitoring': ['monitor', 'log analytics', 'application insights'],
      'Container': ['container', 'kubernetes', 'aks', 'docker'],
      'AI': ['cognitive', 'machine learning', 'ai', 'bot']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category as TemplateCategory;
      }
    }

    return 'General';
  }

  private extractDescriptionFromTemplate(content: string, fileName: string): string {
    try {
      if (fileName.endsWith('.bicep')) {
        // Look for description decorators or comments
        const decoratorMatch = content.match(/@description\('([^']+)'\)/);
        if (decoratorMatch) return decoratorMatch[1];
        
        const commentMatch = content.match(/\/\/\s*(.+)/);
        if (commentMatch) return commentMatch[1];
      } else {
        // Look for description in JSON metadata
        const template = JSON.parse(content);
        if (template.metadata?.description) {
          return template.metadata.description;
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return '';
  }

  private extractBicepProperties(resourceContent: string): string[] {
    const properties: string[] = [];
    const propertyMatches = resourceContent.match(/(\w+):/g);
    
    if (propertyMatches) {
      for (const match of propertyMatches) {
        properties.push(match.replace(':', ''));
      }
    }
    
    return properties;
  }

  private assessComplexity(
    resourceTypes: Array<{ type: string; provider: string; properties: string[] }>,
    parameters: Array<{ name: string; type: string }>,
    outputs: Array<{ name: string; type: string }>
  ): 'simple' | 'moderate' | 'complex' {
    const resourceCount = resourceTypes.length;
    const parameterCount = parameters.length;
    const outputCount = outputs.length;
    const totalComplexity = resourceCount + parameterCount * 0.5 + outputCount * 0.3;

    if (totalComplexity <= 3) return 'simple';
    if (totalComplexity <= 10) return 'moderate';
    return 'complex';
  }

  private sortTemplates(templates: BicepTemplate[], sortBy: string): BicepTemplate[] {
    switch (sortBy) {
      case 'name':
        return templates.sort((a, b) => a.name.localeCompare(b.name));
      case 'complexity':
        const complexityOrder = { 'simple': 1, 'moderate': 2, 'complex': 3 };
        return templates.sort((a, b) => complexityOrder[a.complexity] - complexityOrder[b.complexity]);
      case 'size':
        return templates.sort((a, b) => a.size - b.size);
      case 'resources':
        return templates.sort((a, b) => b.resourceTypes.length - a.resourceTypes.length);
      default:
        return templates;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}