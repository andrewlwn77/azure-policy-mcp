/**
 * Azure Documentation Scraper Service
 * 
 * Provides direct Puppeteer-based scraping of Azure resource documentation
 * from https://learn.microsoft.com/en-us/azure/templates/
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { CacheManager } from '../../infrastructure/cache/cache-manager.js';
import { ErrorHandler } from '../../infrastructure/errors/error-handler.js';
import type { DocumentationResult, NavigationResult, ScrapeParams } from '../../types/azure.js';

// Global browser state for reuse across requests
let browser: Browser | null = null;

export class AzureDocsScraperService {
  private static readonly BASE_URL = 'https://learn.microsoft.com/en-us/azure/templates/';
  private static readonly NAVIGATION_TIMEOUT = 30000;
  private static readonly REQUEST_DELAY = 2000;
  
  private cache: CacheManager;
  private lastRequestTime = 0;

  constructor(cache: CacheManager) {
    this.cache = cache;
  }

  /**
   * Ensure browser instance is available, following rapidapi-discovery-mcp patterns EXACTLY
   */
  private async ensureBrowser(): Promise<Browser> {
    // ALWAYS create fresh browser instance to avoid anti-bot flagging
    // Once a browser is flagged by websites, all pages from it hit CAPTCHA
    if (browser) {
      await browser.close();
      browser = null;
    }
    
    const launchOptions: any = {
      headless: true, // REQUIRED: Must be true in server environment (no X Windows)
      args: [
        // EXACT working args from rapidapi-discovery-mcp (simpler is better!)
        '--no-sandbox',
        '--single-process',
        '--no-zygote'
      ],
      slowMo: 100, // Add slight delay between actions for human-like behavior
      defaultViewport: null, // Use actual browser viewport
      devtools: false
    };
    
    // Use custom Chrome executable path if provided
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      console.error(`Using custom Chrome executable: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }
    
    browser = await puppeteer.launch(launchOptions);
    return browser;
  }


  /**
   * Create a new page with proper configuration following rapidapi-discovery-mcp EXACTLY
   */
  private async createNewPage(): Promise<Page> {
    const browserInstance = await this.ensureBrowser();
    const page = await browserInstance.newPage();
    
    // Randomize viewport slightly for more human-like behavior
    const baseWidth = 1920;
    const baseHeight = 1080;
    await page.setViewport({
      width: baseWidth + Math.floor(Math.random() * 100) - 50,
      height: baseHeight + Math.floor(Math.random() * 100) - 50
    });
    
    // Set user agent to match rapidapi-discovery-mcp
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    
    // Set additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
    
    // Remove webdriver property and other automation indicators
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      // Mock chrome object
      (window as any).chrome = {
        runtime: {}
      };
      // Hide automation indicators
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    
    // Set default timeout
    page.setDefaultTimeout(60000);
    
    return page;
  }

  /**
   * Navigate with retry logic following rapidapi-discovery-mcp EXACTLY
   */
  private async navigateWithRetry(page: Page, url: string, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        return;
      } catch (error) {
        console.error(`Navigation attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  /**
   * Lightweight overview function - returns metadata only for quick assessment
   */
  async fetchDocumentationOverview(resourceType: string, options: { cache_duration?: number } = {}): Promise<DocumentationResult> {
    const cacheKey = `azure-docs-overview:${resourceType}`;
    
    // Check cache first
    const cached = this.cache.get<DocumentationResult>(cacheKey);
    if (cached) {
      return {
        ...cached,
        cache_info: {
          cached: true,
          cache_age: Math.floor((Date.now() - cached.timestamp!) / 60000),
          expires_at: new Date(cached.timestamp! + (options.cache_duration || 60) * 60000).toISOString()
        }
      };
    }

    try {
      // Rate limiting
      await this.enforceRateLimit();

      // Navigate to resource documentation
      const navigationResult = await this.navigateToResource({ resourceType, language: 'bicep' });
      if (!navigationResult.success) {
        throw new Error(`Navigation failed: ${navigationResult.error}`);
      }

      // Extract overview metadata only
      const overviewData = await this.getDocumentationOverview(navigationResult.page!);

      const result: DocumentationResult = {
        success: true,
        data: {
          resource_type: resourceType,
          documentation_url: `https://learn.microsoft.com/en-us/azure/templates/${resourceType.toLowerCase()}`,
          overview: overviewData.overview,
          available_sections: overviewData.available_sections,
          last_updated: new Date().toISOString()
        },
        cache_info: {
          cached: false,
          cache_age: 0,
          expires_at: new Date(Date.now() + (options.cache_duration || 60) * 60000).toISOString()
        },
        timestamp: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, result, (options.cache_duration || 60) * 60000);
      
      return result;

    } catch (error) {
      return {
        success: false,
        error: {
          type: this.categorizeError(error),
          message: this.getUserFriendlyErrorMessage(error),
          details: error instanceof Error ? error.message : String(error),
          suggestions: this.getErrorSuggestions(error, resourceType)
        },
        cache_info: {
          cached: false,
          cache_age: 0,
          expires_at: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Detailed function with selective section retrieval
   */
  async fetchDocumentationDetails(
    resourceType: string, 
    sections: string[] = ['properties', 'code_examples', 'api_versions'],
    options: { language?: 'bicep' | 'arm' | 'terraform'; include_examples?: boolean; cache_duration?: number } = {}
  ): Promise<DocumentationResult> {
    const sectionsHash = sections.sort().join(',');
    const cacheKey = `azure-docs-detailed:${resourceType}:${sectionsHash}`;
    
    // Check cache first
    const cached = this.cache.get<DocumentationResult>(cacheKey);
    if (cached) {
      return {
        ...cached,
        cache_info: {
          cached: true,
          cache_age: Math.floor((Date.now() - cached.timestamp!) / 60000),
          expires_at: new Date(cached.timestamp! + (options.cache_duration || 60) * 60000).toISOString()
        }
      };
    }

    try {
      // Rate limiting
      await this.enforceRateLimit();

      // Navigate to resource documentation
      const navigationResult = await this.navigateToResource({ 
        resourceType, 
        language: options.language || 'bicep' 
      });
      if (!navigationResult.success) {
        throw new Error(`Navigation failed: ${navigationResult.error}`);
      }

      // Extract detailed content with section filtering
      const detailedData = await this.getDocumentationDetails(navigationResult.page!, sections);

      const result: DocumentationResult = {
        success: true,
        data: {
          resource_type: resourceType,
          documentation_url: `https://learn.microsoft.com/en-us/azure/templates/${resourceType.toLowerCase()}`,
          requested_sections: sections,
          retrieved_sections: detailedData.retrieved_sections,
          last_updated: new Date().toISOString(),
          ...this.filterExtractedContent(detailedData, sections)
        },
        cache_info: {
          cached: false,
          cache_age: 0,
          expires_at: new Date(Date.now() + (options.cache_duration || 60) * 60000).toISOString()
        },
        timestamp: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, result, (options.cache_duration || 60) * 60000);
      
      return result;

    } catch (error) {
      return {
        success: false,
        error: {
          type: this.categorizeError(error),
          message: this.getUserFriendlyErrorMessage(error),
          details: error instanceof Error ? error.message : String(error),
          suggestions: this.getErrorSuggestions(error, resourceType)
        },
        cache_info: {
          cached: false,
          cache_age: 0,
          expires_at: new Date().toISOString()
        }
      };
    }
  }


  /**
   * Navigate to the specific Azure resource documentation page
   */
  private async navigateToResource(params: ScrapeParams): Promise<NavigationResult> {
    let page: Page | null = null;
    
    try {
      // Create new page with direct browser management
      page = await this.createNewPage();
      
      // Navigate directly to the documentation URL with retry logic (following rapidapi-discovery-mcp)
      const documentationUrl = this.constructDocumentationUrl(params.resourceType);
      console.log(`[AzureDocsScraperService] Navigating to: ${documentationUrl}`);
      
      await this.navigateWithRetry(page, documentationUrl);

      // Check if page loaded successfully
      const pageTitle = await page.title();
      if (pageTitle.includes('Page not found') || pageTitle.includes('404')) {
        return { success: false, error: 'Documentation page not found for this resource type' };
      }

      // Switch to requested language tab if needed
      if (params.language && params.language !== 'bicep') {
        await this.switchLanguageTab(page, params.language);
      }

      return {
        success: true,
        pageUrl: documentationUrl,
        page: page // Pass page reference for content extraction
      };

    } catch (error) {
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          console.warn('Error closing page:', closeError);
        }
      }
      
      return {
        success: false,
        error: `Navigation error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Construct the direct documentation URL for a resource type
   */
  private constructDocumentationUrl(resourceType: string): string {
    // Convert Microsoft.Storage/storageAccounts to microsoft.storage/storageaccounts
    const normalizedType = resourceType.toLowerCase().replace(/\./g, '.');
    return `${AzureDocsScraperService.BASE_URL}${normalizedType}`;
  }


  /**
   * Switch to the requested language tab (Bicep, ARM, Terraform)
   */
  private async switchLanguageTab(page: Page, language: 'arm' | 'terraform'): Promise<void> {
    try {
      console.log(`[AzureDocsScraperService] Switching to ${language} tab`);
      
      const switchResult = await page.evaluate((lang) => {
        // Look for language tabs
        const languageTabs = Array.from(document.querySelectorAll('.choose-language button, .language-selector button'));
        const targetTab = languageTabs.find((tab: any) => 
          tab.textContent.toLowerCase().includes(lang) ||
          tab.textContent.toLowerCase().includes(lang === 'arm' ? 'template' : 'terraform')
        );
        
        if (targetTab && !targetTab.classList.contains('active')) {
          (targetTab as HTMLElement).click();
          return { success: true };
        }
        
        return { success: false };
      }, language);

      // Wait for tab content to load
      if (switchResult.success) {
        await page.waitForTimeout(1000);
      }

    } catch (error) {
      console.warn(`Failed to switch to ${language} tab:`, error);
      // Non-critical error, continue with default language
    }
  }

  /**
   * Extract overview metadata only - fast counting operation
   */
  private async getDocumentationOverview(page: Page) {
    try {
      console.log('[AzureDocsScraperService] Extracting overview metadata only');
      
      const overviewData = await page.evaluate(() => {
        // Count property tables
        const tables = document.querySelectorAll('table');
        const propertyCount = Array.from(tables).reduce((count, table) => {
          const headers = Array.from(table.querySelectorAll('th, td')).map(th => th.textContent?.trim() || '');
          const hasPropertyColumns = headers.some(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('property'));
          return hasPropertyColumns ? count + table.querySelectorAll('tr').length - 1 : count; // -1 for header
        }, 0);
        
        // Count code examples
        const codeBlocks = document.querySelectorAll('pre code, pre');
        const codeExampleCount = Array.from(codeBlocks).filter(block => 
          (block.textContent || '').length > 20
        ).length;
        
        // Count API versions
        const selects = document.querySelectorAll('select');
        let apiVersions: string[] = [];
        selects.forEach(select => {
          const options = Array.from(select.options).map(opt => opt.textContent?.trim() || '');
          if (options.some(opt => opt.includes('2024') || opt.includes('2025'))) {
            apiVersions = options.filter(opt => opt.match(/\d{4}-\d{2}-\d{2}/));
          }
        });
        
        if (apiVersions.length === 0) {
          const pageText = document.body.textContent || '';
          const versionMatches = pageText.match(/\d{4}-\d{2}-\d{2}/g);
          if (versionMatches) {
            apiVersions = [...new Set(versionMatches)].slice(0, 5);
          }
        }
        
        // Determine complexity score
        let complexityScore: 'simple' | 'moderate' | 'complex' = 'simple';
        if (propertyCount > 20) complexityScore = 'moderate';
        if (propertyCount > 50) complexityScore = 'complex';
        
        // Determine available sections
        const availableSections = [];
        if (propertyCount > 0) availableSections.push('properties');
        if (codeExampleCount > 0) availableSections.push('code_examples');
        if (apiVersions.length > 0) availableSections.push('api_versions');
        if (propertyCount > 0 || codeExampleCount > 0) availableSections.push('quick_summary');
        
        return {
          overview: {
            property_count: propertyCount,
            code_example_count: codeExampleCount,
            api_versions_count: apiVersions.length,
            last_updated: new Date().toISOString(),
            complexity_score: complexityScore
          },
          available_sections: availableSections
        };
      });
      
      // Clean up the page after extraction
      await page.close();
      
      console.log('[AzureDocsScraperService] Overview extraction completed:', overviewData.overview);
      return overviewData;

    } catch (error) {
      console.error('[AzureDocsScraperService] Overview extraction failed:', error);
      
      // Ensure page cleanup on error
      try {
        await page.close();
      } catch (closeError) {
        console.warn('Error closing page after overview extraction failure:', closeError);
      }
      
      throw error;
    }
  }

  /**
   * Extract detailed content with section filtering
   */
  private async getDocumentationDetails(page: Page, requestedSections: string[]) {
    try {
      console.log('[AzureDocsScraperService] Extracting detailed content for sections:', requestedSections);
      
      const detailedData = await page.evaluate((sections) => {
        const extractedData: any = {
          retrieved_sections: []
        };
        
        // Extract properties if requested
        if (sections.includes('properties')) {
          const tables = document.querySelectorAll('table');
          const propertyDetails: Array<{name: string; description: string; type?: string; required?: boolean}> = [];
          
          for (let i = 0; i < Math.min(10, tables.length); i++) {
            const table = tables[i];
            const rows = table.querySelectorAll('tr');
            if (rows.length > 1) {
              const headers = Array.from(rows[0].querySelectorAll('th, td')).map(th => th.textContent?.trim() || '');
              const nameCol = headers.findIndex(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('property'));
              const descCol = headers.findIndex(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('desc'));
              const typeCol = headers.findIndex(h => h.toLowerCase().includes('type'));
              const reqCol = headers.findIndex(h => h.toLowerCase().includes('required'));
              
              if (nameCol >= 0) {
                for (let j = 1; j < Math.min(50, rows.length); j++) {
                  const cells = Array.from(rows[j].querySelectorAll('td')).map(td => td.textContent?.trim() || '');
                  if (cells[nameCol]) {
                    const propertyEntry: { name: string; description: string; type?: string; required?: boolean } = {
                      name: cells[nameCol],
                      description: descCol >= 0 ? cells[descCol] : ''
                    };
                    
                    if (typeCol >= 0 && cells[typeCol]) {
                      propertyEntry.type = cells[typeCol];
                    }
                    
                    if (reqCol >= 0 && cells[reqCol]) {
                      propertyEntry.required = cells[reqCol]?.toLowerCase().includes('yes');
                    }
                    
                    propertyDetails.push(propertyEntry);
                  }
                }
              }
            }
          }
          
          if (propertyDetails.length > 0) {
            extractedData.properties = propertyDetails;
            extractedData.retrieved_sections.push('properties');
          }
        }
        
        // Extract code examples if requested
        if (sections.includes('code_examples')) {
          const codeBlocks = document.querySelectorAll('pre code, pre');
          const codeExamples: Array<{language: string; code: string}> = [];
          
          codeBlocks.forEach(block => {
            const code = block.textContent || '';
            if (code.length > 20) {
              let language = 'unknown';
              
              const parent = block.closest('[data-lang], .language-bicep, .language-json, .language-arm');
              if (parent) {
                const className = parent.className;
                const dataLang = parent.getAttribute('data-lang');
                if (dataLang) language = dataLang;
                else if (className.includes('bicep')) language = 'bicep';
                else if (className.includes('json')) language = 'json';
                else if (className.includes('arm')) language = 'arm';
              }
              
              if (language === 'unknown') {
                if (code.includes('resource ') && code.includes('@')) language = 'bicep';
                else if (code.includes('"$schema"') && code.includes('deploymentTemplate')) language = 'arm';
                else if (code.includes('terraform') || code.includes('resource "')) language = 'terraform';
                else if (code.includes('{') && code.includes('"')) language = 'json';
              }
              
              codeExamples.push({
                language,
                code: code.substring(0, 1500) // Limit code size for detailed extraction
              });
            }
          });
          
          if (codeExamples.length > 0) {
            extractedData.code_examples = codeExamples;
            extractedData.retrieved_sections.push('code_examples');
          }
        }
        
        // Extract API versions if requested
        if (sections.includes('api_versions')) {
          const selects = document.querySelectorAll('select');
          let apiVersions: string[] = [];
          
          selects.forEach(select => {
            const options = Array.from(select.options).map(opt => opt.textContent?.trim() || '');
            if (options.some(opt => opt.includes('2024') || opt.includes('2025'))) {
              apiVersions = options.filter(opt => opt.match(/\d{4}-\d{2}-\d{2}/));
            }
          });
          
          if (apiVersions.length === 0) {
            const pageText = document.body.textContent || '';
            const versionMatches = pageText.match(/\d{4}-\d{2}-\d{2}/g);
            if (versionMatches) {
              apiVersions = [...new Set(versionMatches)].slice(0, 10);
            }
          }
          
          if (apiVersions.length > 0) {
            extractedData.api_versions = apiVersions;
            extractedData.retrieved_sections.push('api_versions');
          }
        }
        
        // Extract quick summary if requested
        if (sections.includes('quick_summary')) {
          const topProperties = extractedData.properties?.slice(0, 5) || [];
          const bicepExample = extractedData.code_examples?.find((ex: any) => ex.language === 'bicep');
          const anyExample = extractedData.code_examples?.[0];
          const exampleSnippet = bicepExample?.code || anyExample?.code || '';
          
          if (topProperties.length > 0 || exampleSnippet) {
            extractedData.quick_summary = {
              top_properties: topProperties,
              example_snippet: exampleSnippet.substring(0, 500)
            };
            extractedData.retrieved_sections.push('quick_summary');
          }
        }
        
        return extractedData;
      }, requestedSections);
      
      // Clean up the page after extraction
      await page.close();
      
      console.log('[AzureDocsScraperService] Detailed extraction completed:', {
        requestedSections,
        retrievedSections: detailedData.retrieved_sections
      });
      
      return detailedData;

    } catch (error) {
      console.error('[AzureDocsScraperService] Detailed extraction failed:', error);
      
      // Ensure page cleanup on error
      try {
        await page.close();
      } catch (closeError) {
        console.warn('Error closing page after detailed extraction failure:', closeError);
      }
      
      throw error;
    }
  }

  /**
   * Filter extracted content to include only requested sections
   */
  private filterExtractedContent(extractedData: any, requestedSections: string[]) {
    const filtered: any = {};
    
    if (requestedSections.includes('properties') && extractedData.properties) {
      filtered.properties = extractedData.properties;
    }
    
    if (requestedSections.includes('code_examples') && extractedData.code_examples) {
      filtered.code_examples = extractedData.code_examples;
    }
    
    if (requestedSections.includes('api_versions') && extractedData.api_versions) {
      filtered.api_versions = extractedData.api_versions;
    }
    
    if (requestedSections.includes('quick_summary') && extractedData.quick_summary) {
      filtered.quick_summary = extractedData.quick_summary;
    }
    
    return filtered;
  }



  /**
   * Generate cache key for the given parameters
   */
  private generateCacheKey(params: ScrapeParams): string {
    return `azure-docs:${params.resourceType}:${params.language || 'bicep'}:${params.cache_duration || 60}`;
  }

  /**
   * Enforce rate limiting between requests
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < AzureDocsScraperService.REQUEST_DELAY) {
      const delay = AzureDocsScraperService.REQUEST_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Categorize error types for structured error handling
   */
  private categorizeError(error: any): string {
    if (error instanceof Error) {
      if (error.message.includes('timeout')) return 'navigation_timeout';
      if (error.message.includes('not found') || error.message.includes('404')) return 'resource_not_found';
      if (error.message.includes('navigation')) return 'navigation_error';
      if (error.message.includes('extraction')) return 'content_parse_error';
    }
    return 'system_error';
  }

  /**
   * Generate user-friendly error messages
   */
  private getUserFriendlyErrorMessage(error: any): string {
    const errorType = this.categorizeError(error);
    
    switch (errorType) {
      case 'navigation_timeout':
        return 'The Azure documentation site took too long to respond. Please try again.';
      case 'resource_not_found':
        return 'Could not find documentation for the specified resource type.';
      case 'navigation_error':
        return 'Failed to navigate to the Azure documentation page.';
      case 'content_parse_error':
        return 'Successfully reached the documentation page but could not extract all information.';
      default:
        return 'An unexpected error occurred while fetching documentation.';
    }
  }

  /**
   * Generate actionable suggestions for error resolution
   */
  private getErrorSuggestions(error: any, resourceType: string): string[] {
    const errorType = this.categorizeError(error);
    
    switch (errorType) {
      case 'resource_not_found':
        return [
          'Check the resource type spelling',
          'Verify the resource type exists in Azure',
          `Try searching for similar resources to '${resourceType}'`,
          'Ensure the resource type follows the format Microsoft.Service/resourceType'
        ];
      case 'navigation_timeout':
        return [
          'Try again in a few moments',
          'Check your internet connection',
          'The Azure documentation site may be experiencing issues'
        ];
      case 'content_parse_error':
        return [
          'Some information was extracted successfully',
          'Try refreshing the cache and retrying',
          'The documentation format may have changed recently'
        ];
      default:
        return [
          'Try again in a few moments',
          'Check if the issue persists',
          'Contact support if the problem continues'
        ];
    }
  }
}