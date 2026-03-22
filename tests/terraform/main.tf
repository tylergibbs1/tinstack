terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3              = "http://localhost:4566"
    dynamodb        = "http://localhost:4566"
    sqs             = "http://localhost:4566"
    sns             = "http://localhost:4566"
    ssm             = "http://localhost:4566"
    secretsmanager  = "http://localhost:4566"
    iam             = "http://localhost:4566"
    sts             = "http://localhost:4566"
    kms             = "http://localhost:4566"
    kinesis         = "http://localhost:4566"
    cloudwatchlogs  = "http://localhost:4566"
    lambda          = "http://localhost:4566"
    eventbridge     = "http://localhost:4566"
    sfn             = "http://localhost:4566"
    cloudwatch      = "http://localhost:4566"
    apigatewayv2    = "http://localhost:4566"
    cognitoidp      = "http://localhost:4566"
  }
}

# ─── S3 ───
resource "aws_s3_bucket" "data" {
  bucket = "tf-data-bucket"
}

resource "aws_s3_object" "config" {
  bucket  = aws_s3_bucket.data.id
  key     = "config/settings.json"
  content = jsonencode({ env = "test" })
}

# ─── DynamoDB ───
resource "aws_dynamodb_table" "users" {
  name         = "tf-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "sk"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL"
  }

  tags = {
    Environment = "test"
  }
}

# ─── SQS ───
resource "aws_sqs_queue" "orders" {
  name                       = "tf-orders"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400

  tags = {
    Service = "orders"
  }
}

resource "aws_sqs_queue" "orders_dlq" {
  name = "tf-orders-dlq"
}

# ─── SNS ───
resource "aws_sns_topic" "alerts" {
  name = "tf-alerts"

  tags = {
    Team = "platform"
  }
}

resource "aws_sns_topic_subscription" "sqs_sub" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.orders.arn
}

# ─── SSM Parameters ───
resource "aws_ssm_parameter" "db_host" {
  name  = "/tf/app/db-host"
  type  = "String"
  value = "localhost"
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/tf/app/db-password"
  type  = "SecureString"
  value = "supersecret"
}

# ─── Secrets Manager ───
resource "aws_secretsmanager_secret" "api_key" {
  name = "tf/api-key"
}

resource "aws_secretsmanager_secret_version" "api_key" {
  secret_id     = aws_secretsmanager_secret.api_key.id
  secret_string = jsonencode({ key = "sk_test_123" })
}

# ─── KMS ───
resource "aws_kms_key" "main" {
  description = "Main encryption key"
}

resource "aws_kms_alias" "main" {
  name          = "alias/tf-main-key"
  target_key_id = aws_kms_key.main.key_id
}

# ─── IAM ───
resource "aws_iam_role" "lambda_role" {
  name = "tf-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "dynamodb_access" {
  name = "tf-dynamodb-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "dynamodb:*"
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamo" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.dynamodb_access.arn
}

# ─── Lambda ───
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda.zip"

  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify(event) });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "api" {
  function_name = "tf-api-handler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = data.archive_file.lambda_zip.output_path

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.users.name
      QUEUE_URL  = aws_sqs_queue.orders.url
    }
  }
}

# ─── CloudWatch Logs ───
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14
}

# ─── EventBridge ───
resource "aws_cloudwatch_event_rule" "order_created" {
  name = "tf-order-created"

  event_pattern = jsonencode({
    source      = ["ecommerce"]
    detail-type = ["OrderCreated"]
  })
}

resource "aws_cloudwatch_event_target" "order_queue" {
  rule = aws_cloudwatch_event_rule.order_created.name
  arn  = aws_sqs_queue.orders.arn

  target_id = "send-to-sqs"
}

# ─── Kinesis ───
resource "aws_kinesis_stream" "events" {
  name        = "tf-event-stream"
  shard_count = 1
}

# ─── Step Functions ───
resource "aws_iam_role" "sfn_role" {
  name = "tf-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })
}

resource "aws_sfn_state_machine" "order_flow" {
  name     = "tf-order-flow"
  role_arn = aws_iam_role.sfn_role.arn

  definition = jsonencode({
    StartAt = "Process"
    States = {
      Process = {
        Type   = "Pass"
        Result = { status = "processed" }
        Next   = "Done"
      }
      Done = {
        Type = "Succeed"
      }
    }
  })
}

# ─── API Gateway v2 ───
resource "aws_apigatewayv2_api" "http" {
  name          = "tf-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

# ─── Outputs ───
output "s3_bucket" {
  value = aws_s3_bucket.data.id
}

output "dynamodb_table" {
  value = aws_dynamodb_table.users.name
}

output "sqs_queue_url" {
  value = aws_sqs_queue.orders.url
}

output "lambda_arn" {
  value = aws_lambda_function.api.arn
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "state_machine_arn" {
  value = aws_sfn_state_machine.order_flow.arn
}
