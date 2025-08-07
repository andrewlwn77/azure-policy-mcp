/**
 * GitHub API type definitions
 */

export interface GitHubApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface GitHubRepositoryContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
}

export interface GitHubRateLimit {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
}

export interface GitHubApiError {
  message: string;
  status: number;
  documentation_url?: string;
}

export interface DataSourceConfig {
  owner: string;
  repo: string;
  branch?: string;
  basePath?: string;
  description: string;
}

export interface RepositoryIndex {
  lastUpdated: number;
  files: GitHubRepositoryContent[];
  directories: string[];
  totalSize: number;
}