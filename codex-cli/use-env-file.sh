#!/bin/bash

# Set the path to the .env file
ENV_FILE="../.env"

# Check if the .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

echo "Loading variables from .env file..."

# Load variables from .env file
set -a  # automatically export all variables
source "$ENV_FILE"
set +a  # turn off auto-export

# Verify the credentials are set
echo "AWS credentials have been loaded from .env file:"
echo "- AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:5}..."
echo "- AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:0:5}..."
echo "- AWS_REGION: ${AWS_REGION:-us-east-1}"
echo "- OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."

# Run the CLI with Bedrock model
echo ""
echo "Running the CLI with amazon.nova-pro-v1:0 model..."
echo ""

# Build the project if needed
if [ ! -f "dist/cli.js" ]; then
  echo "Building the project first..."
  npm run build
fi

# Run the CLI with the Bedrock model
node dist/cli.js -m amazon.nova-pro-v1:0 "Tell me a short joke about programming" 