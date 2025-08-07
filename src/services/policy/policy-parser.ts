/**
 * Azure Policy Parser - extracts and analyzes policy definitions
 */

import type { 
  AzurePolicyDefinition, 
  ParsedPolicy, 
  PolicyCondition, 
  PolicyConditionInfo,
  PolicyParameterInfo,
  PolicyRuleAnalysis,
  PolicyEffectInfo,
  FieldCheck,
  PolicyValidationResult,
  ResourceTypeCompatibility
} from '../../types/policy.js';

export class PolicyParser {
  private readonly commonResourceTypes = new Set([
    'Microsoft.Compute/virtualMachines',
    'Microsoft.Storage/storageAccounts',
    'Microsoft.Network/virtualNetworks',
    'Microsoft.Network/networkSecurityGroups',
    'Microsoft.Web/sites',
    'Microsoft.KeyVault/vaults',
    'Microsoft.ContainerInstance/containerGroups',
    'Microsoft.ContainerRegistry/registries'
  ]);

  /**
   * Parse an Azure Policy definition JSON into structured analysis
   */
  parsePolicy(policyJson: string, id?: string): ParsedPolicy {
    let policyDef: AzurePolicyDefinition;
    
    try {
      policyDef = JSON.parse(policyJson);
    } catch (error) {
      throw new Error(`Invalid policy JSON: ${String(error)}`);
    }

    return this.analyzePolicyDefinition(policyDef, id);
  }

  /**
   * Analyze a parsed policy definition object
   */
  analyzePolicyDefinition(policy: AzurePolicyDefinition, id?: string): ParsedPolicy {
    const props = policy.properties;
    
    return {
      id: id || policy.id || 'unknown',
      name: policy.name || 'unknown',
      displayName: props.displayName,
      description: props.description,
      category: props.metadata?.category || 'General',
      policyType: props.policyType,
      mode: props.mode,
      version: props.metadata?.version,
      deprecated: props.metadata?.deprecated || false,
      preview: props.metadata?.preview || false,
      parameters: this.extractParameters(props.parameters || {}),
      rules: this.analyzeRules(props.policyRule),
      resourceTypes: this.extractResourceTypes(props.policyRule),
      effects: this.extractEffects(props.policyRule)
    };
  }

  /**
   * Extract and analyze policy parameters
   */
  private extractParameters(parameters: Record<string, any>): PolicyParameterInfo[] {
    return Object.entries(parameters).map(([name, param]) => ({
      name,
      type: param.type,
      displayName: param.metadata?.displayName,
      description: param.metadata?.description,
      required: param.defaultValue === undefined,
      allowedValues: param.allowedValues,
      defaultValue: param.defaultValue
    }));
  }

  /**
   * Analyze policy rules and conditions
   */
  private analyzeRules(policyRule: any): PolicyRuleAnalysis {
    const conditions = this.extractConditions(policyRule.if);
    const fieldChecks = this.extractFieldChecks(policyRule.if);
    const logicalOperators = this.extractLogicalOperators(policyRule.if);
    
    return {
      conditions,
      logicalOperators,
      fieldChecks,
      complexity: this.assessComplexity(conditions, logicalOperators, fieldChecks)
    };
  }

  /**
   * Extract detailed condition information
   */
  private extractConditions(condition: PolicyCondition): PolicyConditionInfo[] {
    const conditions: PolicyConditionInfo[] = [];

    if (!condition) return conditions;

    // Handle logical operators
    if (condition.allOf) {
      conditions.push({
        type: 'logical',
        operator: 'allOf',
        nested: condition.allOf.flatMap(c => this.extractConditions(c))
      });
    }

    if (condition.anyOf) {
      conditions.push({
        type: 'logical', 
        operator: 'anyOf',
        nested: condition.anyOf.flatMap(c => this.extractConditions(c))
      });
    }

    if (condition.not) {
      conditions.push({
        type: 'logical',
        operator: 'not',
        nested: this.extractConditions(condition.not)
      });
    }

    // Handle field conditions
    if (condition.field) {
      const operators = ['equals', 'notEquals', 'like', 'notLike', 'match', 'notMatch', 
                        'contains', 'notContains', 'in', 'notIn', 'exists', 
                        'less', 'lessOrEquals', 'greater', 'greaterOrEquals'];
      
      for (const op of operators) {
        if (condition[op as keyof PolicyCondition] !== undefined) {
          conditions.push({
            type: 'field',
            operator: op,
            field: condition.field,
            value: condition[op as keyof PolicyCondition]
          });
        }
      }
    }

    // Handle count function
    if (condition.count) {
      conditions.push({
        type: 'function',
        operator: 'count',
        field: condition.count.field,
        value: condition.count,
        nested: condition.count.where ? this.extractConditions(condition.count.where) : []
      });
    }

    return conditions;
  }

  /**
   * Extract field checks for analysis
   */
  private extractFieldChecks(condition: PolicyCondition): FieldCheck[] {
    const fieldMap = new Map<string, FieldCheck>();

    const processCondition = (cond: PolicyCondition) => {
      if (!cond) return;

      if (cond.field) {
        const operators = [];
        const values = [];
        
        const checkOps = ['equals', 'notEquals', 'like', 'notLike', 'in', 'notIn', 'exists'];
        for (const op of checkOps) {
          if (cond[op as keyof PolicyCondition] !== undefined) {
            operators.push(op);
            values.push(cond[op as keyof PolicyCondition]);
          }
        }

        if (operators.length > 0) {
          const existing = fieldMap.get(cond.field);
          if (existing) {
            existing.operators.push(...operators);
            existing.values.push(...values);
          } else {
            fieldMap.set(cond.field, {
              field: cond.field,
              operators,
              values,
              required: operators.includes('exists') ? cond.exists === true : false
            });
          }
        }
      }

      // Recursively process nested conditions
      if (cond.allOf) cond.allOf.forEach(processCondition);
      if (cond.anyOf) cond.anyOf.forEach(processCondition);
      if (cond.not) processCondition(cond.not);
    };

    processCondition(condition);
    return Array.from(fieldMap.values());
  }

  /**
   * Extract logical operators used in policy
   */
  private extractLogicalOperators(condition: PolicyCondition): string[] {
    const operators = new Set<string>();

    const processCondition = (cond: PolicyCondition) => {
      if (!cond) return;

      if (cond.allOf) {
        operators.add('allOf');
        cond.allOf.forEach(processCondition);
      }
      if (cond.anyOf) {
        operators.add('anyOf');
        cond.anyOf.forEach(processCondition);
      }
      if (cond.not) {
        operators.add('not');
        processCondition(cond.not);
      }
    };

    processCondition(condition);
    return Array.from(operators);
  }

  /**
   * Assess rule complexity
   */
  private assessComplexity(
    conditions: PolicyConditionInfo[], 
    logicalOperators: string[], 
    fieldChecks: FieldCheck[]
  ): 'simple' | 'moderate' | 'complex' {
    const totalConditions = conditions.length;
    const logicalOpCount = logicalOperators.length;
    const fieldCount = fieldChecks.length;

    if (totalConditions <= 3 && logicalOpCount <= 1 && fieldCount <= 2) {
      return 'simple';
    }
    
    if (totalConditions <= 8 && logicalOpCount <= 3 && fieldCount <= 5) {
      return 'moderate';
    }
    
    return 'complex';
  }

  /**
   * Extract resource types affected by the policy
   */
  private extractResourceTypes(policyRule: any): string[] {
    const resourceTypes = new Set<string>();

    const extractFromCondition = (condition: PolicyCondition) => {
      if (!condition) return;

      // Check for type field
      if (condition.field === 'type') {
        if (condition.equals && typeof condition.equals === 'string') {
          resourceTypes.add(condition.equals);
        }
        if (condition.in && Array.isArray(condition.in)) {
          condition.in.forEach(type => {
            if (typeof type === 'string') resourceTypes.add(type);
          });
        }
      }

      // Check for resource type patterns in field names
      if (condition.field && typeof condition.field === 'string') {
        // Extract resource type from field paths like "Microsoft.Compute/virtualMachines/property"
        const match = condition.field.match(/^(Microsoft\.\w+\/\w+)/);
        if (match) {
          resourceTypes.add(match[1]);
        }
      }

      // Recursively check nested conditions
      if (condition.allOf) condition.allOf.forEach(extractFromCondition);
      if (condition.anyOf) condition.anyOf.forEach(extractFromCondition);
      if (condition.not) extractFromCondition(condition.not);
    };

    extractFromCondition(policyRule.if);
    
    // If no specific types found, return common types based on field patterns
    if (resourceTypes.size === 0) {
      return this.inferResourceTypesFromFields(policyRule.if);
    }

    return Array.from(resourceTypes);
  }

  /**
   * Infer resource types from field patterns
   */
  private inferResourceTypesFromFields(condition: PolicyCondition): string[] {
    const fieldPatterns = new Map([
      ['location', ['*']], // Most resources have location
      ['tags', ['*']], // Most resources support tags
      ['sku', ['Microsoft.Compute/virtualMachines', 'Microsoft.Storage/storageAccounts']],
      ['properties.encryption', ['Microsoft.Storage/storageAccounts', 'Microsoft.KeyVault/vaults']],
      ['properties.networkAcls', ['Microsoft.Storage/storageAccounts']],
      ['properties.supportsHttpsTrafficOnly', ['Microsoft.Storage/storageAccounts']],
      ['properties.minimumTlsVersion', ['Microsoft.Storage/storageAccounts']]
    ]);

    const foundFields = new Set<string>();
    
    const collectFields = (cond: PolicyCondition) => {
      if (!cond) return;
      
      if (cond.field) {
        foundFields.add(cond.field);
      }
      
      if (cond.allOf) cond.allOf.forEach(collectFields);
      if (cond.anyOf) cond.anyOf.forEach(collectFields);
      if (cond.not) collectFields(cond.not);
    };

    collectFields(condition);

    const inferredTypes = new Set<string>();
    for (const field of foundFields) {
      for (const [pattern, types] of fieldPatterns) {
        if (field.includes(pattern)) {
          types.forEach(type => {
            if (type === '*') {
              // Add common types for universal fields
              this.commonResourceTypes.forEach(rt => inferredTypes.add(rt));
            } else {
              inferredTypes.add(type);
            }
          });
        }
      }
    }

    return Array.from(inferredTypes);
  }

  /**
   * Extract policy effects information
   */
  private extractEffects(policyRule: any): PolicyEffectInfo[] {
    const effects: PolicyEffectInfo[] = [];
    
    if (policyRule.then && policyRule.then.effect) {
      const effect = policyRule.then.effect;
      const details = policyRule.then.details;

      effects.push({
        effect,
        hasDetails: !!details,
        requiresRoleDefinitions: !!(details?.roleDefinitionIds?.length),
        deploysResources: effect === 'deployIfNotExists' && !!details?.deployment,
        modifiesResources: effect === 'modify' && !!(details?.operations?.length)
      });
    }

    return effects;
  }

  /**
   * Validate policy definition
   */
  validatePolicy(policy: AzurePolicyDefinition): PolicyValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!policy.properties) {
      errors.push('Missing properties object');
      return { isValid: false, errors, warnings, resourceTypeCompatibility: [] };
    }

    const props = policy.properties;
    
    if (!props.displayName) errors.push('Missing displayName');
    if (!props.description) errors.push('Missing description');
    if (!props.policyRule) errors.push('Missing policyRule');
    if (!props.mode) errors.push('Missing mode');

    // Policy rule validation
    if (props.policyRule) {
      if (!props.policyRule.if) errors.push('Missing if condition in policyRule');
      if (!props.policyRule.then) errors.push('Missing then effect in policyRule');
      
      if (props.policyRule.then && !props.policyRule.then.effect) {
        errors.push('Missing effect in then clause');
      }
    }

    // Metadata validation
    if (!props.metadata?.category) {
      warnings.push('Missing category in metadata');
    }

    // Parameter validation
    if (props.parameters) {
      for (const [name, param] of Object.entries(props.parameters)) {
        if (!param.type) {
          errors.push(`Parameter ${name} missing type`);
        }
      }
    }

    const resourceTypeCompatibility = this.analyzeResourceTypeCompatibility(props);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      resourceTypeCompatibility
    };
  }

  /**
   * Analyze resource type compatibility
   */
  private analyzeResourceTypeCompatibility(props: any): ResourceTypeCompatibility[] {
    if (!props.policyRule || !props.policyRule.if) {
      return [];
    }
    
    const extractedTypes = this.extractResourceTypes(props.policyRule);
    const fieldChecks = this.extractFieldChecks(props.policyRule.if);

    return extractedTypes.map(resourceType => {
      const requiredFields = fieldChecks
        .filter(fc => fc.required)
        .map(fc => fc.field);
        
      const optionalFields = fieldChecks
        .filter(fc => !fc.required)
        .map(fc => fc.field);

      return {
        resourceType,
        compatible: true, // Basic assumption - could be enhanced with schema validation
        requiredFields,
        optionalFields
      };
    });
  }
}