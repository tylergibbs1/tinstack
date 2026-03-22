import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { KinesisService } from "./kinesis-service";

export class KinesisHandler {
  constructor(private service: KinesisService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateStream": this.service.createStream(body.StreamName, body.ShardCount, ctx.region); return this.json({}, ctx);
        case "DeleteStream": this.service.deleteStream(body.StreamName, ctx.region); return this.json({}, ctx);
        case "DescribeStream": {
          const s = this.service.describeStream(body.StreamName, ctx.region);
          return this.json({
            StreamDescription: {
              StreamName: s.streamName, StreamARN: s.streamArn, StreamStatus: s.streamStatus,
              Shards: s.shards.map((sh) => ({ ShardId: sh.shardId, HashKeyRange: sh.hashKeyRange, SequenceNumberRange: sh.sequenceNumberRange })),
              HasMoreShards: false, RetentionPeriodHours: s.retentionPeriodHours,
              StreamCreationTimestamp: s.createdTimestamp,
            },
          }, ctx);
        }
        case "ListStreams": return this.json({ StreamNames: this.service.listStreams(ctx.region), HasMoreStreams: false }, ctx);
        case "PutRecord": {
          const r = this.service.putRecord(body.StreamName, body.Data, body.PartitionKey, ctx.region);
          return this.json({ ShardId: r.shardId, SequenceNumber: r.sequenceNumber }, ctx);
        }
        case "PutRecords": {
          const r = this.service.putRecords(body.StreamName, body.Records, ctx.region);
          return this.json({ FailedRecordCount: r.failedRecordCount, Records: r.records.map((rec) => ({ ShardId: rec.shardId, SequenceNumber: rec.sequenceNumber })) }, ctx);
        }
        case "GetShardIterator": {
          const iter = this.service.getShardIterator(body.StreamName, body.ShardId, body.ShardIteratorType, body.StartingSequenceNumber, ctx.region);
          return this.json({ ShardIterator: iter }, ctx);
        }
        case "GetRecords": {
          const r = this.service.getRecords(body.ShardIterator, body.Limit);
          return this.json({
            Records: r.records.map((rec) => ({ SequenceNumber: rec.sequenceNumber, PartitionKey: rec.partitionKey, Data: rec.data, ApproximateArrivalTimestamp: rec.timestamp })),
            NextShardIterator: r.nextShardIterator, MillisBehindLatest: r.millisBehindLatest,
          }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
