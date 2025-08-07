/**
 * GitHub API client with intelligent caching and rate limiting
 */

import { CacheManager } from '../../infrastructure/cache/cache-manager.js';
import { GitHubApiError } from '../../infrastructure/errors/error-handler.js';
import type { 
  GitHubRepositoryContent, 
  GitHubRateLimit, 
  DataSourceConfig,
  RepositoryIndex 
} from '../../types/github.js';

export class GitHubClient {
  private readonly baseUrl = 'https://api.github.com';
  private readonly token: string | undefined;
  private requestCount = 0;
  private lastReset = Date.now();

  constructor(private cache: CacheManager) {
    this.token = process.env.GITHUB_TOKEN;
  }

  async getRepositoryContents(
    owner: string, 
    repo: string, 
    path: string = '',
    branch: string = 'master'
  ): Promise<GitHubRepositoryContent[]> {
    const cacheKey = `repo:${owner}/${repo}/${branch}/${path}`;
    const cached = this.cache.get<GitHubRepositoryContent[]>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const response = await this.makeRequest<GitHubRepositoryContent[]>(url);
    
    // Cache for 1 hour
    this.cache.set(cacheKey, response, 3600000);
    return response;
  }

  async getFileContent(
    owner: string, 
    repo: string, 
    path: string,
    branch: string = 'master'
  ): Promise<string> {
    const cacheKey = `file:${owner}/${repo}/${branch}/${path}`;
    const cached = this.cache.get<string>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const fileInfo = await this.makeRequest<GitHubRepositoryContent>(url);
    
    if (fileInfo.type !== 'file' || !fileInfo.content || !fileInfo.encoding) {
      throw new GitHubApiError(`Invalid file response for ${path}`);
    }

    let content: string;
    if (fileInfo.encoding === 'base64') {
      content = Buffer.from(fileInfo.content, 'base64').toString('utf-8');
    } else {
      content = fileInfo.content;
    }

    // Cache files for 24 hours
    this.cache.set(cacheKey, content, 24 * 3600000);
    return content;
  }

  async getRawFileContent(
    owner: string, 
    repo: string, 
    path: string,
    branch: string = 'master'
  ): Promise<string> {
    const cacheKey = `raw:${owner}/${repo}/${branch}/${path}`;
    const cached = this.cache.get<string>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    
    try {
      // Create AbortController for timeout functionality
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(url, { signal: controller.signal });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new GitHubApiError(
          `Failed to fetch raw file: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const content = await response.text();
      
      // Cache files for 24 hours
      this.cache.set(cacheKey, content, 24 * 3600000);
      return content;
      
    } catch (error) {
      if (error instanceof GitHubApiError) {
        throw error;
      }
      
      // Handle timeout/abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GitHubApiError(
          `Request timeout after 30 seconds for raw file: ${url}`,
          408 // Request Timeout HTTP status
        );
      }
      
      throw new GitHubApiError(`Network error fetching raw file: ${String(error)}`);
    }
  }

  async indexRepository(config: DataSourceConfig): Promise<RepositoryIndex> {
    const cacheKey = `index:${config.owner}/${config.repo}/${config.branch || 'master'}`;
    const cached = this.cache.get<RepositoryIndex>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const files: GitHubRepositoryContent[] = [];
    const directories: string[] = [];
    let totalSize = 0;

    await this.indexDirectoryRecursive(
      config.owner,
      config.repo,
      config.basePath || '',
      config.branch || 'master',
      files,
      directories
    );

    totalSize = files.reduce((sum, file) => sum + file.size, 0);

    const index: RepositoryIndex = {
      lastUpdated: Date.now(),
      files,
      directories,
      totalSize
    };

    // Cache repository index for 6 hours
    this.cache.set(cacheKey, index, 6 * 3600000);
    return index;
  }

  private async indexDirectoryRecursive(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    files: GitHubRepositoryContent[],
    directories: string[],
    maxDepth: number = 5,
    currentDepth: number = 0
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    try {
      const contents = await this.getRepositoryContents(owner, repo, path, branch);
      
      for (const item of contents) {
        if (item.type === 'file') {
          files.push(item);
        } else if (item.type === 'dir') {
          directories.push(item.path);
          await this.indexDirectoryRecursive(
            owner, 
            repo, 
            item.path, 
            branch, 
            files, 
            directories,
            maxDepth,
            currentDepth + 1
          );
        }
      }
    } catch (error) {
      console.error(`Error indexing directory ${path}:`, error);
      // Continue indexing other directories even if one fails
    }
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    const url = `${this.baseUrl}/rate_limit`;
    const response = await this.makeRequest<{ rate: GitHubRateLimit }>(url);
    return response.rate;
  }

  private async makeRequest<T>(url: string): Promise<T> {
    // Rate limiting logic
    this.requestCount++;
    const now = Date.now();
    
    // Reset counter every hour
    if (now - this.lastReset > 3600000) {
      this.requestCount = 0;
      this.lastReset = now;
    }

    // Implement basic rate limiting (be conservative)
    if (this.requestCount > 50) {
      await this.sleep(1000); // Wait 1 second between requests when approaching limits
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'azure-policy-mcp/1.0.0'
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    try {
      // Create AbortController for timeout functionality
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(url, { 
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }

        throw new GitHubApiError(
          `GitHub API error: ${response.status} - ${errorMessage}`,
          response.status
        );
      }

      return await response.json() as T;
      
    } catch (error) {
      if (error instanceof GitHubApiError) {
        throw error;
      }
      
      // Handle timeout/abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GitHubApiError(
          `Request timeout after 30 seconds for: ${url}`,
          408 // Request Timeout HTTP status
        );
      }
      
      throw new GitHubApiError(`Network error: ${String(error)}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  hasToken(): boolean {
    return !!this.token;
  }
}