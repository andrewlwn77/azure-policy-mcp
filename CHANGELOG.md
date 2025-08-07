# Changelog

All notable changes to the Azure Policy MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-08

### Added
- Initial release of Azure Policy MCP Server
- GitHub Search API integration for fast policy and template discovery
- 5 production-ready MCP tools:
  - `analyze_policy_requirements` - Analyze applicable Azure policies
  - `validate_bicep_against_policies` - Validate Bicep against policies
  - `search_bicep_templates` - Search Azure QuickStart templates
  - `recommend_bicep_templates` - Generate policy-compliant Bicep code
  - `refresh_data_sources` - Clear search caches
- Real-time policy analysis using Azure/azure-policy repository
- Direct template search in Azure/azure-quickstart-templates
- Intelligent caching with 10-minute cache windows
- Request timeout management (10-30 seconds)
- GitHub token support for higher rate limits
- Comprehensive error handling and logging

### Performance
- Policy analysis: < 2 seconds
- Template search: < 2 seconds  
- Template validation: < 3 seconds
- Code generation: < 1 second

### Architecture
- Lightweight, API-first design
- No heavy repository indexing
- GitHub Search API for real-time data
- Direct file fetching for specific policies
- Production-ready TypeScript implementation