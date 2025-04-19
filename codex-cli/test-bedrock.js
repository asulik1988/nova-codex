#!/usr/bin/env node

// Import required modules
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  // Enable debug logging
  process.env.CODEX_DEBUG = 'true';
  process.env.DEBUG = 'true';

  console.log('Checking environment variables:');
  console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set');
  console.log('- AWS_REGION:', process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '✗ Not set');
  console.log('- AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✓ Set' : '✗ Not set');
  console.log('- AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✓ Set' : '✗ Not set');

  // Check for AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('\nAWS credentials are not set. Please set the following environment variables:');
    console.log('  export AWS_ACCESS_KEY_ID=your_access_key');
    console.log('  export AWS_SECRET_ACCESS_KEY=your_secret_key');
    console.log('  export AWS_REGION=your_region (e.g., us-east-1)');
    process.exit(1);
  }

  // Build the TypeScript module
  try {
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/utils/bedrock-client.ts')],
      bundle: true,
      format: 'esm',
      outfile: join(__dirname, 'temp-bedrock-client.js'),
      platform: 'node',
      external: ['@aws-sdk/*'],
    });

    // Now dynamically import the built module
    const { createBedrockClient } = await import('./temp-bedrock-client.js');
    
    console.log('\nAttempting to create Bedrock client...');
    const bedrockClient = createBedrockClient();
    console.log('SUCCESS: Bedrock client created successfully');
    console.log('Client configuration:');
    console.log('- Region:', bedrockClient.config.region);
    console.log('- Has credentials:', !!bedrockClient.config.credentials);
  } catch (error) {
    console.error('FAILURE: Could not create Bedrock client');
    console.error('Error:', error.message);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

async function testBedrock() {
  console.log('Starting Bedrock test...');
  console.log(`Using AWS credentials: ${process.env.AWS_ACCESS_KEY_ID ? 'Access key is set' : 'No access key'}`);
  console.log(`Using AWS region: ${process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'Not set'}`);

  try {
    // Create the Bedrock client
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION
    });
    console.log('Created Bedrock client');

    // Prepare a simple message
    const message = {
      role: 'user',
      content: [{ text: 'Hello, who are you?' }]
    };

    // Create the command
    const command = new ConverseStreamCommand({
      modelId: 'amazon.nova-pro-v1:0',
      messages: [message]
    });
    console.log('Created command, sending request...');

    // Send the request and handle the streaming response
    const response = await client.send(command);
    console.log('Got response!', response.$metadata);

    if (response.stream) {
      console.log('Processing stream...');
      
      // Variables to accumulate the response
      let responseText = '';
      
      // Process the stream
      for await (const chunk of response.stream) {
        if (chunk && typeof chunk === 'object') {
          if ('messageStart' in chunk) {
            console.log('Assistant is responding...');
          } else if ('contentBlockDelta' in chunk) {
            const delta = chunk.contentBlockDelta.delta;
            if (delta && delta.text !== undefined) {
              responseText += delta.text;
              process.stdout.write(delta.text); // Stream to console
            }
          } else if ('messageStop' in chunk) {
            const stopReason = chunk.messageStop.stopReason;
            console.log(`\n\nResponse completed. Stop reason: ${stopReason}`);
          } else if ('metadata' in chunk) {
            console.log('\nMetadata:', JSON.stringify(chunk.metadata, null, 2));
          } else {
            console.log('Unknown chunk format:', JSON.stringify(chunk));
          }
        }
      }
      
      console.log('\nFull response:');
      console.log(responseText);
      console.log('Stream completed!');
    } else {
      console.log('No stream in response');
    }
  } catch (error) {
    console.error('Error:', error);
    if (error.$metadata) {
      console.error('Error metadata:', error.$metadata);
    }
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the test
testBedrock().catch(console.error); 