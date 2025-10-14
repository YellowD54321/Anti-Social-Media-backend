#!/bin/bash

# Initialize DynamoDB Local Tables
# Usage: ./scripts/init-dynamodb.sh

ENDPOINT_URL="http://localhost:8100"
CLICK_TABLE_NAME="qit-db-local"
USER_TABLE_NAME="qit-user-local"

echo "🚀 Starting DynamoDB Local initialization..."

# ============================================
# 1. Create Click Table (qit-db-local)
# ============================================
echo ""
echo "📋 [1/2] Setting up Click Table..."

# Check if click table already exists
CLICK_TABLE_EXISTS=$(aws dynamodb list-tables --endpoint-url $ENDPOINT_URL --output text --query "TableNames[?@=='$CLICK_TABLE_NAME']" 2>/dev/null)

if [ "$CLICK_TABLE_EXISTS" == "$CLICK_TABLE_NAME" ]; then
    echo "⚠️  Table $CLICK_TABLE_NAME already exists, deleting..."
    aws dynamodb delete-table \
        --table-name $CLICK_TABLE_NAME \
        --endpoint-url $ENDPOINT_URL \
        --output json > /dev/null
    
    echo "⏳ Waiting for table deletion..."
    sleep 2
fi

# Create click table (with GSI)
echo "📝 Creating table $CLICK_TABLE_NAME (with GSI: DateIndex)..."
aws dynamodb create-table \
    --table-name $CLICK_TABLE_NAME \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=createDateTime,AttributeType=S \
        AttributeName=dateKey,AttributeType=S \
        AttributeName=recordSort,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=createDateTime,KeyType=RANGE \
    --global-secondary-indexes \
        "[{
            \"IndexName\": \"DateIndex\",
            \"KeySchema\": [
                {\"AttributeName\":\"dateKey\",\"KeyType\":\"HASH\"},
                {\"AttributeName\":\"recordSort\",\"KeyType\":\"RANGE\"}
            ],
            \"Projection\": {\"ProjectionType\":\"ALL\"}
        }]" \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url $ENDPOINT_URL \
    --output json > /dev/null

echo "⏳ Waiting for table creation..."
sleep 2

# Initialize total clicks record (with GSI fields)
echo "🔢 Initializing total clicks record..."
aws dynamodb put-item \
    --table-name $CLICK_TABLE_NAME \
    --item '{
        "userId": {"S": "STAT#TOTAL"},
        "createDateTime": {"S": "METADATA"},
        "totalClicks": {"N": "0"},
        "dateKey": {"S": "STAT#TOTAL"},
        "recordSort": {"S": "METADATA"}
    }' \
    --endpoint-url $ENDPOINT_URL \
    --output json > /dev/null

echo "✅ Click table created successfully!"

# ============================================
# 2. Create User Table (qit-user-local)
# ============================================
echo ""
echo "👤 [2/2] Setting up User Table..."

# Check if user table already exists
USER_TABLE_EXISTS=$(aws dynamodb list-tables --endpoint-url $ENDPOINT_URL --output text --query "TableNames[?@=='$USER_TABLE_NAME']" 2>/dev/null)

if [ "$USER_TABLE_EXISTS" == "$USER_TABLE_NAME" ]; then
    echo "⚠️  Table $USER_TABLE_NAME already exists, deleting..."
    aws dynamodb delete-table \
        --table-name $USER_TABLE_NAME \
        --endpoint-url $ENDPOINT_URL \
        --output json > /dev/null
    
    echo "⏳ Waiting for table deletion..."
    sleep 2
fi

# Create user table (with GSI for googleId and appleId)
echo "📝 Creating table $USER_TABLE_NAME (with GSI: GoogleIdIndex, AppleIdIndex)..."
aws dynamodb create-table \
    --table-name $USER_TABLE_NAME \
    --attribute-definitions \
        AttributeName=userId,AttributeType=S \
        AttributeName=createDateTime,AttributeType=S \
        AttributeName=googleId,AttributeType=S \
        AttributeName=appleId,AttributeType=S \
    --key-schema \
        AttributeName=userId,KeyType=HASH \
        AttributeName=createDateTime,KeyType=RANGE \
    --global-secondary-indexes \
        "[{
            \"IndexName\": \"GoogleIdIndex\",
            \"KeySchema\": [
                {\"AttributeName\":\"googleId\",\"KeyType\":\"HASH\"}
            ],
            \"Projection\": {\"ProjectionType\":\"ALL\"}
        },
        {
            \"IndexName\": \"AppleIdIndex\",
            \"KeySchema\": [
                {\"AttributeName\":\"appleId\",\"KeyType\":\"HASH\"}
            ],
            \"Projection\": {\"ProjectionType\":\"ALL\"}
        }]" \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url $ENDPOINT_URL \
    --output json > /dev/null

echo "⏳ Waiting for table creation..."
sleep 2

echo "✅ User table created successfully!"

# ============================================
# 3. Verify Tables
# ============================================
echo ""
echo "🔍 Verifying tables..."
echo ""
echo "--- Click Table ($CLICK_TABLE_NAME) ---"
aws dynamodb describe-table \
    --table-name $CLICK_TABLE_NAME \
    --endpoint-url $ENDPOINT_URL \
    --query "Table.[TableName,TableStatus,KeySchema,GlobalSecondaryIndexes[*].IndexName]" \
    --output table

echo ""
echo "--- User Table ($USER_TABLE_NAME) ---"
aws dynamodb describe-table \
    --table-name $USER_TABLE_NAME \
    --endpoint-url $ENDPOINT_URL \
    --query "Table.[TableName,TableStatus,KeySchema,GlobalSecondaryIndexes[*].IndexName]" \
    --output table

echo ""
echo "✨ DynamoDB Local initialization complete!"
echo ""
echo "📊 Tables created:"
echo "   1. $CLICK_TABLE_NAME (點擊記錄表)"
echo "   2. $USER_TABLE_NAME (使用者資料表)"
echo ""
echo "🔗 Endpoint: $ENDPOINT_URL"
echo ""
echo "📋 Useful commands:"
echo "   View click table: aws dynamodb scan --table-name $CLICK_TABLE_NAME --endpoint-url $ENDPOINT_URL"
echo "   View user table:  aws dynamodb scan --table-name $USER_TABLE_NAME --endpoint-url $ENDPOINT_URL"
echo ""

