#!/usr/bin/env node

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 9293; // Use a different port to avoid conflict

// Middleware
app.use(cors());
app.use(express.json());

// Mock models endpoint
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'test-model-vision',
        object: 'model',
        created: 1620000000,
        owned_by: 'test'
      },
      {
        id: 'gpt-4-vision-preview',
        object: 'model',
        created: 1620000000,
        owned_by: 'openai'
      }
    ]
  });
});

// Mock chat completion endpoint
app.post('/v1/chat/completions', (req, res) => {
  const { messages, stream } = req.body;
  
  // Log the request for debugging
  console.log('Mock server received chat completion request:', {
    hasMessages: !!messages,
    messageCount: messages?.length || 0,
    streaming: stream
  });
  
  // Extract image content from the message
  const imageMessage = messages?.find(msg => {
    // Handle both array content (for multimodal) and string content (for text-only)
    if (Array.isArray(msg.content)) {
      return msg.content.some(item => item.type === 'image_url');
    }
    return false; // Text-only message
  });
  
  if (imageMessage) {
    // Log image information for debugging
    const imageUrlContent = imageMessage.content.find(item => item.type === 'image_url');
    console.log('Mock server processing image:', {
      hasImageUrl: !!imageUrlContent,
      imageUrl: imageUrlContent?.image_url?.url ? 'Image URL present (redacted for logging)' : 'No URL found'
    });
    // Mock response for image analysis
    const response = {
      id: 'chatcmpl-test123',
      object: 'chat.completion',
      created: Date.now(),
      model: req.body.model || 'test-model-vision',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a test image analysis. The image contains a simple blue pixel. This is a mock response for testing purposes.'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 30,
        total_tokens: 80
      }
    };
    
    if (stream) {
      // Simulate streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send initial chunk
      res.write(`data: ${JSON.stringify({
        id: 'chatcmpl-test123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: req.body.model || 'test-model-vision',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'This is a test image analysis. The image contains '
            },
            finish_reason: null
          }
        ]
      })}\n\n`);
      
      // Send middle chunk
      setTimeout(() => {
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-test123',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: req.body.model || 'test-model-vision',
          choices: [
            {
              index: 0,
              delta: {
                content: 'a simple blue pixel. This is a mock response for testing purposes.'
              },
              finish_reason: null
            }
          ]
        })}\n\n`);
      }, 100);
      
      // Send final chunk
      setTimeout(() => {
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-test123',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: req.body.model || 'test-model-vision',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop'
            }
          ]
        })}\n\n`);
        
        // End the stream
        res.write('data: [DONE]\n\n');
        res.end();
      }, 200);
    } else {
      // Send regular response
      res.json(response);
    }
  } else {
    // Handle text-only messages
    res.json({
      id: 'chatcmpl-text123',
      object: 'chat.completion',
      created: Date.now(),
      model: req.body.model || 'test-model-vision',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a text-only message response. No image was detected.'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20
      }
    });
  }
});

// Mock endpoint to test image processing directly
app.post('/v1/test/image-process', (req, res) => {
  console.log('Mock server received image processing test request');
  
  const { image_url, custom_prompt } = req.body;
  
  // Validate input
  if (!image_url) {
    return res.status(400).json({
      error: {
        message: 'image_url parameter is required',
        type: 'invalid_request_error'
      }
    });
  }
  
  // Log the different input types for testing
  let inputType = 'unknown';
  if (image_url.startsWith('data:')) {
    inputType = 'data_url';
  } else if (/^https?:\/\/.+/i.test(image_url)) {
    inputType = 'http_url';
  } else {
    inputType = 'file_path';
  }
  
  console.log(`Image input type detected: ${inputType}`);
  
  // Return success response
  res.json({
    success: true,
    input_type: inputType,
    processed: true,
    custom_prompt: custom_prompt || 'default',
    message: 'Image processed successfully'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Mock server error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'internal_error'
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Mock OpenAI-compatible server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/v1/models`);
  console.log(`  POST http://localhost:${PORT}/v1/chat/completions`);
  console.log(`  POST http://localhost:${PORT}/v1/test/image-process`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down mock server...');
  process.exit(0);
});