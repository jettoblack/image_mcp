#!/usr/bin/env node
import { Command } from 'commander';
import { z } from 'zod';

// Define configuration schema with validation
const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().default('http://localhost:9292/v1'),
  model: z.string().optional(),
  streaming: z.boolean().default(true),
  timeout: z.number().min(1000).max(300000).default(60000),
  maxRetries: z.number().min(0).max(5).default(3),
});

export type Config = z.infer<typeof ConfigSchema>;

// Default configuration for testing
const DEFAULT_CONFIG: Partial<Config> = {
  baseUrl: 'http://localhost:9292/v1',
  apiKey: 'key',
  streaming: true,
  timeout: 60000,
  maxRetries: 3,
};

/**
 * Configuration Manager for the MCP Image Summarization Server
 * Handles environment variables and command line arguments
 */
export class ConfigManager {
  private config: Config;

  constructor() {
    const program = new Command();
    
    // Set up command line arguments
    program
      .name('@jettoblack/image_mcp')
      .description('MCP server for image summarization')
      .version('1.0.0');

    program
      .option('-k, --api-key <key>', 'OpenAI API key')
      .option('-u, --base-url <url>', 'OpenAI API base URL', DEFAULT_CONFIG.baseUrl)
      .option('-m, --model <model>', 'Default model to use')
      .option('--no-streaming', 'Disable streaming responses')
      .option('-t, --timeout <ms>', 'Request timeout in milliseconds', parseInt)
      .option('-r, --max-retries <count>', 'Maximum number of retries', parseInt);

    program.parse();

    const cliOptions = program.opts();

    // Build configuration with precedence: CLI > Environment > Defaults
    this.config = ConfigSchema.parse({
      apiKey: cliOptions.apiKey ?? process.env.OPENAI_API_KEY ?? DEFAULT_CONFIG.apiKey,
      baseUrl: cliOptions.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_CONFIG.baseUrl,
      model: cliOptions.model ?? process.env.OPENAI_MODEL,
      streaming: cliOptions.streaming ?? DEFAULT_CONFIG.streaming,
      timeout: cliOptions.timeout ?? (process.env.OPENAI_TIMEOUT ? parseInt(process.env.OPENAI_TIMEOUT) : DEFAULT_CONFIG.timeout),
      maxRetries: cliOptions.maxRetries ?? (process.env.OPENAI_MAX_RETRIES ? parseInt(process.env.OPENAI_MAX_RETRIES) : DEFAULT_CONFIG.maxRetries),
    });
  }

  /**
   * Get the complete configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Get API key
   */
  getApiKey(): string {
    return this.config.apiKey;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get the configured model
   */
  getModel(): string {
    return this.config.model ?? '';
  }

  /**
   * Check if streaming is enabled
   */
  isStreamingEnabled(): boolean {
    return this.config.streaming;
  }

  /**
   * Get timeout in milliseconds
   */
  getTimeout(): number {
    return this.config.timeout;
  }

  /**
   * Get maximum retry attempts
   */
  getMaxRetries(): number {
    return this.config.maxRetries;
  }

}

// Export singleton instance
export const configManager = new ConfigManager();