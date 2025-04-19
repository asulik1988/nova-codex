import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NOVA_PRO_MODEL_ID, streamBedrockResponse } from "../src/utils/bedrock-agent";
import * as bedrockClient from "../src/utils/bedrock-client";
import { Readable } from "stream";

// Mock the Bedrock client
vi.mock("../src/utils/bedrock-client", () => {
  const mockBedrockClient = {
    send: vi.fn(),
  };
  
  return {
    createBedrockClient: () => mockBedrockClient,
    ConversationRole: {
      SYSTEM: "system",
      USER: "user",
      ASSISTANT: "assistant",
    },
    ConverseStreamCommand: vi.fn(),
  };
});

describe("bedrock-agent", () => {
  let mockStream: Readable;
  let mockBedrockClient: { send: any };
  
  beforeEach(() => {
    // Create a new mock stream for each test
    mockStream = new Readable({ objectMode: true });
    mockStream._read = () => {}; // Required implementation
    
    // Get the mocked client
    mockBedrockClient = bedrockClient.createBedrockClient();
    
    // Reset the mock function
    mockBedrockClient.send.mockReset();
    
    // Set up the mock to return our stream
    mockBedrockClient.send.mockResolvedValue({
      stream: mockStream,
    });
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  it("should throw an error for unsupported models", async () => {
    await expect(streamBedrockResponse(
      {
        model: "unsupported-model",
        input: [],
      },
      () => {}
    )).rejects.toThrow("Unsupported model for Bedrock");
  });
  
  it("should create a response from text content", async () => {
    const onItem = vi.fn();
    
    // Start streaming response in the background
    const responsePromise = streamBedrockResponse(
      {
        model: NOVA_PRO_MODEL_ID,
        instructions: "You are a helpful assistant",
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello" }],
          },
        ],
      },
      onItem
    );
    
    // Send a chunk with text content
    const chunk = {
      chunk: {
        bytes: Buffer.from(JSON.stringify({
          delta: {
            content: "Hello! How can I help you today?",
          },
        })),
      },
    };
    
    mockStream.push(chunk);
    mockStream.push(null); // End the stream
    
    // Wait for the response to complete
    const { responseId } = await responsePromise;
    
    // Verify the client was called correctly
    expect(bedrockClient.ConverseStreamCommand).toHaveBeenCalledWith({
      modelId: NOVA_PRO_MODEL_ID,
      messages: [
        {
          role: "system",
          content: [{ text: "You are a helpful assistant" }],
        },
        {
          role: "user",
          content: [{ text: "Hello" }],
        },
      ],
    });
    
    // Verify the callback was called with the correct message
    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: responseId,
        type: "message",
        role: "assistant",
        content: expect.arrayContaining([
          expect.objectContaining({
            text: "Hello! How can I help you today?",
          }),
        ]),
      })
    );
  });
  
  it("should handle tool calls", async () => {
    const onItem = vi.fn();
    
    // Start streaming response in the background
    const responsePromise = streamBedrockResponse(
      {
        model: NOVA_PRO_MODEL_ID,
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Run ls" }],
          },
        ],
        tools: [
          {
            type: "function",
            name: "shell",
            description: "Run shell command",
            parameters: {
              type: "object",
              properties: {
                command: { type: "array", items: { type: "string" } },
              },
              required: ["command"],
            },
          },
        ],
      },
      onItem
    );
    
    // Send a chunk with tool use
    const toolUseChunk = {
      chunk: {
        bytes: Buffer.from(JSON.stringify({
          delta: {
            toolUse: {
              name: "shell",
              parameters: JSON.stringify({
                command: ["ls", "-la"],
              }),
            },
          },
        })),
      },
    };
    
    mockStream.push(toolUseChunk);
    mockStream.push(null); // End the stream
    
    // Wait for the response to complete
    await responsePromise;
    
    // Verify the callback was called with the function call
    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "function_call",
        name: "shell",
        arguments: expect.stringContaining("ls"),
      })
    );
  });
  
  it("should handle errors from the Bedrock client", async () => {
    // Mock the client to throw an error
    mockBedrockClient.send.mockRejectedValue(new Error("Network error"));
    
    // Attempt to stream a response
    await expect(streamBedrockResponse(
      {
        model: NOVA_PRO_MODEL_ID,
        input: [],
      },
      () => {}
    )).rejects.toThrow("Network error");
  });
}); 