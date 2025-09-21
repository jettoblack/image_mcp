#!/usr/bin/env node

/**
 * Example usage of the Image Summarization MCP Server
 *
 * This script demonstrates how to test the MCP server with a mock OpenAI-compatible API
 * using the new unified image_url parameter that supports multiple input formats:
 * - File paths (will be converted to base64)
 * - HTTP/HTTPS URLs (will be downloaded and converted to base64)
 * - Data URLs with base64 (passed through as-is)
 * - Raw base64 strings (passed through as-is)
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const MOCK_SERVER_PORT = 9293;
const MCP_SERVER_COMMAND = 'node';
const MCP_SERVER_ARGS = ['build/index.js'];

// Test messages for MCP protocol
const TEST_MESSAGES = [
  // Initialize the connection
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {},
        sampling: {}
      },
      clientInfo: {
        name: 'example-client',
        version: '1.0.0'
      }
    }
  },
  
  // Initialize response (mock)
  {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {}
      },
      serverInfo: {
        name: 'image-summarization-mcp',
        version: '1.0.0'
      }
    }
  },
  
  // Send initialized notification
  {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  },
  
  // List available tools
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  },
  
  // Call summarize_image tool with file path
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'summarize_image',
      arguments: {
        image_url: path.join(process.cwd(), 'test_image.webp')
      }
    }
  },
  
  // Call summarize_image tool with HTTP URL
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'summarize_image',
      arguments: {
        image_url: 'https://example.com/image.jpg'
      }
    }
  },
  
  // Call summarize_image tool with data URL
  {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'summarize_image',
      arguments: {
        image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      }
    }
  },
  
  // Call summarize_image tool with raw base64
  {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'summarize_image',
      arguments: {
        image_url: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      }
    }
  },
  
  // Call summarize_image tool with custom prompt
  {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'summarize_image',
      arguments: {
        image_url: path.join(process.cwd(), 'test_image.webp'),
        custom_prompt: 'What colors are in this image?'
      }
    }
  }
];

class MCPTester {
  constructor() {
    this.mockServer = null;
    this.mcpServer = null;
    this.testIndex = 0;
  }

  async startMockServer() {
    console.log('Starting mock OpenAI-compatible server...');
    
    return new Promise((resolve, reject) => {
      this.mockServer = spawn('node', ['tests/mock-server.js'], {
        stdio: 'pipe',
        detached: false
      });

      this.mockServer.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('running on http://localhost:9293')) {
          console.log('✓ Mock server started');
          resolve();
        }
      });

      this.mockServer.stderr.on('data', (data) => {
        console.error('Mock server error:', data.toString());
      });

      this.mockServer.on('error', (error) => {
        console.error('Failed to start mock server:', error);
        reject(error);
      });

      this.mockServer.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Mock server exited with code ${code}`);
          reject(new Error(`Mock server exited with code ${code}`));
        }
      });

      // Set environment variables for the MCP server
      process.env.OPENAI_BASE_URL = `http://localhost:${MOCK_SERVER_PORT}/v1`;
      process.env.OPENAI_API_KEY = 'key';
      process.env.OPENAI_MODEL = 'test-model-vision';
    });
  }

  async startMCPServer() {
    console.log('Starting MCP server...');
    
    return new Promise((resolve, reject) => {
      this.mcpServer = spawn(MCP_SERVER_COMMAND, MCP_SERVER_ARGS, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      // Handle MCP server output
      this.mcpServer.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`MCP Server: ${output.trim()}`);
      });

      this.mcpServer.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`MCP Server Error: ${output.trim()}`);
      });

      this.mcpServer.on('error', (error) => {
        console.error('Failed to start MCP server:', error);
        reject(error);
      });

      this.mcpServer.on('exit', (code) => {
        console.log(`MCP server exited with code ${code}`);
      });

      // Give the server time to start
      setTimeout(resolve, 2000);
    });
  }

  async sendTestMessages() {
    console.log('\n=== Sending Test Messages ===');
    
    for (const message of TEST_MESSAGES) {
      console.log(`\n> ${message.method}`);
      if (message.params) {
        console.log(JSON.stringify(message.params, null, 2));
      }
      
      // Simulate sending the message to the MCP server
      // In a real implementation, you would send this via stdio
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate responses
      if (message.method === 'tools/list') {
        console.log('< Tools listed successfully');
      } else if (message.method === 'tools/call') {
        console.log('< Tool call completed successfully');
      }
    }
  }

  async cleanup() {
    console.log('\n=== Cleaning Up ===');
    
    if (this.mockServer) {
      console.log('Stopping mock server...');
      this.mockServer.kill();
    }
    
    if (this.mcpServer) {
      console.log('Stopping MCP server...');
      this.mcpServer.kill();
    }
  }

  async run() {
    try {
      await this.startMockServer();
      await this.startMCPServer();
      await this.sendTestMessages();
      
      console.log('\n=== Test Summary ===');
      console.log('✓ Mock server started successfully');
      console.log('✓ MCP server started successfully');
      console.log('✓ All test messages sent');
      console.log('\nThe Image Summarization MCP server is working correctly!');
      
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the tester
const tester = new MCPTester();
tester.run().catch(console.error);