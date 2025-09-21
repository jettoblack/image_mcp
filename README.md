# Image Summarization MCP Server

A Model Context Protocol (MCP) server that accepts image files and sends them to an OpenAI-compatible chat completion endpoint for analysis and description.

## Features

- Accepts images via unified `image_url` parameter with multiple input formats
- Sends images to OpenAI-compatible chat completion endpoints
- Returns detailed image descriptions
- Configurable endpoint URL, API key, and model
- Command-line interface for configuration
- Comprehensive error handling
- TypeScript support

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd image-summarization-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

The MCP server can be configured using environment variables, command-line arguments, or defaults.

### Environment Variables

- `OPENAI_API_KEY`: Your API key for the OpenAI-compatible service
- `OPENAI_BASE_URL`: The base URL of the OpenAI-compatible service (default: `http://localhost:9293/v1`)
- `OPENAI_MODEL`: The model to use for image analysis
- `OPENAI_TIMEOUT`: Request timeout in milliseconds (default: 30000)
- `OPENAI_MAX_RETRIES`: Maximum number of retry attempts (default: 3)

### Command Line Arguments

```bash
node build/index.js \
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

## Usage

### Starting the Server

```bash
node build/index.js
```

The server will start and listen on stdio for MCP protocol communications.

### MCP Tool: `summarize_image`

The server provides one tool: `summarize_image` for analyzing images.

#### Parameters

- `image_url` (string): URL to the image file to analyze. Supports:
  - File paths (will be converted to base64)
  - HTTP/HTTPS URLs (will be downloaded and converted to base64)
  - Data URLs with base64 (passed through as-is)
  - Raw base64 strings (passed through as-is)
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

Using raw base64 string:
```json
{
  "name": "summarize_image",
  "arguments": {
    "image_url": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
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

## Testing

### Testing Setup

1. Start a mock OpenAI-compatible server for testing:
```bash
# Using a tool like https://github.com/abetlen/llama-proxy or similar
# Or create your own mock server that responds to /chat/completions
```

2. Set the environment variable:
```bash
export OPENAI_BASE_URL=http://localhost:9292/v1
export OPENAI_API_KEY=key
```

3. Start the MCP server:
```bash
node build/index.js
```

4. Test with an image:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "summarize_image",
    "arguments": {
      "image_url": "test-image.png"
    }
  }
}
```

### Development Testing

To test with a real OpenAI-compatible endpoint:

1. Set up your environment:
```bash
export OPENAI_API_KEY=your-actual-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4-vision-preview
```

2. Start the MCP server:
```bash
node build/index.js
```

3. Send test requests using an MCP client.

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