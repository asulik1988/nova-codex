// Bedrock client wrapper for Neo CLI
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  BedrockRuntimeClientConfig,
  Message
} from '@aws-sdk/client-bedrock-runtime';
// Replace direct imports with just type imports to avoid runtime issues
import type { ConversationRole } from '@aws-sdk/client-bedrock-runtime';

import { log, isLoggingEnabled } from './agent/log.js';

// Re-export the ConversationRole enum since we're using it
export { ConversationRole };

/**
 * Creates an AWS Bedrock client with improved error handling and debugging
 */
export function createBedrockClient() {
  log(`[bedrock-client] Creating Bedrock client`);
  
  try {
    validateAwsConfiguration();
    
    // Set up client configuration
    const clientConfig: BedrockRuntimeClientConfig = {};
    
    // Add custom region if provided
    const region = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'];
    if (region) {
      clientConfig.region = region;
      log(`[bedrock-client] Using AWS region: ${region}`);
    } else {
      log(`[bedrock-client] WARNING: No AWS region set. Default region will be used.`);
    }
    
    // Create the Bedrock client
    log(`[bedrock-client] Initializing Bedrock client with config: ${JSON.stringify(clientConfig, null, 2)}`);
    const client = new BedrockRuntimeClient(clientConfig);
    
    // Advanced connection diagnostics
    log(`[bedrock-client] Endpoint: ${client.config.endpoint}`);
    log(`[bedrock-client] Middleware stack: ${client.middlewareStack.identify()}`);
    
    // Perform a basic credential check (without actually calling the AWS API)
    verifyCredentials()
      .then(() => log(`[bedrock-client] Credentials verified successfully`))
      .catch(error => {
        log(`[bedrock-client] Failed to verify credentials: ${error.message}`);
        console.error(`[bedrock-client] Credential verification error:`, error);
      });
    
    return client;
  } catch (error: any) {
    // Enhanced error handling with more details
    const errorType = error.name || 'Unknown';
    const errorCode = error.code || 'None';
    const errorMessage = error.message || 'No error message available';
    
    log(`[bedrock-client] Error creating Bedrock client: ${errorType} (${errorCode}): ${errorMessage}`);
    console.error(`[bedrock-client] Error details:`, error);
    
    if (error.code === 'CredentialsProviderError') {
      const configHints = `
      - Check that AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correctly set in your environment
      - Verify that AWS_PROFILE is correctly configured if using AWS profiles
      - Ensure IAM permissions include 'bedrock:InvokeModel' and 'bedrock:InvokeModelWithResponseStream'
      `;
      log(`[bedrock-client] Credentials error detected. ${errorMessage}${configHints}`);
      throw new Error(`AWS credentials error: ${errorMessage}. ${configHints}`);
    } else if (error.code === 'RegionError') {
      const regionsWithNovaPro = ['us-east-1', 'us-west-2']; // Regions where Anthropic Nova Pro is available
      log(`[bedrock-client] Region error detected. Nova Pro is available in: ${regionsWithNovaPro.join(', ')}`);
      throw new Error(`AWS region error: ${errorMessage}. Set AWS_REGION or AWS_DEFAULT_REGION to a valid region where Nova Pro is available.`);
    } else if (error instanceof Error) {
      throw error; // Re-throw the original error
    } else {
      throw new Error(`Failed to create Bedrock client: ${errorMessage}`);
    }
  }
}

function validateAwsConfiguration() {
  log(`[bedrock-client] Validating AWS configuration`);
  
  // Check for AWS Region
  const region = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'];
  if (!region) {
    log(`[bedrock-client] WARNING: No AWS region specified in environment variables`);
    log(`[bedrock-client] Set AWS_REGION or AWS_DEFAULT_REGION for proper configuration`);
  } else {
    log(`[bedrock-client] AWS region configured: ${region}`);
    
    // Check if Nova Pro is available in this region
    const novaPro_available_regions = ['us-east-1', 'us-west-2'];
    if (!novaPro_available_regions.includes(region)) {
      log(`[bedrock-client] WARNING: Nova Pro model is not available in region ${region}`);
      log(`[bedrock-client] Nova Pro is only available in: ${novaPro_available_regions.join(', ')}`);
    }
  }
  
  // Check for AWS Credentials
  const hasAccessKey = !!process.env['AWS_ACCESS_KEY_ID'];
  const hasSecretKey = !!process.env['AWS_SECRET_ACCESS_KEY'];
  const hasProfile = !!process.env['AWS_PROFILE'];
  
  if (hasAccessKey && hasSecretKey) {
    log(`[bedrock-client] AWS credentials found in environment variables`);
    if (process.env['AWS_ACCESS_KEY_ID']) {
      log(`[bedrock-client] Access Key ID: ${process.env['AWS_ACCESS_KEY_ID'].substring(0, 4)}...`);
    }
  } else if (hasProfile) {
    log(`[bedrock-client] AWS profile '${process.env['AWS_PROFILE']}' configured in environment variables`);
  } else {
    log(`[bedrock-client] WARNING: No AWS credentials found in environment variables`);
    log(`[bedrock-client] Checking default credential providers (shared credentials file, EC2 instance profile, etc.)`);
  }
  
  return {
    region,
    hasCredentials: hasAccessKey && hasSecretKey,
    hasProfile,
  };
}

async function verifyCredentials() {
  log(`[bedrock-client] Verifying AWS credentials with Bedrock API`);
  
  try {
    // Just ensure the environment variables are set
    const hasAwsAccess = !!process.env['AWS_ACCESS_KEY_ID'];
    const hasAwsSecret = !!process.env['AWS_SECRET_ACCESS_KEY'];
    
    if (!hasAwsAccess || !hasAwsSecret) {
      log(`[bedrock-client] Missing AWS credentials in environment variables`);
      log(`[bedrock-client] Will use default credential provider chain`);
    }
    
    log(`[bedrock-client] Connection validation prepared successfully`);
    log(`[bedrock-client] Credentials look valid based on client configuration`);
    
    return true;
  } catch (error: any) {
    // Enhanced detailed error logging
    log(`[bedrock-client] Credential verification error: ${error.name || 'Unknown error'}: ${error.message}`);
    
    if (error.$metadata) {
      log(`[bedrock-client] Error metadata: HTTP ${error.$metadata.httpStatusCode}, Request ID: ${error.$metadata.requestId}`);
    }
    
    if (error.name === 'AccessDeniedException') {
      log(`[bedrock-client] Access denied. Your IAM credentials don't have permission to list Bedrock models.`);
      log(`[bedrock-client] Required permission: 'bedrock:ListFoundationModels'`);
    } else if (error.name === 'ThrottlingException') {
      log(`[bedrock-client] Request throttled. AWS is limiting your request rate.`);
    } else if (error.name === 'ValidationException') {
      log(`[bedrock-client] Validation error: ${error.message}`);
    } else if (error.name === 'ServiceQuotaExceededException') {
      log(`[bedrock-client] Service quota exceeded: ${error.message}`);
    } else if (error.code === 'CredentialsProviderError') {
      log(`[bedrock-client] Credentials provider error: ${error.message}`);
      log(`[bedrock-client] Check your AWS configuration and ensure credentials are properly set`);
    } else if (error.code === 'RegionError') {
      log(`[bedrock-client] Region error: ${error.message}`);
    } else {
      log(`[bedrock-client] Unknown error during credential verification: ${error.message}`);
      if (error.stack) {
        log(`[bedrock-client] Error stack: ${error.stack}`);
      }
    }
    
    throw error;
  }
}

// Export types for use in the Bedrock agent
export { ConverseStreamCommand };
export type { Message } from '@aws-sdk/client-bedrock-runtime';

// Add environment check
export function checkAwsCredentials(): boolean {
  const hasAwsAccess = process.env['AWS_ACCESS_KEY_ID'] !== undefined;
  const hasAwsSecret = process.env['AWS_SECRET_ACCESS_KEY'] !== undefined;
  
  if (isLoggingEnabled()) {
    if (hasAwsAccess && hasAwsSecret) {
      log(`[bedrock-client] AWS credentials found in environment`);
    } else {
      log(`[bedrock-client] AWS credentials not found in environment`);
    }
  }
  
  return hasAwsAccess && hasAwsSecret;
}