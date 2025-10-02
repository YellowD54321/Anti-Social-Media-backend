/**
 * DynamoDB 操作範例
 * 展示如何記錄使用者點擊和更新總點擊數
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// 建立 DynamoDB client
const client = new DynamoDBClient({
  region: 'local',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8100',
  credentials: {
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy'
  }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'qit-db-local';

/**
 * 記錄使用者點擊（含 GSI 欄位）
 * @param {string} userId - 使用者 ID
 * @returns {Promise<Object>} 點擊記錄
 */
export async function recordUserClick(userId) {
  const now = new Date();
  const createDateTime = now.toISOString();
  const date = createDateTime.split('T')[0]; // 2025-10-02
  
  try {
    // 1. 建立點擊記錄（含 GSI 欄位）
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

    // 2. 更新總點擊數（使用 atomic counter）
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
 * 取得使用者的所有點擊記錄
 * @param {string} userId - 使用者 ID
 * @returns {Promise<Array>} 點擊記錄陣列
 */
export async function getUserClicks(userId) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false // 由新到舊排序
    }));

    return result.Items || [];
  } catch (error) {
    console.error('取得使用者點擊記錄失敗:', error);
    throw error;
  }
}

/**
 * 取得特定時間範圍內的使用者點擊記錄
 * @param {string} userId - 使用者 ID
 * @param {string} startDateTime - 開始時間 (ISO 8601)
 * @param {string} endDateTime - 結束時間 (ISO 8601)
 * @returns {Promise<Array>} 點擊記錄陣列
 */
export async function getUserClicksInRange(userId, startDateTime, endDateTime) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId AND createDateTime BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':start': startDateTime,
        ':end': endDateTime
      },
      ScanIndexForward: false
    }));

    return result.Items || [];
  } catch (error) {
    console.error('取得時間範圍內點擊記錄失敗:', error);
    throw error;
  }
}

/**
 * 取得總點擊數
 * @returns {Promise<number>} 總點擊數
 */
export async function getTotalClicks() {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: 'STAT#TOTAL',
        createDateTime: 'METADATA'
      }
    }));

    return result.Item?.totalClicks || 0;
  } catch (error) {
    console.error('取得總點擊數失敗:', error);
    throw error;
  }
}

/**
 * 取得某天所有點擊記錄（使用 GSI）
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Promise<Array>} 點擊記錄陣列
 */
export async function getClicksByDate(date) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'DateIndex',
      KeyConditionExpression: 'dateKey = :date',
      ExpressionAttributeValues: {
        ':date': `DATE#${date}`
      }
    }));

    return result.Items || [];
  } catch (error) {
    console.error('取得某天點擊記錄失敗:', error);
    throw error;
  }
}

/**
 * 建立或更新每日統計
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @param {number} clickCount - 點擊數增量
 * @param {string} userId - 使用者 ID (用於計算唯一使用者)
 * @returns {Promise<Object>} 更新後的統計
 */
export async function updateDailyStat(date, clickCount = 1, userId = null) {
  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: 'STAT#DAILY',
        createDateTime: date
      },
      UpdateExpression: 'ADD totalClicks :clicks SET dateKey = :dateKey, recordSort = :recordSort',
      ExpressionAttributeValues: {
        ':clicks': clickCount,
        ':dateKey': `DATE#${date}`,
        ':recordSort': 'STAT#DAILY'
      },
      ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
  } catch (error) {
    console.error('更新每日統計失敗:', error);
    throw error;
  }
}

/**
 * 取得某天的統計資料（使用 GSI）
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @returns {Promise<Object>} 統計資料
 */
export async function getDailyStat(date) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'DateIndex',
      KeyConditionExpression: 'dateKey = :date AND recordSort = :stat',
      ExpressionAttributeValues: {
        ':date': `DATE#${date}`,
        ':stat': 'STAT#DAILY'
      }
    }));

    return result.Items?.[0] || null;
  } catch (error) {
    console.error('取得每日統計失敗:', error);
    throw error;
  }
}

/**
 * 建立或更新每月統計
 * @param {string} month - 年月 (YYYY-MM)
 * @param {number} clickCount - 點擊數增量
 * @returns {Promise<Object>} 更新後的統計
 */
export async function updateMonthlyStat(month, clickCount = 1) {
  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: 'STAT#MONTHLY',
        createDateTime: month
      },
      UpdateExpression: 'ADD totalClicks :clicks SET dateKey = :dateKey, recordSort = :recordSort',
      ExpressionAttributeValues: {
        ':clicks': clickCount,
        ':dateKey': `MONTH#${month}`,
        ':recordSort': 'STAT#MONTHLY'
      },
      ReturnValues: 'ALL_NEW'
    }));

    return result.Attributes;
  } catch (error) {
    console.error('更新每月統計失敗:', error);
    throw error;
  }
}

/**
 * 取得某月的統計資料（使用 GSI）
 * @param {string} month - 年月 (YYYY-MM)
 * @returns {Promise<Object>} 統計資料
 */
export async function getMonthlyStat(month) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'DateIndex',
      KeyConditionExpression: 'dateKey = :month AND recordSort = :stat',
      ExpressionAttributeValues: {
        ':month': `MONTH#${month}`,
        ':stat': 'STAT#MONTHLY'
      }
    }));

    return result.Items?.[0] || null;
  } catch (error) {
    console.error('取得每月統計失敗:', error);
    throw error;
  }
}

// 範例使用
async function example() {
  try {
    // 記錄使用者點擊
    console.log('📝 記錄使用者點擊...');
    const click1 = await recordUserClick('user-001');
    console.log('✅ 點擊記錄成功:', click1);

    const click2 = await recordUserClick('user-002');
    console.log('✅ 點擊記錄成功:', click2);

    const click3 = await recordUserClick('user-001');
    console.log('✅ 點擊記錄成功:', click3);

    // 取得總點擊數
    console.log('\n📊 取得總點擊數...');
    const total = await getTotalClicks();
    console.log('✅ 總點擊數:', total);

    // 取得特定使用者的所有點擊記錄
    console.log('\n📋 取得 user-001 的所有點擊記錄...');
    const userClicks = await getUserClicks('user-001');
    console.log('✅ 找到', userClicks.length, '筆記錄');
    console.log(userClicks);

  } catch (error) {
    console.error('❌ 執行失敗:', error);
  }
}

// 如果直接執行此檔案
if (import.meta.url === `file://${process.argv[1]}`) {
  example();
}

