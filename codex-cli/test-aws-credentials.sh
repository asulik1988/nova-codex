#!/bin/bash

# Load variables from the .env file
ENV_FILE="../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Load environment variables from .env
set -a  # automatically export all variables
source "$ENV_FILE"
set +a  # turn off auto-export

# Print the loaded credentials (but mask sensitive parts)
echo "AWS credentials loaded from .env file:"
echo "- AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:5}..."
echo "- AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:0:5}..."
echo "- AWS_REGION: ${AWS_REGION:-us-east-1}"
echo "- OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."

# Try to use the AWS CLI to verify credentials
echo ""
echo "Testing AWS credentials with AWS CLI..."
if command -v aws &> /dev/null; then
  aws sts get-caller-identity
else
  echo "AWS CLI not found. Skipping credential verification."
fi

# Print instructions for using the Bedrock model
echo ""
echo "To use these credentials with the CLI and Bedrock model, run:"
echo "source $ENV_FILE && node dist/cli.js -m amazon.nova-pro-v1:0 \"Your prompt here\"" 