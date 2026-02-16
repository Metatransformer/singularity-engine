#!/bin/bash
set -e

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Configuration (from env or defaults)
REGION="${AWS_REGION:-us-east-1}"
TABLE_NAME="${TABLE_NAME:-singularity-db}"
ROLE_NAME="${ROLE_NAME:-singularity-engine-role}"
CODE_RUNNER_FN="${CODE_RUNNER_FN:-singularity-code-runner}"
DEPLOYER_FN="${DEPLOYER_FN:-singularity-deployer}"
WATCHER_FN="${WATCHER_FN:-singularity-tweet-watcher}"
DRY_RUN=false

# Parse args
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --region=*) REGION="${arg#*=}" ;;
    --table=*) TABLE_NAME="${arg#*=}" ;;
    --help) echo "Usage: ./deploy-aws.sh [--dry-run] [--region=us-east-1] [--table=singularity-db]"; exit 0 ;;
  esac
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
  echo "❌ AWS CLI not configured. Run 'aws configure' first."
  exit 1
}

echo "🚀 Deploying Singularity Engine to AWS..."
echo "   Account: $ACCOUNT_ID"
echo "   Region: $REGION"
echo "   Table: $TABLE_NAME"
if $DRY_RUN; then echo "   ⚠️  DRY RUN — no changes will be made"; fi

run() {
  if $DRY_RUN; then
    echo "   [dry-run] $*"
  else
    "$@"
  fi
}

# 1. Create IAM role
echo ""
echo "🔐 Setting up IAM role..."

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

if ! $DRY_RUN; then
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --query 'Role.Arn' --output text \
    2>/dev/null) || ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
  echo "   Role: $ROLE_ARN"

  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

  POLICY='{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan"],
        "Resource": "arn:aws:dynamodb:'$REGION':'$ACCOUNT_ID':table/'$TABLE_NAME'"
      },
      {
        "Effect": "Allow",
        "Action": ["lambda:InvokeFunction"],
        "Resource": "arn:aws:lambda:'$REGION':'$ACCOUNT_ID':function:singularity-*"
      }
    ]
  }'

  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "singularity-engine-policy" \
    --policy-document "$POLICY"

  echo "   ✅ IAM configured"
  echo "   ⏳ Waiting for IAM propagation..."
  sleep 10
else
  echo "   [dry-run] Would create/update IAM role: $ROLE_NAME"
  ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
fi

# Helper: package and deploy a Lambda
deploy_lambda() {
  local FN_NAME=$1
  local ENTRY_FILE=$2
  local INCLUDE_SHARED=$3
  local PKG_JSON=$4
  local ENV_VARS=$5
  local TIMEOUT=$6
  local MEMORY=$7

  echo ""
  echo "📦 Deploying $FN_NAME..."

  TMPDIR=$(mktemp -d)
  cp "$ENTRY_FILE" "$TMPDIR/index.mjs"

  if [ -n "$PKG_JSON" ] && [ -f "$PKG_JSON" ]; then
    cp "$PKG_JSON" "$TMPDIR/package.json"
  fi

  if [ "$INCLUDE_SHARED" = "true" ]; then
    mkdir -p "$TMPDIR/shared"
    cp shared/*.mjs "$TMPDIR/shared/"
    # Fix import paths for flat Lambda structure
    sed -i '' 's|../../shared/|./shared/|g' "$TMPDIR/index.mjs" 2>/dev/null || \
    sed -i 's|../../shared/|./shared/|g' "$TMPDIR/index.mjs"
  fi

  if [ -f "$TMPDIR/package.json" ]; then
    cd "$TMPDIR" && npm install --production 2>/dev/null && cd - > /dev/null
  fi

  cd "$TMPDIR" && zip -r function.zip . > /dev/null && cd - > /dev/null

  if ! $DRY_RUN; then
    aws lambda create-function \
      --function-name "$FN_NAME" \
      --runtime nodejs20.x \
      --handler index.handler \
      --role "$ROLE_ARN" \
      --zip-file "fileb://$TMPDIR/function.zip" \
      --environment "Variables={$ENV_VARS}" \
      --timeout "$TIMEOUT" \
      --memory-size "$MEMORY" \
      --region "$REGION" \
      > /dev/null 2>&1 || {
        echo "   Updating existing function..."
        aws lambda update-function-code \
          --function-name "$FN_NAME" \
          --zip-file "fileb://$TMPDIR/function.zip" \
          --region "$REGION" > /dev/null
      }
  else
    echo "   [dry-run] Would deploy $FN_NAME ($(du -sh "$TMPDIR/function.zip" | cut -f1))"
  fi

  echo "   ✅ $FN_NAME deployed"
  rm -rf "$TMPDIR"
}

# 2. Deploy Code Runner
deploy_lambda "$CODE_RUNNER_FN" "aws/code-runner/run.mjs" "true" "aws/code-runner/package.json" \
  "TABLE_NAME=$TABLE_NAME" 120 512

# 3. Deploy Deployer (needs shared modules for x-api-client.mjs)
TMPDIR_DEPLOYER=$(mktemp -d)
cat > "$TMPDIR_DEPLOYER/package.json" << 'PKGJSON'
{"name":"singularity-deployer","version":"1.0.0","type":"module","dependencies":{"@aws-sdk/client-dynamodb":"^3.0.0","@aws-sdk/lib-dynamodb":"^3.0.0"}}
PKGJSON
deploy_lambda "$DEPLOYER_FN" "aws/deployer/index.mjs" "true" "$TMPDIR_DEPLOYER/package.json" \
  "TABLE_NAME=$TABLE_NAME,GITHUB_REPO=${GITHUB_REPO:-your-org/singularity-builds},GITHUB_TOKEN=${GITHUB_TOKEN:-},GITHUB_PAGES_URL=${GITHUB_PAGES_URL:-},REPLY_MODE=${REPLY_MODE:-openclaw},X_CONSUMER_KEY=${X_CONSUMER_KEY:-},X_CONSUMER_SECRET=${X_CONSUMER_SECRET:-},X_ACCESS_TOKEN=${X_ACCESS_TOKEN:-},X_ACCESS_TOKEN_SECRET=${X_ACCESS_TOKEN_SECRET:-}" 30 256
rm -rf "$TMPDIR_DEPLOYER"

# 4. Deploy Tweet Watcher
TMPDIR_WATCHER=$(mktemp -d)
cat > "$TMPDIR_WATCHER/package.json" << 'PKGJSON'
{"name":"singularity-watcher","version":"1.0.0","type":"module","dependencies":{"@aws-sdk/client-dynamodb":"^3.0.0","@aws-sdk/lib-dynamodb":"^3.0.0","@aws-sdk/client-lambda":"^3.0.0"}}
PKGJSON
deploy_lambda "$WATCHER_FN" "aws/tweet-watcher/index.mjs" "true" "$TMPDIR_WATCHER/package.json" \
  "TABLE_NAME=$TABLE_NAME,CODE_RUNNER_FUNCTION=$CODE_RUNNER_FN,DEPLOYER_FUNCTION=$DEPLOYER_FN,X_BEARER_TOKEN=${X_BEARER_TOKEN:-},WATCHED_TWEET_ID=${WATCHED_TWEET_ID:-},OWNER_USERNAME=${OWNER_USERNAME:-}" 300 256
rm -rf "$TMPDIR_WATCHER"

# 5. Deploy DB API
DB_API_FN="${DB_API_FN:-singularity-db-api}"
TMPDIR_DBAPI=$(mktemp -d)
cat > "$TMPDIR_DBAPI/package.json" << 'PKGJSON'
{"name":"singularity-db-api","version":"1.0.0","type":"module","dependencies":{"@aws-sdk/client-dynamodb":"^3.0.0","@aws-sdk/lib-dynamodb":"^3.0.0"}}
PKGJSON
deploy_lambda "$DB_API_FN" "aws/db-api/index.mjs" "false" "$TMPDIR_DBAPI/package.json" \
  "TABLE_NAME=$TABLE_NAME" 10 256
rm -rf "$TMPDIR_DBAPI"

# 6. Create EventBridge schedule
echo ""
echo "⏰ Setting up EventBridge schedule..."

if ! $DRY_RUN; then
  RULE_ARN=$(aws events put-rule \
    --name "singularity-tweet-poll" \
    --schedule-expression "rate(2 minutes)" \
    --region "$REGION" \
    --query 'RuleArn' --output text)

  WATCHER_ARN=$(aws lambda get-function --function-name "$WATCHER_FN" --query 'Configuration.FunctionArn' --output text --region "$REGION")

  aws events put-targets \
    --rule "singularity-tweet-poll" \
    --targets "Id=singularity-watcher,Arn=$WATCHER_ARN" \
    --region "$REGION" > /dev/null

  aws lambda add-permission \
    --function-name "$WATCHER_FN" \
    --statement-id "eventbridge-invoke" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "$RULE_ARN" \
    --region "$REGION" 2>/dev/null || true
else
  echo "   [dry-run] Would create EventBridge rule: singularity-tweet-poll (rate 2 min)"
fi

echo "   ✅ Tweet watcher runs every 2 minutes"

echo ""
echo "============================================"
echo "🎉 Singularity Engine deployed!"
echo "============================================"
echo ""
echo "Lambdas:"
echo "  - $WATCHER_FN (polls X every 2 min)"
echo "  - $CODE_RUNNER_FN (generates apps)"
echo "  - $DEPLOYER_FN (pushes to GitHub Pages)"
echo ""
echo "⚠️  Configure Lambda env vars (if not already set):"
echo "  aws lambda update-function-configuration --function-name $CODE_RUNNER_FN \\"
echo "    --environment 'Variables={TABLE_NAME=$TABLE_NAME,ANTHROPIC_API_KEY=\$ANTHROPIC_API_KEY,SINGULARITY_DB_URL=\$SINGULARITY_DB_URL}'"
echo ""
echo "  aws lambda update-function-configuration --function-name $DEPLOYER_FN \\"
echo "    --environment 'Variables={TABLE_NAME=$TABLE_NAME,GITHUB_REPO=\$GITHUB_REPO,GITHUB_TOKEN=\$GITHUB_TOKEN,GITHUB_PAGES_URL=\$GITHUB_PAGES_URL}'"
echo ""
echo "  aws lambda update-function-configuration --function-name $WATCHER_FN \\"
echo "    --environment 'Variables={TABLE_NAME=$TABLE_NAME,CODE_RUNNER_FUNCTION=$CODE_RUNNER_FN,DEPLOYER_FUNCTION=$DEPLOYER_FN,X_BEARER_TOKEN=\$X_BEARER_TOKEN,WATCHED_TWEET_ID=\$WATCHED_TWEET_ID,OWNER_USERNAME=\$OWNER_USERNAME}'"
