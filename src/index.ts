#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  JSONRPCMessage
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAIClient } from './openai-client.js';
import { ImageProcessor } from './image-processor.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';

// Configuration
import { configManager } from './config.js';

// Initialize components
const openaiClient = new OpenAIClient(
  configManager.getBaseUrl(),
  configManager.getApiKey(),
  configManager.getTimeout(),
  configManager.getMaxRetries()
);

// Create MCP server
const server = new Server(
  {
    name: '@jettoblack/image_mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      logging: {},
    },
  }
);

// Server capabilities
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'summarize_image',
        description: 'Analyze and describe an image in detail',
        inputSchema: {
          type: 'object',
          properties: {
            image_url: {
              type: 'string',
              description: 'URL to the image file to analyze (supports absolute file paths, file:// URLs, http/https protocols, and data URL with base64 encoded image file)'
            },
            custom_prompt: {
              type: 'string',
              description: 'Custom prompt to use instead of the default image description prompt. Use this to request specific details about the image.',
              default: 'Describe this image in detail, including all text.'
            }
          },
          required: ['image_url'],
          additionalProperties: false
        }
      },
      {
        name: 'compare_images',
        description: 'Compares 2 or more images and describes the differences',
        inputSchema: {
          type: 'object',
          properties: {
            image_urls: {
              type: 'array',
              items: {
                type: 'string',
                description: 'URL to the image file to analyze (supports absolute file paths, file:// URLs, http/https protocols, and data URL with base64 encoded image file)'
              },
              minItems: 2,
              description: 'Array of image URLs to compare (minimum 2 images required)'
            },
            custom_prompt: {
              type: 'string',
              description: 'Custom prompt to use instead of the default image comparison prompt',
              default: 'Compare these images in detail, including all text, and describe the similarities and differences.'
            }
          },
          required: ['image_urls'],
          additionalProperties: false
        }
      }
    ]
  };
});

// Shared function to handle summarize_image tool
async function handleSummarizeImage(image_url: string, custom_prompt?: string, enableStreaming: boolean = false) {
  // Validate required parameters
  if (!image_url) {
    throw new Error('image_url must be provided');
  }

  if (typeof image_url !== 'string') {
    throw new Error('image_url must be a string');
  }

  // Process the image URL to handle different input formats (file paths, HTTP URLs, data URLs, etc.)
  const processedImage = await ImageProcessor.processImage(image_url);

  // Prepare the content for the OpenAI API
  const prompt = custom_prompt || 'Describe this image in detail, including all text.';

  // Convert MCP content to OpenAI format
  const chatRequest = {
    model: configManager.getModel() || 'gemma3:4b-it-qat-cpu',
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: prompt
          },
          {
            type: 'image_url' as const,
            image_url: {
              url: processedImage.url
            }
          }
        ]
      }
    ],
    stream: enableStreaming
  };

  if (chatRequest.stream) {
    // For streaming responses, we need to accumulate the content
    let accumulatedContent = '';

    const result = await openaiClient.chatCompletion(chatRequest, (chunk) => {
      const chunkContent = chunk.choices?.[0]?.delta?.content || '';
      if (chunkContent) {
        accumulatedContent += chunkContent;
      }
    });

    // Use the accumulated content or the final response
    const finalContent = accumulatedContent || (result.choices?.[0]?.message?.content || 'No response received');

    return {
      content: [
        {
          type: 'text',
          text: finalContent
        }
      ]
    };

  } else {
    // Call the OpenAI API without streaming
    const result = await openaiClient.chatCompletion(chatRequest);

    // Extract the content from the response
    const content = result.choices?.[0]?.message?.content || 'No response received';

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }
}

// Shared function to handle compare_images tool
async function handleCompareImages(image_urls: string[], custom_prompt?: string, enableStreaming: boolean = false) {
  // Validate required parameters
  if (!image_urls || !Array.isArray(image_urls)) {
    throw new Error('image_urls must be provided as an array');
  }

  if (image_urls.length < 2) {
    throw new Error('At least 2 images are required for comparison');
  }

  // Process all image URLs
  const processedImages = await Promise.all(
    image_urls.map(async (image_url, index) => {
      if (typeof image_url !== 'string') {
        throw new Error(`image_urls[${index}] must be a string`);
      }
      return await ImageProcessor.processImage(image_url);
    })
  );

  // Prepare the content for the OpenAI API
  const prompt = custom_prompt || 'Compare these images in detail, including all text, and describe the similarities and differences.';

  // Build content array with prompt and all images
  const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text' as const,
      text: prompt
    }
  ];

  // Add all processed images
  processedImages.forEach(processedImage => {
    content.push({
      type: 'image_url' as const,
      image_url: {
        url: processedImage.url
      }
    });
  });

  // Convert MCP content to OpenAI format
  const chatRequest = {
    model: configManager.getModel() || 'gemma3:4b-it-qat-cpu',
    messages: [
      {
        role: 'user' as const,
        content
      }
    ],
    stream: enableStreaming
  };

  if (chatRequest.stream) {
    // For streaming responses, we need to accumulate the content
    let accumulatedContent = '';

    const result = await openaiClient.chatCompletion(chatRequest, (chunk) => {
      const chunkContent = chunk.choices?.[0]?.delta?.content || '';
      if (chunkContent) {
        accumulatedContent += chunkContent;
      }
    });

    // Use the accumulated content or the final response
    const finalContent = accumulatedContent || (result.choices?.[0]?.message?.content || 'No response received');

    return {
      content: [
        {
          type: 'text',
          text: finalContent
        }
      ]
    };

  } else {
    // Call the OpenAI API without streaming
    const result = await openaiClient.chatCompletion(chatRequest);

    // Extract the content from the response
    const content = result.choices?.[0]?.message?.content || 'No response received';

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }
}

// Tool handler for summarize_image
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Log the incoming request for debugging purposes
  server.sendLoggingMessage({
    level: "info",
    data: JSON.stringify(request.params),
  });

  if (name === 'summarize_image') {
    try {
      // Validate arguments
      if (!args || typeof args !== 'object') {
        throw new Error('Invalid arguments: expected an object');
      }

      const { image_url, custom_prompt } = args;

      // Determine if we're using HTTP transport or stdio
      const useHttp = process.env.MCP_USE_HTTP === 'true' || process.argv.includes('--http');

      // Only enable streaming when in HTTP/SSE mode, disable for stdio mode
      const enableStreaming = useHttp && configManager.isStreamingEnabled();

      return await handleSummarizeImage(image_url as string, custom_prompt as string | undefined, enableStreaming);

    } catch (error) {
      // Log the error for debugging purposes
      server.sendLoggingMessage({
        level: "error",
        data: JSON.stringify(error),
      });

      // Return a user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Failed to process image';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  } else if (name === 'compare_images') {
    try {
      // Validate arguments
      if (!args || typeof args !== 'object') {
        throw new Error('Invalid arguments: expected an object');
      }

      const { image_urls, custom_prompt } = args;

      // Determine if we're using HTTP transport or stdio
      const useHttp = process.env.MCP_USE_HTTP === 'true' || process.argv.includes('--http');

      // Only enable streaming when in HTTP/SSE mode, disable for stdio mode
      const enableStreaming = useHttp && configManager.isStreamingEnabled();

      return await handleCompareImages(image_urls as string[], custom_prompt as string | undefined, enableStreaming);

    } catch (error) {
      // Log the error for debugging purposes
      server.sendLoggingMessage({
        level: "error",
        data: JSON.stringify(error),
      });

      // Return a user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Failed to compare images';

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start the server
async function main() {
  try {
    // Check if we should use HTTP transport or stdio
    const useHttp = process.env.MCP_USE_HTTP === 'true' || process.argv.includes('--http');

    if (useHttp) {
      await startHttpServer();
    } else {
      await startStdioServer();
    }
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    throw error;
  }
}

async function startStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Image Summarization MCP server running on stdio');
}

// Global map to store active SSE transports
const sseTransports = new Map<string, SSEServerTransport>();

async function startHttpServer() {
  const app = express();
  const server = createServer(app);
  
  // Enable CORS for all routes
  app.use(cors());
  app.use(express.json());
  
  // SSE endpoint
  app.get('/sse', async (req, res) => {
    try {
      const transport = new SSEServerTransport('/sse', res);
      await transport.start();
      
      // Store the transport
      sseTransports.set(transport.sessionId, transport);
      
      // Set up message handler - handle messages through the standard MCP server
      transport.onmessage = async (message) => {
        try {
          // For SSE, we'll handle basic tool calls directly
          const msg = message as any;
          
          if (msg.method === 'tools/call') {
            const toolName = msg.params?.name;
            const args = msg.params?.arguments || {};
            
            if (toolName === 'summarize_image') {
              // Use the shared handler function
              const enableStreaming = configManager.isStreamingEnabled();
              const response = await handleSummarizeImage(args.image_url as string, args.custom_prompt as string | undefined, enableStreaming);

              // Send the response back through SSE
              await transport.send({
                jsonrpc: '2.0',
                id: msg.id,
                result: response
              });

            } else if (toolName === 'compare_images') {
              // Use the shared handler function
              const enableStreaming = configManager.isStreamingEnabled();
              const response = await handleCompareImages(args.image_urls as string[], args.custom_prompt as string | undefined, enableStreaming);

              // Send the response back through SSE
              await transport.send({
                jsonrpc: '2.0',
                id: msg.id,
                result: response
              });

            } else {
              throw new Error(`Unknown tool: ${toolName}`);
            }
          } else {
            throw new Error(`Method not supported: ${msg.method}`);
          }
        } catch (error) {
          console.error('Error handling SSE message:', error);
          
          try {
            await transport.send({
              jsonrpc: '2.0',
              id: (message as any).id,
              error: {
                code: -32603,
                message: 'Internal error while processing request'
              }
            });
          } catch (sendError) {
            console.error('Error sending error response:', sendError);
          }
        }
      };
      
      transport.onerror = (error) => {
        console.error('SSE transport error:', error);
      };
      
      transport.onclose = () => {
        console.log('SSE connection closed');
        sseTransports.delete(transport.sessionId);
      };
      
    } catch (error) {
      console.error('Error setting up SSE transport:', error);
      res.status(500).send('Internal server error');
    }
  });
  
  // POST endpoint for MCP messages over HTTP
  app.post('/sse', async (req, res) => {
    try {
      const message: JSONRPCMessage = req.body;
      
      if (!message || message.jsonrpc !== '2.0') {
        return res.status(400).json({ error: 'Invalid JSON-RPC message' });
      }
      
      const msg = message as any;
      
      if (msg.method === 'tools/call') {
        const toolName = msg.params?.name;
        const args = msg.params?.arguments || {};
        
        if (toolName === 'summarize_image') {
          try {
            // Use the shared handler function
            const enableStreaming = configManager.isStreamingEnabled();
            const response = await handleSummarizeImage(args.image_url as string, args.custom_prompt as string | undefined, enableStreaming);

            return res.json({
              jsonrpc: '2.0',
              id: msg.id,
              result: response
            });

          } catch (error) {
            console.error('Error processing image:', error);
            return res.json({
              jsonrpc: '2.0',
              id: msg.id,
              error: {
                code: -32603,
                message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            });
          }
        } else if (toolName === 'compare_images') {
          try {
            // Use the shared handler function
            const enableStreaming = configManager.isStreamingEnabled();
            const response = await handleCompareImages(args.image_urls as string[], args.custom_prompt as string | undefined, enableStreaming);

            return res.json({
              jsonrpc: '2.0',
              id: msg.id,
              result: response
            });

          } catch (error) {
            console.error('Error comparing images:', error);
            return res.json({
              jsonrpc: '2.0',
              id: msg.id,
              error: {
                code: -32603,
                message: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            });
          }
        } else {
          return res.json({
            jsonrpc: '2.0',
            id: msg.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          });
        }
      } else {
        return res.json({
          jsonrpc: '2.0',
          id: msg.id,
          error: {
            code: -32601,
            message: `Method not supported: ${msg.method}`
          }
        });
      }
    } catch (error) {
      console.error('Error handling POST message:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        }
      });
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', transports: sseTransports.size });
  });
  
  const PORT = process.env.MCP_PORT || process.argv["mcp_port"] || 8080;
  
  server.listen(PORT, () => {
    console.log(`Image Summarization MCP server running on HTTP at http://localhost:${PORT}`);
    console.log(`SSE endpoint available at http://localhost:${PORT}/sse`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
  });
  
  // Clean up on exit
  process.on('SIGTERM', () => {
    // Close all SSE transports
    for (const transport of sseTransports.values()) {
      try {
        transport.close();
      } catch (error) {
        console.error('Error closing SSE transport:', error);
      }
    }
    sseTransports.clear();
    
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});