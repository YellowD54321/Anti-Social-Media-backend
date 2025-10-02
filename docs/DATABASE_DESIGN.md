# DynamoDB 資料庫設計文件

## 資料表：qit-db-local

### 主鍵結構

- **Partition Key (PK):** `userId` (String)
- **Sort Key (SK):** `createDateTime` (String, ISO 8601 格式)

### Global Secondary Index (GSI)

- **Index Name:** `DateIndex`
- **Partition Key:** `dateKey` (String)
- **Sort Key:** `recordSort` (String)
- **Projection:** ALL

### 資料模式

#### 1. 使用者點擊記錄

用於儲存每個使用者的點擊記錄。

```json
{
  "userId": "user-123",
  "createDateTime": "2025-10-02T10:30:00.000Z",
  "clickCount": 1,
  "dateKey": "DATE#2025-10-02",
  "recordSort": "CLICK#2025-10-02T10:30:00.000Z#user-123"
}
```

**欄位說明：**

- `userId`: 使用者唯一識別碼
- `createDateTime`: 點擊時間（ISO 8601 格式）
- `clickCount`: 該次點擊數（預設為 1）
- `dateKey`: GSI 分區鍵，格式為 `DATE#{日期}`
- `recordSort`: GSI 排序鍵，格式為 `CLICK#{時間}#{使用者ID}`

#### 2. 每日統計記錄

儲存每天的統計資料。

```json
{
  "userId": "STAT#DAILY",
  "createDateTime": "2025-10-02",
  "totalClicks": 1500,
  "uniqueUsers": 250,
  "dateKey": "DATE#2025-10-02",
  "recordSort": "STAT#DAILY"
}
```

**欄位說明：**

- `userId`: 固定為 "STAT#DAILY"
- `createDateTime`: 日期（YYYY-MM-DD）
- `totalClicks`: 當天總點擊數
- `uniqueUsers`: 當天唯一使用者數
- `dateKey`: GSI 分區鍵
- `recordSort`: 固定為 "STAT#DAILY"

#### 3. 每月統計記錄

儲存每月的統計資料。

```json
{
  "userId": "STAT#MONTHLY",
  "createDateTime": "2025-10",
  "totalClicks": 45000,
  "uniqueUsers": 3200,
  "dateKey": "MONTH#2025-10",
  "recordSort": "STAT#MONTHLY"
}
```

**欄位說明：**

- `userId`: 固定為 "STAT#MONTHLY"
- `createDateTime`: 年月（YYYY-MM）
- `totalClicks`: 當月總點擊數
- `uniqueUsers`: 當月唯一使用者數
- `dateKey`: GSI 分區鍵
- `recordSort`: 固定為 "STAT#MONTHLY"

#### 4. 全域總點擊數記錄

儲存所有使用者的總點擊數。

```json
{
  "userId": "STAT#TOTAL",
  "createDateTime": "METADATA",
  "totalClicks": 123456,
  "dateKey": "STAT#TOTAL",
  "recordSort": "METADATA"
}
```

**欄位說明：**

- `userId`: 固定為 "STAT#TOTAL"
- `createDateTime`: 固定為 "METADATA"
- `totalClicks`: 所有使用者的總點擊數
- `dateKey`: 固定為 "STAT#TOTAL"
- `recordSort`: 固定為 "METADATA"

### 查詢模式

#### 1. 取得特定使用者的所有點擊記錄（使用主表）

```javascript
{
  TableName: 'qit-db-local',
  KeyConditionExpression: "userId = :userId",
  ExpressionAttributeValues: {
    ":userId": "user-123"
  }
}
```

#### 2. 取得特定使用者在某時間範圍的點擊記錄（使用主表）

```javascript
{
  TableName: 'qit-db-local',
  KeyConditionExpression: "userId = :userId AND createDateTime BETWEEN :start AND :end",
  ExpressionAttributeValues: {
    ":userId": "user-123",
    ":start": "2025-10-01T00:00:00.000Z",
    ":end": "2025-10-02T23:59:59.999Z"
  }
}
```

#### 3. 取得某天所有點擊記錄（使用 GSI）⚡ NEW

```javascript
{
  TableName: 'qit-db-local',
  IndexName: 'DateIndex',
  KeyConditionExpression: "dateKey = :date",
  ExpressionAttributeValues: {
    ":date": "DATE#2025-10-02"
  }
}
```

#### 4. 取得某天的統計資料（使用 GSI）⚡ NEW

```javascript
{
  TableName: 'qit-db-local',
  IndexName: 'DateIndex',
  KeyConditionExpression: "dateKey = :date AND recordSort = :stat",
  ExpressionAttributeValues: {
    ":date": "DATE#2025-10-02",
    ":stat": "STAT#DAILY"
  }
}
```

#### 5. 取得某月的統計資料（使用 GSI）⚡ NEW

```javascript
{
  TableName: 'qit-db-local',
  IndexName: 'DateIndex',
  KeyConditionExpression: "dateKey = :month AND recordSort = :stat",
  ExpressionAttributeValues: {
    ":month": "MONTH#2025-10",
    ":stat": "STAT#MONTHLY"
  }
}
```

#### 6. 取得總點擊數（使用主表）

```javascript
{
  TableName: 'qit-db-local',
  Key: {
    userId: "STAT#TOTAL",
    createDateTime: "METADATA"
  }
}
```

### 更新操作

#### 新增點擊記錄（含 GSI 欄位）

```javascript
const now = new Date();
const dateTime = now.toISOString(); // "2025-10-02T10:30:00.000Z"
const date = dateTime.split('T')[0]; // "2025-10-02"

// 1. 建立點擊記錄（含 GSI 欄位）
await docClient.send(
  new PutCommand({
    TableName: 'qit-db-local',
    Item: {
      userId: 'user-123',
      createDateTime: dateTime,
      clickCount: 1,
      dateKey: `DATE#${date}`,
      recordSort: `CLICK#${dateTime}#user-123`,
    },
  })
);

// 2. 使用 DynamoDB Streams + Lambda 自動更新統計
// （非同步處理，無需在此手動更新）
```

#### 使用 DynamoDB Streams 自動更新統計

建議設定 Lambda function 監聽 Stream，自動更新統計資料：

```javascript
export async function streamHandler(event) {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const click = record.dynamodb.NewImage;
      const date = click.createDateTime.S.split('T')[0];
      const month = date.substring(0, 7);
      const userId = click.userId.S;

      // 更新每日統計
      await updateDailyStat(date);

      // 更新每月統計
      await updateMonthlyStat(month);

      // 更新總點擊數
      await updateTotalClicks();
    }
  }
}
```

### GSI 設計說明

**DateIndex (dateKey, recordSort)**

- **用途：** 按日期查詢所有點擊和統計
- **dateKey 格式：**
  - `DATE#{日期}` - 例如：`DATE#2025-10-02`
  - `MONTH#{年月}` - 例如：`MONTH#2025-10`
  - `STAT#TOTAL` - 總統計
- **recordSort 格式：**
  - `CLICK#{時間}#{使用者ID}` - 點擊記錄
  - `STAT#DAILY` - 每日統計
  - `STAT#MONTHLY` - 每月統計
  - `METADATA` - 總統計

### 查詢效能對照

| 查詢需求         | 索引    | 效能        | RCU 消耗 |
| ---------------- | ------- | ----------- | -------- |
| 某使用者所有點擊 | 主表    | ⚡ 快       | 低       |
| 某使用者某天點擊 | 主表    | ⚡ 快       | 低       |
| **某天所有點擊** | **GSI** | **⚡ 快**   | **低**   |
| **某天統計**     | **GSI** | **⚡ 超快** | **極低** |
| **某月統計**     | **GSI** | **⚡ 超快** | **極低** |

### 注意事項

1. **GSI 欄位必須在寫入時設定**，無法後續自動生成
2. 使用 ISO 8601 格式儲存時間，便於排序和範圍查詢
3. 統計資料建議使用 DynamoDB Streams + Lambda 非同步更新
4. GSI 查詢是 eventually consistent，通常延遲小於 1 秒
5. 考慮定期清理舊資料或使用 TTL
