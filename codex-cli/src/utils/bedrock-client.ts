// Bedrock client wrapper for Neo CLI
import { BedrockRuntimeClient, ConversationRole, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { AWS_REGION } from "./config";

/**
 * Create an Amazon Bedrock runtime client using the AWS region
 * specified in the environment (AWS_DEFAULT_REGION or AWS_REGION).
 */
export function createBedrockClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({ region: AWS_REGION });
}

export { ConversationRole, ConverseStreamCommand };