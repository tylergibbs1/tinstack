import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface TableDefinition {
  tableName: string;
  tableArn: string;
  tableStatus: string;
  keySchema: KeySchemaElement[];
  attributeDefinitions: AttributeDefinition[];
  globalSecondaryIndexes?: GlobalSecondaryIndex[];
  localSecondaryIndexes?: LocalSecondaryIndex[];
  provisionedThroughput?: ProvisionedThroughput;
  billingMode?: string;
  creationDateTime: number;
  itemCount: number;
  tableSizeBytes: number;
  streamSpecification?: { StreamEnabled: boolean; StreamViewType?: string };
  ttlSpecification?: { AttributeName: string; Enabled: boolean };
  tags: Record<string, string>;
  pointInTimeRecovery?: { PointInTimeRecoveryStatus: string; EarliestRestorableDateTime?: number; LatestRestorableDateTime?: number };
}

export interface BackupDescription {
  backupArn: string;
  backupName: string;
  tableName: string;
  tableArn: string;
  backupStatus: string;
  backupCreationDateTime: number;
  keySchema: KeySchemaElement[];
  attributeDefinitions: AttributeDefinition[];
  provisionedThroughput?: ProvisionedThroughput;
  billingMode?: string;
}

export interface KeySchemaElement {
  AttributeName: string;
  KeyType: "HASH" | "RANGE";
}

export interface AttributeDefinition {
  AttributeName: string;
  AttributeType: "S" | "N" | "B";
}

export interface GlobalSecondaryIndex {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: { ProjectionType: string; NonKeyAttributes?: string[] };
  ProvisionedThroughput?: ProvisionedThroughput;
  IndexStatus?: string;
  IndexArn?: string;
  ItemCount?: number;
  IndexSizeBytes?: number;
}

export interface LocalSecondaryIndex {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: { ProjectionType: string; NonKeyAttributes?: string[] };
  IndexArn?: string;
  ItemCount?: number;
  IndexSizeBytes?: number;
}

export interface ProvisionedThroughput {
  ReadCapacityUnits: number;
  WriteCapacityUnits: number;
}

type DynamoValue = Record<string, any>;
type Item = Record<string, DynamoValue>;

export class DynamoDbService {
  private tables: StorageBackend<string, TableDefinition>;
  private items: StorageBackend<string, Map<string, Item>>;
  private backups: Map<string, BackupDescription> = new Map();

  constructor(
    private accountId: string,
  ) {
    this.tables = new InMemoryStorage();
    this.items = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createTable(request: any, region: string): TableDefinition {
    const key = this.regionKey(region, request.TableName);
    if (this.tables.has(key)) {
      throw new AwsError("ResourceInUseException", `Table already exists: ${request.TableName}`, 400);
    }

    const table: TableDefinition = {
      tableName: request.TableName,
      tableArn: buildArn("dynamodb", region, this.accountId, "table/", request.TableName),
      tableStatus: "ACTIVE",
      keySchema: request.KeySchema,
      attributeDefinitions: request.AttributeDefinitions,
      billingMode: request.BillingMode ?? "PROVISIONED",
      provisionedThroughput: request.ProvisionedThroughput ?? { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      creationDateTime: Date.now() / 1000,
      itemCount: 0,
      tableSizeBytes: 0,
      streamSpecification: request.StreamSpecification,
      tags: {},
    };

    if (request.Tags) {
      for (const t of request.Tags) table.tags[t.Key] = t.Value;
    }

    if (request.GlobalSecondaryIndexes) {
      table.globalSecondaryIndexes = request.GlobalSecondaryIndexes.map((gsi: any) => ({
        ...gsi,
        IndexStatus: "ACTIVE",
        IndexArn: `${table.tableArn}/index/${gsi.IndexName}`,
        ItemCount: 0,
        IndexSizeBytes: 0,
      }));
    }

    if (request.LocalSecondaryIndexes) {
      table.localSecondaryIndexes = request.LocalSecondaryIndexes.map((lsi: any) => ({
        ...lsi,
        IndexArn: `${table.tableArn}/index/${lsi.IndexName}`,
        ItemCount: 0,
        IndexSizeBytes: 0,
      }));
    }

    this.tables.set(key, table);
    this.items.set(key, new Map());
    return table;
  }

  deleteTable(tableName: string, region: string): TableDefinition {
    const key = this.regionKey(region, tableName);
    const table = this.tables.get(key);
    if (!table) throw new AwsError("ResourceNotFoundException", `Requested resource not found: Table: ${tableName} not found`, 400);
    this.tables.delete(key);
    this.items.delete(key);
    table.tableStatus = "DELETING";
    return table;
  }

  describeTable(tableName: string, region: string): TableDefinition {
    const key = this.regionKey(region, tableName);
    const table = this.tables.get(key);
    if (!table) throw new AwsError("ResourceNotFoundException", `Requested resource not found: Table: ${tableName} not found`, 400);
    const itemMap = this.items.get(key);
    table.itemCount = itemMap?.size ?? 0;
    return table;
  }

  listTables(region: string, exclusiveStartTableName?: string, limit?: number): { tableNames: string[]; lastEvaluatedTableName?: string } {
    const allTables = this.tables.values()
      .filter((t) => this.tables.has(this.regionKey(region, t.tableName)))
      .map((t) => t.tableName)
      .sort();

    let start = 0;
    if (exclusiveStartTableName) {
      start = allTables.indexOf(exclusiveStartTableName) + 1;
    }

    const pageSize = limit ?? 100;
    const page = allTables.slice(start, start + pageSize);
    return {
      tableNames: page,
      lastEvaluatedTableName: start + pageSize < allTables.length ? page[page.length - 1] : undefined,
    };
  }

  putItem(tableName: string, item: Item, region: string, conditionExpression?: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>): Item | undefined {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemKey = this.buildItemKey(table, item);
    const itemMap = this.items.get(key)!;

    const existing = itemMap.get(itemKey);
    if (conditionExpression) {
      this.evaluateCondition(conditionExpression, existing, expressionNames, expressionValues);
    }

    itemMap.set(itemKey, item);
    return existing;
  }

  getItem(tableName: string, keyObj: Item, region: string, projectionExpression?: string, expressionNames?: Record<string, string>): Item | undefined {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemKey = this.buildItemKey(table, keyObj);
    const item = this.items.get(key)?.get(itemKey);
    if (!item) return undefined;
    if (projectionExpression) return this.projectItem(item, projectionExpression, expressionNames);
    return item;
  }

  deleteItem(tableName: string, keyObj: Item, region: string, conditionExpression?: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>): Item | undefined {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemKey = this.buildItemKey(table, keyObj);
    const itemMap = this.items.get(key)!;
    const existing = itemMap.get(itemKey);

    if (conditionExpression) {
      this.evaluateCondition(conditionExpression, existing, expressionNames, expressionValues);
    }

    itemMap.delete(itemKey);
    return existing;
  }

  updateItem(tableName: string, keyObj: Item, region: string, updateExpression: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>, conditionExpression?: string, returnValues?: string): Item | undefined {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemKey = this.buildItemKey(table, keyObj);
    const itemMap = this.items.get(key)!;

    let item = itemMap.get(itemKey);
    const oldItem = item ? { ...item } : undefined;

    if (conditionExpression) {
      this.evaluateCondition(conditionExpression, item, expressionNames, expressionValues);
    }

    if (!item) {
      item = { ...keyObj };
    }

    this.applyUpdateExpression(item, updateExpression, expressionNames, expressionValues);
    itemMap.set(itemKey, item);

    switch (returnValues) {
      case "ALL_OLD": return oldItem;
      case "ALL_NEW": return item;
      case "UPDATED_OLD": {
        if (!oldItem) return undefined;
        const modified: Item = {};
        for (const attr of Object.keys(item)) {
          if (attr in oldItem && JSON.stringify(oldItem[attr]) !== JSON.stringify(item[attr])) {
            modified[attr] = oldItem[attr];
          }
        }
        return modified;
      }
      case "UPDATED_NEW": {
        if (!oldItem) return { ...item };
        const modified: Item = {};
        for (const attr of Object.keys(item)) {
          if (!(attr in oldItem) || JSON.stringify(oldItem[attr]) !== JSON.stringify(item[attr])) {
            modified[attr] = item[attr];
          }
        }
        return modified;
      }
      default: return undefined;
    }
  }

  query(tableName: string, region: string, params: any): { items: Item[]; count: number; scannedCount: number; lastEvaluatedKey?: Item } {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemMap = this.items.get(key)!;
    let allItems = [...itemMap.values()];

    const indexName = params.IndexName;
    let keySchema = table.keySchema;

    if (indexName) {
      const gsi = table.globalSecondaryIndexes?.find((g) => g.IndexName === indexName);
      const lsi = table.localSecondaryIndexes?.find((l) => l.IndexName === indexName);
      if (!gsi && !lsi) throw new AwsError("ResourceNotFoundException", `Requested resource not found`, 400);
      keySchema = (gsi ?? lsi)!.KeySchema;
    }

    const hashKeyName = keySchema.find((k) => k.KeyType === "HASH")!.AttributeName;
    const rangeKeyName = keySchema.find((k) => k.KeyType === "RANGE")?.AttributeName;

    if (params.KeyConditionExpression) {
      allItems = this.applyKeyCondition(allItems, params.KeyConditionExpression, params.ExpressionAttributeNames, params.ExpressionAttributeValues, hashKeyName, rangeKeyName);
    }

    // Sort by range key (ascending by default, descending if ScanIndexForward is false)
    if (rangeKeyName) {
      allItems.sort((a, b) => this.compareDynamoValues(a[rangeKeyName], b[rangeKeyName]));
      if (params.ScanIndexForward === false) {
        allItems.reverse();
      }
    }

    // Skip items up to and including the ExclusiveStartKey
    if (params.ExclusiveStartKey) {
      const startIdx = allItems.findIndex((item) => {
        return keySchema.every((ks) => {
          const itemVal = this.extractScalarValue(item[ks.AttributeName]);
          const startVal = this.extractScalarValue(params.ExclusiveStartKey[ks.AttributeName]);
          return itemVal === startVal;
        });
      });
      if (startIdx >= 0) {
        allItems = allItems.slice(startIdx + 1);
      }
    }

    // Apply Limit before FilterExpression (AWS behavior: Limit controls items evaluated)
    let scannedCount: number;
    let lastEvaluatedKey: Item | undefined;
    if (params.Limit && allItems.length > params.Limit) {
      allItems = allItems.slice(0, params.Limit);
      const lastItem = allItems[allItems.length - 1];
      lastEvaluatedKey = {};
      for (const ks of keySchema) {
        lastEvaluatedKey[ks.AttributeName] = lastItem[ks.AttributeName];
      }
    }
    scannedCount = allItems.length;

    if (params.FilterExpression) {
      allItems = allItems.filter((item) => this.evaluateFilterExpression(item, params.FilterExpression, params.ExpressionAttributeNames, params.ExpressionAttributeValues));
    }

    if (params.ProjectionExpression) {
      allItems = allItems.map((item) => this.projectItem(item, params.ProjectionExpression, params.ExpressionAttributeNames));
    }

    return { items: allItems, count: allItems.length, scannedCount, lastEvaluatedKey };
  }

  scan(tableName: string, region: string, params: any): { items: Item[]; count: number; scannedCount: number; lastEvaluatedKey?: Item } {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemMap = this.items.get(key)!;
    let allItems = [...itemMap.values()];

    // Skip items up to and including the ExclusiveStartKey
    if (params.ExclusiveStartKey) {
      const startIdx = allItems.findIndex((item) => {
        return table.keySchema.every((ks) => {
          const itemVal = this.extractScalarValue(item[ks.AttributeName]);
          const startVal = this.extractScalarValue(params.ExclusiveStartKey[ks.AttributeName]);
          return itemVal === startVal;
        });
      });
      if (startIdx >= 0) {
        allItems = allItems.slice(startIdx + 1);
      }
    }

    // Apply Limit before FilterExpression (AWS behavior: Limit controls items evaluated)
    let lastEvaluatedKey: Item | undefined;
    if (params.Limit && allItems.length > params.Limit) {
      allItems = allItems.slice(0, params.Limit);
      const lastItem = allItems[allItems.length - 1];
      lastEvaluatedKey = {};
      for (const ks of table.keySchema) {
        lastEvaluatedKey[ks.AttributeName] = lastItem[ks.AttributeName];
      }
    }
    const scannedCount = allItems.length;

    if (params.FilterExpression) {
      allItems = allItems.filter((item) => this.evaluateFilterExpression(item, params.FilterExpression, params.ExpressionAttributeNames, params.ExpressionAttributeValues));
    }

    if (params.ProjectionExpression) {
      allItems = allItems.map((item) => this.projectItem(item, params.ProjectionExpression, params.ExpressionAttributeNames));
    }

    return { items: allItems, count: allItems.length, scannedCount, lastEvaluatedKey };
  }

  batchWriteItem(requestItems: Record<string, any[]>, region: string): Record<string, any[]> {
    let totalOps = 0;
    for (const requests of Object.values(requestItems)) {
      totalOps += requests.length;
    }
    if (totalOps > 25) {
      throw new AwsError("ValidationException", "Too many items requested for the BatchWriteItem call", 400);
    }

    const unprocessed: Record<string, any[]> = {};
    for (const [tableName, requests] of Object.entries(requestItems)) {
      for (const request of requests) {
        if (request.PutRequest) {
          this.putItem(tableName, request.PutRequest.Item, region);
        } else if (request.DeleteRequest) {
          this.deleteItem(tableName, request.DeleteRequest.Key, region);
        }
      }
    }
    return unprocessed;
  }

  batchGetItem(requestItems: Record<string, any>, region: string): { responses: Record<string, Item[]>; unprocessedKeys: Record<string, any> } {
    let totalKeys = 0;
    for (const request of Object.values(requestItems)) {
      totalKeys += (request as any).Keys.length;
    }
    if (totalKeys > 100) {
      throw new AwsError("ValidationException", "Too many items requested for the BatchGetItem call", 400);
    }

    const responses: Record<string, Item[]> = {};
    for (const [tableName, request] of Object.entries(requestItems)) {
      responses[tableName] = [];
      for (const keyObj of (request as any).Keys) {
        const item = this.getItem(tableName, keyObj, region);
        if (item) responses[tableName].push(item);
      }
    }
    return { responses, unprocessedKeys: {} };
  }

  transactWriteItems(transactItems: any[], region: string): void {
    // Pre-check all conditions first
    for (const item of transactItems) {
      if (item.ConditionCheck) {
        const existing = this.getItem(item.ConditionCheck.TableName, item.ConditionCheck.Key, region);
        this.evaluateCondition(
          item.ConditionCheck.ConditionExpression,
          existing,
          item.ConditionCheck.ExpressionAttributeNames,
          item.ConditionCheck.ExpressionAttributeValues,
        );
      }
    }

    // Execute all writes
    for (const item of transactItems) {
      if (item.Put) {
        this.putItem(item.Put.TableName, item.Put.Item, region, item.Put.ConditionExpression, item.Put.ExpressionAttributeNames, item.Put.ExpressionAttributeValues);
      } else if (item.Delete) {
        this.deleteItem(item.Delete.TableName, item.Delete.Key, region, item.Delete.ConditionExpression, item.Delete.ExpressionAttributeNames, item.Delete.ExpressionAttributeValues);
      } else if (item.Update) {
        this.updateItem(item.Update.TableName, item.Update.Key, region, item.Update.UpdateExpression, item.Update.ExpressionAttributeNames, item.Update.ExpressionAttributeValues, item.Update.ConditionExpression);
      }
    }
  }

  transactGetItems(transactItems: any[], region: string): (Item | undefined)[] {
    return transactItems.map((item) => {
      if (item.Get) {
        return this.getItem(item.Get.TableName, item.Get.Key, region, item.Get.ProjectionExpression, item.Get.ExpressionAttributeNames);
      }
      return undefined;
    });
  }

  updateTable(request: any, region: string): TableDefinition {
    const key = this.regionKey(region, request.TableName);
    const table = this.getTable(key);

    if (request.BillingMode) {
      table.billingMode = request.BillingMode;
    }

    if (request.ProvisionedThroughput) {
      table.provisionedThroughput = request.ProvisionedThroughput;
    }

    if (request.StreamSpecification) {
      table.streamSpecification = request.StreamSpecification;
    }

    if (request.AttributeDefinitions) {
      table.attributeDefinitions = request.AttributeDefinitions;
    }

    if (request.GlobalSecondaryIndexUpdates) {
      for (const update of request.GlobalSecondaryIndexUpdates) {
        if (update.Create) {
          const gsi: GlobalSecondaryIndex = {
            ...update.Create,
            IndexStatus: "ACTIVE",
            IndexArn: `${table.tableArn}/index/${update.Create.IndexName}`,
            ItemCount: 0,
            IndexSizeBytes: 0,
          };
          if (!table.globalSecondaryIndexes) table.globalSecondaryIndexes = [];
          const existing = table.globalSecondaryIndexes.find((g) => g.IndexName === update.Create.IndexName);
          if (existing) throw new AwsError("ValidationException", `One or more parameter values were invalid: Table already has a GSI with name ${update.Create.IndexName}`, 400);
          table.globalSecondaryIndexes.push(gsi);
        }
        if (update.Delete) {
          if (!table.globalSecondaryIndexes) throw new AwsError("ValidationException", `Requested GSI ${update.Delete.IndexName} does not exist`, 400);
          const idx = table.globalSecondaryIndexes.findIndex((g) => g.IndexName === update.Delete.IndexName);
          if (idx === -1) throw new AwsError("ValidationException", `Requested GSI ${update.Delete.IndexName} does not exist`, 400);
          table.globalSecondaryIndexes.splice(idx, 1);
          if (table.globalSecondaryIndexes.length === 0) table.globalSecondaryIndexes = undefined;
        }
        if (update.Update) {
          if (!table.globalSecondaryIndexes) throw new AwsError("ValidationException", `Requested GSI ${update.Update.IndexName} does not exist`, 400);
          const gsi = table.globalSecondaryIndexes.find((g) => g.IndexName === update.Update.IndexName);
          if (!gsi) throw new AwsError("ValidationException", `Requested GSI ${update.Update.IndexName} does not exist`, 400);
          if (update.Update.ProvisionedThroughput) {
            gsi.ProvisionedThroughput = update.Update.ProvisionedThroughput;
          }
        }
      }
    }

    return table;
  }

  describeEndpoints(): { Endpoints: { Address: string; CachePeriodInMinutes: number }[] } {
    return {
      Endpoints: [
        { Address: "localhost:4566", CachePeriodInMinutes: 1440 },
      ],
    };
  }

  describeTimeToLive(tableName: string, region: string): { AttributeName?: string; TimeToLiveStatus: string } {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    if (table.ttlSpecification?.Enabled) {
      return { AttributeName: table.ttlSpecification.AttributeName, TimeToLiveStatus: "ENABLED" };
    }
    return { TimeToLiveStatus: "DISABLED" };
  }

  updateTimeToLive(tableName: string, spec: { AttributeName: string; Enabled: boolean }, region: string): void {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    table.ttlSpecification = spec;
  }

  listTagsOfResource(resourceArn: string, region: string): { Key: string; Value: string }[] {
    const table = this.findTableByArn(resourceArn, region);
    return Object.entries(table.tags).map(([Key, Value]) => ({ Key, Value }));
  }

  tagResource(resourceArn: string, tags: { Key: string; Value: string }[], region: string): void {
    const table = this.findTableByArn(resourceArn, region);
    for (const t of tags) table.tags[t.Key] = t.Value;
  }

  untagResource(resourceArn: string, tagKeys: string[], region: string): void {
    const table = this.findTableByArn(resourceArn, region);
    for (const key of tagKeys) delete table.tags[key];
  }

  private findTableByArn(resourceArn: string, region: string): TableDefinition {
    for (const table of this.tables.values()) {
      if (table.tableArn === resourceArn) return table;
    }
    throw new AwsError("ResourceNotFoundException", `Requested resource not found`, 400);
  }

  // --- PartiQL ---

  executeStatement(statement: string, parameters: any[] | undefined, region: string): Item[] {
    const trimmed = statement.trim();
    const upperStatement = trimmed.toUpperCase();

    if (upperStatement.startsWith("SELECT")) {
      return this.executePartiqlSelect(trimmed, parameters, region);
    }
    if (upperStatement.startsWith("INSERT")) {
      this.executePartiqlInsert(trimmed, parameters, region);
      return [];
    }
    if (upperStatement.startsWith("UPDATE")) {
      this.executePartiqlUpdate(trimmed, parameters, region);
      return [];
    }
    if (upperStatement.startsWith("DELETE")) {
      this.executePartiqlDelete(trimmed, parameters, region);
      return [];
    }

    throw new AwsError("ValidationException", `Statement is not supported: ${statement}`, 400);
  }

  private parseTableName(statement: string): string {
    // Match FROM "TableName" or FROM TableName or INTO "TableName"
    const match = statement.match(/(?:FROM|INTO|UPDATE)\s+"?([^"\s]+)"?/i);
    if (!match) throw new AwsError("ValidationException", "Could not parse table name from statement", 400);
    return match[1];
  }

  private executePartiqlSelect(statement: string, parameters: any[] | undefined, region: string): Item[] {
    const tableName = this.parseTableName(statement);
    const key = this.regionKey(region, tableName);
    this.getTable(key); // ensure table exists
    const itemMap = this.items.get(key)!;
    let allItems = [...itemMap.values()];

    // Parse WHERE clause for simple equality: WHERE pk = ?  or WHERE pk = 'value'
    const whereMatch = statement.match(/WHERE\s+(.+)$/i);
    if (whereMatch && parameters && parameters.length > 0) {
      const conditions = whereMatch[1].split(/\s+AND\s+/i);
      let paramIdx = 0;
      for (const condition of conditions) {
        const eqMatch = condition.trim().match(/^"?([^"=\s]+)"?\s*=\s*\?$/);
        if (eqMatch && paramIdx < parameters.length) {
          const attrName = eqMatch[1];
          const paramValue = parameters[paramIdx];
          allItems = allItems.filter((item) => {
            const itemVal = item[attrName];
            if (!itemVal) return false;
            return JSON.stringify(itemVal) === JSON.stringify(paramValue);
          });
          paramIdx++;
        }
      }
    }

    return allItems;
  }

  private executePartiqlInsert(statement: string, parameters: any[] | undefined, region: string): void {
    const tableName = this.parseTableName(statement);
    // Parse value from: INSERT INTO "Table" value {'pk': 'val', ...}
    const valueMatch = statement.match(/value\s*(\{[\s\S]+\})\s*$/i);
    if (valueMatch) {
      // For PartiQL INSERT, parameters aren't typically used for the value block
      // The SDK sends the item in a structured format already
      // For our emulator we simply require parameters-based insert
    }
    if (parameters && parameters.length > 0) {
      // Treat first parameter as the item (SDK marshalled)
      const item = parameters[0]?.M ?? parameters[0];
      if (item && typeof item === "object") {
        this.putItem(tableName, item, region);
        return;
      }
    }
    // Fallback: do nothing for unsupported INSERT syntax
  }

  private executePartiqlUpdate(statement: string, parameters: any[] | undefined, region: string): void {
    const tableName = this.parseTableName(statement);
    // Basic update: UPDATE "Table" SET attr=? WHERE pk=?
    // For emulator, we do a scan + filter + update approach
    const key = this.regionKey(region, tableName);
    this.getTable(key);
    // Not fully implemented for complex PartiQL updates - this is a stub
  }

  private executePartiqlDelete(statement: string, parameters: any[] | undefined, region: string): void {
    const tableName = this.parseTableName(statement);
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);
    const itemMap = this.items.get(key)!;

    // Parse WHERE clause to find the item to delete
    const whereMatch = statement.match(/WHERE\s+(.+)$/i);
    if (whereMatch && parameters && parameters.length > 0) {
      const conditions = whereMatch[1].split(/\s+AND\s+/i);
      let paramIdx = 0;
      const keyObj: Item = {};
      for (const condition of conditions) {
        const eqMatch = condition.trim().match(/^"?([^"=\s]+)"?\s*=\s*\?$/);
        if (eqMatch && paramIdx < parameters.length) {
          keyObj[eqMatch[1]] = parameters[paramIdx];
          paramIdx++;
        }
      }
      if (Object.keys(keyObj).length > 0) {
        this.deleteItem(tableName, keyObj, region);
      }
    }
  }

  batchExecuteStatement(statements: { Statement: string; Parameters?: any[] }[], region: string): { Responses: { Item?: Item; Error?: any }[] } {
    const responses: { Item?: Item; Error?: any }[] = [];
    for (const stmt of statements) {
      try {
        const items = this.executeStatement(stmt.Statement, stmt.Parameters, region);
        responses.push(items.length > 0 ? { Item: items[0] } : {});
      } catch (e) {
        if (e instanceof AwsError) {
          responses.push({ Error: { Code: e.code, Message: e.message } });
        } else {
          throw e;
        }
      }
    }
    return { Responses: responses };
  }

  executeTransaction(statements: { Statement: string; Parameters?: any[] }[], region: string): { Responses: { Item?: Item }[] } {
    // Execute all statements; if any fails, they all fail (simplified transactional semantics)
    const results: { Item?: Item }[] = [];
    for (const stmt of statements) {
      const items = this.executeStatement(stmt.Statement, stmt.Parameters, region);
      results.push(items.length > 0 ? { Item: items[0] } : {});
    }
    return { Responses: results };
  }

  // --- Backups ---

  createBackup(tableName: string, backupName: string, region: string): BackupDescription {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);

    const backupArn = buildArn("dynamodb", region, this.accountId, "table/", `${tableName}/backup/${Date.now()}`);
    const backup: BackupDescription = {
      backupArn,
      backupName,
      tableName: table.tableName,
      tableArn: table.tableArn,
      backupStatus: "AVAILABLE",
      backupCreationDateTime: Date.now() / 1000,
      keySchema: table.keySchema,
      attributeDefinitions: table.attributeDefinitions,
      provisionedThroughput: table.provisionedThroughput,
      billingMode: table.billingMode,
    };
    this.backups.set(backupArn, backup);
    return backup;
  }

  describeBackup(backupArn: string): BackupDescription {
    const backup = this.backups.get(backupArn);
    if (!backup) throw new AwsError("BackupNotFoundException", "Backup not found: " + backupArn, 400);
    return backup;
  }

  listBackups(tableName?: string): BackupDescription[] {
    const all = [...this.backups.values()];
    if (tableName) return all.filter((b) => b.tableName === tableName);
    return all;
  }

  deleteBackup(backupArn: string): BackupDescription {
    const backup = this.backups.get(backupArn);
    if (!backup) throw new AwsError("BackupNotFoundException", "Backup not found: " + backupArn, 400);
    this.backups.delete(backupArn);
    backup.backupStatus = "DELETED";
    return backup;
  }

  restoreTableFromBackup(backupArn: string, targetTableName: string, region: string): TableDefinition {
    const backup = this.backups.get(backupArn);
    if (!backup) throw new AwsError("BackupNotFoundException", "Backup not found: " + backupArn, 400);

    const key = this.regionKey(region, targetTableName);
    if (this.tables.has(key)) {
      throw new AwsError("TableAlreadyExistsException", `Table already exists: ${targetTableName}`, 400);
    }

    const table: TableDefinition = {
      tableName: targetTableName,
      tableArn: buildArn("dynamodb", region, this.accountId, "table/", targetTableName),
      tableStatus: "ACTIVE",
      keySchema: backup.keySchema,
      attributeDefinitions: backup.attributeDefinitions,
      billingMode: backup.billingMode,
      provisionedThroughput: backup.provisionedThroughput,
      creationDateTime: Date.now() / 1000,
      itemCount: 0,
      tableSizeBytes: 0,
      tags: {},
    };

    this.tables.set(key, table);
    this.items.set(key, new Map());
    return table;
  }

  updateContinuousBackups(tableName: string, region: string, pointInTimeRecoverySpec: { PointInTimeRecoveryEnabled: boolean }): {
    ContinuousBackupsDescription: {
      ContinuousBackupsStatus: string;
      PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus: string; EarliestRestorableDateTime?: number; LatestRestorableDateTime?: number };
    };
  } {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);

    const enabled = pointInTimeRecoverySpec.PointInTimeRecoveryEnabled;
    const now = Date.now() / 1000;
    table.pointInTimeRecovery = {
      PointInTimeRecoveryStatus: enabled ? "ENABLED" : "DISABLED",
      ...(enabled ? { EarliestRestorableDateTime: now, LatestRestorableDateTime: now } : {}),
    };

    return {
      ContinuousBackupsDescription: {
        ContinuousBackupsStatus: enabled ? "ENABLED" : "DISABLED",
        PointInTimeRecoveryDescription: table.pointInTimeRecovery,
      },
    };
  }

  describeContinuousBackups(tableName: string, region: string): {
    ContinuousBackupsDescription: {
      ContinuousBackupsStatus: string;
      PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus: string; EarliestRestorableDateTime?: number; LatestRestorableDateTime?: number };
    };
  } {
    const key = this.regionKey(region, tableName);
    const table = this.getTable(key);

    const pitr = table.pointInTimeRecovery ?? { PointInTimeRecoveryStatus: "DISABLED" };
    return {
      ContinuousBackupsDescription: {
        ContinuousBackupsStatus: pitr.PointInTimeRecoveryStatus === "ENABLED" ? "ENABLED" : "DISABLED",
        PointInTimeRecoveryDescription: pitr,
      },
    };
  }

  // --- Internal helpers ---

  private getTable(key: string): TableDefinition {
    const table = this.tables.get(key);
    if (!table) throw new AwsError("ResourceNotFoundException", `Requested resource not found`, 400);
    return table;
  }

  private buildItemKey(table: TableDefinition, item: Item): string {
    const hashKey = table.keySchema.find((k) => k.KeyType === "HASH")!;
    const rangeKey = table.keySchema.find((k) => k.KeyType === "RANGE");
    const pk = this.extractScalarValue(item[hashKey.AttributeName]);
    if (rangeKey) {
      const sk = this.extractScalarValue(item[rangeKey.AttributeName]);
      return `${pk}#${sk}`;
    }
    return pk;
  }

  private extractScalarValue(dynamoValue: DynamoValue): string {
    if (!dynamoValue) return "";
    if (dynamoValue.S) return dynamoValue.S;
    if (dynamoValue.N) return dynamoValue.N;
    if (dynamoValue.B) return dynamoValue.B;
    return JSON.stringify(dynamoValue);
  }

  private resolveAttributeName(name: string, expressionNames?: Record<string, string>): string {
    if (name.startsWith("#") && expressionNames) {
      return expressionNames[name] ?? name;
    }
    return name;
  }

  private resolveValue(ref: string, expressionValues?: Record<string, any>): any {
    if (ref.startsWith(":") && expressionValues) {
      return expressionValues[ref];
    }
    return undefined;
  }

  private parsePath(path: string, expressionNames?: Record<string, string>): (string | number)[] {
    const segments: (string | number)[] = [];
    // Split on '.' for map access and '[n]' for list index
    // e.g. "a.b[0].c" → ["a", "b", 0, "c"]
    const tokens = path.split(".");
    for (const token of tokens) {
      // Each token might contain list index brackets, e.g. "list[0]" or "a[1][2]"
      let remaining = token;
      const bracketIdx = remaining.indexOf("[");
      if (bracketIdx === -1) {
        segments.push(this.resolveAttributeName(remaining, expressionNames));
      } else {
        if (bracketIdx > 0) {
          segments.push(this.resolveAttributeName(remaining.substring(0, bracketIdx), expressionNames));
        }
        // Extract all [n] indices
        const indexPattern = /\[(\d+)\]/g;
        let match: RegExpExecArray | null;
        while ((match = indexPattern.exec(remaining)) !== null) {
          segments.push(parseInt(match[1], 10));
        }
      }
    }
    return segments;
  }

  private setNestedValue(item: Item, path: string, value: any, expressionNames?: Record<string, string>): void {
    const segments = this.parsePath(path, expressionNames);
    if (segments.length === 0) return;
    if (segments.length === 1) {
      item[segments[0] as string] = value;
      return;
    }

    let current: any = item;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const nextSeg = segments[i + 1];
      if (typeof seg === "number") {
        // Indexing into a list (current should be an L wrapper)
        if (!current.L) current.L = [];
        while (current.L.length <= seg) current.L.push({ NULL: true });
        if (i === segments.length - 2) {
          // Next is the last segment
          if (typeof nextSeg === "number") {
            current = current.L[seg];
          } else {
            // Need to ensure the element is a map
            if (!current.L[seg] || !current.L[seg].M) {
              current.L[seg] = { M: {} };
            }
            current = current.L[seg].M;
          }
        } else {
          if (typeof nextSeg === "number") {
            // Next segment is also a list index
            if (!current.L[seg] || !current.L[seg].L) {
              current.L[seg] = { L: [] };
            }
            current = current.L[seg];
          } else {
            if (!current.L[seg] || !current.L[seg].M) {
              current.L[seg] = { M: {} };
            }
            current = current.L[seg].M;
          }
        }
      } else {
        // String key - map access
        if (i === 0) {
          // Top-level attribute on the item
          if (i === segments.length - 2) {
            // Parent of final segment
            if (typeof nextSeg === "number") {
              if (!current[seg] || !current[seg].L) {
                current[seg] = { L: [] };
              }
              current = current[seg];
            } else {
              if (!current[seg] || !current[seg].M) {
                current[seg] = { M: {} };
              }
              current = current[seg].M;
            }
          } else {
            if (typeof nextSeg === "number") {
              if (!current[seg] || !current[seg].L) {
                current[seg] = { L: [] };
              }
              current = current[seg];
            } else {
              if (!current[seg] || !current[seg].M) {
                current[seg] = { M: {} };
              }
              current = current[seg].M;
            }
          }
        } else {
          // Nested map key (current is already inside an M)
          if (i === segments.length - 2) {
            if (typeof nextSeg === "number") {
              if (!current[seg] || !current[seg].L) {
                current[seg] = { L: [] };
              }
              current = current[seg];
            } else {
              if (!current[seg] || !current[seg].M) {
                current[seg] = { M: {} };
              }
              current = current[seg].M;
            }
          } else {
            if (typeof nextSeg === "number") {
              if (!current[seg] || !current[seg].L) {
                current[seg] = { L: [] };
              }
              current = current[seg];
            } else {
              if (!current[seg] || !current[seg].M) {
                current[seg] = { M: {} };
              }
              current = current[seg].M;
            }
          }
        }
      }
    }

    // Set the final value
    const lastSeg = segments[segments.length - 1];
    if (typeof lastSeg === "number") {
      if (!current.L) current.L = [];
      while (current.L.length <= lastSeg) current.L.push({ NULL: true });
      current.L[lastSeg] = value;
    } else {
      current[lastSeg] = value;
    }
  }

  private removeNestedValue(item: Item, path: string, expressionNames?: Record<string, string>): void {
    const segments = this.parsePath(path, expressionNames);
    if (segments.length === 0) return;
    if (segments.length === 1) {
      delete item[segments[0] as string];
      return;
    }

    // Navigate to the parent
    let current: any = item;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (typeof seg === "number") {
        if (!current.L || seg >= current.L.length) return;
        const elem = current.L[seg];
        if (i < segments.length - 2) {
          const nextSeg = segments[i + 1];
          if (typeof nextSeg === "number") {
            current = elem;
          } else {
            if (!elem?.M) return;
            current = elem.M;
          }
        } else {
          // Parent of final segment
          const lastSeg = segments[segments.length - 1];
          if (typeof lastSeg === "number") {
            current = elem;
          } else {
            if (!elem?.M) return;
            current = elem.M;
          }
        }
      } else {
        if (i === 0) {
          const attr = current[seg];
          if (!attr) return;
          const nextSeg = segments[i + 1];
          if (i === segments.length - 2) {
            const lastSeg = segments[segments.length - 1];
            if (typeof lastSeg === "number") {
              current = attr;
            } else {
              if (!attr.M) return;
              current = attr.M;
            }
          } else {
            if (typeof nextSeg === "number") {
              current = attr;
            } else {
              if (!attr.M) return;
              current = attr.M;
            }
          }
        } else {
          const attr = current[seg];
          if (!attr) return;
          const nextSeg = i < segments.length - 2 ? segments[i + 1] : segments[segments.length - 1];
          if (typeof nextSeg === "number") {
            current = attr;
          } else {
            if (!attr.M) return;
            current = attr.M;
          }
        }
      }
    }

    const lastSeg = segments[segments.length - 1];
    if (typeof lastSeg === "number") {
      if (current.L && lastSeg < current.L.length) {
        current.L.splice(lastSeg, 1);
      }
    } else {
      delete current[lastSeg];
    }
  }

  private getNestedValue(item: Item, path: string, expressionNames?: Record<string, string>): any {
    const parts = path.split(".").map((p) => this.resolveAttributeName(p, expressionNames));
    let current: any = item;
    for (const part of parts) {
      if (!current) return undefined;
      if (current[part] !== undefined) {
        current = current[part];
      } else if (current.M && current.M[part] !== undefined) {
        current = current.M[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private compareDynamoValues(a: any, b: any): number {
    const aVal = this.extractScalarValue(a);
    const bVal = this.extractScalarValue(b);
    if (a?.N && b?.N) return parseFloat(aVal) - parseFloat(bVal);
    return aVal.localeCompare(bVal);
  }

  private evaluateCondition(expression: string, item: Item | undefined, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>): void {
    if (!this.evaluateFilterExpression(item ?? {}, expression, expressionNames, expressionValues)) {
      throw new AwsError("ConditionalCheckFailedException", "The conditional request failed", 400);
    }
  }

  evaluateFilterExpression(item: Item, expression: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>): boolean {
    const expr = expression.trim();

    // Handle AND/OR with proper precedence
    const andParts = this.splitExpression(expr, " AND ");
    if (andParts.length > 1) {
      return andParts.every((part) => this.evaluateFilterExpression(item, part, expressionNames, expressionValues));
    }

    const orParts = this.splitExpression(expr, " OR ");
    if (orParts.length > 1) {
      return orParts.some((part) => this.evaluateFilterExpression(item, part, expressionNames, expressionValues));
    }

    // Handle NOT
    if (expr.startsWith("NOT ")) {
      return !this.evaluateFilterExpression(item, expr.slice(4), expressionNames, expressionValues);
    }

    // Handle parentheses
    if (expr.startsWith("(") && expr.endsWith(")")) {
      return this.evaluateFilterExpression(item, expr.slice(1, -1), expressionNames, expressionValues);
    }

    // Functions
    const attrExistsMatch = expr.match(/^attribute_exists\((.+)\)$/);
    if (attrExistsMatch) {
      const val = this.getNestedValue(item, attrExistsMatch[1], expressionNames);
      return val !== undefined;
    }

    const attrNotExistsMatch = expr.match(/^attribute_not_exists\((.+)\)$/);
    if (attrNotExistsMatch) {
      const val = this.getNestedValue(item, attrNotExistsMatch[1], expressionNames);
      return val === undefined;
    }

    const containsMatch = expr.match(/^contains\((.+),\s*(.+)\)$/);
    if (containsMatch) {
      const val = this.getNestedValue(item, containsMatch[1].trim(), expressionNames);
      const search = this.resolveValue(containsMatch[2].trim(), expressionValues);
      if (!val || !search) return false;
      if (val.S && search.S) return val.S.includes(search.S);
      if (val.L) return val.L.some((v: any) => JSON.stringify(v) === JSON.stringify(search));
      return false;
    }

    const beginsWithMatch = expr.match(/^begins_with\((.+),\s*(.+)\)$/);
    if (beginsWithMatch) {
      const val = this.getNestedValue(item, beginsWithMatch[1].trim(), expressionNames);
      const prefix = this.resolveValue(beginsWithMatch[2].trim(), expressionValues);
      if (!val?.S || !prefix?.S) return false;
      return val.S.startsWith(prefix.S);
    }

    const sizeMatch = expr.match(/^size\((.+)\)\s*(=|<>|<|>|<=|>=)\s*(.+)$/);
    if (sizeMatch) {
      const val = this.getNestedValue(item, sizeMatch[1].trim(), expressionNames);
      const op = sizeMatch[2];
      const compareVal = this.resolveValue(sizeMatch[3].trim(), expressionValues);
      let size = 0;
      if (val?.S) size = val.S.length;
      else if (val?.L) size = val.L.length;
      else if (val?.M) size = Object.keys(val.M).length;
      else if (val?.B) size = val.B.length;
      const target = parseFloat(compareVal?.N ?? "0");
      return this.compareOp(size, op, target);
    }

    // BETWEEN
    const betweenMatch = expr.match(/^(.+)\s+BETWEEN\s+(.+)\s+AND\s+(.+)$/i);
    if (betweenMatch) {
      const val = this.getNestedValue(item, betweenMatch[1].trim(), expressionNames);
      const low = this.resolveValue(betweenMatch[2].trim(), expressionValues);
      const high = this.resolveValue(betweenMatch[3].trim(), expressionValues);
      if (!val) return false;
      return this.compareDynamoValues(val, low) >= 0 && this.compareDynamoValues(val, high) <= 0;
    }

    // IN
    const inMatch = expr.match(/^(.+)\s+IN\s*\((.+)\)$/i);
    if (inMatch) {
      const val = this.getNestedValue(item, inMatch[1].trim(), expressionNames);
      const values = inMatch[2].split(",").map((v) => this.resolveValue(v.trim(), expressionValues));
      return values.some((v) => JSON.stringify(v) === JSON.stringify(val));
    }

    // Comparison operators
    const compMatch = expr.match(/^(.+?)\s*(=|<>|<|>|<=|>=)\s*(.+)$/);
    if (compMatch) {
      const left = compMatch[1].trim();
      const op = compMatch[2];
      const right = compMatch[3].trim();

      const leftVal = right.startsWith(":") ? this.getNestedValue(item, left, expressionNames) : this.resolveValue(left, expressionValues);
      const rightVal = this.resolveValue(right, expressionValues) ?? this.getNestedValue(item, right, expressionNames);

      if (leftVal === undefined && op === "<>") return true;
      if (leftVal === undefined) return false;

      if (leftVal?.N && rightVal?.N) {
        return this.compareOp(parseFloat(leftVal.N), op, parseFloat(rightVal.N));
      }
      if (leftVal?.S && rightVal?.S) {
        if (op === "=") return leftVal.S === rightVal.S;
        if (op === "<>") return leftVal.S !== rightVal.S;
        return this.compareOp(leftVal.S, op, rightVal.S);
      }

      return op === "=" ? JSON.stringify(leftVal) === JSON.stringify(rightVal) : op === "<>" ? JSON.stringify(leftVal) !== JSON.stringify(rightVal) : false;
    }

    return true;
  }

  private compareOp(a: any, op: string, b: any): boolean {
    switch (op) {
      case "=": return a === b;
      case "<>": return a !== b;
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
      default: return false;
    }
  }

  private splitExpression(expr: string, delimiter: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    let i = 0;
    while (i < expr.length) {
      if (expr[i] === "(") depth++;
      if (expr[i] === ")") depth--;
      if (depth === 0 && expr.substring(i, i + delimiter.length) === delimiter) {
        parts.push(current.trim());
        current = "";
        i += delimiter.length;
        continue;
      }
      current += expr[i];
      i++;
    }
    parts.push(current.trim());
    return parts.filter((p) => p.length > 0);
  }

  private applyKeyCondition(items: Item[], expression: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>, hashKeyName?: string, rangeKeyName?: string): Item[] {
    return items.filter((item) => this.evaluateFilterExpression(item, expression, expressionNames, expressionValues));
  }

  applyUpdateExpression(item: Item, expression: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>): void {
    const setClauses = expression.match(/SET\s+(.*?)(?=\s+(?:REMOVE|ADD|DELETE)\s|$)/i);
    const removeClauses = expression.match(/REMOVE\s+(.*?)(?=\s+(?:SET|ADD|DELETE)\s|$)/i);
    const addClauses = expression.match(/ADD\s+(.*?)(?=\s+(?:SET|REMOVE|DELETE)\s|$)/i);
    const deleteClauses = expression.match(/DELETE\s+(.*?)(?=\s+(?:SET|REMOVE|ADD)\s|$)/i);

    if (setClauses) {
      const assignments = this.splitSetClauses(setClauses[1]);
      for (const assignment of assignments) {
        const eqIdx = assignment.indexOf("=");
        if (eqIdx === -1) continue;
        const path = assignment.substring(0, eqIdx).trim();
        const valueExpr = assignment.substring(eqIdx + 1).trim();
        const value = this.evaluateValueExpression(item, valueExpr, expressionNames, expressionValues);
        if (value !== undefined) {
          const segments = this.parsePath(path, expressionNames);
          if (segments.length <= 1) {
            item[segments[0] as string] = value;
          } else {
            this.setNestedValue(item, path, value, expressionNames);
          }
        }
      }
    }

    if (removeClauses) {
      const paths = removeClauses[1].split(",").map((p) => p.trim());
      for (const path of paths) {
        const segments = this.parsePath(path, expressionNames);
        if (segments.length <= 1) {
          delete item[segments[0] as string];
        } else {
          this.removeNestedValue(item, path, expressionNames);
        }
      }
    }

    if (addClauses) {
      const assignments = addClauses[1].split(",").map((a) => a.trim());
      for (const assignment of assignments) {
        const parts = assignment.split(/\s+/);
        const attrName = this.resolveAttributeName(parts[0], expressionNames);
        const value = this.resolveValue(parts[1], expressionValues);
        const existing = item[attrName];
        if (value?.N) {
          const current = existing?.N ? parseFloat(existing.N) : 0;
          item[attrName] = { N: String(current + parseFloat(value.N)) };
        } else if (value?.SS) {
          const currentSet = existing?.SS ?? [];
          item[attrName] = { SS: [...new Set([...currentSet, ...value.SS])] };
        } else if (value?.NS) {
          const currentSet = existing?.NS ?? [];
          item[attrName] = { NS: [...new Set([...currentSet, ...value.NS])] };
        }
      }
    }

    if (deleteClauses) {
      const assignments = deleteClauses[1].split(",").map((a) => a.trim());
      for (const assignment of assignments) {
        const parts = assignment.split(/\s+/);
        const attrName = this.resolveAttributeName(parts[0], expressionNames);
        const value = this.resolveValue(parts[1], expressionValues);
        const existing = item[attrName];
        if (value?.SS && existing?.SS) {
          item[attrName] = { SS: existing.SS.filter((s: string) => !value.SS.includes(s)) };
        }
      }
    }
  }

  private splitSetClauses(expr: string): string[] {
    const clauses: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of expr) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        clauses.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    clauses.push(current.trim());
    return clauses;
  }

  private evaluateValueExpression(item: Item, expr: string, expressionNames?: Record<string, string>, expressionValues?: Record<string, any>): any {
    const trimmed = expr.trim();

    // if_not_exists(path, value)
    const ifNotExistsMatch = trimmed.match(/^if_not_exists\((.+),\s*(.+)\)$/);
    if (ifNotExistsMatch) {
      const path = this.resolveAttributeName(ifNotExistsMatch[1].trim(), expressionNames);
      const existing = item[path];
      if (existing !== undefined) return existing;
      return this.resolveValue(ifNotExistsMatch[2].trim(), expressionValues);
    }

    // list_append(a, b)
    const listAppendMatch = trimmed.match(/^list_append\((.+),\s*(.+)\)$/);
    if (listAppendMatch) {
      const a = this.evaluateValueExpression(item, listAppendMatch[1].trim(), expressionNames, expressionValues);
      const b = this.evaluateValueExpression(item, listAppendMatch[2].trim(), expressionNames, expressionValues);
      const aList = a?.L ?? [];
      const bList = b?.L ?? [];
      return { L: [...aList, ...bList] };
    }

    // Arithmetic: path + :val or :val - :val
    const arithMatch = trimmed.match(/^(.+?)\s*([+-])\s*(.+)$/);
    if (arithMatch) {
      const left = this.evaluateValueExpression(item, arithMatch[1].trim(), expressionNames, expressionValues);
      const right = this.evaluateValueExpression(item, arithMatch[3].trim(), expressionNames, expressionValues);
      if (left?.N && right?.N) {
        const result = arithMatch[2] === "+" ? parseFloat(left.N) + parseFloat(right.N) : parseFloat(left.N) - parseFloat(right.N);
        return { N: String(result) };
      }
    }

    // Expression value reference
    if (trimmed.startsWith(":")) {
      return this.resolveValue(trimmed, expressionValues);
    }

    // Attribute reference
    const attrName = this.resolveAttributeName(trimmed, expressionNames);
    return item[attrName];
  }

  private projectItem(item: Item, projectionExpression: string, expressionNames?: Record<string, string>): Item {
    const attrs = projectionExpression.split(",").map((a) => a.trim());
    const result: Item = {};
    for (const attr of attrs) {
      const segments = this.parsePath(attr, expressionNames);
      if (segments.length === 1) {
        const key = segments[0] as string;
        if (item[key] !== undefined) {
          result[key] = item[key];
        }
      } else {
        // Navigate source to extract nested value
        let current: any = item;
        let found = true;
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (current === undefined || current === null) { found = false; break; }
          if (typeof seg === "number") {
            if (!current.L || seg >= current.L.length) { found = false; break; }
            current = current.L[seg];
          } else {
            if (i === 0) {
              current = current[seg];
            } else {
              if (current.M) {
                current = current.M[seg];
              } else {
                found = false; break;
              }
            }
          }
        }
        if (!found || current === undefined) continue;

        // Build nested structure in result
        let target: any = result;
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i];
          const nextSeg = segments[i + 1];
          if (typeof seg === "number") {
            if (!target.L) target.L = [];
            while (target.L.length <= seg) target.L.push({ NULL: true });
            if (typeof nextSeg === "number") {
              if (!target.L[seg].L) target.L[seg] = { L: [] };
              target = target.L[seg];
            } else {
              if (!target.L[seg].M) target.L[seg] = { M: {} };
              target = target.L[seg].M;
            }
          } else {
            if (i === 0) {
              if (typeof nextSeg === "number") {
                if (!target[seg]) target[seg] = { L: [] };
                target = target[seg];
              } else {
                if (!target[seg]) target[seg] = { M: {} };
                target = target[seg].M;
              }
            } else {
              if (typeof nextSeg === "number") {
                if (!target[seg]) target[seg] = { L: [] };
                target = target[seg];
              } else {
                if (!target[seg]) target[seg] = { M: {} };
                target = target[seg].M;
              }
            }
          }
        }
        const lastSeg = segments[segments.length - 1];
        if (typeof lastSeg === "number") {
          if (!target.L) target.L = [];
          while (target.L.length <= lastSeg) target.L.push({ NULL: true });
          target.L[lastSeg] = current;
        } else {
          target[lastSeg] = current;
        }
      }
    }
    return result;
  }
}
