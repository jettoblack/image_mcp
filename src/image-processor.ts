import fs from 'fs-extra';
import path from 'path';
import mimeTypes from 'mime-types';
import axios from 'axios';

// Define types for image processing
export interface ImageInfo {
  type: 'file' | 'base64' | 'url';
  data: string;
  mimeType: string;
  size: number;
}

export interface ProcessedImage {
  url: string;
  mimeType: string;
  size: number;
}

/**
 * Image Processor for handling file paths, URLs, and base64 encoded images
 */
export class ImageProcessor {
  private static readonly SUPPORTED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
  ];

  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Processes various image input formats (file paths, URLs, base64 data URLs, raw base64)
   * and converts them to a standardized format for the OpenAI API
   */
  static async processImage(imageInput: string): Promise<ProcessedImage> {
    let processedInput = imageInput;

    // Handle file:// URLs by stripping the protocol
    if (imageInput.startsWith('file://')) {
      processedInput = imageInput.substring(7); // Remove 'file://' prefix
    }

    // Basic validation after processing the input
    const validation = this.validateImageInput(processedInput);
    if (!validation.isValid) {
      throw new Error(`Invalid image input: ${validation.errors.join(', ')}`);
    }

    let imageInfo: ImageInfo;

    // Determine input type and process accordingly
    if (processedInput.includes('BASE64')) {
      // Pass through as-is
      imageInfo = await this.processBase64Input(processedInput);
    } else if (/^https?:\/\/.+/i.test(processedInput)) {
      // HTTP/HTTPS URL - download the image
      imageInfo = await this.processUrlInput(processedInput);
    } else if (this.isFileInput(processedInput)) {
      // File path
      imageInfo = await this.processFileInput(processedInput);
    } else {
      // Data URL or raw base64
      imageInfo = await this.processBase64Input(processedInput);
    }

    // Validate image
    this.validateImage(imageInfo);

    // Convert to URL format
    const url = this.formatImageUrl(imageInfo);

    return {
      url,
      mimeType: imageInfo.mimeType,
      size: imageInfo.size,
    };
  }

  /**
   * Determines whether the input string represents a file path or other input type
   * Uses heuristics to distinguish between file paths, URLs, and base64 data
   */
  private static isFileInput(input: string): boolean {
    // Check for HTTP/HTTPS URLs
    if (/^https?:\/\/.+/i.test(input)) {
      return false; // It's a URL
    }

    // Check for file:// URLs
    if (input.startsWith('file://')) {
      return true; // It's a file URL
    }

    // Check for data URLs with base64
    if (input.startsWith('data:image/') && input.includes('base64')) {
      return false; // It's a data URL
    }

    // Check for raw base64 without header
    if (/^[A-Za-z0-9\/+=]*$/.test(input)) {
      return false; // It's raw base64
    }

    // Check for path-like patterns
    return (
      input.startsWith('/') ||
      input.startsWith('./') ||
      input.startsWith('../') ||
      input.startsWith('/([A-Za-z]:\\|\\\\)/') ||   //  Windows drive or UNC path
      !!input.match(/^\.[/\\]/) ||
      // Check if it has a file extension that looks like an image
      (input.includes('.') && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'].includes(input.split('.').pop()?.toLowerCase() || ''))
    );
  }

  /**
   * Process file path input
   */
  private static async processFileInput(filePath: string): Promise<ImageInfo> {
    try {
      // Resolve absolute path
      const absolutePath = path.resolve(filePath);
      
      // Check if file exists
      if (!(await fs.pathExists(absolutePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Get file stats
      const stats = await fs.stat(absolutePath);
      
      // Check file size
      if (stats.size > this.MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum limit of ${this.MAX_FILE_SIZE} bytes`);
      }

      // Detect MIME type
      const mimeType = mimeTypes.lookup(absolutePath) || 'application/octet-stream';
      
      // Verify it's an image
      if (!this.SUPPORTED_MIME_TYPES.includes(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType}`);
      }

      // Read file as base64
      const base64Data = await fs.readFile(absolutePath, 'base64');

      return {
        type: 'file',
        data: base64Data,
        mimeType,
        size: stats.size,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to process file input: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Process URL input
   */
  private static async processUrlInput(url: string): Promise<ImageInfo> {
    try {
      // Validate URL format
      const urlPattern = /^https?:\/\/.+\/.+$/i;
      if (!urlPattern.test(url)) {
        throw new Error(`Invalid image URL format: ${url}`);
      }

      // Download the image
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout
        maxRedirects: 5,
      });

      // Check response status
      if (response.status !== 200) {
        throw new Error(`Failed to download image. HTTP status: ${response.status}`);
      }

      // Get image data
      const imageData = Buffer.from(response.data);
      const size = imageData.length;

      // Check file size
      if (size > this.MAX_FILE_SIZE) {
        throw new Error(`Image size exceeds maximum limit of ${this.MAX_FILE_SIZE} bytes`);
      }

      // Detect MIME type from response headers or file extension
      let mimeType = response.headers['content-type'];
      if (!mimeType) {
        // Fallback to extension-based detection
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        switch (ext) {
          case '.jpg':
          case '.jpeg':
            mimeType = 'image/jpeg';
            break;
          case '.png':
            mimeType = 'image/png';
            break;
          case '.gif':
            mimeType = 'image/gif';
            break;
          case '.webp':
            mimeType = 'image/webp';
            break;
          case '.bmp':
            mimeType = 'image/bmp';
            break;
          case '.tiff':
          case '.tif':
            mimeType = 'image/tiff';
            break;
          default:
            mimeType = 'image/jpeg'; // Default
        }
      }

      // Verify it's an image
      if (!this.SUPPORTED_MIME_TYPES.includes(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType}`);
      }

      // Convert to base64
      const base64Data = imageData.toString('base64');

      return {
        type: 'url',
        data: base64Data,
        mimeType,
        size,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to process URL input: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Process base64 input
   */
  private static async processBase64Input(base64Input: string): Promise<ImageInfo> {
    try {
      // Extract MIME type from base64 header
      const base64Match = base64Input.match(/^data:([^;]+);base64,/);
      let mimeType = 'image/jpeg'; // default
      
      if (base64Match) {
        mimeType = base64Match[1] || 'image/jpeg';
        // Remove the data URL prefix
        base64Input = base64Input.replace(/^data:[^;]+;base64,/, '');
      }

      // Verify it's an image
      if (!this.SUPPORTED_MIME_TYPES.includes(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType}`);
      }

      // Validate base64 length (rough size estimate)
      const base64Length = base64Input.length;
      const size = Math.floor(base64Length * 3 / 4); // Approximate size in bytes
      
      if (size > this.MAX_FILE_SIZE) {
        throw new Error(`Base64 image exceeds maximum limit of ${this.MAX_FILE_SIZE} bytes`);
      }

      // Validate base64 format
      if (!this.isValidBase64(base64Input)) {
        throw new Error('Invalid base64 format');
      }

      return {
        type: 'base64',
        data: base64Input,
        mimeType,
        size,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to process base64 input: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate image info
   */
  private static validateImage(imageInfo: ImageInfo): void {
    // Validate MIME type
    if (!this.SUPPORTED_MIME_TYPES.includes(imageInfo.mimeType)) {
      throw new Error(`Unsupported image type: ${imageInfo.mimeType}`);
    }

    // Validate file size
    if (imageInfo.size > this.MAX_FILE_SIZE) {
      throw new Error(`Image size exceeds maximum limit of ${this.MAX_FILE_SIZE} bytes`);
    }

    // Validate base64 data if applicable
    if (imageInfo.type === 'base64' || imageInfo.type === 'url') {
      if (!this.isValidBase64(imageInfo.data)) {
        throw new Error('Invalid base64 format');
      }
    }
  }

  /**
   * Format image URL for OpenAI API
   */
  private static formatImageUrl(imageInfo: ImageInfo): string {
    if (imageInfo.type === 'base64') {
      return `data:${imageInfo.mimeType};base64,${imageInfo.data}`;
    } else {
      // For file inputs, we've already converted to base64
      return `data:${imageInfo.mimeType};base64,${imageInfo.data}`;
    }
  }

  /**
   * Validate base64 format
   */
  private static isValidBase64(str: string): boolean {
    try {
      // Remove whitespace
      const cleanStr = str.replace(/\s/g, '');
      
      // Check if it's valid base64
      return /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(cleanStr);
    } catch {
      return false;
    }
  }

  /**
   * Validate image input schema
   */
  static validateImageInput(imageInput: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!imageInput || typeof imageInput !== 'string') {
      errors.push('Image input is required and must be a string');
      return { isValid: false, errors };
    }

    if (imageInput.length === 0) {
      errors.push('Image input cannot be empty');
    }

    if (imageInput.length > 200 * 1024) { // 200KB limit for string input
      errors.push('Image input is too large (max 200KB)');
    }

    // Check if it looks like a file path
    if (this.isFileInput(imageInput)) {
      if (!imageInput.match(/^[\/.]/) && !imageInput.includes('.')) {
        errors.push('File path must be absolute, relative, or include a file extension');
      }
    } else if (/^https?:\/\/.+/i.test(imageInput)) {
      // URL validation
      const urlPattern = /^https?:\/\/.+\/.+$/i;
      if (!urlPattern.test(imageInput)) {
        errors.push('Invalid image URL format. Supported formats: jpg, jpeg, png, gif, webp, bmp, tiff');
      }
    } else if (!imageInput.includes('base64') && !imageInput.match(/^[A-Za-z0-9\/+=]*$/)) {
      // Check if it looks like base64
      errors.push('Base64 input should contain "base64" or be valid base64 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

}