# Azure Policy MCP Server

A comprehensive Model Context Protocol (MCP) server that enables Claude Code to generate policy-compliant Azure Bicep infrastructure from natural language descriptions.

## Overview

The Azure Policy MCP Server transforms Claude Code into an intelligent infrastructure development partner by combining comprehensive Azure Policy knowledge with extensive Bicep template databases. This enables developers to generate policy-compliant Azure infrastructure from natural language descriptions, eliminating deployment failures and dramatically accelerating compliant cloud development.

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

## Installation

### Method 1: NPX (Recommended)

```bash
# Add to Claude Code configuration
claude mcp add-json azure-policy-mcp '{
  "command": "npx",
  "args": ["-y", "azure-policy-mcp"]
}'
```

### Method 2: Global NPM Installation

```bash
npm install -g azure-policy-mcp
```

Then configure Claude Code:
```json
{
  "mcpServers": {
    "azure-policy-mcp": {
      "command": "azure-policy-mcp",
      "args": []
    }
  }
}
```

## Usage

Once installed, the Azure Policy MCP integrates seamlessly with Claude Code. Use natural language commands:

```
"Create a secure storage account for healthcare data"
"What policies apply to virtual machines in my subscription?"
"Validate this Bicep template against Azure policies"
"Fix policy violations in my infrastructure template"
```

## MCP Tools

### `generate_compliant_infrastructure`
Generate policy-compliant Bicep code from natural language descriptions.

**Example:**
```
Input: "Create secure web app infrastructure with database for financial services"
Output: Complete Bicep template with App Service, SQL Database, Key Vault, and compliance configurations
```

### `analyze_policy_requirements`
Analyze and explain applicable Azure policies for specific resources.

**Example:**
```
Input: "storage account"
Output: List of applicable policies with human-readable explanations and compliance guidance
```

### `validate_template_compliance`
Validate existing Bicep templates against all applicable policies.

**Example:**
```
Input: Bicep template
Output: Comprehensive compliance report with specific violations and remediation suggestions
```

### `generate_compliance_fixes`
Generate specific code changes to resolve policy violations.

### `discover_compliant_templates`
Search and retrieve proven compliant templates from comprehensive database.

## Data Sources

- **Azure Policy Repository**: 93+ categories, 500+ policy definitions
- **Azure QuickStart Templates**: 1000+ Bicep templates
- **Azure Docs Bicep Samples**: 100+ real-world examples  
- **Azure Resource Modules**: 50+ production-ready modules

## Configuration

### Environment Variables

- `GITHUB_TOKEN`: Optional GitHub API token for higher rate limits
- `CACHE_SIZE_MB`: Maximum cache size in megabytes (default: 256)
- `LOG_LEVEL`: Logging level - error, warn, info, debug (default: info)

### Performance

- **Policy Analysis**: < 3 seconds
- **Template Validation**: < 5 seconds
- **Code Generation**: < 10 seconds
- **Template Search**: < 2 seconds

## Development

### Prerequisites
- Node.js 18+
- TypeScript 5.0+
- GitHub access for fetching templates and policies

### Setup
```bash
git clone <repository-url>
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

The Azure Policy MCP follows a modular monolith architecture:

```
src/
├── tools/              # MCP tool implementations
├── services/           # Core business logic
├── infrastructure/     # Cross-cutting concerns
├── server/            # MCP server setup
└── types/             # TypeScript definitions
```

### Key Components

- **Policy Intelligence Engine**: Policy discovery and rule interpretation
- **Template Intelligence Engine**: Template matching and code generation  
- **Validation Engine**: Compliance checking and fix suggestions
- **Data Access Layer**: GitHub integration with intelligent caching
- **Session State Manager**: Context preservation across tool invocations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the test suite
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: Report bugs and request features
- Documentation: See `/docs` directory for detailed guides

---

Built with the BMAD Method for comprehensive, production-ready software development.