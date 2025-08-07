/**
 * MCP-specific type definitions
 */

export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolExecutionContext {
  name: string;
  arguments: Record<string, any>;
}