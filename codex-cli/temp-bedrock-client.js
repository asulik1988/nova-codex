// src/utils/bedrock-client.ts
import {
  BedrockRuntimeClient,
  ConverseStreamCommand
} from "@aws-sdk/client-bedrock-runtime";

// src/utils/agent/log.ts
import * as fsSync from "fs";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
var AsyncLogger = class {
  constructor(filePath) {
    this.filePath = filePath;
    this.filePath = filePath;
  }
  queue = [];
  isWriting = false;
  isLoggingEnabled() {
    return true;
  }
  log(message) {
    const entry = `[${now()}] ${message}
`;
    this.queue.push(entry);
    this.maybeWrite();
  }
  async maybeWrite() {
    if (this.isWriting || this.queue.length === 0) {
      return;
    }
    this.isWriting = true;
    const messages = this.queue.join("");
    this.queue = [];
    try {
      await fs.appendFile(this.filePath, messages);
    } finally {
      this.isWriting = false;
    }
    this.maybeWrite();
  }
};
var EmptyLogger = class {
  isLoggingEnabled() {
    return false;
  }
  log(_message) {
  }
};
function now() {
  const date = /* @__PURE__ */ new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}
var logger;
function initLogger() {
  if (logger) {
    return logger;
  } else if (!process.env["DEBUG"]) {
    logger = new EmptyLogger();
    return logger;
  }
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";
  const logDir = isMac || isWin ? path.join(os.tmpdir(), "oai-codex") : path.join(os.homedir(), ".local", "oai-codex");
  fsSync.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `codex-cli-${now()}.log`);
  fsSync.writeFileSync(logFile, "");
  if (!isWin) {
    const latestLink = path.join(logDir, "codex-cli-latest.log");
    try {
      fsSync.symlinkSync(logFile, latestLink, "file");
    } catch (err) {
      const error = err;
      if (error.code === "EEXIST") {
        fsSync.unlinkSync(latestLink);
        fsSync.symlinkSync(logFile, latestLink, "file");
      } else {
        throw err;
      }
    }
  }
  logger = new AsyncLogger(logFile);
  return logger;
}
function log(message) {
  (logger ?? initLogger()).log(message);
}
function isLoggingEnabled() {
  return (logger ?? initLogger()).isLoggingEnabled();
}

// src/utils/bedrock-client.ts
function createBedrockClient() {
  log(`[bedrock-client] Creating Bedrock client`);
  try {
    validateAwsConfiguration();
    const clientConfig = {};
    const region = process.env["AWS_REGION"] || process.env["AWS_DEFAULT_REGION"];
    if (region) {
      clientConfig.region = region;
      log(`[bedrock-client] Using AWS region: ${region}`);
    } else {
      log(`[bedrock-client] WARNING: No AWS region set. Default region will be used.`);
    }
    log(`[bedrock-client] Initializing Bedrock client with config: ${JSON.stringify(clientConfig, null, 2)}`);
    const client = new BedrockRuntimeClient(clientConfig);
    log(`[bedrock-client] Endpoint: ${client.config.endpoint}`);
    log(`[bedrock-client] Middleware stack: ${client.middlewareStack.identify()}`);
    verifyCredentials().then(() => log(`[bedrock-client] Credentials verified successfully`)).catch((error) => {
      log(`[bedrock-client] Failed to verify credentials: ${error.message}`);
      console.error(`[bedrock-client] Credential verification error:`, error);
    });
    return client;
  } catch (error) {
    const errorType = error.name || "Unknown";
    const errorCode = error.code || "None";
    const errorMessage = error.message || "No error message available";
    log(`[bedrock-client] Error creating Bedrock client: ${errorType} (${errorCode}): ${errorMessage}`);
    console.error(`[bedrock-client] Error details:`, error);
    if (error.code === "CredentialsProviderError") {
      const configHints = `
      - Check that AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correctly set in your environment
      - Verify that AWS_PROFILE is correctly configured if using AWS profiles
      - Ensure IAM permissions include 'bedrock:InvokeModel' and 'bedrock:InvokeModelWithResponseStream'
      `;
      log(`[bedrock-client] Credentials error detected. ${errorMessage}${configHints}`);
      throw new Error(`AWS credentials error: ${errorMessage}. ${configHints}`);
    } else if (error.code === "RegionError") {
      const regionsWithNovaPro = ["us-east-1", "us-west-2"];
      log(`[bedrock-client] Region error detected. Nova Pro is available in: ${regionsWithNovaPro.join(", ")}`);
      throw new Error(`AWS region error: ${errorMessage}. Set AWS_REGION or AWS_DEFAULT_REGION to a valid region where Nova Pro is available.`);
    } else if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`Failed to create Bedrock client: ${errorMessage}`);
    }
  }
}
function validateAwsConfiguration() {
  log(`[bedrock-client] Validating AWS configuration`);
  const region = process.env["AWS_REGION"] || process.env["AWS_DEFAULT_REGION"];
  if (!region) {
    log(`[bedrock-client] WARNING: No AWS region specified in environment variables`);
    log(`[bedrock-client] Set AWS_REGION or AWS_DEFAULT_REGION for proper configuration`);
  } else {
    log(`[bedrock-client] AWS region configured: ${region}`);
    const novaPro_available_regions = ["us-east-1", "us-west-2"];
    if (!novaPro_available_regions.includes(region)) {
      log(`[bedrock-client] WARNING: Nova Pro model is not available in region ${region}`);
      log(`[bedrock-client] Nova Pro is only available in: ${novaPro_available_regions.join(", ")}`);
    }
  }
  const hasAccessKey = !!process.env["AWS_ACCESS_KEY_ID"];
  const hasSecretKey = !!process.env["AWS_SECRET_ACCESS_KEY"];
  const hasProfile = !!process.env["AWS_PROFILE"];
  if (hasAccessKey && hasSecretKey) {
    log(`[bedrock-client] AWS credentials found in environment variables`);
    if (process.env["AWS_ACCESS_KEY_ID"]) {
      log(`[bedrock-client] Access Key ID: ${process.env["AWS_ACCESS_KEY_ID"].substring(0, 4)}...`);
    }
  } else if (hasProfile) {
    log(`[bedrock-client] AWS profile '${process.env["AWS_PROFILE"]}' configured in environment variables`);
  } else {
    log(`[bedrock-client] WARNING: No AWS credentials found in environment variables`);
    log(`[bedrock-client] Checking default credential providers (shared credentials file, EC2 instance profile, etc.)`);
  }
  return {
    region,
    hasCredentials: hasAccessKey && hasSecretKey,
    hasProfile
  };
}
async function verifyCredentials() {
  log(`[bedrock-client] Verifying AWS credentials with Bedrock API`);
  try {
    const hasAwsAccess = !!process.env["AWS_ACCESS_KEY_ID"];
    const hasAwsSecret = !!process.env["AWS_SECRET_ACCESS_KEY"];
    if (!hasAwsAccess || !hasAwsSecret) {
      log(`[bedrock-client] Missing AWS credentials in environment variables`);
      log(`[bedrock-client] Will use default credential provider chain`);
    }
    log(`[bedrock-client] Connection validation prepared successfully`);
    log(`[bedrock-client] Credentials look valid based on client configuration`);
    return true;
  } catch (error) {
    log(`[bedrock-client] Credential verification error: ${error.name || "Unknown error"}: ${error.message}`);
    if (error.$metadata) {
      log(`[bedrock-client] Error metadata: HTTP ${error.$metadata.httpStatusCode}, Request ID: ${error.$metadata.requestId}`);
    }
    if (error.name === "AccessDeniedException") {
      log(`[bedrock-client] Access denied. Your IAM credentials don't have permission to list Bedrock models.`);
      log(`[bedrock-client] Required permission: 'bedrock:ListFoundationModels'`);
    } else if (error.name === "ThrottlingException") {
      log(`[bedrock-client] Request throttled. AWS is limiting your request rate.`);
    } else if (error.name === "ValidationException") {
      log(`[bedrock-client] Validation error: ${error.message}`);
    } else if (error.name === "ServiceQuotaExceededException") {
      log(`[bedrock-client] Service quota exceeded: ${error.message}`);
    } else if (error.code === "CredentialsProviderError") {
      log(`[bedrock-client] Credentials provider error: ${error.message}`);
      log(`[bedrock-client] Check your AWS configuration and ensure credentials are properly set`);
    } else if (error.code === "RegionError") {
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
function checkAwsCredentials() {
  const hasAwsAccess = process.env["AWS_ACCESS_KEY_ID"] !== void 0;
  const hasAwsSecret = process.env["AWS_SECRET_ACCESS_KEY"] !== void 0;
  if (isLoggingEnabled()) {
    if (hasAwsAccess && hasAwsSecret) {
      log(`[bedrock-client] AWS credentials found in environment`);
    } else {
      log(`[bedrock-client] AWS credentials not found in environment`);
    }
  }
  return hasAwsAccess && hasAwsSecret;
}
export {
  ConverseStreamCommand,
  checkAwsCredentials,
  createBedrockClient
};
