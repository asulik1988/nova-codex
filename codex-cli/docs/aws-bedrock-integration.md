# AWS Bedrock Integration with Codex CLI

This document explains how to use AWS Bedrock models (including Amazon Nova and Claude) with Codex CLI through the AWS Bedrock Access Gateway.

## What is AWS Bedrock Access Gateway?

[AWS Bedrock Access Gateway](https://aws.amazon.com/bedrock/access-gateway/) is a service that provides an OpenAI API-compatible interface for AWS Bedrock models. This allows applications built for the OpenAI API to use AWS Bedrock models without extensive code changes.

## Setup Instructions

### 1. Deploy the Bedrock Access Gateway

First, you need to deploy the Bedrock Access Gateway CloudFormation stack in your AWS account:

```bash
aws cloudformation deploy \
  --template-file https://amazon-bedrock-access-gateway.s3.amazonaws.com/latest/template.yaml \
  --stack-name BedrockAccessGateway \
  --capabilities CAPABILITY_IAM
```

### 2. Get the Gateway ID

After deployment, get the Gateway ID from the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name BedrockAccessGateway \
  --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" \
  --output text
```

### 3. Set Environment Variables

Set the following environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=us-east-1  # Or your preferred region
export AWS_BEDROCK_GATEWAY_ID=gateway_id_from_step_2
```

### 4. Configure Codex CLI

Run the Codex CLI configuration:

```bash
codex config
```

### 5. Select Provider and Model

In the Codex CLI interface:
1. Use the model selector (`Ctrl+P`)
2. Press tab to switch to provider selection
3. Select "bedrock" as your provider
4. Press tab again to select a model, like "amazon.nova-pro-v1:0" or "anthropic.claude-3-sonnet-20240229-v1:0"

## Available Models

The integration supports a range of AWS Bedrock models:

- **Claude Models**:
  - anthropic.claude-3-opus-20240229-v1:0
  - anthropic.claude-3-sonnet-20240229-v1:0
  - anthropic.claude-3-haiku-20240307-v1:0
  - anthropic.claude-instant-1.2:0

- **Amazon Nova Models**:
  - amazon.nova-pro-v1:0
  - amazon.nova-lite-v1:0
  - amazon.nova-micro-v1:0

- **Other Models**:
  - Cohere models (cohere.command-r-v1:0, etc.)
  - Meta models (meta.llama3-70b-instruct-v1:0, etc.)

## Troubleshooting

### No Gateway ID Set

If you see the message "AWS_BEDROCK_GATEWAY_ID environment variable is not set", the integration will fall back to using the direct Bedrock API. Set the `AWS_BEDROCK_GATEWAY_ID` environment variable to use the Access Gateway.

### Authentication Errors

If you encounter authentication errors, make sure your AWS credentials are correct and have the necessary permissions for Bedrock and the Access Gateway.

### API Errors

If you encounter API errors, check if:
1. Your AWS credentials have the right permissions
2. The model you're trying to use is available in your AWS region
3. Your AWS account has access to the requested model

## Advanced Configuration

### Direct Bedrock API Access

If you prefer to use the direct Bedrock API instead of the Access Gateway, simply don't set the `AWS_BEDROCK_GATEWAY_ID` environment variable.

### Custom Gateway URL

To use a custom Gateway URL, set the `AMAZON_BEDROCK_BASE_URL` environment variable to your custom endpoint. 