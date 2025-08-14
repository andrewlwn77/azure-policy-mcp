/**
 * Documentation Parser Service
 * 
 * Handles parsing and structuring of scraped Azure documentation content
 */

export interface PropertyDetail {
  name: string;
  type: string;
  required: boolean;
  description: string;
  constraints?: string;
  deprecated?: boolean;
  valid_values?: string[];
}

export interface ParsedSchema {
  properties: string[];
  required_properties: string[];
  api_version: string;
}

export interface ParsedExamples {
  bicep?: string;
  arm?: string;
  terraform?: string;
}

export class DocumentationParser {
  
  /**
   * Parse property information from table rows
   */
  static parsePropertyTable(tableRows: any[]): PropertyDetail[] {
    const properties: PropertyDetail[] = [];
    
    for (const row of tableRows) {
      const cells = row.cells || [];
      if (cells.length < 2) continue;
      
      const property = this.parsePropertyRow(cells);
      if (property) {
        properties.push(property);
      }
    }
    
    return properties;
  }

  /**
   * Parse a single property row from a table
   */
  private static parsePropertyRow(cells: any[]): PropertyDetail | null {
    try {
      const name = this.extractCellText(cells[0])?.trim();
      if (!name || this.isHeaderRow(name)) {
        return null;
      }

      const description = this.extractCellText(cells[1])?.trim() || 'No description available';
      const type = this.extractCellText(cells[2])?.trim() || 'string';
      const requiredText = this.extractCellText(cells[3])?.trim().toLowerCase() || '';
      
      // Determine if property is required
      const required = requiredText.includes('yes') || 
                     requiredText.includes('required') || 
                     requiredText.includes('true');

      // Extract constraints if available
      const constraints = this.extractConstraints(description, cells[4]);
      
      // Check for deprecation
      const deprecated = description.toLowerCase().includes('deprecated') ||
                        description.toLowerCase().includes('obsolete');

      // Extract valid values if available
      const validValues = this.extractValidValues(description, constraints);

      const property: PropertyDetail = {
        name,
        type: this.normalizeType(type),
        required,
        description,
        deprecated
      };

      if (constraints !== undefined) {
        property.constraints = constraints;
      }

      if (validValues !== undefined) {
        property.valid_values = validValues;
      }

      return property;

    } catch (error) {
      console.warn('Failed to parse property row:', error);
      return null;
    }
  }

  /**
   * Extract text content from a table cell
   */
  private static extractCellText(cell: any): string {
    if (!cell) return '';
    
    // Handle different cell formats
    if (typeof cell === 'string') return cell;
    if (cell.textContent) return cell.textContent;
    if (cell.innerText) return cell.innerText;
    if (cell.text) return cell.text;
    
    return String(cell);
  }

  /**
   * Check if this is a header row
   */
  private static isHeaderRow(text: string): boolean {
    const headerKeywords = ['property', 'name', 'type', 'description', 'required'];
    return headerKeywords.some(keyword => 
      text.toLowerCase().includes(keyword) && text.length < 50
    );
  }

  /**
   * Extract constraints from description or constraints cell
   */
  private static extractConstraints(description: string, constraintsCell?: any): string | undefined {
    const constraintsText = this.extractCellText(constraintsCell);
    if (constraintsText && constraintsText.trim() && !constraintsText.toLowerCase().includes('n/a')) {
      return constraintsText.trim();
    }

    // Look for constraints in the description
    const constraintPatterns = [
      /valid values?:?\s*([^.]+)/i,
      /allowed values?:?\s*([^.]+)/i,
      /must be:?\s*([^.]+)/i,
      /range:?\s*([^.]+)/i,
      /between\s+(\d+)\s+and\s+(\d+)/i
    ];

    for (const pattern of constraintPatterns) {
      const match = description.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Extract valid values from description or constraints
   */
  private static extractValidValues(description: string, constraints?: string): string[] | undefined {
    const text = `${description} ${constraints || ''}`.toLowerCase();
    
    // Look for enum-like values in quotes or parentheses
    const enumPattern = /["']([^"']+)["']/g;
    const values: string[] = [];
    let match;
    
    while ((match = enumPattern.exec(text)) !== null) {
      values.push(match[1]);
    }
    
    if (values.length > 0) {
      return values;
    }

    // Look for pipe-separated values
    const pipePattern = /(?:valid|allowed)\s+values?:?\s*([^.]+)/i;
    const pipeMatch = text.match(pipePattern);
    if (pipeMatch) {
      const pipeValues = pipeMatch[1]
        .split(/[|,]/)
        .map(v => v.trim())
        .filter(v => v.length > 0 && v.length < 50);
      
      if (pipeValues.length > 0) {
        return pipeValues;
      }
    }

    return undefined;
  }

  /**
   * Normalize type names to consistent format
   */
  private static normalizeType(type: string): string {
    const normalizedType = type.toLowerCase().trim();
    
    const typeMap: Record<string, string> = {
      'str': 'string',
      'text': 'string',
      'int': 'integer',
      'num': 'number',
      'bool': 'boolean',
      'arr': 'array',
      'obj': 'object'
    };

    return typeMap[normalizedType] || type;
  }

  /**
   * Parse code examples and categorize by language
   */
  static parseCodeExamples(codeBlocks: any[]): ParsedExamples {
    const examples: ParsedExamples = {};

    for (const block of codeBlocks) {
      const content = this.extractCellText(block);
      if (!content || content.length < 10) continue;

      const language = this.detectCodeLanguage(content, block);
      if (language && !examples[language]) {
        examples[language] = this.cleanCodeExample(content);
      }
    }

    return examples;
  }

  /**
   * Detect programming language from code content
   */
  private static detectCodeLanguage(content: string, block?: any): keyof ParsedExamples | null {
    // Check parent element or block attributes for language hints
    const parentText = block?.parentElement?.textContent?.toLowerCase() || '';
    const className = block?.className?.toLowerCase() || '';
    
    if (parentText.includes('bicep') || className.includes('bicep')) {
      return 'bicep';
    }
    if (parentText.includes('terraform') || className.includes('terraform')) {
      return 'terraform';
    }
    if (parentText.includes('arm') || parentText.includes('template') || className.includes('json')) {
      return 'arm';
    }

    // Detect by content patterns
    if (content.includes('resource ') && content.includes("'") && content.includes('@')) {
      return 'bicep';
    }
    if (content.includes('resource "azurerm_') || content.includes('provider "azurerm"')) {
      return 'terraform';
    }
    if (content.includes('"$schema"') && content.includes('"resources"')) {
      return 'arm';
    }

    return null;
  }

  /**
   * Clean and format code examples
   */
  private static cleanCodeExample(content: string): string {
    return content
      .trim()
      .replace(/^\s*```\w*\s*/, '') // Remove opening code fences
      .replace(/\s*```\s*$/, '')    // Remove closing code fences
      .replace(/^\s*<code>/, '')    // Remove opening HTML code tags
      .replace(/<\/code>\s*$/, '')  // Remove closing HTML code tags
      .trim();
  }

  /**
   * Extract API version from various sources
   */
  static extractApiVersion(content: any): string {
    // Try different selectors and patterns for API version
    const apiVersionPatterns = [
      /@(\d{4}-\d{2}-\d{2}(?:-preview)?)/,  // Bicep format
      /"apiVersion":\s*"([^"]+)"/,           // ARM JSON format
      /api[_-]?version[:\s=]+([^\s,\]})]+)/i // General pattern
    ];

    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (content?.textContent) {
      text = content.textContent;
    }

    for (const pattern of apiVersionPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return 'unknown';
  }

  /**
   * Create schema structure from parsed properties
   */
  static createSchema(properties: PropertyDetail[], apiVersion: string): ParsedSchema {
    return {
      properties: properties.map(p => p.name),
      required_properties: properties.filter(p => p.required).map(p => p.name),
      api_version: apiVersion
    };
  }

  /**
   * Validate and clean parsed data
   */
  static validateAndCleanData(data: any): any {
    try {
      // Ensure required fields exist
      if (!data.schema) {
        data.schema = { properties: [], required_properties: [], api_version: 'unknown' };
      }
      if (!data.property_details) {
        data.property_details = [];
      }
      if (!data.examples) {
        data.examples = {};
      }

      // Remove any null or undefined values
      data.schema.properties = (data.schema.properties || []).filter(Boolean);
      data.schema.required_properties = (data.schema.required_properties || []).filter(Boolean);
      data.property_details = (data.property_details || []).filter(Boolean);

      // Limit arrays to reasonable sizes to prevent huge responses
      if (data.property_details.length > 50) {
        data.property_details = data.property_details.slice(0, 50);
      }

      return data;
    } catch (error) {
      console.warn('Data validation failed:', error);
      return {
        schema: { properties: [], required_properties: [], api_version: 'unknown' },
        property_details: [],
        examples: {}
      };
    }
  }
}