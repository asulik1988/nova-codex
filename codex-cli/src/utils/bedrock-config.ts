import fs from 'fs';
import path from 'path';
import { log, isLoggingEnabled } from "./agent/log.js";
import { fileURLToPath } from 'url';

export interface BedrockConfig {
  inference: {
    /**
     * Temperature controls the randomness of the model response (0-1)
     */
    temperature?: number;
    /**
     * Top-p controls the diversity of responses (0-1)
     */
    topP?: number;
    /**
     * Max tokens limits output length, but note each model has its own hard limits
     * For example, Nova Pro might limit this to 2048 regardless of what's set here
     */
    maxTokens?: number;
    /**
     * Top-k sampling parameter (only supported through additionalModelRequestFields)
     */
    topK?: number;
  };
  models: {
    default: string;
  };
}

export const DEFAULT_BEDROCK_CONFIG: BedrockConfig = {
  inference: {
    temperature: 1,
    topP: 1,
    maxTokens: 9999,
    topK: 1
  },
  models: {
    default: "amazon.nova-pro-v1:0"
  }
};

// Helper function to get config paths
export function getBedrockConfigPaths() {
  // Get current file's directory in ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Use repo-relative paths
  const repoConfigDir = path.resolve(path.join(__dirname, '../../config'));
  const repoConfigPath = path.join(repoConfigDir, 'bedrock-config.json');
  
  return {
    repoConfigDir,
    repoConfigPath
  };
}

/**
 * Loads the Bedrock configuration from config/bedrock-config.json in the repository
 * Creates a default config if one doesn't exist
 */
export function loadBedrockConfig(): BedrockConfig {
  const { repoConfigDir, repoConfigPath } = getBedrockConfigPaths();
  
  try {
    // First check if config exists in the repository
    if (fs.existsSync(repoConfigPath)) {
      const configData = fs.readFileSync(repoConfigPath, 'utf-8');
      const parsedConfig = JSON.parse(configData);
      
      console.log(`[bedrock-config] Loaded Bedrock config from ${repoConfigPath}: ${configData}`);
      if (isLoggingEnabled()) {
        log(`[bedrock-config] Loaded Bedrock config from ${repoConfigPath}: ${configData}`);
      }
      
      return { ...DEFAULT_BEDROCK_CONFIG, ...parsedConfig };
    }
    
    // Create default config if it doesn't exist
    if (!fs.existsSync(repoConfigDir)) {
      fs.mkdirSync(repoConfigDir, { recursive: true });
    }
    
    fs.writeFileSync(repoConfigPath, JSON.stringify(DEFAULT_BEDROCK_CONFIG, null, 2), 'utf-8');
    
    console.log(`[bedrock-config] Created default Bedrock config at ${repoConfigPath}`);
    if (isLoggingEnabled()) {
      log(`[bedrock-config] Created default Bedrock config at ${repoConfigPath}`);
    }
    
    return DEFAULT_BEDROCK_CONFIG;
  } catch (error) {
    console.error(`[bedrock-config] Error loading Bedrock config: ${error}`);
    if (isLoggingEnabled()) {
      log(`[bedrock-config] Error loading Bedrock config: ${error}`);
    }
    return DEFAULT_BEDROCK_CONFIG;
  }
}

/**
 * Saves the Bedrock configuration to config/bedrock-config.json in the repository
 */
export function saveBedrockConfig(config: Partial<BedrockConfig>): void {
  const { repoConfigDir, repoConfigPath } = getBedrockConfigPaths();
  
  try {
    // Ensure directory exists
    if (!fs.existsSync(repoConfigDir)) {
      fs.mkdirSync(repoConfigDir, { recursive: true });
    }
    
    // Load existing config if it exists
    let existingConfig = DEFAULT_BEDROCK_CONFIG;
    if (fs.existsSync(repoConfigPath)) {
      const configData = fs.readFileSync(repoConfigPath, 'utf-8');
      existingConfig = { ...DEFAULT_BEDROCK_CONFIG, ...JSON.parse(configData) };
    }
    
    // Merge and save the updated config
    const updatedConfig = {
      ...existingConfig,
      ...config,
      inference: {
        ...existingConfig.inference,
        ...(config.inference || {})
      },
      models: {
        ...existingConfig.models,
        ...(config.models || {})
      }
    };
    
    fs.writeFileSync(repoConfigPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
    
    if (isLoggingEnabled()) {
      log(`[bedrock-config] Saved Bedrock config to ${repoConfigPath}`);
    }
  } catch (error) {
    if (isLoggingEnabled()) {
      log(`[bedrock-config] Error saving Bedrock config: ${error}`);
    }
  }
} 