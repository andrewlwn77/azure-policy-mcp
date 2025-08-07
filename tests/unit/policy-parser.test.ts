/**
 * Unit tests for PolicyParser
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { PolicyParser } from '../../src/services/policy/policy-parser.js';
import type { AzurePolicyDefinition } from '../../src/types/policy.js';

describe('PolicyParser', () => {
  let policyParser: PolicyParser;

  beforeEach(() => {
    policyParser = new PolicyParser();
  });

  const samplePolicy: AzurePolicyDefinition = {
    properties: {
      displayName: 'Storage accounts should use HTTPS',
      policyType: 'BuiltIn',
      mode: 'All',
      description: 'This policy ensures storage accounts use HTTPS only',
      metadata: {
        version: '1.0.0',
        category: 'Storage',
        preview: false,
        deprecated: false
      },
      parameters: {
        effect: {
          type: 'String',
          metadata: {
            displayName: 'Effect',
            description: 'The effect to apply when the policy is evaluated'
          },
          allowedValues: ['Audit', 'Deny', 'Disabled'],
          defaultValue: 'Audit'
        }
      },
      policyRule: {
        if: {
          allOf: [
            {
              field: 'type',
              equals: 'Microsoft.Storage/storageAccounts'
            },
            {
              field: 'Microsoft.Storage/storageAccounts/supportsHttpsTrafficOnly',
              notEquals: true
            }
          ]
        },
        then: {
          effect: '[parameters(\'effect\')]'
        }
      }
    },
    id: '/providers/Microsoft.Authorization/policyDefinitions/404c3081-a854-4457-ae30-26a93ef643f9',
    name: '404c3081-a854-4457-ae30-26a93ef643f9',
    type: 'Microsoft.Authorization/policyDefinitions'
  };

  const complexPolicy: AzurePolicyDefinition = {
    properties: {
      displayName: 'Complex VM Policy',
      policyType: 'BuiltIn',
      mode: 'Indexed',
      description: 'Complex policy with multiple conditions',
      metadata: {
        category: 'Compute'
      },
      policyRule: {
        if: {
          anyOf: [
            {
              allOf: [
                {
                  field: 'type',
                  equals: 'Microsoft.Compute/virtualMachines'
                },
                {
                  field: 'location',
                  in: ['eastus', 'westus']
                }
              ]
            },
            {
              not: {
                field: 'tags.environment',
                exists: true
              }
            }
          ]
        },
        then: {
          effect: 'deny'
        }
      }
    }
  };

  describe('parsePolicy', () => {
    test('should parse valid policy JSON successfully', () => {
      const policyJson = JSON.stringify(samplePolicy);
      const result = policyParser.parsePolicy(policyJson, 'test-id');

      expect(result.id).toBe('test-id');
      expect(result.displayName).toBe('Storage accounts should use HTTPS');
      expect(result.category).toBe('Storage');
      expect(result.policyType).toBe('BuiltIn');
      expect(result.parameters).toHaveLength(1);
      expect(result.parameters[0].name).toBe('effect');
      expect(result.resourceTypes).toContain('Microsoft.Storage/storageAccounts');
    });

    test('should throw error for invalid JSON', () => {
      expect(() => {
        policyParser.parsePolicy('invalid json');
      }).toThrow('Invalid policy JSON');
    });
  });

  describe('analyzePolicyDefinition', () => {
    test('should extract basic policy information', () => {
      const result = policyParser.analyzePolicyDefinition(samplePolicy);

      expect(result.displayName).toBe('Storage accounts should use HTTPS');
      expect(result.description).toBe('This policy ensures storage accounts use HTTPS only');
      expect(result.category).toBe('Storage');
      expect(result.version).toBe('1.0.0');
      expect(result.deprecated).toBe(false);
      expect(result.preview).toBe(false);
    });

    test('should handle missing optional fields', () => {
      const minimalPolicy: AzurePolicyDefinition = {
        properties: {
          displayName: 'Minimal Policy',
          policyType: 'Custom',
          mode: 'All',
          description: 'Minimal policy',
          policyRule: {
            if: { field: 'type', equals: 'Microsoft.Storage/storageAccounts' },
            then: { effect: 'audit' }
          }
        }
      };

      const result = policyParser.analyzePolicyDefinition(minimalPolicy);

      expect(result.category).toBe('General');
      expect(result.version).toBeUndefined();
      expect(result.deprecated).toBe(false);
      expect(result.preview).toBe(false);
      expect(result.parameters).toHaveLength(0);
    });
  });

  describe('parameter extraction', () => {
    test('should extract parameter information correctly', () => {
      const result = policyParser.analyzePolicyDefinition(samplePolicy);

      expect(result.parameters).toHaveLength(1);
      const param = result.parameters[0];
      expect(param.name).toBe('effect');
      expect(param.type).toBe('String');
      expect(param.displayName).toBe('Effect');
      expect(param.required).toBe(false); // has defaultValue
      expect(param.allowedValues).toEqual(['Audit', 'Deny', 'Disabled']);
      expect(param.defaultValue).toBe('Audit');
    });
  });

  describe('rule analysis', () => {
    test('should analyze simple policy rules', () => {
      const result = policyParser.analyzePolicyDefinition(samplePolicy);

      expect(result.rules.complexity).toBe('simple');
      expect(result.rules.logicalOperators).toContain('allOf');
      expect(result.rules.fieldChecks).toHaveLength(2);
      
      const typeCheck = result.rules.fieldChecks.find(fc => fc.field === 'type');
      expect(typeCheck?.operators).toContain('equals');
      expect(typeCheck?.values).toContain('Microsoft.Storage/storageAccounts');
    });

    test('should analyze complex policy rules', () => {
      const result = policyParser.analyzePolicyDefinition(complexPolicy);

      expect(result.rules.complexity).toBe('moderate');
      expect(result.rules.logicalOperators).toEqual(expect.arrayContaining(['anyOf', 'allOf', 'not']));
      expect(result.rules.conditions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resource type extraction', () => {
    test('should extract explicit resource types', () => {
      const result = policyParser.analyzePolicyDefinition(samplePolicy);

      expect(result.resourceTypes).toContain('Microsoft.Storage/storageAccounts');
    });

    test('should infer resource types from field patterns', () => {
      const policyWithFieldPattern: AzurePolicyDefinition = {
        properties: {
          displayName: 'Test Policy',
          policyType: 'Custom',
          mode: 'All',
          description: 'Test',
          policyRule: {
            if: {
              field: 'location',
              exists: true
            },
            then: {
              effect: 'audit'
            }
          }
        }
      };

      const result = policyParser.analyzePolicyDefinition(policyWithFieldPattern);

      expect(result.resourceTypes.length).toBeGreaterThan(0);
    });
  });

  describe('effect extraction', () => {
    test('should extract basic effects', () => {
      const result = policyParser.analyzePolicyDefinition(samplePolicy);

      expect(result.effects).toHaveLength(1);
      // Note: effect is parameterized, so it shows the parameter reference
    });

    test('should identify effect characteristics', () => {
      const deployPolicy: AzurePolicyDefinition = {
        properties: {
          displayName: 'Deploy Policy',
          policyType: 'Custom',
          mode: 'All',
          description: 'Deploy resources',
          policyRule: {
            if: { field: 'type', equals: 'Microsoft.Storage/storageAccounts' },
            then: {
              effect: 'deployIfNotExists',
              details: {
                type: 'Microsoft.Storage/storageAccounts/blobServices/containers',
                roleDefinitionIds: ['/providers/Microsoft.Authorization/roleDefinitions/17d1049b-9a84-46fb-8f53-869881c3d3ab'],
                deployment: {
                  properties: {
                    mode: 'incremental',
                    template: {},
                    parameters: {}
                  }
                }
              }
            }
          }
        }
      };

      const result = policyParser.analyzePolicyDefinition(deployPolicy);

      expect(result.effects).toHaveLength(1);
      const effect = result.effects[0];
      expect(effect.effect).toBe('deployIfNotExists');
      expect(effect.hasDetails).toBe(true);
      expect(effect.requiresRoleDefinitions).toBe(true);
      expect(effect.deploysResources).toBe(true);
    });
  });

  describe('policy validation', () => {
    test('should validate complete policy successfully', () => {
      const result = policyParser.validatePolicy(samplePolicy);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.resourceTypeCompatibility.length).toBeGreaterThan(0);
    });

    test('should identify missing required fields', () => {
      const incompletePolicy = {
        properties: {
          displayName: 'Incomplete Policy'
          // Missing other required fields
        }
      } as AzurePolicyDefinition;

      const result = policyParser.validatePolicy(incompletePolicy);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing description');
      expect(result.errors).toContain('Missing policyRule');
      expect(result.errors).toContain('Missing mode');
    });

    test('should identify warnings for recommended fields', () => {
      const policyWithoutCategory: AzurePolicyDefinition = {
        properties: {
          displayName: 'Test Policy',
          policyType: 'Custom',
          mode: 'All',
          description: 'Test policy',
          metadata: {}, // No category
          policyRule: {
            if: { field: 'type', equals: 'Microsoft.Storage/storageAccounts' },
            then: { effect: 'audit' }
          }
        }
      };

      const result = policyParser.validatePolicy(policyWithoutCategory);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Missing category in metadata');
    });
  });
});