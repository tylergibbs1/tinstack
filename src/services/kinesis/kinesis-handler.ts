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
          const iter = this.service.getShardIterator(body.StreamName, body.ShardId, body.ShardIteratorType, body.StartingSequenceNumber, ctx.region, body.Timestamp);
          return this.json({ ShardIterator: iter }, ctx);
        }
        case "GetRecords": {
          const r = this.service.getRecords(body.ShardIterator, body.Limit);
          return this.json({
            Records: r.records.map((rec) => ({ SequenceNumber: rec.sequenceNumber, PartitionKey: rec.partitionKey, Data: rec.data, ApproximateArrivalTimestamp: rec.timestamp })),
            NextShardIterator: r.nextShardIterator, MillisBehindLatest: r.millisBehindLatest,
          }, ctx);
        }
        case "DescribeStreamSummary": return this.json({ StreamDescriptionSummary: this.service.describeStreamSummary(body.StreamName, ctx.region) }, ctx);
        case "ListTagsForStream": return this.json(this.service.listTagsForStream(body.StreamName, ctx.region), ctx);
        case "AddTagsToStream": this.service.addTagsToStream(body.StreamName, body.Tags, ctx.region); return this.json({}, ctx);
        case "IncreaseStreamRetentionPeriod": {
          const stream = this.service.describeStream(body.StreamName, ctx.region);
          stream.retentionPeriodHours = body.RetentionPeriodHours ?? 24;
          return this.json({}, ctx);
        }
        case "DecreaseStreamRetentionPeriod": {
          const stream = this.service.describeStream(body.StreamName, ctx.region);
          stream.retentionPeriodHours = body.RetentionPeriodHours ?? 24;
          return this.json({}, ctx);
        }
        case "RemoveTagsFromStream": return this.json({}, ctx);
        case "ListShards": {
          const shards = this.service.listShards(body.StreamName, ctx.region);
          return this.json({
            Shards: shards.map((sh) => ({
              ShardId: sh.shardId,
              ParentShardId: sh.parentShardId,
              HashKeyRange: { StartingHashKey: sh.hashKeyRange.startingHashKey, EndingHashKey: sh.hashKeyRange.endingHashKey },
              SequenceNumberRange: { StartingSequenceNumber: sh.sequenceNumberRange.startingSequenceNumber },
            })),
          }, ctx);
        }
        case "UpdateShardCount": {
          const result = this.service.updateShardCount(body.StreamName, body.TargetShardCount, ctx.region);
          return this.json({
            StreamName: result.streamName,
            CurrentShardCount: result.currentShardCount,
            TargetShardCount: result.targetShardCount,
          }, ctx);
        }
        case "RegisterStreamConsumer": {
          const consumer = this.service.registerStreamConsumer(body.ConsumerName, body.StreamARN, ctx.region);
          return this.json({
            Consumer: {
              ConsumerName: consumer.consumerName,
              ConsumerARN: consumer.consumerArn,
              ConsumerStatus: consumer.consumerStatus,
              ConsumerCreationTimestamp: consumer.consumerCreationTimestamp,
            },
          }, ctx);
        }
        case "DescribeStreamConsumer": {
          const consumer = this.service.describeStreamConsumer(body.ConsumerARN, body.ConsumerName, body.StreamARN);
          return this.json({
            ConsumerDescription: {
              ConsumerName: consumer.consumerName,
              ConsumerARN: consumer.consumerArn,
              ConsumerStatus: consumer.consumerStatus,
              ConsumerCreationTimestamp: consumer.consumerCreationTimestamp,
              StreamARN: consumer.streamArn,
            },
          }, ctx);
        }
        case "ListStreamConsumers": {
          const consumers = this.service.listStreamConsumers(body.StreamARN);
          return this.json({
            Consumers: consumers.map((c) => ({
              ConsumerName: c.consumerName,
              ConsumerARN: c.consumerArn,
              ConsumerStatus: c.consumerStatus,
              ConsumerCreationTimestamp: c.consumerCreationTimestamp,
            })),
          }, ctx);
        }
        case "DeregisterStreamConsumer": {
          this.service.deregisterStreamConsumer(body.ConsumerARN, body.ConsumerName, body.StreamARN);
          return this.json({}, ctx);
        }
        case "StartStreamEncryption": {
          this.service.startStreamEncryption(body.StreamName, body.EncryptionType, body.KeyId, ctx.region);
          return this.json({}, ctx);
        }
        case "StopStreamEncryption": {
          this.service.stopStreamEncryption(body.StreamName, body.EncryptionType, body.KeyId, ctx.region);
          return this.json({}, ctx);
        }
        case "MergeShards": {
          this.service.mergeShards(body.StreamName, body.ShardToMerge, body.AdjacentShardToMerge, ctx.region);
          return this.json({}, ctx);
        }
        case "SplitShard": {
          this.service.splitShard(body.StreamName, body.ShardToSplit, body.NewStartingHashKey, ctx.region);
          return this.json({}, ctx);
        }
        case "DescribeLimits": {
          const limits = this.service.describeLimits(ctx.region);
          return this.json({
            ShardLimit: limits.shardLimit,
            OpenShardCount: limits.openShardCount,
            OnDemandStreamCount: limits.onDemandStreamCount,
            OnDemandStreamCountLimit: limits.onDemandStreamCountLimit,
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
