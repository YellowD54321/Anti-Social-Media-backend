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

---

## 資料表：qit-user-local

### 主鍵結構

- **Partition Key (PK):** `userId` (String)
- **Sort Key (SK):** `createDateTime` (String, ISO 8601 格式)

### Global Secondary Indexes (GSI)

#### 1. GoogleIdIndex

- **Partition Key:** `googleId` (String)
- **Projection:** ALL
- **用途：** 透過 Google ID 快速查詢使用者

#### 2. AppleIdIndex

- **Partition Key:** `appleId` (String)
- **Projection:** ALL
- **用途：** 透過 Apple ID 快速查詢使用者

### 資料模式

#### 使用者資料

用於儲存使用者的基本資料和第三方登入資訊。

```json
{
  "userId": "user-123",
  "createDateTime": "2025-10-14T08:30:00.000Z",
  "provider": "google",
  "googleId": "google-123456789",
  "appleId": null,
  "email": "user@example.com",
  "displayName": "張三",
  "profilePicture": "https://example.com/photo.jpg"
}
```

**欄位說明：**

- `userId`: 使用者唯一識別碼（系統自動生成）
- `createDateTime`: 註冊時間（ISO 8601 格式）
- `provider`: 登入提供者（`google`、`apple` 等）
- `googleId`: Google 帳號唯一識別碼（若為 Google 登入）
- `appleId`: Apple 帳號唯一識別碼（若為 Apple 登入）
- `email`: 使用者電子郵件
- `displayName`: 使用者顯示名稱
- `profilePicture`: 使用者頭像網址

**注意事項：**

- `googleId` 和 `appleId` 至少其中一個必須有值
- 若使用者同時綁定多個登入方式，兩者都會有值
- 用於 GSI 查詢的欄位（`googleId`、`appleId`）必須在寫入時設定

### 查詢模式

#### 1. 透過 Google ID 查詢使用者（使用 GoogleIdIndex）

用於 Google 登入時檢查使用者是否已註冊。

```javascript
{
  TableName: 'qit-user-local',
  IndexName: 'GoogleIdIndex',
  KeyConditionExpression: "googleId = :googleId",
  ExpressionAttributeValues: {
    ":googleId": "google-123456789"
  }
}
```

#### 2. 透過 Apple ID 查詢使用者（使用 AppleIdIndex）

用於 Apple 登入時檢查使用者是否已註冊。

```javascript
{
  TableName: 'qit-user-local',
  IndexName: 'AppleIdIndex',
  KeyConditionExpression: "appleId = :appleId",
  ExpressionAttributeValues: {
    ":appleId": "apple-987654321"
  }
}
```

#### 3. 透過 userId 取得使用者資料（使用主表）

```javascript
{
  TableName: 'qit-user-local',
  KeyConditionExpression: "userId = :userId",
  ExpressionAttributeValues: {
    ":userId": "user-123"
  }
}
```

### 新增/更新操作

#### 新增使用者（Google 登入）

```javascript
const now = new Date();
const userId = `user-${Date.now()}`; // 或使用 UUID

await docClient.send(
  new PutCommand({
    TableName: 'qit-user-local',
    Item: {
      userId: userId,
      createDateTime: now.toISOString(),
      provider: 'google',
      googleId: 'google-123456789',
      appleId: null,
      email: 'user@example.com',
      displayName: '張三',
      profilePicture: 'https://example.com/photo.jpg',
    },
  })
);
```

#### 新增使用者（Apple 登入）

```javascript
const now = new Date();
const userId = `user-${Date.now()}`; // 或使用 UUID

await docClient.send(
  new PutCommand({
    TableName: 'qit-user-local',
    Item: {
      userId: userId,
      createDateTime: now.toISOString(),
      provider: 'apple',
      googleId: null,
      appleId: 'apple-987654321',
      email: 'user@example.com',
      displayName: '李四',
      profilePicture: null,
    },
  })
);
```

#### 綁定第二個登入方式

使用者已經用 Google 登入，現在想綁定 Apple 帳號：

```javascript
await docClient.send(
  new UpdateCommand({
    TableName: 'qit-user-local',
    Key: {
      userId: 'user-123',
      createDateTime: '2025-10-14T08:30:00.000Z',
    },
    UpdateExpression: 'SET appleId = :appleId',
    ExpressionAttributeValues: {
      ':appleId': 'apple-987654321',
    },
  })
);
```

### 登入/註冊流程

#### Google 登入流程

```javascript
async function loginWithGoogle(googleId, userData) {
  // 1. 查詢使用者是否已存在
  const result = await docClient.send(
    new QueryCommand({
      TableName: 'qit-user-local',
      IndexName: 'GoogleIdIndex',
      KeyConditionExpression: 'googleId = :googleId',
      ExpressionAttributeValues: {
        ':googleId': googleId,
      },
    })
  );

  // 2. 若已存在，返回使用者資料
  if (result.Items && result.Items.length > 0) {
    return { isNewUser: false, user: result.Items[0] };
  }

  // 3. 若不存在，建立新使用者
  const newUser = {
    userId: `user-${Date.now()}`,
    createDateTime: new Date().toISOString(),
    provider: 'google',
    googleId: googleId,
    appleId: null,
    email: userData.email,
    displayName: userData.name,
    profilePicture: userData.picture,
  };

  await docClient.send(
    new PutCommand({
      TableName: 'qit-user-local',
      Item: newUser,
    })
  );

  return { isNewUser: true, user: newUser };
}
```

#### Apple 登入流程

```javascript
async function loginWithApple(appleId, userData) {
  // 1. 查詢使用者是否已存在
  const result = await docClient.send(
    new QueryCommand({
      TableName: 'qit-user-local',
      IndexName: 'AppleIdIndex',
      KeyConditionExpression: 'appleId = :appleId',
      ExpressionAttributeValues: {
        ':appleId': appleId,
      },
    })
  );

  // 2. 若已存在，返回使用者資料
  if (result.Items && result.Items.length > 0) {
    return { isNewUser: false, user: result.Items[0] };
  }

  // 3. 若不存在，建立新使用者
  const newUser = {
    userId: `user-${Date.now()}`,
    createDateTime: new Date().toISOString(),
    provider: 'apple',
    googleId: null,
    appleId: appleId,
    email: userData.email,
    displayName: userData.name || '使用者',
    profilePicture: null,
  };

  await docClient.send(
    new PutCommand({
      TableName: 'qit-user-local',
      Item: newUser,
    })
  );

  return { isNewUser: true, user: newUser };
}
```

### 查詢效能對照

| 查詢需求               | 索引              | 效能      | RCU 消耗 |
| ---------------------- | ----------------- | --------- | -------- |
| 透過 userId 查詢       | 主表              | ⚡ 快     | 低       |
| **透過 googleId 查詢** | **GoogleIdIndex** | **⚡ 快** | **低**   |
| **透過 appleId 查詢**  | **AppleIdIndex**  | **⚡ 快** | **低**   |

### 注意事項

1. **GSI 欄位必須在寫入時設定**

   - `googleId` 和 `appleId` 必須在建立使用者時就設定好
   - 即使某個登入方式未使用，也要設為 `null`

2. **避免重複註冊**

   - 在建立新使用者前，務必先透過對應的 GSI 查詢
   - 防止同一個 Google ID 或 Apple ID 建立多個帳號

3. **處理帳號綁定**

   - 若要支援多種登入方式綁定同一帳號
   - 需要額外的邏輯處理綁定流程
   - 建議在 UI 提供帳號綁定功能

4. **資料一致性**

   - GSI 是 eventually consistent
   - 在高併發情況下，可能需要額外的防重複機制

5. **隱私與安全**
   - 不要儲存敏感資訊（如密碼、完整 token）
   - 考慮加密儲存 email 等個人資訊
   - 遵守 GDPR 等隱私法規
