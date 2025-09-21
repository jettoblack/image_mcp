import axios, { AxiosInstance } from 'axios';

// Define types for OpenAI API responses
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export interface ChatResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: 'assistant';
      content: string;
    };
    delta?: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason?: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelsResponse {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
  }>;
}

/**
 * OpenAI-compatible API client with streaming support and automatic retry logic
 */
export class OpenAIClient {
  private client: AxiosInstance;
  private maxRetries: number;

  /**
   * Creates a new OpenAI client instance
   * @param baseUrl - The base URL for the OpenAI-compatible API
   * @param apiKey - The API key for authentication
   * @param timeout - Request timeout in milliseconds (default: 60000)
   * @param maxRetries - Maximum number of retry attempts for failed requests (default: 3)
   */
  constructor(baseUrl: string, apiKey: string, timeout: number = 60000, maxRetries: number = 3) {
    this.maxRetries = maxRetries;

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: timeout,
    });

    // Set up retry interceptor with exponential backoff
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        if (!config || !config.retryCount) {
          config.retryCount = 0;
        }

        // Check if we should retry based on error type and retry count
        if (config.retryCount >= this.maxRetries || !this.shouldRetry(error)) {
          return Promise.reject(error);
        }

        config.retryCount += 1;

        // Exponential backoff: base delay of 1 second, multiplied by 2^(retryCount-1)
        // This gives delays of 1s, 2s, 4s, 8s, etc., capped at 30 seconds
        const delay = Math.min(1000 * Math.pow(2, config.retryCount - 1), 30000);

        console.warn(`Retrying request (attempt ${config.retryCount}/${this.maxRetries}) after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.client(config);
      }
    );
  }

  /**
   * Determines if an error should trigger a retry attempt
   * @param error - The error object from the failed request
   * @returns true if the request should be retried, false otherwise
   */
  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (!error.response) {
      // Network error or timeout
      return true;
    }

    const status = error.response.status;
    // Retry on 5xx server errors and 429 rate limit errors, but not on 4xx client errors
    return status >= 500 || status === 429;
  }

  /**
   * Fetches available models from the API
   * @returns Promise resolving to the models response
   */
  async getModels(): Promise<ModelsResponse> {
    try {
      const response = await this.client.get<ModelsResponse>('/models');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch models: ${this.getErrorString(error)}`);
    }
  }

  /**
   * Sends a chat completion request with optional streaming support
   * @param request - The chat completion request parameters
   * @param onChunk - Optional callback for handling streaming chunks
   * @returns Promise resolving to the chat completion response
   */
  async chatCompletion(
    request: ChatRequest,
    onChunk?: (chunk: ChatResponse) => void
  ): Promise<ChatResponse> {
    // Validate request
    if (!request || typeof request !== 'object') {
      throw new Error('Request is required and must be an object');
    }
    
    if (!request.model || typeof request.model !== 'string' || request.model.trim() === '') {
      throw new Error('Model is required and must be a non-empty string');
    }
    
    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      throw new Error('Messages are required and must be a non-empty array');
    }
    
    for (const message of request.messages) {
      if (!message || typeof message !== 'object') {
        throw new Error('Each message must be an object');
      }
      
      if (!message.role || !['system', 'user', 'assistant'].includes(message.role)) {
        throw new Error('Each message must have a valid role (system, user, or assistant)');
      }
      
      if (!message.content || !Array.isArray(message.content)) {
        throw new Error('Each message must have a content array');
      }
    }

    try {
      // Create a modified request with URL-encoded image URLs
      const modifiedRequest = {
        ...request,
        messages: request.messages.map(msg => ({
          ...msg,
          content: msg.content.map(c => {
            if (c.type === 'text') return c;
            if (c.type === 'image_url' && c.image_url?.url) {
              return {
                ...c,
                image_url: {
                  ...c.image_url,
                  url: c.image_url.url
                }
              };
            }
            return c;
          })
        }))
      };

      const response = await this.client.post('/chat/completions', modifiedRequest, {
        responseType: request.stream ? 'stream' : 'json',
        headers: request.stream ? { 'Accept': 'text/event-stream' } : {},
      });

      if (request.stream && onChunk && typeof response?.data === 'object') {
        // Handle streaming response
        const streamResult = await this.handleStreamResponse(response.data as AsyncIterable<unknown>, onChunk);
        // Return the final response for streaming
        return streamResult || this.createEmptyResponse(request.model);
      } else {
        // Handle non-streaming response
        return response?.data as ChatResponse;
      }
    } catch (error) {
      throw new Error(`Chat completion failed: ${this.getErrorString(error)}`);
    }
  }

  /**
   * Processes a streaming response from the OpenAI API
   * @param stream - The async iterable stream of response chunks
   * @param onChunk - Callback function to handle each chunk as it's received
   * @returns Promise resolving to the final complete response, or null if no complete response
   */
  private async handleStreamResponse(
    stream: AsyncIterable<unknown>,
    onChunk: (chunk: ChatResponse) => void
  ): Promise<ChatResponse | null> {
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: ChatResponse | null = null;

    for await (const chunk of stream) {
      if (chunk instanceof Buffer) {
        buffer += decoder.decode(chunk);
      } else if (typeof chunk === 'string') {
        buffer += chunk;
      }

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data) as ChatResponse;
            onChunk(parsed);
            
            // Keep track of the final response
            if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].finish_reason === 'stop') {
              finalResponse = parsed;
            }
          } catch (error) {
            console.warn('Failed to parse streaming chunk:', error);
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data) as ChatResponse;
            onChunk(parsed);
            
            // Keep track of the final response
            if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].finish_reason === 'stop') {
              finalResponse = parsed;
            }
          } catch (error) {
            console.warn('Failed to parse final streaming chunk:', error);
          }
        }
      }
    }

    return finalResponse;
  }

  /**
   * Creates an empty response object for streaming fallback scenarios
   * @param model - The model name to include in the response
   * @returns An empty ChatResponse object
   */
  private createEmptyResponse(model: string): ChatResponse {
    return {
      id: '',
      object: 'chat.completion',
      created: Date.now(),
      model,
      choices: [],
    };
  }

  /**
   * Extracts a user-friendly error message from various error types
   * @param error - The error object to process
   * @returns A string representation of the error
   */
  private getErrorString(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object') {
      const axiosError = error as any;
      if (axiosError.response?.data?.error) {
        return axiosError.response.data.error.message;
      }
      if (axiosError.message) {
        return axiosError.message;
      }
    }
    return 'Unknown error';
  }

  /**
   * Validates a chat request object
   * @param request - The chat request to validate
   * @returns An object containing validation result and any error messages
   */
  validateChatRequest(request: ChatRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.model) {
      errors.push('Model is required');
    }

    if (!request.messages || request.messages.length === 0) {
      errors.push('Messages are required');
    }

    if (request.messages) {
      for (let i = 0; i < request.messages.length; i++) {
        const message = request.messages[i];
        if (!message?.role) {
          errors.push(`Message ${i + 1}: Role is required`);
        }
        if (!message?.content || message.content.length === 0) {
          errors.push(`Message ${i + 1}: Content is required`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}