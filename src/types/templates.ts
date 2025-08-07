/**
 * Template indexing and search type definitions
 */

export interface BicepTemplate {
  id: string;
  name: string;
  path: string;
  fileName: string;
  size: number;
  content: string;
  metadata: TemplateMetadata;
  resourceTypes: Array<{
    type: string;
    provider: string;
    properties: string[];
  }>;
  parameters: Array<{
    name: string;
    type: string;
    description?: string;
    defaultValue?: any;
    allowedValues?: any[];
  }>;
  outputs: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
  lastModified: number;
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface TemplateMetadata {
  description: string;
  category: TemplateCategory;
  tags: string[];
  author: string;
  version: string;
  createdDate: number;
  updatedDate: number;
}

export type TemplateCategory = 
  | 'General'
  | 'Compute' 
  | 'Storage'
  | 'Network'
  | 'Database'
  | 'Web'
  | 'Identity'
  | 'Security'
  | 'Monitoring'
  | 'Container'
  | 'AI'
  | 'Analytics'
  | 'DevOps'
  | 'Integration';

export interface TemplateIndex {
  lastUpdated: number;
  totalTemplates: number;
  templates: BicepTemplate[];
  categories: Record<string, number>;
  resourceTypes: Record<string, {
    type: string;
    templateCount: number;
    commonProperties: string[];
    provider: string;
  }>;
  dataSource: {
    owner: string;
    repo: string;
    branch: string;
    basePath?: string;
  };
}

export interface ResourceTypeInfo {
  type: string;
  templateCount: number;
  commonProperties: Set<string>;
  provider: string;
}

export interface TemplateSearchCriteria {
  categories?: TemplateCategory[];
  resourceTypes?: string[];
  keywords?: string[];
  maxComplexity?: 'simple' | 'moderate' | 'complex';
  sortBy?: 'name' | 'complexity' | 'size' | 'resources';
  limit?: number;
}

export interface TemplateRecommendation {
  template: BicepTemplate;
  score: number;
  reasons: string[];
  matchedCriteria: string[];
}

export interface TemplateAnalysis {
  template: BicepTemplate;
  policyCompliance: PolicyComplianceResult[];
  securityRecommendations: string[];
  bestPracticeViolations: string[];
  costOptimizations: string[];
}

export interface PolicyComplianceResult {
  policyId: string;
  policyName: string;
  compliant: boolean;
  violations: PolicyViolation[];
  recommendations: string[];
}

export interface PolicyViolation {
  resourceType: string;
  property: string;
  violation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion: string;
}

export interface TemplateGenerationRequest {
  requirements: {
    resourceTypes: string[];
    location?: string;
    tags?: Record<string, string>;
    naming?: {
      prefix?: string;
      suffix?: string;
      convention?: string;
    };
  };
  constraints: {
    policies?: string[];
    budget?: {
      maxCost?: number;
      currency?: string;
    };
    compliance?: string[];
  };
  preferences: {
    complexity?: 'simple' | 'moderate' | 'complex';
    includeMonitoring?: boolean;
    includeSecurity?: boolean;
    includeBackup?: boolean;
  };
}

export interface GeneratedTemplate {
  bicepContent: string;
  parametersFile: string;
  metadata: TemplateMetadata;
  recommendations: TemplateRecommendation[];
  policyCompliance: PolicyComplianceResult[];
  estimatedCost?: {
    monthly: number;
    currency: string;
    breakdown: Array<{
      resource: string;
      cost: number;
    }>;
  };
}