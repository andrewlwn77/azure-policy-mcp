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