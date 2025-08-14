/**
 * Azure-specific type definitions
 */

export interface PolicyDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  policyType: 'BuiltIn' | 'Custom';
  mode: 'All' | 'Indexed' | 'Microsoft.ContainerService.Data';
  metadata: {
    version: string;
    category: string;
    preview?: boolean;
    deprecated?: boolean;
  };
  parameters?: Record<string, any>;
  policyRule: {
    if: any;
    then: {
      effect: string;
      details?: any;
    };
  };
}

export interface BicepTemplate {
  content: string;
  metadata: {
    name: string;
    description: string;
    resourceTypes: string[];
    category: string;
    complexity: 'Low' | 'Medium' | 'High';
    quality_score: number;
  };
  parameters?: Record<string, any>;
  variables?: Record<string, any>;
  resources: any[];
  outputs?: Record<string, any>;
}

export interface PolicyViolation {
  policyId: string;
  policyName: string;
  severity: 'error' | 'warning' | 'info';
  resourcePath: string;
  lineNumber?: number;
  description: string;
  remediationHint: string;
}

export interface ComplianceReport {
  overallStatus: 'compliant' | 'violations' | 'warnings';
  complianceScore: number;
  policiesEvaluated: number;
  evaluationTime: number;
  violations: PolicyViolation[];
  summary: {
    totalPolicies: number;
    passedPolicies: number;
    failedPolicies: number;
    warningPolicies: number;
  };
}

// Azure Documentation Scraper Types

export interface ScrapeParams {
  resourceType: string;
  language?: 'bicep' | 'arm' | 'terraform';
  include_examples?: boolean;
  cache_duration?: number;
}

export interface DocumentationResult {
  success: boolean;
  data?: {
    resource_type: string;
    documentation_url: string;
    last_updated: string;
    page_url?: string;
    extraction_timestamp?: string;
    
    // Two-function architecture fields
    overview?: {
      property_count: number;
      code_example_count: number;
      api_versions_count: number;
      last_updated: string;
      complexity_score: 'simple' | 'moderate' | 'complex';
    };
    available_sections?: string[];
    requested_sections?: string[];
    retrieved_sections?: string[];
    
    // Detailed content fields
    properties?: Array<{
      name: string;
      description: string;
      type?: string;
      required?: boolean;
    }>;
    code_examples?: Array<{
      language: string;
      code: string;
    }>;
    api_versions?: string[];
    
    // Legacy available_content for backward compatibility
    available_content?: {
      property_tables: number;
      code_examples: number;
      api_versions: string[];
    };
    quick_summary?: {
      top_properties: Array<{
        name: string;
        description: string;
      }>;
      example_snippet?: string;
    };
    // Legacy fields for backward compatibility
    schema?: {
      properties: string[];
      required_properties: string[];
      api_version: string;
    };
    examples?: {
      bicep?: string;
      arm?: string;
      terraform?: string;
    };
    property_details?: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
      constraints?: string;
      deprecated?: boolean;
      valid_values?: string[];
      table_index?: number;
    }>;
  };
  cache_info: {
    cached: boolean;
    cache_age: number;
    expires_at: string;
  };
  error?: {
    type: string;
    message: string;
    details: string;
    suggestions: string[];
  };
  timestamp?: number;
}

export interface NavigationResult {
  success: boolean;
  pageUrl?: string;
  error?: string;
  page?: any; // Puppeteer Page reference for content extraction
}