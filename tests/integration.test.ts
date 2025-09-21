// Integration tests for the complete image processing workflow
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

describe('Image Processing Integration Tests', () => {
  const BASE_URL = 'http://localhost:9293';
  const TEST_IMAGE_PATH = path.join(__dirname, '../test_image.webp');
  const TEST_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const TEST_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const TEST_HTTP_URL = 'https://httpbin.org/image/jpeg'; // Public test image

  beforeAll(async () => {
    // Check if mock server is available
    try {
      await axios.get(`${BASE_URL}/v1/models`, { timeout: 1000 });
      console.log('Mock server is available, running integration tests');
    } catch (error) {
      console.log('Mock server is not available, skipping integration tests');
      // Skip all tests in this suite
      pending('Mock server not available');
    }
  });

  afterAll(async () => {
    // Clean up any temporary files
  });

  describe('Direct image processing endpoint', () => {
    it('should detect file path input type', async () => {
      if (!(await fs.pathExists(TEST_IMAGE_PATH))) {
        console.log(`Skipping file path test - test image not found at ${TEST_IMAGE_PATH}`);
        return;
      }

      const response = await axios.post(`${BASE_URL}/v1/test/image-process`, {
        image_url: TEST_IMAGE_PATH
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.input_type).toBe('file_path');
    });

    it('should detect data URL input type', async () => {
      const response = await axios.post(`${BASE_URL}/v1/test/image-process`, {
        image_url: TEST_DATA_URL
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.input_type).toBe('data_url');
    });

    it('should detect raw base64 input type', async () => {
      const response = await axios.post(`${BASE_URL}/v1/test/image-process`, {
        image_url: TEST_BASE64
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.input_type).toBe('raw_base64');
    });

    it('should detect HTTP URL input type', async () => {
      const response = await axios.post(`${BASE_URL}/v1/test/image-process`, {
        image_url: TEST_HTTP_URL
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.input_type).toBe('http_url');
    });

    it('should handle custom prompt', async () => {
      const response = await axios.post(`${BASE_URL}/v1/test/image-process`, {
        image_url: TEST_DATA_URL,
        custom_prompt: 'What colors are in this image?'
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.custom_prompt).toBe('What colors are in this image?');
    });

    it('should reject missing image_url', async () => {
      try {
        await axios.post(`${BASE_URL}/v1/test/image-process`, {});
        fail('Expected request to be rejected');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error.message).toBe('image_url parameter is required');
      }
    });
  });

  describe('OpenAI API compatibility', () => {
    it('should list models', async () => {
      const response = await axios.get(`${BASE_URL}/v1/models`);

      expect(response.status).toBe(200);
      expect(response.data.object).toBe('list');
      expect(response.data.data).toHaveLength(2);
      expect(response.data.data[0].id).toBe('test-model-vision');
      expect(response.data.data[1].id).toBe('gpt-4-vision-preview');
    });

    it('should handle text-only chat completion', async () => {
      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'test-model-vision',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?'
          }
        ],
        stream: false
      });

      expect(response.status).toBe(200);
      expect(response.data.object).toBe('chat.completion');
      expect(response.data.choices).toHaveLength(1);
      expect(response.data.choices[0].message.content).toContain('text-only message');
      expect(response.data.choices[0].message.role).toBe('assistant');
    });

    it('should handle image chat completion with data URL', async () => {
      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'test-model-vision',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image'
              },
              {
                type: 'image_url',
                image_url: {
                  url: TEST_DATA_URL
                }
              }
            ]
          }
        ],
        stream: false
      });

      expect(response.status).toBe(200);
      expect(response.data.object).toBe('chat.completion');
      expect(response.data.choices).toHaveLength(1);
      expect(response.data.choices[0].message.content).toContain('test image analysis');
      expect(response.data.choices[0].message.role).toBe('assistant');
    });

    it('should handle streaming chat completion with image', async () => {
      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'test-model-vision',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image'
              },
              {
                type: 'image_url',
                image_url: {
                  url: TEST_DATA_URL
                }
              }
            ]
          }
        ],
        stream: true
      }, {
        responseType: 'stream'
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      return new Promise<void>((resolve, reject) => {
        let content = '';
        let chunkCount = 0;

        response.data.on('data', (chunk: Buffer) => {
          chunkCount++;
          const chunkStr = chunk.toString();
          if (chunkStr.includes('data:')) {
            const jsonStr = chunkStr.replace('data: ', '').trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const data = JSON.parse(jsonStr);
                if (data.choices && data.choices[0] && data.choices[0].delta) {
                  content += data.choices[0].delta.content || '';
                }
              } catch (e) {
                // Ignore JSON parse errors for non-JSON chunks
              }
            }
          }
        });

        response.data.on('end', () => {
          expect(chunkCount).toBeGreaterThan(1);
          expect(content).toContain('test image analysis');
          resolve();
        });

        response.data.on('error', reject);
      });
    });
  });

  describe('Error handling', () => {
    it('should handle invalid endpoint', async () => {
      try {
        await axios.get(`${BASE_URL}/v1/invalid-endpoint`);
        fail('Expected request to be rejected');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should handle invalid image URL in chat completion', async () => {
      const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'test-model-vision',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image'
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'invalid-url'
                }
              }
            ]
          }
        ],
        stream: false
      });

      // The mock server should still respond with a test response even for invalid URLs
      expect(response.status).toBe(200);
      expect(response.data.choices).toHaveLength(1);
    });
  });
});