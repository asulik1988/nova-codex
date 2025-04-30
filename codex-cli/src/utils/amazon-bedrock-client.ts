import {
  BedrockRuntimeClient,
} from "@aws-sdk/client-bedrock-runtime";

interface BedrockOptions {
  region?: string;
}

export function createBedrockClient(options: BedrockOptions = {}): BedrockRuntimeClient {
  const region = process.env["AWS_DEFAULT_REGION"] || options.region || "us-east-1";
  
  // If API keys are provided directly, use them
  const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
  
  return new BedrockRuntimeClient({
    region,
    credentials: accessKeyId && secretAccessKey 
      ? { accessKeyId, secretAccessKey } 
      : undefined // Will use default credential provider chain if undefined
  });
}