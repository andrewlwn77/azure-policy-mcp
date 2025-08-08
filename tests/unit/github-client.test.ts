/**
 * Unit tests for GitHubClient
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { GitHubClient } from '../../src/services/github/github-client.js';
import { CacheManager } from '../../src/infrastructure/cache/cache-manager.js';

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('GitHubClient', () => {
  let githubClient: GitHubClient;
  let cache: CacheManager;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    cache = new CacheManager(100, 1000);
    githubClient = new GitHubClient(cache);
    mockFetch.mockClear();
  });

  describe('getRepositoryContents', () => {
    test('should fetch repository contents successfully', async () => {
      const mockContents = [
        {
          name: 'test.json',
          path: 'test.json',
          sha: 'abc123',
          size: 1024,
          url: 'https://api.github.com/test',
          html_url: 'https://github.com/test',
          git_url: 'git://test',
          download_url: 'https://raw.githubusercontent.com/test',
          type: 'file' as const
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContents,
        status: 200,
        statusText: 'OK'
      } as Response);

      const result = await githubClient.getRepositoryContents('Azure', 'azure-policy');
      
      expect(result).toEqual(mockContents);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/Azure/azure-policy/contents/?ref=master',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'azure-policy-mcp/1.0.0'
          })
        })
      );
    });

    test('should return cached results on second call', async () => {
      const mockContents = [{ name: 'test.json', type: 'file' as const }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockContents
      } as Response);

      // First call
      await githubClient.getRepositoryContents('Azure', 'azure-policy');
      
      // Second call should use cache
      const result = await githubClient.getRepositoryContents('Azure', 'azure-policy');
      
      expect(result).toEqual(mockContents);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should throw GitHubApiError on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '{"message": "Not Found"}'
      } as Response);

      await expect(
        githubClient.getRepositoryContents('Invalid', 'repo')
      ).rejects.toThrow('GitHub API error: 404 - Not Found');
    });
  });

  describe('getRawFileContent', () => {
    test('should fetch raw file content successfully', async () => {
      const mockContent = '{"test": "content"}';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent
      } as Response);

      const result = await githubClient.getRawFileContent(
        'Azure', 
        'azure-policy', 
        'test.json'
      );

      expect(result).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/Azure/azure-policy/master/test.json',
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });

    test('should use cache on subsequent calls', async () => {
      const mockContent = '{"test": "content"}';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent
      } as Response);

      // First call
      await githubClient.getRawFileContent('Azure', 'azure-policy', 'test.json');
      
      // Second call should use cache
      const result = await githubClient.getRawFileContent('Azure', 'azure-policy', 'test.json');
      
      expect(result).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasToken', () => {
    test('should return false when no token is set', () => {
      expect(githubClient.hasToken()).toBe(false);
    });

    test('should return true when token is set via environment', () => {
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'test-token';
      
      const clientWithToken = new GitHubClient(cache);
      expect(clientWithToken.hasToken()).toBe(true);
      
      process.env.GITHUB_TOKEN = originalToken;
    });
  });

  describe('getRequestCount', () => {
    test('should track request count', async () => {
      expect(githubClient.getRequestCount()).toBe(0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => []
      } as Response);

      await githubClient.getRepositoryContents('Azure', 'azure-policy');
      expect(githubClient.getRequestCount()).toBe(1);
    });
  });
});