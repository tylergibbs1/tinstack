import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DynamoDbService } from "./dynamodb-service";

export class DynamoDbHandler {
  constructor(private service: DynamoDbService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateTable":
          return this.createTable(body, ctx);
        case "DeleteTable":
          return this.deleteTable(body, ctx);
        case "DescribeTable":
          return this.describeTable(body, ctx);
        case "ListTables":
          return this.listTables(body, ctx);
        case "PutItem":
          return this.putItem(body, ctx);
        case "GetItem":
          return this.getItem(body, ctx);
        case "DeleteItem":
          return this.deleteItem(body, ctx);
        case "UpdateItem":
          return this.updateItem(body, ctx);
        case "Query":
          return this.query(body, ctx);
        case "Scan":
          return this.scan(body, ctx);
        case "BatchWriteItem":
          return this.batchWriteItem(body, ctx);
        case "BatchGetItem":
          return this.batchGetItem(body, ctx);
        case "TransactWriteItems":
          return this.transactWriteItems(body, ctx);
        case "TransactGetItems":
          return this.transactGetItems(body, ctx);
        case "DescribeTimeToLive":
          return this.describeTimeToLive(body, ctx);
        case "UpdateTimeToLive":
          return this.updateTimeToLive(body, ctx);
        case "ListTagsOfResource":
          return this.json({ Tags: this.service.listTagsOfResource(body.ResourceArn, ctx.region) }, ctx);
        case "TagResource":
          this.service.tagResource(body.ResourceArn, body.Tags ?? [], ctx.region);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.ResourceArn, body.TagKeys ?? [], ctx.region);
          return this.json({}, ctx);
        case "DescribeContinuousBackups":
          return this.json({
            ContinuousBackupsDescription: {
              ContinuousBackupsStatus: "DISABLED",
              PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus: "DISABLED" },
            },
          }, ctx);
        default:
          return this.error(new AwsError("UnknownOperationException", `Operation ${action} is not supported.`, 400), ctx);
      }
    } catch (e) {
      if (e instanceof AwsError) return this.error(e, ctx);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private error(err: AwsError, ctx: RequestContext): Response {
    return jsonErrorResponse(err, ctx.requestId);
  }

  private createTable(body: any, ctx: RequestContext): Response {
    const table = this.service.createTable(body, ctx.region);
    return this.json({ TableDescription: this.tableToJson(table) }, ctx);
  }

  private deleteTable(body: any, ctx: RequestContext): Response {
    const table = this.service.deleteTable(body.TableName, ctx.region);
    return this.json({ TableDescription: this.tableToJson(table) }, ctx);
  }

  private describeTable(body: any, ctx: RequestContext): Response {
    const table = this.service.describeTable(body.TableName, ctx.region);
    return this.json({ Table: this.tableToJson(table) }, ctx);
  }

  private listTables(body: any, ctx: RequestContext): Response {
    const result = this.service.listTables(ctx.region, body.ExclusiveStartTableName, body.Limit);
    return this.json({
      TableNames: result.tableNames,
      LastEvaluatedTableName: result.lastEvaluatedTableName,
    }, ctx);
  }

  private putItem(body: any, ctx: RequestContext): Response {
    const old = this.service.putItem(
      body.TableName,
      body.Item,
      ctx.region,
      body.ConditionExpression,
      body.ExpressionAttributeNames,
      body.ExpressionAttributeValues,
    );
    const result: any = {};
    if (body.ReturnValues === "ALL_OLD" && old) result.Attributes = old;
    return this.json(result, ctx);
  }

  private getItem(body: any, ctx: RequestContext): Response {
    const item = this.service.getItem(body.TableName, body.Key, ctx.region, body.ProjectionExpression, body.ExpressionAttributeNames);
    return this.json(item ? { Item: item } : {}, ctx);
  }

  private deleteItem(body: any, ctx: RequestContext): Response {
    const old = this.service.deleteItem(
      body.TableName,
      body.Key,
      ctx.region,
      body.ConditionExpression,
      body.ExpressionAttributeNames,
      body.ExpressionAttributeValues,
    );
    const result: any = {};
    if (body.ReturnValues === "ALL_OLD" && old) result.Attributes = old;
    return this.json(result, ctx);
  }

  private updateItem(body: any, ctx: RequestContext): Response {
    const result = this.service.updateItem(
      body.TableName,
      body.Key,
      ctx.region,
      body.UpdateExpression,
      body.ExpressionAttributeNames,
      body.ExpressionAttributeValues,
      body.ConditionExpression,
      body.ReturnValues,
    );
    const response: any = {};
    if (result) response.Attributes = result;
    return this.json(response, ctx);
  }

  private query(body: any, ctx: RequestContext): Response {
    const result = this.service.query(body.TableName, ctx.region, body);
    return this.json({
      Items: result.items,
      Count: result.count,
      ScannedCount: result.scannedCount,
      LastEvaluatedKey: result.lastEvaluatedKey,
    }, ctx);
  }

  private scan(body: any, ctx: RequestContext): Response {
    const result = this.service.scan(body.TableName, ctx.region, body);
    return this.json({
      Items: result.items,
      Count: result.count,
      ScannedCount: result.scannedCount,
      LastEvaluatedKey: result.lastEvaluatedKey,
    }, ctx);
  }

  private batchWriteItem(body: any, ctx: RequestContext): Response {
    const unprocessed = this.service.batchWriteItem(body.RequestItems, ctx.region);
    return this.json({ UnprocessedItems: unprocessed }, ctx);
  }

  private batchGetItem(body: any, ctx: RequestContext): Response {
    const result = this.service.batchGetItem(body.RequestItems, ctx.region);
    return this.json({ Responses: result.responses, UnprocessedKeys: result.unprocessedKeys }, ctx);
  }

  private transactWriteItems(body: any, ctx: RequestContext): Response {
    this.service.transactWriteItems(body.TransactItems, ctx.region);
    return this.json({}, ctx);
  }

  private transactGetItems(body: any, ctx: RequestContext): Response {
    const items = this.service.transactGetItems(body.TransactItems, ctx.region);
    return this.json({
      Responses: items.map((item) => (item ? { Item: item } : {})),
    }, ctx);
  }

  private describeTimeToLive(body: any, ctx: RequestContext): Response {
    const result = this.service.describeTimeToLive(body.TableName, ctx.region);
    return this.json({ TimeToLiveDescription: result }, ctx);
  }

  private updateTimeToLive(body: any, ctx: RequestContext): Response {
    this.service.updateTimeToLive(body.TableName, body.TimeToLiveSpecification, ctx.region);
    return this.json({
      TimeToLiveSpecification: body.TimeToLiveSpecification,
    }, ctx);
  }

  private tableToJson(table: any): any {
    return {
      TableName: table.tableName,
      TableArn: table.tableArn,
      TableStatus: table.tableStatus,
      KeySchema: table.keySchema,
      AttributeDefinitions: table.attributeDefinitions,
      ProvisionedThroughput: table.billingMode === "PAY_PER_REQUEST"
        ? { ReadCapacityUnits: 0, WriteCapacityUnits: 0, NumberOfDecreasesToday: 0 }
        : table.provisionedThroughput ? {
          ...table.provisionedThroughput,
          NumberOfDecreasesToday: 0,
        } : undefined,
      BillingModeSummary: table.billingMode ? { BillingMode: table.billingMode } : undefined,
      CreationDateTime: table.creationDateTime,
      ItemCount: table.itemCount,
      TableSizeBytes: table.tableSizeBytes,
      GlobalSecondaryIndexes: table.globalSecondaryIndexes,
      LocalSecondaryIndexes: table.localSecondaryIndexes,
      StreamSpecification: table.streamSpecification,
    };
  }
}
