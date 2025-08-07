#!/usr/bin/env node

/**
 * Entry point for the Azure Policy MCP server
 */

import { AzurePolicyMcpServer } from './server/mcp-server.js';

async function main(): Promise<void> {
  try {
    const server = new AzurePolicyMcpServer();
    await server.start();
    
    console.error('Azure Policy MCP Server running on stdio');
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.error('Shutting down Azure Policy MCP Server...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Fatal error starting Azure Policy MCP Server:', error);
    process.exit(1);
  }
}

main().catch(console.error);