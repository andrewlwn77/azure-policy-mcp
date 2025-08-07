/**
 * Centralized error handling with user-friendly messaging
 */

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export class GitHubApiError extends McpError {
  constructor(message: string, statusCode: number = 503) {
    super(message, 'GITHUB_API_ERROR', statusCode);
    this.name = 'GitHubApiError';
  }
}

export class PolicyParsingError extends McpError {
  constructor(message: string) {
    super(message, 'POLICY_PARSING_ERROR', 422);
    this.name = 'PolicyParsingError';
  }
}

export class TemplateValidationError extends McpError {
  constructor(message: string) {
    super(message, 'TEMPLATE_VALIDATION_ERROR', 422);
    this.name = 'TemplateValidationError';
  }
}

export class ErrorHandler {
  static handleError(error: unknown): McpError {
    if (error instanceof McpError) {
      return error;
    }

    if (error instanceof Error) {
      return new McpError(
        `Unexpected error: ${error.message}`,
        'INTERNAL_ERROR',
        500
      );
    }

    return new McpError(
      'An unknown error occurred',
      'UNKNOWN_ERROR',
      500
    );
  }

  static createToolResponse(error: McpError): {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  } {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }

  static sanitizeErrorForLogging(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    return String(error);
  }
}