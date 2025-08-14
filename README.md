# Azure Policy MCP Server

A Model Context Protocol (MCP) server that provides Azure policy analysis and Bicep template generation capabilities for Claude Code. Generate policy-compliant Azure infrastructure using natural language descriptions and GitHub Search API for fast, real-time results.

## Overview

The Azure Policy MCP Server integrates Azure policy intelligence with Bicep template generation, enabling developers to:
- Analyze Azure policies applicable to specific resource types
- Generate policy-compliant Bicep templates from natural language
- Validate existing templates against Azure policies  
- Search Azure QuickStart templates efficiently
- Get policy compliance recommendations
- Scrape live Azure resource documentation from Microsoft Learn

Built with GitHub Search API for fast responses and real-time data access.

## Features

### 🧠 **Intelligent Infrastructure Generation**
- Generate policy-compliant Bicep code from natural language descriptions
- Context-aware template customization for specific environments and requirements
- Automated compliance validation and explanatory documentation

### 📋 **Policy Intelligence**
- Discover and analyze applicable Azure policies for any resource type
- Human-readable policy explanations with compliance guidance
- Policy requirement translation to specific technical configurations

### ✅ **Template Validation & Remediation**
- Comprehensive policy validation of existing Bicep templates
- Automated fix generation for policy violations
- Multi-option remediation with trade-off analysis

### 🔍 **Smart Template Discovery**
- Search 1000+ proven compliant templates from comprehensive database
- Relevance ranking and compliance quality assessment
- Template customization guidance and real-time validation

### 📖 **Progressive Documentation Access**
- **Two-function architecture** for optimal user experience without information overload
- **Quick Overview**: Fast metadata extraction (property counts, complexity assessment, available sections)
- **Selective Retrieval**: Get only the sections you need (properties, code examples, API versions, quick summary)
- **Real-time scraping** from Microsoft Learn with Bicep, ARM, and Terraform support
- **Smart caching** with configurable duration up to 24 hours

## Installation

### Method 1: NPX (Recommended)

Add the following to your Claude Code `.mcp.json` configuration file:

```json
{
  "azure-policy-mcp": {
    "command": "npx",
    "args": ["-y", "azure-policy-mcp"],
    "transport": {"type": "stdio"},
    "env": {
      "NODE_ENV": "production",
      "GITHUB_TOKEN": "your_github_token_here"
    },
    "disabled": false,
    "autoApprove": [],
    "description": "Azure Policy MCP Server - Generate policy-compliant Bicep templates from natural language"
  }
}
```

### Method 2: Global NPM Installation

```bash
npm install -g azure-policy-mcp
```

Then add to your `.mcp.json` configuration:
```json
{
  "azure-policy-mcp": {
    "command": "azure-policy-mcp",
    "transport": {"type": "stdio"},
    "env": {
      "GITHUB_TOKEN": "your_github_token_here"
    }
  }
}
```

### GitHub Token Setup

For best performance, add a GitHub personal access token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a token with `public_repo` access
3. Add it to your MCP configuration as shown above

Without a token, you'll be limited to 60 API requests per hour.

## Usage

Once installed, the Azure Policy MCP integrates seamlessly with Claude Code. Use natural language commands:

```
"Create a secure storage account for healthcare data"
"What policies apply to virtual machines in my subscription?"
"Validate this Bicep template against Azure policies"
"Fix policy violations in my infrastructure template"
"Get overview of Azure Key Vault documentation"
"Show me only the properties for Azure App Service"
"Get Bicep examples and API versions for Storage Accounts"
```

## Available MCP Tools

### `analyze_policy_requirements`
Analyze Azure policies applicable to specific resource types and provide compliance guidance.

**Parameters:**
- `resource_types` (required): Array of Azure resource types (e.g., `["Microsoft.Storage/storageAccounts"]`)
- `policy_categories` (optional): Filter by policy categories (e.g., `["Security", "Compliance"]`)
- `include_deprecated` (optional): Include deprecated policies (default: false)

### `validate_bicep_against_policies`
Validate Bicep template against Azure policies and identify compliance issues.

**Parameters:**
- `bicep_content` (required): Bicep template content to validate
- `policy_categories` (optional): Policy categories to validate against

### `search_bicep_templates`
Search Azure Bicep templates by resource types, categories, and keywords.

**Parameters:**
- `resource_types` (optional): Resource types to search for
- `categories` (optional): Template categories (Compute, Storage, Network, etc.)
- `keywords` (optional): Keywords to search in template names
- `max_complexity` (optional): Maximum template complexity (simple, moderate, complex)
- `limit` (optional): Maximum number of results (default: 10)

### `recommend_bicep_templates`
Get template recommendations based on requirements and generate policy-compliant Bicep code.

**Parameters:**
- `requirements` (required): Natural language description of infrastructure needs
- `resource_types` (optional): Specific Azure resource types needed
- `include_monitoring` (optional): Include monitoring and diagnostics (default: true)
- `include_security` (optional): Include security best practices (default: true)

### `fetch_azure_documentation_overview`
Get a lightweight overview of Azure resource documentation for quick assessment without information overload.

**Parameters:**
- `resource_type` (required): Azure resource type (e.g., `"Microsoft.Storage/storageAccounts"`)
- `cache_duration` (optional): Cache duration in minutes (default: 60, max: 1440)

**Returns:**
- Property count and complexity assessment
- Number of available code examples and API versions
- List of available sections for detailed retrieval
- Fast response time (~1-2 seconds)

### `fetch_azure_documentation_details`
Get detailed Azure resource documentation with selective section retrieval to avoid overwhelming users.

**Parameters:**
- `resource_type` (required): Azure resource type (e.g., `"Microsoft.Storage/storageAccounts"`)
- `sections` (optional): Array of sections to retrieve - `["properties", "code_examples", "api_versions", "quick_summary"]` (default: all)
- `language` (optional): Documentation language preference - `"bicep"`, `"arm"`, or `"terraform"` (default: `"bicep"`)
- `include_examples` (optional): Include code examples in response (default: `true`)
- `cache_duration` (optional): Cache duration in minutes (default: 60, max: 1440)

**Example Usage:**
```
"Get overview of Azure Storage Account documentation"
"Show me just the API versions for Virtual Machines"
"Get properties and code examples for Azure Key Vault"
"Fetch only Bicep examples for App Service"
```

### `refresh_data_sources`
Refresh cached data from GitHub repositories.

**Parameters:**
- `data_source` (optional): Specific data source to refresh

## Data Sources

The MCP server uses GitHub Search API to access real-time data from:

- **Azure Policy Repository** (`Azure/azure-policy`): Official Azure policy definitions
- **Azure QuickStart Templates** (`Azure/azure-quickstart-templates`): Community-driven Bicep templates
- **Live GitHub Search**: Real-time search across Azure repositories
- **Microsoft Learn Documentation** (`learn.microsoft.com`): Live Azure resource documentation scraping

## Configuration

### Environment Variables

- `GITHUB_TOKEN`: GitHub API token for higher rate limits (recommended)
- `PUPPETEER_EXECUTABLE_PATH`: Custom path to Chrome executable for documentation scraping (optional)
- `CACHE_SIZE_MB`: Maximum cache size in megabytes (default: 256)
- `LOG_LEVEL`: Logging level - error, warn, info, debug (default: info)
- `NODE_ENV`: Node environment (default: production)

### Performance

- **Policy Analysis**: < 2 seconds (with GitHub Search API)
- **Template Search**: < 2 seconds (direct directory search)
- **Template Validation**: < 3 seconds (cached policy lookups)
- **Code Generation**: < 1 second (template-based generation)
- **Documentation Overview**: 1-2 seconds (fast metadata extraction)
- **Documentation Details**: 3-5 seconds (selective content retrieval)

### Rate Limits

- **With GitHub Token**: 30 searches/minute, 5000 API requests/hour
- **Without Token**: 10 searches/minute, 60 API requests/hour

## Development

### Prerequisites
- Node.js 18+
- TypeScript 5.0+
- GitHub access for fetching templates and policies

### Setup
```bash
git clone https://github.com/andrewlwn77/azure-policy-mcp.git
cd azure-policy-mcp
npm install
npm run build
```

### Testing
```bash
npm test                # Run all tests
npm run test:unit      # Run unit tests
npm run test:integration # Run integration tests
npm run test:coverage   # Run with coverage
```

### Building
```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode for development
```

## Architecture

The Azure Policy MCP follows a lightweight, API-first architecture:

```
src/
├── server/            # MCP server and tool implementations
├── services/          # GitHub API integration and parsing
├── infrastructure/    # Caching, session management, error handling
└── types/             # TypeScript definitions
```

### Key Components

- **GitHub Search API Integration**: Fast, real-time policy and template discovery
- **Direct File Fetching**: Targeted file access without heavy indexing
- **Progressive Documentation System**: Two-function architecture preventing information overload
- **Puppeteer Browser Automation**: Direct Microsoft Learn documentation scraping
- **Intelligent Caching**: Separate cache strategies for overview and detailed content
- **Policy Parser**: JSON policy definition analysis and explanation
- **Template Generator**: Policy-compliant Bicep code generation
- **Timeout Management**: 10-30 second timeouts preventing hanging requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the test suite
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Publishing

To publish to npm:

```bash
npm version patch  # or minor, major
npm publish
```

**Note**: Publishing requires OTP (One-Time Password) authentication.

## Support

For issues and questions:
- **GitHub Issues**: [https://github.com/andrewlwn77/azure-policy-mcp/issues](https://github.com/andrewlwn77/azure-policy-mcp/issues)
- **GitHub Repository**: [https://github.com/andrewlwn77/azure-policy-mcp](https://github.com/andrewlwn77/azure-policy-mcp)

---

Built with the BMAD Method for comprehensive, production-ready software development.