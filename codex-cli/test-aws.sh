#!/bin/bash

# Clear the terminal
clear

# Print a header
echo "====================================="
echo "AWS Bedrock Credentials Test Script"
echo "====================================="
echo ""

# Check for AWS credentials
echo "Checking AWS credentials..."
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  echo "AWS credentials are not properly set. Please enter your credentials:"
  
  # Prompt for credentials if not set
  read -p "AWS Access Key ID: " AWS_ACCESS_KEY_ID
  read -p "AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
  read -p "AWS Region (default: us-east-1): " AWS_REGION
  
  # Set default region if not provided
  AWS_REGION=${AWS_REGION:-us-east-1}
  
  # Export the variables
  export AWS_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY
  export AWS_REGION
  
  echo "Credentials have been set for this session."
else
  echo "AWS credentials are already set in the environment."
  echo "- AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:0:5}..."
  echo "- AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:0:5}..."
  echo "- AWS_REGION: ${AWS_REGION:-us-east-1}"
fi

# Also check for OpenAI API key
if [ -z "$OPENAI_API_KEY" ]; then
  echo ""
  echo "Warning: OPENAI_API_KEY is not set. Some CLI functions may not work."
  read -p "Enter your OpenAI API key (or press Enter to skip): " OPENAI_API_KEY
  if [ ! -z "$OPENAI_API_KEY" ]; then
    export OPENAI_API_KEY
    echo "OpenAI API key has been set for this session."
  fi
else
  echo "- OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."
fi

echo ""
echo "Environment is ready for testing."
echo ""

# Ask what to test
echo "What would you like to test?"
echo "1. Run the CLI with the 'nova.pro' model"
echo "2. Exit"
read -p "Enter your choice (1-2): " choice

case $choice in
  1)
    echo ""
    echo "Running CLI with Bedrock model..."
    echo ""
    # Note: Use the model ID for Amazon Bedrock Nova Pro
    ./dist/cli.js -m amazon.nova-pro-v1:0 "Tell me a short joke"
    ;;
  *)
    echo "Exiting test script."
    ;;
esac 