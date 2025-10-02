#!/bin/bash

# Initialize DynamoDB Local Table
# Usage: ./scripts/init-dynamodb.sh

ENDPOINT_URL="http://localhost:8100"
TABLE_NAME="qit-db-local"

echo "🚀 Starting DynamoDB Local initialization..."

# Check if table already exists
TABLE_EXISTS=$(aws dynamodb list-tables --endpoint-url $ENDPOINT_URL --output text --query "TableNames[?@=='$TABLE_NAME']" 2>/dev/null)

if [ "$TABLE_EXISTS" == "$TABLE_NAME" ]; then
    echo "⚠️  Table $TABLE_NAME already exists, deleting..."
    aws dynamodb delete-table \
        --table-name $TABLE_NAME \
        --endpoint-url $ENDPOINT_URL \
        --output json > /dev/null
    
    echo "⏳ Waiting for table deletion..."
    sleep 2
fi

# Create table (with GSI)
echo "📝 Creating table $TABLE_NAME (with GSI: DateIndex)..."
aws dynamodb create-table \
    --table-name $TABLE_NAME \
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
    --table-name $TABLE_NAME \
    --item '{
        "userId": {"S": "STAT#TOTAL"},
        "createDateTime": {"S": "METADATA"},
        "totalClicks": {"N": "0"},
        "dateKey": {"S": "STAT#TOTAL"},
        "recordSort": {"S": "METADATA"}
    }' \
    --endpoint-url $ENDPOINT_URL \
    --output json > /dev/null

# Verify table
echo "✅ Verifying table..."
aws dynamodb describe-table \
    --table-name $TABLE_NAME \
    --endpoint-url $ENDPOINT_URL \
    --query "Table.[TableName,TableStatus,KeySchema]" \
    --output table

echo ""
echo "✨ DynamoDB Local initialization complete!"
echo "📊 Table name: $TABLE_NAME"
echo "🔗 Endpoint: $ENDPOINT_URL"
echo ""
echo "Use the following command to view table contents:"
echo "aws dynamodb scan --table-name $TABLE_NAME --endpoint-url $ENDPOINT_URL"

