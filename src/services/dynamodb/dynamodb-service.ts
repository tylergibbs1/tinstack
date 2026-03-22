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
        const attrName = this.resolveAttributeName(path, expressionNames);
        const value = this.evaluateValueExpression(item, valueExpr, expressionNames, expressionValues);
        if (value !== undefined) item[attrName] = value;
      }
    }

    if (removeClauses) {
      const paths = removeClauses[1].split(",").map((p) => p.trim());
      for (const path of paths) {
        const attrName = this.resolveAttributeName(path, expressionNames);
        delete item[attrName];
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
      const resolved = this.resolveAttributeName(attr, expressionNames);
      if (item[resolved] !== undefined) {
        result[resolved] = item[resolved];
      }
    }
    return result;
  }
}
