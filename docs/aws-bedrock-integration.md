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

### 2. Get the Gateway URL

After deployment, get the Gateway URL endpoint. This will be in the format:

```
https://[api-id].execute-api.[region].amazonaws.com/prod/v1
```

You can find the API ID in the CloudFormation stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name BedrockAccessGateway \
  --query "Stacks[0].Outputs[?OutputKey=='ApiId'].OutputValue" \
  --output text
```

### 3. Set Environment Variable

Set the following environment variable with the full Gateway URL:

```bash
export BEDROCK_ACCESS_GATEWAY_URL="https://[api-id].execute-api.[region].amazonaws.com/prod/v1"
```

Also set your AWS credentials:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
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

### Gateway URL Not Set

If you see the message "BEDROCK_ACCESS_GATEWAY_URL environment variable is not set", the integration will fall back to using the direct Bedrock API. Make sure to set the `BEDROCK_ACCESS_GATEWAY_URL` environment variable with the full URL of your Gateway.

### Authentication Errors

If you encounter authentication errors, make sure your AWS credentials are correct and have the necessary permissions for Bedrock and the Access Gateway.

### API Errors

If you encounter API errors, check if:
1. Your AWS credentials have the right permissions
2. The model you're trying to use is available in your AWS region
3. Your AWS account has access to the requested model

## Advanced Configuration

### Direct Bedrock API Access

If you prefer to use the direct Bedrock API instead of the Access Gateway, simply don't set the `BEDROCK_ACCESS_GATEWAY_URL` environment variable.

### Custom URL Format

If your gateway has a different URL format, you can still use it by setting the full URL in the `BEDROCK_ACCESS_GATEWAY_URL` environment variable. 