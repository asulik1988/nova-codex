// Import dependencies using ES modules
import { createBedrockClient } from './amazon-bedrock-client.ts';
import { InvokeModelWithResponseStreamCommand, InvokeModelCommand, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = createBedrockClient();

async function invokeBedrockStream(modelType = 'claude', prompt = 'Tell me a short story about a robot.') {
  try {
    console.log(`Creating streaming command for ${modelType} model...`);
    
    let modelId, command, response;
    
    if (modelType === 'claude') {
      modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });
      
      command = new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body
      });
      
      console.log(`Sending streaming command to Bedrock for ${modelId}...`);
      response = await bedrockClient.send(command);
      
      console.log("Processing streaming response...");
      const stream = response.body;
      
      // Process the stream for Claude model
      for await (const chunk of stream) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
          
          // Claude's response format
          if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
            process.stdout.write(chunkData.delta.text);
          }
          
          if (chunkData.type === 'message_stop') {
            console.log("\n--- End of Claude response ---");
          }
        }
      }
    } else if (modelType === 'nova') {
      modelId = 'amazon.nova-pro-v1:0';
      
      // Nova uses the Converse API with a different format
      const request = {
        modelId: modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }]
          }
        ],
        inferenceConfig: {
          maxTokens: 1000,
          temperature: 0.7,
          topP: 0.9
        }
      };
      
      console.log(`Sending Converse command to Bedrock for ${modelId}...`);
      try {
        response = await bedrockClient.send(new ConverseCommand(request));
        
        // Extract and print the Nova model's response text
        if (response.output?.message?.content[0]?.text) {
          const responseText = response.output.message.content[0].text;
          console.log(responseText);
          console.log("\n--- End of Nova response ---");
        }
      } catch (error) {
        console.error("Nova API error:", error);
        
        // Fallback to InvokeModelWithResponseStream if the Converse API fails
        console.log("Falling back to InvokeModelWithResponseStream...");
        const body = JSON.stringify({
          inputText: prompt,
          textGenerationConfig: {
            maxTokenCount: 1000
          }
        });
        
        command = new InvokeModelWithResponseStreamCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body
        });
        
        console.log(`Sending streaming command to Bedrock for ${modelId}...`);
        response = await bedrockClient.send(command);
        
        console.log("Processing streaming response...");
        const stream = response.body;
        
        // Process the stream for Nova model
        for await (const chunk of stream) {
          if (chunk.chunk?.bytes) {
            const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
            
            // Nova's response format for streaming
            if (chunkData.outputText) {
              process.stdout.write(chunkData.outputText);
            }
            
            if (chunkData.completionReason) {
              console.log(`\n--- End of Nova response (${chunkData.completionReason}) ---`);
            }
          }
        }
      }
    } else {
      throw new Error(`Unsupported model type: ${modelType}`);
    }
  } catch (error) {
    console.error("Detailed error:", error);
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    if (error.$metadata) {
      console.error("AWS metadata:", error.$metadata);
    }
  }
}

// Add a function for non-streaming invocation
async function invokeBedrock(modelType = 'claude', prompt = 'Tell me a short story about a robot.') {
  try {
    console.log(`Creating command for ${modelType} model...`);
    
    let modelId, command, response;
    
    if (modelType === 'claude') {
      modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });
      
      command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body
      });
      
      console.log(`Sending command to Bedrock for ${modelId}...`);
      response = await bedrockClient.send(command);
      
      console.log("Processing response...");
      const responseBody = new TextDecoder().decode(response.body);
      const responseData = JSON.parse(responseBody);
      
      // Claude's response format
      if (responseData.content && responseData.content[0].text) {
        return responseData.content[0].text;
      }
      
      return responseData;
    } else if (modelType === 'nova') {
      modelId = 'amazon.nova-pro-v1:0';
      
      // Nova uses the Converse API with a different format
      const request = {
        modelId: modelId,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }]
          }
        ],
        inferenceConfig: {
          maxTokens: 1000,
          temperature: 0.7,
          topP: 0.9
        }
      };
      
      console.log(`Sending Converse command to Bedrock for ${modelId}...`);
      try {
        response = await bedrockClient.send(new ConverseCommand(request));
        
        // Extract the Nova model's response text
        if (response.output?.message?.content[0]?.text) {
          return response.output.message.content[0].text;
        }
        
        return response;
      } catch (error) {
        console.error("Nova API error:", error);
        
        // Fallback to InvokeModel if the Converse API fails
        console.log("Falling back to InvokeModel...");
        const body = JSON.stringify({
          inputText: prompt,
          textGenerationConfig: {
            maxTokenCount: 1000
          }
        });
        
        command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body
        });
        
        console.log(`Sending command to Bedrock for ${modelId}...`);
        response = await bedrockClient.send(command);
        
        console.log("Processing response...");
        const responseBody = new TextDecoder().decode(response.body);
        const responseData = JSON.parse(responseBody);
        
        // Nova's response format
        if (responseData.outputText) {
          return responseData.outputText;
        }
        
        return responseData;
      }
    } else {
      throw new Error(`Unsupported model type: ${modelType}`);
    }
  } catch (error) {
    console.error("Detailed error:", error);
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    if (error.$metadata) {
      console.error("AWS metadata:", error.$metadata);
    }
    throw error;
  }
}

// Export for use in other modules
export { invokeBedrockStream, invokeBedrock };