/**
 * Azure Policy type definitions
 */

export interface AzurePolicyDefinition {
  properties: {
    displayName: string;
    policyType: 'BuiltIn' | 'Custom' | 'Static';
    mode: 'All' | 'Indexed' | 'Microsoft.KeyVault.Data' | string;
    description: string;
    metadata?: {
      version?: string;
      category?: string;
      preview?: boolean;
      deprecated?: boolean;
    };
    parameters?: Record<string, PolicyParameter>;
    policyRule: PolicyRule;
  };
  id?: string;
  name?: string;
  type?: string;
}

export interface PolicyParameter {
  type: 'String' | 'Array' | 'Object' | 'Boolean' | 'Integer';
  metadata?: {
    displayName?: string;
    description?: string;
  };
  allowedValues?: any[];
  defaultValue?: any;
}

export interface PolicyRule {
  if: PolicyCondition;
  then: PolicyEffect;
}

export interface PolicyCondition {
  allOf?: PolicyCondition[];
  anyOf?: PolicyCondition[];
  not?: PolicyCondition;
  field?: string;
  equals?: any;
  notEquals?: any;
  like?: string;
  notLike?: string;
  match?: string;
  notMatch?: string;
  contains?: any;
  notContains?: any;
  in?: any[];
  notIn?: any[];
  containsKey?: string;
  notContainsKey?: string;
  less?: number;
  lessOrEquals?: number;
  greater?: number;
  greaterOrEquals?: number;
  exists?: boolean;
  count?: {
    field: string;
    where?: PolicyCondition;
    equals?: number;
    notEquals?: number;
    less?: number;
    lessOrEquals?: number;
    greater?: number;
    greaterOrEquals?: number;
  };
  value?: any;
  source?: string;
}

export interface PolicyEffect {
  effect: 'deny' | 'audit' | 'append' | 'auditIfNotExists' | 'deployIfNotExists' | 'disabled' | 'modify' | string;
  details?: PolicyEffectDetails;
}

export interface PolicyEffectDetails {
  type?: string;
  name?: string;
  existenceCondition?: PolicyCondition;
  roleDefinitionIds?: string[];
  deployment?: {
    properties: {
      mode: string;
      template: Record<string, any>;
      parameters: Record<string, any>;
    };
  };
  operations?: Array<{
    operation: 'add' | 'addOrReplace' | 'remove';
    field: string;
    value?: any;
  }>;
}

export interface ParsedPolicy {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  policyType: string;
  mode: string;
  version: string | undefined;
  deprecated: boolean;
  preview: boolean;
  parameters: PolicyParameterInfo[];
  rules: PolicyRuleAnalysis;
  resourceTypes: string[];
  effects: PolicyEffectInfo[];
}

export interface PolicyParameterInfo {
  name: string;
  type: string;
  displayName?: string;
  description?: string;
  required: boolean;
  allowedValues?: any[];
  defaultValue?: any;
}

export interface PolicyRuleAnalysis {
  conditions: PolicyConditionInfo[];
  logicalOperators: string[];
  fieldChecks: FieldCheck[];
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface PolicyConditionInfo {
  type: 'field' | 'logical' | 'function';
  operator: string;
  field?: string;
  value?: any;
  nested?: PolicyConditionInfo[];
}

export interface FieldCheck {
  field: string;
  operators: string[];
  values: any[];
  required: boolean;
}

export interface PolicyEffectInfo {
  effect: string;
  hasDetails: boolean;
  requiresRoleDefinitions: boolean;
  deploysResources: boolean;
  modifiesResources: boolean;
}

export interface PolicyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  resourceTypeCompatibility: ResourceTypeCompatibility[];
}

export interface ResourceTypeCompatibility {
  resourceType: string;
  compatible: boolean;
  reason?: string;
  requiredFields: string[];
  optionalFields: string[];
}

export interface PolicySearchCriteria {
  categories?: string[];
  effects?: string[];
  resourceTypes?: string[];
  keywords?: string[];
  policyTypes?: string[];
  includePreview?: boolean;
  includeDeprecated?: boolean;
}