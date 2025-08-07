/**
 * Manages multiple GitHub data sources for Azure Policy and Bicep templates
 */

import { GitHubClient } from './github-client.js';
import { CacheManager } from '../../infrastructure/cache/cache-manager.js';
import type { DataSourceConfig, RepositoryIndex } from '../../types/github.js';

export class DataSourceManager {
  private readonly dataSources: Map<string, DataSourceConfig> = new Map();

  constructor(
    private githubClient: GitHubClient,
    private cache: CacheManager
  ) {
    this.initializeDataSources();
  }

  private initializeDataSources(): void {
    // Azure Policy Repository
    this.dataSources.set('azure-policy', {
      owner: 'Azure',
      repo: 'azure-policy',
      branch: 'master',
      basePath: 'built-in-policies/policyDefinitions',
      description: 'Azure built-in policy definitions'
    });

    // Azure QuickStart Templates
    this.dataSources.set('quickstart-templates', {
      owner: 'Azure',
      repo: 'azure-quickstart-templates', 
      branch: 'master',
      basePath: 'quickstarts',
      description: 'Azure QuickStart Bicep templates'
    });

    // Azure Docs Bicep Samples
    this.dataSources.set('bicep-samples', {
      owner: 'Azure',
      repo: 'azure-docs-bicep-samples',
      branch: 'main',
      basePath: 'samples',
      description: 'Azure documentation Bicep samples'
    });

    // Azure Resource Modules (formerly CARML)
    this.dataSources.set('resource-modules', {
      owner: 'Azure',
      repo: 'ResourceModules',
      branch: 'main',
      basePath: 'modules',
      description: 'Azure Resource Modules (mature Bicep modules)'
    });
  }

  async getDataSource(name: string): Promise<DataSourceConfig | undefined> {
    return this.dataSources.get(name);
  }

  async listDataSources(): Promise<string[]> {
    return Array.from(this.dataSources.keys());
  }

  async getDataSourceInfo(name: string): Promise<{
    config: DataSourceConfig;
    index?: RepositoryIndex;
  } | undefined> {
    const config = this.dataSources.get(name);
    if (!config) {
      return undefined;
    }

    let index: RepositoryIndex | undefined = undefined;
    try {
      index = await this.githubClient.indexRepository(config);
    } catch (error) {
      console.warn(`Failed to index data source ${name}:`, error);
      // Return config even if indexing fails
    }

    return index !== undefined ? { config, index } : { config };
  }

  async refreshDataSource(name: string): Promise<boolean> {
    const config = this.dataSources.get(name);
    if (!config) {
      return false;
    }

    try {
      // Clear cache for this data source
      const cacheKey = `index:${config.owner}/${config.repo}/${config.branch || 'master'}`;
      this.cache.delete(cacheKey);

      // Re-index
      await this.githubClient.indexRepository(config);
      return true;
    } catch (error) {
      console.error(`Failed to refresh data source ${name}:`, error);
      return false;
    }
  }

  async refreshAllDataSources(): Promise<{
    success: string[];
    failed: string[];
  }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const name of this.dataSources.keys()) {
      const result = await this.refreshDataSource(name);
      if (result) {
        success.push(name);
      } else {
        failed.push(name);
      }
    }

    return { success, failed };
  }

  async getFileFromDataSource(
    dataSourceName: string,
    filePath: string
  ): Promise<string | undefined> {
    const config = this.dataSources.get(dataSourceName);
    if (!config) {
      return undefined;
    }

    try {
      const fullPath = config.basePath ? `${config.basePath}/${filePath}` : filePath;
      return await this.githubClient.getRawFileContent(
        config.owner,
        config.repo,
        fullPath,
        config.branch
      );
    } catch (error) {
      console.warn(`Failed to get file ${filePath} from ${dataSourceName}:`, error);
      return undefined;
    }
  }

  async searchFiles(
    dataSourceName: string,
    pattern: RegExp,
    fileExtensions?: string[]
  ): Promise<string[]> {
    const info = await this.getDataSourceInfo(dataSourceName);
    if (!info || !info.index) {
      return [];
    }

    let files = info.index.files;

    // Filter by file extensions if provided
    if (fileExtensions && fileExtensions.length > 0) {
      const extensions = fileExtensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`);
      files = files.filter(file => 
        extensions.some(ext => file.name.endsWith(ext))
      );
    }

    // Filter by pattern
    return files
      .filter(file => pattern.test(file.path) || pattern.test(file.name))
      .map(file => file.path);
  }

  getDataSourceStats(): Record<string, {
    description: string;
    fileCount?: number;
    totalSize?: number;
    lastUpdated?: number;
  }> {
    const stats: Record<string, any> = {};

    for (const [name, config] of this.dataSources) {
      stats[name] = {
        description: config.description
      };

      // Try to get cached index stats
      const cacheKey = `index:${config.owner}/${config.repo}/${config.branch || 'master'}`;
      const index = this.cache.get<RepositoryIndex>(cacheKey);
      
      if (index) {
        stats[name].fileCount = index.files.length;
        stats[name].totalSize = index.totalSize;
        stats[name].lastUpdated = index.lastUpdated;
      }
    }

    return stats;
  }
}