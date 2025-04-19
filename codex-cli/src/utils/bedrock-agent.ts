// Bedrock agent implementation for Nova Pro model
import { log, isLoggingEnabled } from "./agent/log.js";
import { createBedrockClient } from "./bedrock-client.js";
import { parseToolCallArguments } from "./parsers.js";
import { randomUUID } from "crypto";
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand,
  InvokeModelCommandInput,
  InvokeModelWithResponseStreamCommand,
  InvokeModelWithResponseStreamCommandInput,
  InvokeModelWithResponseStreamCommandOutput,
  ConverseStreamCommand,
  ConverseStreamCommandOutput,
  ConverseStreamCommandInput,
  ConverseStreamOutput,
  type Message,
  type ConversationRole,
} from "@aws-sdk/client-bedrock-runtime";
import { isError } from "util";
// Replace smithy-client import with a type declaration for ServiceException
// since the module may not be directly available
type ServiceException = {
  name: string;
  message: string;
  $metadata?: {
    requestId?: string;
    cfId?: string;
    httpStatusCode?: number;
  }
};

// Create a Response interface to match the StreamingTextResponse implementation
interface ResponseLike {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
}

// Define our own MessageContent interface since it's not in the AWS SDK
interface MessageContent {
  text: string;
}

interface BedrockMessage {
  role: string;
  content: MessageContent[];
}

export const NOVA_PRO_MODEL_ID = 'amazon.nova-pro-v1:0';

/**
 * Inputs for the Claude/Bedrock streaming request
 */
export interface BedrockStreamingInput {
  /**
   * Input messages to send to Claude
   */
  messages: {
    role: string;
    content: string;
  }[];
  /**
   * Whether to stream the response
   */
  stream?: boolean;
  /**
   * Model to use, e.g. "anthropic.claude-3-sonnet-20240229-v1:0"
   */
  model?: string;
  tools?: any[];
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  };
}

// Enhanced debugging helper
const debugBedrockRequest = (modelId: string, params: BedrockStreamingInput) => {
  if (isLoggingEnabled()) {
    log('[bedrock-agent] Request details:');
    log(`[bedrock-agent] Model ID: ${modelId}`);
    log(`[bedrock-agent] Messages count: ${params.messages.length}`);
    log(`[bedrock-agent] System message: ${params.messages.find(m => m.role === 'system')?.content.substring(0, 50)}...`);
    log(`[bedrock-agent] User message: ${params.messages.find(m => m.role === 'user')?.content.substring(0, 50)}...`);
    
    // Log tool config summary if available (using optional chaining to avoid type errors)
    if ('toolConfig' in params && params.toolConfig) {
      log(`[bedrock-agent] Tool config: ${JSON.stringify({
        toolChoice: (params.toolConfig as any).toolChoice,
        toolCount: (params.toolConfig as any).tools?.length || 0
      })}`);
    }
  }
};

export const streamBedrockResponse = async function* (
  modelId: string,
  params: BedrockStreamingInput,
  signal?: AbortSignal
): AsyncGenerator<any> {
  try {
    const client = createBedrockClient();
    
    if (modelId === NOVA_PRO_MODEL_ID) {
      log(`Using Nova Pro streaming with converse stream API`);
      
      // Convert our messages to Bedrock format
      const bedrockMessages = params.messages.map((message) => {
        // Map our role names to Bedrock role names
        const roleMapping: Record<string, string> = {
          'user': 'user',
          'assistant': 'assistant',
          'system': 'system'
        };
        
        const role = roleMapping[message.role.toLowerCase()] || 'user';
        
        // Format content as required by Bedrock API
        return {
          role,
          content: [{
            text: message.content
          }]
        };
      });
      
      const input: ConverseStreamCommandInput = {
        modelId: modelId,
        messages: bedrockMessages as any, // Type assertion needed due to SDK typing issues
      };
      
      // Add optional params if provided
      if (params.inferenceConfig?.maxTokens) {
        input.inferenceConfig = {
          ...input.inferenceConfig,
          maxTokens: params.inferenceConfig.maxTokens
        };
      }
      
      const command = new ConverseStreamCommand(input);
      
      log(`Sending request to Bedrock Converse API`);
      
      const response = await client.send(command, { abortSignal: signal });
      
      log(`Got response from Bedrock, streaming results...`);
      
      // Process the stream
      let completionToken = '';
      let messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      
      if (response && response.stream) {
        for await (const chunk of response.stream) {
          if (signal?.aborted) {
            throw new Error('Request was aborted');
          }
          try {
            if (chunk && typeof chunk === 'object') {
              if ('messageStart' in chunk) {
                log('[bedrock-agent] Assistant is responding...');
              } else if ('contentBlockDelta' in chunk && chunk.contentBlockDelta && chunk.contentBlockDelta.delta) {
                const delta = chunk.contentBlockDelta.delta;
                if (delta && delta.text !== undefined) {
                  completionToken += delta.text;
                  // Yield a streaming event for each chunk
                  yield {
                    type: 'response.output_item.done',
                    item: {
                      id: messageId,
                      type: 'message',
                      role: 'assistant',
                      content: [
                        { type: 'output_text', text: delta.text, annotations: [] }
                      ],
                      status: 'in_progress',
                    }
                  };
                }
              } else if ('messageStop' in chunk && chunk.messageStop) {
                log(`[bedrock-agent] Response completed. Stop reason: ${chunk.messageStop.stopReason}`);
                // Optionally yield a final event with the full message
                yield {
                  type: 'response.output_item.done',
                  item: {
                    id: messageId,
                    type: 'message',
                    role: 'assistant',
                    content: [
                      { type: 'output_text', text: completionToken, annotations: [] }
                    ],
                    status: 'completed',
                  }
                };
              } else if ('metadata' in chunk) {
                log(`[bedrock-agent] Metadata: ${JSON.stringify(chunk.metadata)}`);
              } else {
                log(`[bedrock-agent] Unknown chunk format: ${JSON.stringify(chunk)}`);
              }
            }
          } catch (chunkError) {
            log(`[bedrock-agent] Error processing stream chunk: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`);
          }
        }
      } else {
        throw new Error('No response stream received from Bedrock');
      }
      
      return { responseId: messageId };
    } else {
      throw new Error(`Model ${modelId} is not supported for streaming`);
    }
  } catch (err: unknown) {
    // Ensure type safety when handling errors
    if (err instanceof Error) {
      log(`Error in streaming: ${err.message}`);
      throw err;
    } else {
      const errorMessage = typeof err === 'object' && err !== null ? 
        JSON.stringify(err) : 'Unknown error';
      log(`Unknown error type in streaming: ${errorMessage}`);
      throw new Error(`Bedrock streaming error: ${errorMessage}`);
    }
  }
};

/**
 * Create a Response-like object from an async generator
 */
function createStreamingResponse(
  stream: AsyncGenerator<string>
): ResponseLike {
  const encoder = new TextEncoder();
  
  // Create a readable stream from our async generator
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
  
  // Return a Response-like object
  return {
    status: 200,
    headers: new Headers({
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    }),
    body: readableStream
  };
}

/**
 * Process the Bedrock stream chunks with better error handling
 */
async function* processBedrockStream(
  stream: AsyncIterable<any>,
  modelId: string
): AsyncGenerator<string> {
  try {
    for await (const chunk of stream) {
      try {
        if (isLoggingEnabled()) {
          log(`[bedrock-agent] Received chunk from ${modelId}`);
        }
        
        // Different models might format their responses differently
        if (chunk.output?.text) {
          // Standard format for most Anthropic models
          yield chunk.output.text;
        } else if (chunk.chunk?.bytes) {
          // Handle byte format
          const decoder = new TextDecoder();
          const text = decoder.decode(chunk.chunk.bytes);
          
          if (isLoggingEnabled()) {
            log(`[bedrock-agent] Decoded chunk bytes, length: ${text.length}`);
          }
          
          try {
            // Try to parse JSON (Nova might return JSON in bytes)
            const jsonData = JSON.parse(text);
            if (jsonData.delta?.content) {
              yield jsonData.delta.content;
            } else if (jsonData.completion) {
              yield jsonData.completion;
            } else {
              // If we can't extract specific fields, return the whole object
              yield text;
            }
          } catch (parseError) {
            // If not JSON, just return the text
            yield text;
          }
        } else if (chunk.bytes) {
          // Direct bytes format
          const decoder = new TextDecoder();
          const text = decoder.decode(chunk.bytes);
          yield text;
        } else {
          // Unknown format - log for debugging
          if (isLoggingEnabled()) {
            log(`[bedrock-agent] Unknown chunk format: ${JSON.stringify(chunk)}`);
          }
          
          // Attempt to stringify the chunk as a fallback
          const stringified = JSON.stringify(chunk);
          if (stringified !== '{}') {
            yield `Unknown response format: ${stringified}`;
          }
        }
      } catch (chunkError) {
        // If one chunk fails, log and continue with others
        console.error(`[bedrock-agent] Error processing stream chunk: ${chunkError}`);
        yield `[Error processing response chunk: ${chunkError}]`;
      }
    }
  } catch (streamError) {
    console.error(`[bedrock-agent] Stream processing error: ${streamError}`);
    yield `[Stream error: ${streamError}]`;
  }
}

// Define the AgentOptions interface
interface AgentOptions {
  model: string;
  apiKey: string;
  temperature: number;
  topP: number;
  commandParams: {
    toolConfig: (tools: any[]) => any;
  };
}

export function createBedrockAgent(
  model: string,
  apiKey: string,
  temperature: number,
  topP: number
): AgentOptions {
  console.log('AWS Bedrock', model);
  return {
    model,
    apiKey,
    temperature,
    topP,
    commandParams: {
      toolConfig: (tools: any[]) => {
        try {
          console.log('Processing tools for Bedrock:');
          let agent_name = 'codex'; // change to a uuid if we need multiple agents
          let toolDefinitions = tools.map(tool => {
            // Add safety check for undefined properties
            let properties = {};
            let required = [];
            
            try {
              // Safely extract properties with deep null checks
              if (tool && 
                  typeof tool === 'object' && 
                  tool['parameters'] && 
                  typeof tool['parameters'] === 'object') {
                
                if ('properties' in tool['parameters'] && 
                    tool['parameters']['properties'] && 
                    typeof tool['parameters']['properties'] === 'object') {
                  properties = tool['parameters']['properties'];
                }
                
                if ('required' in tool['parameters'] && 
                    Array.isArray(tool['parameters']['required'])) {
                  required = tool['parameters']['required'];
                }
              }
              
              console.log(`Processing schema for tool: ${tool?.name || 'unnamed'}`, { properties, required });
            } catch (err) {
              console.error(`Error processing tool parameters: ${err}`);
            }
            
            return {
              name: tool?.name || 'unnamed_tool',
              description: tool?.description || '',
              inputSchema: {
                json: JSON.stringify({
                  type: "object",
                  properties: properties,
                  required: required,
                }),
              },
            };
          });
          return {
            sessionState: {},
            agent: agent_name,
            toolConfig: {
              tools: toolDefinitions,
              agent: agent_name,
            },
          };
        } catch (error) {
          console.error('Error creating Bedrock agent tool configuration:', error);
          // Return a minimal valid configuration to prevent further errors
          return {
            sessionState: {},
            agent: 'codex',
            toolConfig: {
              tools: [],
              agent: 'codex',
            },
          };
        }
      },
    },
  };
}

// Add a more basic version of the streaming function that can be used for debugging
export const debugBedrockStreaming = async function* (
  modelId: string,
  params: BedrockStreamingInput,
): AsyncGenerator<string> {
  try {
    console.log('====== BASIC BEDROCK DEBUG MODE ======');
    console.log(`Creating basic Bedrock client for model: ${modelId}`);
    
    // Log AWS configuration without revealing secrets
    console.log(`AWS Region: ${process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'NOT SET'}`);
    console.log(`AWS Access Key ID: ${process.env['AWS_ACCESS_KEY_ID'] ? 'Set (starts with ' + process.env['AWS_ACCESS_KEY_ID'].substring(0, 4) + '...)' : 'NOT SET'}`);
    console.log(`AWS Secret Access Key: ${process.env['AWS_SECRET_ACCESS_KEY'] ? 'Set (hidden)' : 'NOT SET'}`);
    console.log(`AWS Session Token: ${process.env['AWS_SESSION_TOKEN'] ? 'Set' : 'NOT SET'}`);
    console.log(`AWS Profile: ${process.env['AWS_PROFILE'] || 'NOT SET'}`);
    
    // Create a minimal client directly
    const client = new BedrockRuntimeClient({
      region: process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'],
      // Use default credential provider chain
    });
    
    // Verify credentials before making the API call
    try {
      const credentials = await client.config.credentials();
      console.log(`Successfully loaded credentials. Access Key starts with: ${credentials.accessKeyId.substring(0, 4)}...`);
      if (credentials.expiration) {
        console.log(`Credentials expire at: ${credentials.expiration.toISOString()}`);
      }
    } catch (credError: any) {
      console.error(`Credential loading error: ${credError.message}`);
      throw new Error(`AWS credential error: ${credError.message}. Check your AWS configuration.`);
    }
    
    // Convert our messages to Bedrock format first
    const bedrockMessages: Message[] = params.messages.map((message) => {
      const roleMapping: Record<string, ConversationRole> = {
        'user': 'user' as ConversationRole,
        'assistant': 'assistant' as ConversationRole,
        'system': 'system' as ConversationRole
      };
      
      const role = roleMapping[message.role.toLowerCase()] || 'user' as ConversationRole;
      
      return {
        role,
        content: [{
          text: message.content
        }]
      };
    });
    
    // Log complete request structure (excluding sensitive content)
    console.log('Request structure:', JSON.stringify({
      modelId,
      messageCount: bedrockMessages.length,
      messageSizes: bedrockMessages.map(m => ({
        role: m.role,
        contentLength: m.content?.[0]?.text?.length || 0
      })),
      hasToolConfig: 'toolConfig' in params && !!params.toolConfig,
      temperature: params.inferenceConfig?.temperature,
      topP: params.inferenceConfig?.topP,
    }, null, 2));
    
    // Create a proper command with correctly typed input
    const inputParams: any = {
      modelId,
      messages: bedrockMessages,
    };
    
    // Add optional parameters if present
    if (params.inferenceConfig?.temperature !== undefined) {
      inputParams.inferenceConfig = {
        temperature: params.inferenceConfig.temperature
      };
    }
    
    if (params.inferenceConfig?.topP !== undefined) {
      if (!inputParams.inferenceConfig) {
        inputParams.inferenceConfig = {};
      }
      inputParams.inferenceConfig.topP = params.inferenceConfig.topP;
    }
    
    // Add tool configuration if present
    if ('toolConfig' in params && params.toolConfig) {
      console.log('Including tool configuration in request');
      inputParams.toolConfig = params.toolConfig;
    }
    
    const command = new ConverseStreamCommand(inputParams);
    
    console.log('Sending basic request to AWS Bedrock...');
    const response = await client.send(command);
    
    console.log('Successfully received response stream');
    
    // Process the stream - ConverseStreamCommandOutput has 'stream' property, not 'body'
    if (response && response.stream) {
      for await (const chunk of response.stream) {
        if (chunk && typeof chunk === 'object') {
          // Handle each chunk based on its structure
          if ('message' in chunk && chunk.message) {
            // Process message content using type assertion
            const message = chunk.message as { content?: Array<{ text?: string }> };
            const content = message.content || [];
            if (Array.isArray(content) && content.length > 0) {
              const text = content[0]?.text || '';
              if (text) {
                console.log('Received chunk text:', text.substring(0, 30) + '...');
                yield text;
              }
            }
          } else if ('delta' in chunk && chunk.delta) {
            // Process delta content for other models
            const delta = chunk.delta as { text?: string };
            const deltaText = delta.text || '';
            if (deltaText) {
              console.log('Received delta chunk:', deltaText.substring(0, 30) + '...');
              yield deltaText;
            }
          }
        }
      }
    } else {
      throw new Error('No response stream received from Bedrock');
    }
  } catch (error: unknown) {
    // Detailed console error for debugging
    console.error('====== BEDROCK DEBUG ERROR ======');
    
    // Type-check error before accessing properties
    if (error && typeof error === 'object') {
      const err = error as {
        name?: string;
        message?: string;
        code?: string;
        $metadata?: {
          httpStatusCode?: number;
          requestId?: string;
          extendedRequestId?: string;
        };
      };
      
      console.error('Error Type:', err.name || 'Unknown');
      console.error('Error Message:', err.message || 'No message available');
      console.error('Error Code:', err.code || 'None');
      
      if (err.$metadata) {
        console.error('HTTP Status:', err.$metadata.httpStatusCode);
        console.error('Request ID:', err.$metadata.requestId);
        console.error('Extended Request ID:', err.$metadata.extendedRequestId);
      }
      
      // More specific error diagnosis
      if (err.name === 'ValidationException') {
        console.error('Validation error detected. This could be due to:');
        console.error('- Invalid model ID');
        console.error('- Improperly formatted messages');
        console.error('- Missing required parameters');
        console.error('- Invalid tool configuration');
        
        // Try to extract specific validation error details
        if (err.message && err.message.includes('validation error detected')) {
          const errorDetails = err.message.split(':').slice(1).join(':').trim();
          console.error(`Validation details: ${errorDetails}`);
        }
      } else if (err.name === 'AccessDeniedException') {
        console.error('Access denied. This could be due to:');
        console.error('- Your AWS account does not have access to the requested model');
        console.error('- Your IAM role does not have bedrock:InvokeModel permission');
        console.error('- The model may not be available in your region');
      } else if (err.name === 'ResourceNotFoundException') {
        console.error(`The requested model '${modelId}' was not found.`);
        console.error('- Check if the model ID is correct');
        console.error('- Verify the model is available in your AWS region');
      } else if (err.name === 'CredentialsProviderError' || err.code === 'CredentialsProviderError') {
        console.error('AWS credential provider error:');
        console.error('- Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set correctly');
        console.error('- If using a profile, make sure AWS_PROFILE is set correctly');
        console.error('- Check if your credentials have expired');
      } else if (err.name === 'ThrottlingException') {
        console.error('Request was throttled by AWS Bedrock:');
        console.error('- You may have exceeded your quota or rate limit');
        console.error('- Try again later or request a quota increase');
      }
      
      console.error('Full Error:', error);
      console.error('====== END DEBUG ERROR ======');
      
      // Re-throw with enhanced error message
      throw new Error(`AWS Bedrock error [${err.name || 'Unknown'}]: ${err.message || 'Unknown error'}${err.$metadata?.httpStatusCode ? ` (HTTP ${err.$metadata.httpStatusCode})` : ''}`);
    } else {
      // Handle non-object errors
      console.error('Unknown error type:', typeof error);
      console.error('Error value:', String(error));
      console.error('====== END DEBUG ERROR ======');
      
      throw new Error(`AWS Bedrock unknown error: ${String(error)}`);
    }
  }
};

export type BedrockAgentResponse = {
  content: string;
  toolCalls: any[];
  modelId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export const streamBedrockResponseWithTools = async function* (
  modelId: string,
  params: BedrockStreamingInput,
  signal?: AbortSignal
): AsyncGenerator<string> {
  try {
    debugBedrockRequest(modelId, params);
    log(`[bedrock-agent] Creating Bedrock client`);
    const client = createBedrockClient();

    // Convert our messages to Bedrock format with proper type handling
    const bedrockMessages: BedrockMessage[] = params.messages.map((message) => {
      // Map our role names to Bedrock role names
      const roleMapping: Record<string, string> = {
        'user': 'user',
        'assistant': 'assistant',
        'system': 'system'
      };
      
      const role = roleMapping[message.role.toLowerCase()] || 'user';
      
      // Format content as required by Bedrock API
      return {
        role,
        content: [{
          text: message.content
        }]
      };
    });

    // Build proper input structure for Bedrock
    const input: InvokeModelWithResponseStreamCommandInput = {
      modelId,
      body: JSON.stringify({
        messages: bedrockMessages,
        anthropic_version: "bedrock-2023-05-31",
        // Add tools if provided
        ...(params.tools && { tools: params.tools }),
        // Add inference config if provided
        ...(params.inferenceConfig && { 
          max_tokens: params.inferenceConfig.maxTokens,
          temperature: params.inferenceConfig.temperature,
          top_p: params.inferenceConfig.topP,
          top_k: params.inferenceConfig.topK
        })
      }),
      contentType: 'application/json',
      accept: 'application/json',
    };

    // Log that we're sending the request
    log(`[bedrock-agent] Sending stream request to model: ${modelId}`);
    
    // Create the command with the input
    const command = new InvokeModelWithResponseStreamCommand(input);
    
    try {
      // Send the command to Bedrock
      log(`[bedrock-agent] Executing stream command`);
      const response: InvokeModelWithResponseStreamCommandOutput = await client.send(command, { abortSignal: signal });
      
      log(`[bedrock-agent] Received response stream`);
      
      // Process the stream
      if (response.body) {
        for await (const chunk of response.body) {
          const decoder = new TextDecoder('utf-8');
          const text = decoder.decode(chunk.chunk?.bytes);
          
          // Optionally debug the raw response chunks
          if (isLoggingEnabled()) {
            log(`[bedrock-agent] Received chunk: ${text.substring(0, 50)}...`);
          }
          
          yield text;
        }
      } else {
        throw new Error('No response body received from Bedrock');
      }
    } catch (error: any) {
      // Detailed error handling
      log(`[bedrock-agent] Error during Bedrock API call: ${error.name}: ${error.message}`);
      
      // Enhanced error handling with specific error types
      if (error.$metadata) {
        log(`[bedrock-agent] API Metadata: HTTP ${error.$metadata.httpStatusCode}, Request ID: ${error.$metadata.requestId}`);
      }

      if (error.name === 'AccessDeniedException') {
        throw new Error(`Access denied: Your AWS credentials do not have permission to use model '${modelId}'. ${error.message}`);
      } else if (error.name === 'ResourceNotFoundException') {
        throw new Error(`Model '${modelId}' not found. Verify the model ID and ensure it's available in your AWS region.`);
      } else if (error.name === 'ValidationException') {
        let details = error.message;
        
        // Check for validation error types if available
        if (error.__type === 'ValidationException' && error.reason) {
          if (error.reason === 'CONTENT_POLICY_VIOLATION') {
            details = `Content policy violation: ${error.message}`;
          } else if (error.reason === 'MALFORMED_INPUT') {
            details = `Malformed input: ${error.message}`;
          }
        }
        
        throw new Error(`Validation error: ${details}`);
      } else if (error.name === 'ThrottlingException') {
        throw new Error(`Rate limit exceeded: ${error.message}. Try again later.`);
      } else if (error.name === 'ServiceQuotaExceededException') {
        throw new Error(`Service quota exceeded: ${error.message}`);
      } else if (error.name === 'ModelTimeoutException') {
        throw new Error(`Model timeout: The request took too long to process. Try simplifying your prompt.`);
      } else if (error.name === 'ModelErrorException') {
        throw new Error(`Model error: ${error.message}. Try again or use a different model.`);
      } else if (error.code === 'CredentialsProviderError') {
        throw new Error(`AWS credentials error: ${error.message}. Check your AWS credentials and region settings.`);
      } else if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        throw new Error('Request was aborted by the user');
      } else {
        // Generic error with as much detail as possible
        const errorMessage = `Bedrock API error (${error.name || 'Unknown'}): ${error.message}`;
        console.error(`[bedrock-agent] ${errorMessage}`, error);
        throw new Error(errorMessage);
      }
    }
  } catch (error: unknown) {
    // Handle top-level errors that might not be directly from the AWS SDK
    const err = error as Error;
    log(`[bedrock-agent] Top-level error: ${err.message}`);
    console.error('[bedrock-agent] Error details:', err);
    
    // Re-throw with appropriate context
    if (err.message.includes('Could not load credentials')) {
      throw new Error(`AWS credentials error: Could not load credentials. Check your AWS configuration.`);
    } else if (err.message.includes('socket hang up') || err.message.includes('ETIMEDOUT')) {
      throw new Error(`Network error: Connection to AWS Bedrock failed. Check your network connection and AWS region settings.`);
    } else {
      throw error; // Re-throw the original error if it already has proper context
    }
  }
};

/**
 * Debug function to check AWS configuration without making API calls
 */
export function debugBedrockConfiguration() {
  try {
    // Check environment variables
    const region = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'];
    const hasAccessKey = !!process.env['AWS_ACCESS_KEY_ID'];
    const hasSecretKey = !!process.env['AWS_SECRET_ACCESS_KEY'];
    const hasProfile = !!process.env['AWS_PROFILE'];
    
    log(`[bedrock-agent] AWS Configuration Debug:`);
    log(`[bedrock-agent] Region: ${region || 'Not set'}`);
    log(`[bedrock-agent] Access Key: ${hasAccessKey ? 'Set' : 'Not set'}`);
    log(`[bedrock-agent] Secret Key: ${hasSecretKey ? 'Set' : 'Not set'}`);
    log(`[bedrock-agent] Profile: ${hasProfile ? process.env['AWS_PROFILE'] : 'Not set'}`);
    
    // Don't log actual keys, but check if they exist
    if (!region) {
      log(`[bedrock-agent] WARNING: No AWS region set. Set AWS_REGION or AWS_DEFAULT_REGION`);
    }
    
    if (!hasAccessKey || !hasSecretKey) {
      if (hasProfile) {
        log(`[bedrock-agent] Using AWS profile: ${process.env['AWS_PROFILE']}`);
      } else {
        log(`[bedrock-agent] WARNING: No AWS credentials found`);
      }
    }
    
    // Check if the expected Nova Pro model ID is used
    log(`[bedrock-agent] Using model ID: ${NOVA_PRO_MODEL_ID}`);
    log(`[bedrock-agent] Nova Pro should be available in regions: us-east-1, us-west-2`);
    
    return {
      region,
      hasCredentials: hasAccessKey && hasSecretKey,
      hasProfile,
      modelId: NOVA_PRO_MODEL_ID
    };
  } catch (error: unknown) {
    // Type-check error before accessing properties
    if (error instanceof Error) {
      log(`[bedrock-agent] Error in debug function: ${error.message}`);
      return { error: error.message };
    }
    
    // Handle unknown error type
    log(`[bedrock-agent] Unknown error in debug function: ${String(error)}`);
    return { error: String(error) };
  }
}

export async function handleAWSServiceError(error: unknown): Promise<{ success: boolean, message: string, details?: any }> {
  if (!error) {
    return { 
      success: false, 
      message: 'Unknown error occurred',
      details: { error: 'No error information available' }
    };
  }
  
  // Type guard for AWS service errors
  if (typeof error === 'object' && error !== null) {
    const possibleServiceError = error as Partial<ServiceException>;
    
    if ('$metadata' in possibleServiceError) {
      return {
        success: false,
        message: `AWS Service error: ${possibleServiceError.name || 'UnknownServiceError'}`,
        details: {
          errorName: possibleServiceError.name,
          errorMessage: possibleServiceError.message,
          requestId: possibleServiceError.$metadata?.requestId,
          httpStatusCode: possibleServiceError.$metadata?.httpStatusCode
        }
      };
    }
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    return { 
      success: false, 
      message: `Error: ${error.name}`,
      details: { 
        errorType: error.name,
        errorMessage: error.message,
        stack: error.stack
      }
    };
  }
  
  // Handle any other type of error
  return { 
    success: false, 
    message: 'Unexpected error format',
    details: { 
      errorValue: String(error),
      errorType: typeof error
    } 
  };
}

/**
 * A simplified test function that can be used to verify basic AWS connectivity
 * without the complexity of the full streaming implementation
 */
export async function testBedrockConnection(): Promise<{ success: boolean, message: string, details?: any }> {
  log(`[bedrock-agent] Testing Bedrock connection...`);
  
  try {
    // Check AWS configuration first
    const configInfo = debugBedrockConfiguration();
    log(`[bedrock-agent] AWS Configuration: ${JSON.stringify(configInfo, null, 2)}`);
    
    if (!configInfo.region) {
      return {
        success: false,
        message: 'Missing AWS region configuration',
        details: 'Set AWS_REGION or AWS_DEFAULT_REGION to a valid region (us-east-1 or us-west-2 for Nova Pro)'
      };
    }
    
    if (!configInfo.hasCredentials) {
      return {
        success: false,
        message: 'Missing AWS credentials',
        details: 'Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables'
      };
    }
    
    // Create Bedrock client
    log(`[bedrock-agent] Creating Bedrock client with region: ${configInfo.region}`);
    const client = createBedrockClient();
    
    // Create a simple ping message to test the connection
    const testMessages: Message[] = [
      {
        role: 'user' as ConversationRole,
        content: [{ text: 'Hello' }]
      }
    ];
    
    // Create a minimalist command just to test connectivity
    const command = new ConverseStreamCommand({
      modelId: NOVA_PRO_MODEL_ID,
      messages: testMessages
    });
    
    log(`[bedrock-agent] Sending test request to model: ${NOVA_PRO_MODEL_ID}`);
    
    // Set a short timeout for the test request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      log(`[bedrock-agent] Test request timed out after 10 seconds`);
    }, 10000);

    try {
      // Send the command but just check for response, don't process fully
      log(`[bedrock-agent] Awaiting response from Bedrock API...`);
      const response = await client.send(command, { abortSignal: controller.signal });
      clearTimeout(timeoutId);
      
      // Ensure we handle the response metadata safely
      if (response && response.$metadata) {
        log(`[bedrock-agent] Received response with status: ${response.$metadata.httpStatusCode || 'unknown'}, requestId: ${response.$metadata.requestId || 'none'}`);
      } else {
        log(`[bedrock-agent] Received response but without metadata`);
      }
      
      // Check for successful response
      if (response && response.$metadata && response.$metadata.httpStatusCode === 200) {
        log(`[bedrock-agent] Connection test successful. HTTP ${response.$metadata.httpStatusCode}`);
        
        // Check if we got a stream in the response
        if (response.stream) {
          log(`[bedrock-agent] Response includes a valid stream`);
        }
        
        return {
          success: true,
          message: 'Successfully connected to AWS Bedrock',
          details: {
            modelId: NOVA_PRO_MODEL_ID,
            region: configInfo.region,
            responseStatus: response.$metadata.httpStatusCode,
            requestId: response.$metadata.requestId || 'none',
            attempts: response.$metadata.attempts || 1
          }
        };
      } else {
        // Handle unexpected response status
        const statusCode = response?.$metadata?.httpStatusCode || 'unknown';
        log(`[bedrock-agent] Unexpected response status: ${statusCode}`);
        return {
          success: false,
          message: 'Received unexpected response from Bedrock',
          details: {
            responseStatus: statusCode,
            requestId: response?.$metadata?.requestId || 'unknown',
            attempts: response?.$metadata?.attempts || 1
          }
        };
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      
      // Log the raw error
      log(`[bedrock-agent] Error in Bedrock request: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof Error && err.stack) {
        log(`[bedrock-agent] Error stack: ${err.stack}`);
      }
      
      // Type check the error properly
      if (err && typeof err === 'object') {
        const typedError = err as Record<string, unknown>;
        log(`[bedrock-agent] Error details: ${JSON.stringify(typedError, null, 2)}`);
        
        // Check for specific AWS SDK errors
        if ('name' in typedError && typeof typedError['name'] === 'string') {
          if (typedError['name'] === 'UnrecognizedClientException') {
            return {
              success: false,
              message: 'AWS authentication failed - invalid credentials or permissions',
              details: typedError
            };
          } else if (typedError['name'] === 'AccessDeniedException') {
            return {
              success: false, 
              message: 'Access denied - your AWS account may not have access to Bedrock or this model',
              details: typedError
            };
          } else if (typedError['name'] === 'ServiceQuotaExceededException') {
            return {
              success: false,
              message: 'Service quota exceeded - you may have hit your Bedrock usage limits',
              details: typedError
            };
          } else if (typedError['name'] === 'ValidationException') {
            return {
              success: false,
              message: 'Validation error - check that you are using the correct model ID and parameters',
              details: typedError
            };
          } else if (typedError['name'] === 'ModelNotReadyException') {
            return {
              success: false,
              message: 'Model not ready - the requested model may not be available in this region',
              details: typedError
            };
          }
        }
        
        return {
          success: false,
          message: 'Error while testing Bedrock connection',
          details: typedError
        };
      }
      
      // Use the helper function to handle AWS errors consistently
      return handleAWSServiceError(err);
    }
  } catch (err: unknown) {
    log(`[bedrock-agent] Unexpected error in test connection: ${err instanceof Error ? err.message : String(err)}`);
    return handleAWSServiceError(err);
  }
}

// Non-streaming Converse for Nova Pro
export async function converseBedrockResponse(
  modelId: string,
  params: BedrockStreamingInput,
  signal?: AbortSignal
): Promise<any> {
  const client = createBedrockClient();
  if (modelId !== NOVA_PRO_MODEL_ID) {
    throw new Error(`Model ${modelId} is not supported for converse`);
  }
  // Convert messages to Bedrock format
  const bedrockMessages = params.messages.map((message) => {
    const roleMapping: Record<string, string> = {
      'user': 'user',
      'assistant': 'assistant',
      'system': 'system',
    };
    const role = roleMapping[message.role.toLowerCase()] || 'user';
    return {
      role,
      content: [{ text: message.content }],
    };
  });
  const input: any = {
    modelId: modelId,
    messages: bedrockMessages,
  };
  if (params.inferenceConfig?.maxTokens) {
    input.inferenceConfig = {
      ...input.inferenceConfig,
      maxTokens: params.inferenceConfig.maxTokens,
    };
  }
  // Use ConverseCommand (non-streaming)
  const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const command = new ConverseCommand(input);
  const response = await client.send(command, { abortSignal: signal });
  // Extract the assistant's message from the response
  const message = response?.output?.message;
  let text = '';
  if (message && Array.isArray(message.content)) {
    text = message.content.map((c: any) => c.text || '').join('');
  }
  // Return a ResponseItem-compatible object
  return {
    type: 'response.output_item.done',
    item: {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'output_text', text, annotations: [] },
      ],
      status: 'completed',
    },
  };
} 