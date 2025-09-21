# Image Summarization MCP Server

A Model Context Protocol (MCP) server that accepts image files and sends them to an OpenAI-compatible chat completion endpoint for analysis, description, and comparison tasks.

## Use Case

Many LLMs used for agentic coding are text-only and lack support for image inputs. This tool allows you to use a secondary model dedicated to describing and analyzing images, without having to use a multi-modal LLM for your primary model. It supports both cloud and local LLMs via any server that supports the OpenAI chat completion endpoint (including llama.cpp / llama-swap, Ollama, open-webui, OpenRouter, etc).

For local models, gemma3:4b-it-qat works quite well with a relatively small footprint and fast performance (even on CPU-only).

## Features

- Accepts images via unified `image_url` parameter with multiple input formats
- Supports `custom_prompt` to perform specific tasks other than just general description
- Sends images to OpenAI-compatible chat completion endpoints
- Returns detailed image descriptions
- Configurable endpoint URL, API key, and model
- Command-line interface for configuration
- Comprehensive error handling
- TypeScript support

## Quick install from NPM

Add this to your global `mcp_settings.json` or project `mcp.json`:

```json
  "image_summarization": {
    "command": "npx",
    "args": [
      "-y",
      "@jettoblack/image_mcp",
      "--api-key",
      "key",
      "--base-url",
      "http://localhost:8080/v1",
      "--model",
      "gemma3:4b-it-qat",
      "--timeout",
      "120000",
      "--max-retries",
      "3"
    ],
    "timeout": 300
  }
```

Replace the base url, API key, model, etc. as required.

## Configuration

The MCP server can be configured using environment variables, command-line arguments, or defaults.

### Environment Variables

- `OPENAI_API_KEY`: Your API key for the OpenAI-compatible service
- `OPENAI_BASE_URL`: The base URL of the OpenAI-compatible service (default: `http://localhost:9292/v1`)
- `OPENAI_MODEL`: The model to use for image analysis
- `OPENAI_TIMEOUT`: Request timeout in milliseconds (default: 60000). When running local models you may need to increase this.
- `OPENAI_MAX_RETRIES`: Maximum number of retry attempts (default: 3)

### Command Line Arguments

```bash
npx -y @jettoblack/image_mcp \
  --api-key your-api-key \
  --base-url https://api.openai.com/v1 \
  --model gpt-4-vision-preview \
  --timeout 60000 \
  --max-retries 5
```

### Configuration Priority

1. Command-line arguments
2. Environment variables
3. Default values

## Dev Installation

1. Clone the repository:
```bash
git clone https://github.com/jettoblack/image_mcp.git
cd image_mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Starting the Server
```bash
node build/index.js
```

The server will start and listen on stdio for MCP protocol communications.

### MCP Tool Installation (local build)

Add this to your global mcp_settings.json or project mcp.json:

```json
  "image_summarizer": {
    "command": "node",
    "args": [
      "/path/to/image_mcp/build/index.js",
      "--api-key",
      "key",
      "--base-url",
      "http://localhost:9292/v1",
      "--model",
      "gemma3:4b-it-qat",
      "--timeout",
      "120000",
      "--max-retries",
      "3"
    ],
    "timeout": 300,
  }
```

## Usage

### MCP Tools

The server provides two tools for image analysis:

#### `summarize_image`

Analyzes and describes a single image in detail.

#### Parameters

- `image_url` (string): URL to the image file to analyze. Supports:
  - Absolute file paths
  - file:// URLs
  - HTTP/HTTPS URLs (will be downloaded and converted to base64)
  - Data URLs with base64 encoded image files
- `custom_prompt` (string, optional): Custom prompt to use instead of the default image description prompt

#### Example Usage

Using file path:
```json
{
  "name": "summarize_image",
  "arguments": {
    "image_url": "/path/to/your/image.jpg"
  }
}
```

Using file:// URL:
```json
{
  "name": "summarize_image",
  "arguments": {
    "image_url": "file:///path/to/your/image.jpg"
  }
}
```

Using HTTP/HTTPS URL:
```json
{
  "name": "summarize_image",
  "arguments": {
    "image_url": "https://example.com/image.jpg"
  }
}
```

Using data URL with base64:
```json
{
  "name": "summarize_image",
  "arguments": {
    "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
  }
}
```

With custom prompt:
```json
{
  "name": "summarize_image",
  "arguments": {
    "image_url": "/path/to/your/image.jpg",
    "custom_prompt": "What objects are visible in this image?"
  }
}
```

#### `compare_images`

Compares 2 or more images and describes their similarities and differences.

##### Parameters

- `image_urls` (array of strings): Array of image URLs to compare (minimum 2 images required). Each URL supports:
  - Absolute file paths
  - file:// URLs
  - HTTP/HTTPS URLs (will be downloaded and converted to base64)
  - Data URLs with base64 encoded image files
- `custom_prompt` (string, optional): Custom prompt to use instead of the default image comparison prompt

##### Example Usage

Comparing two images:
```json
{
  "name": "compare_images",
  "arguments": {
    "image_urls": [
      "/path/to/image1.jpg",
      "/path/to/image2.jpg"
    ]
  }
}
```

Comparing multiple images with custom prompt:
```json
{
  "name": "compare_images",
  "arguments": {
    "image_urls": [
      "https://example.com/image1.jpg",
      "https://example.com/image2.jpg"
    ],
    "custom_prompt": "Compare these UI screenshots and describe the differences in color themes."
  }
}
```

## Testing

### Running Tests

Run the test suite:
```bash
npm test
```

The test suite includes:
- Unit tests for image processing functionality
- Integration tests that require a mock server
- Tests for both `summarize_image` and `compare_images` tools

### Mock Server Testing

The project includes a mock OpenAI-compatible server for testing purposes.

1. Start the mock server in a separate terminal:
```bash
node tests/mock-server.js
```

The mock server will start on `http://localhost:9293` and provides endpoints for:
- `GET /v1/models` - Lists available models
- `POST /v1/chat/completions` - Mock chat completions with image support
- `POST /v1/test/image-process` - Test endpoint for image processing validation

2. Set environment variables for the mock server:
```bash
export OPENAI_BASE_URL=http://localhost:9293/v1
export OPENAI_API_KEY=test-key
export OPENAI_MODEL=test-model-vision
```

3. Run the integration tests:
```bash
npm test tests/integration.test.ts
```

### Real OpenAI-Compatible Server Testing

To test with a real OpenAI-compatible endpoint:

1. Set up your environment variables:
```bash
export OPENAI_API_KEY=your-actual-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4-vision-preview
```

Or for other OpenAI-compatible services:
```bash
export OPENAI_API_KEY=your-service-api-key
export OPENAI_BASE_URL=https://your-service-endpoint/v1
export OPENAI_MODEL=your-vision-model
```

2. Start the MCP server:
```bash
node build/index.js
```

3. Send test requests using an MCP client or test the tools directly.

### Manual Testing

You can manually test the MCP server using tools like `curl` or MCP clients:

```bash
# Test with a local image file
curl -X POST http://localhost:8080/sse \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "summarize_image",
      "arguments": {
        "image_url": "/path/to/your/test/image.jpg"
      }
    }
  }'
```

## API Reference

### OpenAI-Compatible API Integration

The server sends requests to the OpenAI-compatible chat completion endpoint with the following structure:

```json
{
  "model": "your-model",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Describe this image in detail, including all text."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,..."
          }
        }
      ]
    }
  ],
  "stream": false
}
```

### Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)
- BMP (.bmp)
- TIFF (.tiff)

## Error Handling

The server includes comprehensive error handling for:

- Invalid image files
- Unsupported image formats
- Missing API keys
- Network connectivity issues
- API response errors

## Development

### Project Structure

```
src/
├── config.ts          # Configuration management
├── image-processor.ts # Image processing utilities
├── index.ts          # Main MCP server
└── openai-client.ts  # OpenAI-compatible API client
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For issues and questions, please open an issue on the GitHub repository.

## Tips

Tips / donations always appreciated to help fund future development.

* PayPal: [paypal.me/jettoblack](https://paypal.me/jettoblack)
* Venmo: [venmo.com/u/jettoblack](https://venmo.com/u/jettoblack)
* BTC: bc1qa76jrsvyglxq7t5fxnvfkekjtmp4z82wtm6ywf
* ETH: 0x47fc11F09A427540d10a45491d464F02177EAc66