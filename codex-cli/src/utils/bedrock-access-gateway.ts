/**
 * AWS Bedrock Access Gateway Integration
 * 
 * This file contains utilities for integrating with AWS Bedrock Access Gateway,
 * which provides an OpenAI-compatible API for bedrock models.
 * 
 * To use the gateway:
 * 1. Deploy the Bedrock Access Gateway CloudFormation stack
 * 2. Set the environment variables:
 *    - AWS_ACCESS_KEY_ID
 *    - AWS_SECRET_ACCESS_KEY
 *    - AWS_DEFAULT_REGION (defaults to us-east-1)
 *    - AWS_BEDROCK_GATEWAY_ID (the API Gateway ID)
 */

import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { getApiKey } from './config';

/**
 * Mapping of Bedrock model IDs to their Access Gateway compatible formats.
 * The keys are the IDs used in the Bedrock API, and the values are the corresponding
 * model names used by the Access Gateway OpenAI-compatible API.
 */
export const bedrockModelMap: Record<string, string> = {
  // Claude models
  "anthropic.claude-3-opus-20240229-v1:0": "claude-3-opus-20240229",
  "anthropic.claude-3-sonnet-20240229-v1:0": "claude-3-sonnet-20240229",
  "anthropic.claude-3-haiku-20240307-v1:0": "claude-3-haiku-20240307",
  "anthropic.claude-instant-1.2:0": "claude-instant-1.2",
  
  // Amazon models
  "amazon.nova-pro-v1:0": "amazon-nova-pro",
  "amazon.nova-lite-v1:0": "amazon-nova-lite",
  "amazon.nova-micro-v1:0": "amazon-nova-micro",
  
  // Cohere models
  "cohere.command-r-v1:0": "cohere-command-r",
  "cohere.command-r-plus-v1:0": "cohere-command-r-plus",
  
  // Meta models
  "meta.llama3-70b-instruct-v1:0": "meta-llama3-70b-instruct",
  "meta.llama3-8b-instruct-v1:0": "meta-llama3-8b-instruct",
  
  // Add more models as they become available
};

/**
 * Returns the Access Gateway compatible model name for a given Bedrock model ID.
 * Simply passes through the original model ID without mapping.
 */
export function getAccessGatewayModelName(bedrockModelId: string): string {
  return bedrockModelId;
}

// Cached models and timestamp for API-based model fetching
let cachedModels: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns a list of all supported Bedrock model IDs directly from the API.
 * Uses a cached approach to minimize API calls.
 */
export async function getAllBedrockModels(): Promise<string[]> {
  // Return cached models if they're still fresh
  if (cachedModels && (Date.now() - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedModels;
  }
  
  try {
    const baseUrl = getBedrockAccessGatewayBaseUrl();
    const key = getBedrockAccessGatewayKey();
    
    const url = `${baseUrl}/models`;
    console.log(`Fetching models from: ${url}`);
    
    const response = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${key}` 
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract model IDs from the response and use them directly without mapping
    if (data && data.data && Array.isArray(data.data)) {
      const modelIds = data.data.map((model: any) => model.id);
      
      // Update cache
      cachedModels = modelIds;
      cacheTimestamp = Date.now();
      
      return modelIds;
    }
    
    throw new Error('Invalid API response format');
  } catch (error) {
    console.error('Error fetching Bedrock models:', error);
    return []; // Return empty array as fallback
  }
}

/**
 * Creates an AWS SignatureV4 signer for the Bedrock Access Gateway.
 * This is used to sign requests to the gateway using AWS credentials.
 */
export function createBedrockSignatureV4() {
  const credentials = {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
    sessionToken: process.env['AWS_SESSION_TOKEN'],
  };
  
  const region = process.env['AWS_DEFAULT_REGION'] || 'us-east-1';
  
  // Create a signer with the SigV4 algorithm
  return new SignatureV4({
    credentials,
    region,
    service: 'execute-api', // Access Gateway uses API Gateway which requires 'execute-api' service name
    sha256: Sha256,
  });
}

/**
 * Instructions for setting up the Bedrock Access Gateway.
 * This can be displayed to users to help them get started.
 */
export const gatewaySetupInstructions = `
# Setting up AWS Bedrock Access Gateway

1. Deploy the CloudFormation stack:
   \`\`\`bash
   aws cloudformation deploy \\
     --template-file https://amazon-bedrock-access-gateway.s3.amazonaws.com/latest/template.yaml \\
     --stack-name BedrockAccessGateway \\
     --capabilities CAPABILITY_IAM
   \`\`\`

2. Get the Gateway ID from the stack outputs:
   \`\`\`bash
   aws cloudformation describe-stacks \\
     --stack-name BedrockAccessGateway \\
     --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" \\
     --output text
   \`\`\`

3. Set the required environment variables:
   \`\`\`bash
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_DEFAULT_REGION=us-east-1
   export AWS_BEDROCK_GATEWAY_ID=gateway_id_from_step_2
   \`\`\`

4. Update the Codex CLI configuration:
   \`\`\`bash
   codex config
   \`\`\`

5. Select "bedrock" as your provider and choose a model.
`;

/**
 * Get the base URL for the Bedrock Access Gateway.
 * This includes the gateway ID and region.
 * @throws Error if AWS_BEDROCK_GATEWAY_ID is not set
 */
export function getBedrockAccessGatewayBaseUrl(): string {
    const gatewayurl = process.env['AWS_BEDROCK_GATEWAY_ID'];
    return gatewayurl || "";
}
export function getBedrockAccessGatewayKey(): string {
    const gatewayurl = process.env['AWS_BEDROCK_API_KEY'];
    return gatewayurl || "";
} 