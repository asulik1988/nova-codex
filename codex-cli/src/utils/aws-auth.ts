import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

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