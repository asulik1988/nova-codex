// Test file for amazon-bedrock-responses.js
import { invokeBedrockStream, invokeBedrock } from './amazon-bedrock-responses.js';

// Define an async function to run the tests sequentially
async function runTests() {
  try {
    console.log("===== TESTING CLAUDE MODEL (STREAMING) =====");
    await invokeBedrockStream('claude', 'Explain that this response is from the streaming api. Please also answer the question: Who made you, what is your name?');
    
    console.log("\n\n===== TESTING NOVA MODEL (STREAMING) =====");
    // Test Nova
    await invokeBedrockStream('nova', 'Explain that this response is from the streaming api. Please also answer the question: Who made you, what is your name?');
    
    console.log("\n\n===== TESTING CLAUDE MODEL (NON-STREAMING) =====");
    const claudeResponse = await invokeBedrock('claude', 'Explain that this response is from the NON-streaming api. Please also answer the question: Who made you, what is your name?');
    console.log(claudeResponse);
    
    console.log("\n\n===== TESTING NOVA MODEL (NON-STREAMING) =====");
    const novaResponse = await invokeBedrock('nova', 'Explain that this response is from the NON-streaming api. Please also answer the question: Who made you, what is your name?');
    console.log(novaResponse);
    
    console.log("\nAll tests completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the tests
runTests(); 