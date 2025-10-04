/**
 * QuitItToday API Handler
 * 記錄使用者停止使用社交媒體的點擊
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// 建立 DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:8100',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy'
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'qit-db-local';

/**
 * 記錄使用者點擊
 * @param {string} userId - 使用者 ID
 * @returns {Promise<Object>} 點擊記錄結果
 */
async function recordUserClick(userId) {
  const now = new Date();
  const createDateTime = now.toISOString();
  const date = createDateTime.split('T')[0];
  
  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        userId,
        createDateTime,
        clickCount: 1,
        dateKey: `DATE#${date}`,
        recordSort: `CLICK#${createDateTime}#${userId}`
      }
    }));

    const updateResult = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: 'STAT#TOTAL',
        createDateTime: 'METADATA'
      },
      UpdateExpression: 'ADD totalClicks :inc',
      ExpressionAttributeValues: {
        ':inc': 1
      },
      ReturnValues: 'ALL_NEW'
    }));

    return {
      success: true,
      userId,
      createDateTime,
      date,
      totalClicks: updateResult.Attributes.totalClicks
    };
  } catch (error) {
    console.error('記錄點擊失敗:', error);
    throw error;
  }
}

/**
 * Lambda Handler
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} - API Gateway Lambda Proxy Output Format
 */
export const lambdaHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const userId = body.userId || 'testUser123';
    
    const socialMediaType = body.socialMediaType;
    console.log('📱 socialMediaType:', socialMediaType);
    console.log('👤 userId:', userId);
    
    const result = await recordUserClick(userId);
    
    console.log('✅ 點擊記錄成功:', result);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        message: '成功記錄點擊',
        data: {
          userId: result.userId,
          createDateTime: result.createDateTime,
          totalClicks: result.totalClicks
        }
      })
    };
    
  } catch (error) {
    console.error('❌ 處理請求失敗:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
      },
      body: JSON.stringify({
        success: false,
        message: '記錄點擊失敗',
        error: error.message
      })
    };
  }
};

