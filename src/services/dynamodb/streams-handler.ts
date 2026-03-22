import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DynamoDbStreamsService } from "./streams-service";

export class DynamoDbStreamsHandler {
  constructor(private service: DynamoDbStreamsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "ListStreams": {
          const streams = this.service.listStreams(body.TableName, ctx.region);
          return this.json({ Streams: streams.map((s) => ({ StreamArn: s.streamArn, TableName: s.tableName, StreamLabel: s.streamLabel })) }, ctx);
        }
        case "DescribeStream": {
          const stream = this.service.describeStream(body.StreamArn);
          return this.json({
            StreamDescription: {
              StreamArn: stream.streamArn, StreamLabel: stream.streamLabel,
              StreamStatus: stream.streamStatus, StreamViewType: stream.streamViewType,
              TableName: stream.tableName,
              Shards: stream.shards.map((s) => ({
                ShardId: s.shardId, ParentShardId: s.parentShardId,
                SequenceNumberRange: s.sequenceNumberRange,
              })),
            },
          }, ctx);
        }
        case "GetShardIterator": {
          const iter = this.service.getShardIterator(body.StreamArn, body.ShardId, body.ShardIteratorType, body.SequenceNumber);
          return this.json({ ShardIterator: iter }, ctx);
        }
        case "GetRecords": {
          const r = this.service.getRecords(body.ShardIterator, body.Limit);
          return this.json({ Records: r.records, NextShardIterator: r.nextShardIterator }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
