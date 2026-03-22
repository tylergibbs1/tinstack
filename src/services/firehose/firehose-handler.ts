import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { FirehoseService } from "./firehose-service";

export class FirehoseHandler {
  constructor(private service: FirehoseService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDeliveryStream": {
          const destinations: any[] = [];
          if (body.S3DestinationConfiguration) destinations.push({ destinationId: "destinationId-000000000001", S3DestinationDescription: body.S3DestinationConfiguration });
          if (body.ExtendedS3DestinationConfiguration) destinations.push({ destinationId: "destinationId-000000000001", ExtendedS3DestinationDescription: body.ExtendedS3DestinationConfiguration });
          if (body.RedshiftDestinationConfiguration) destinations.push({ destinationId: "destinationId-000000000001", RedshiftDestinationDescription: body.RedshiftDestinationConfiguration });
          if (body.ElasticsearchDestinationConfiguration) destinations.push({ destinationId: "destinationId-000000000001", ElasticsearchDestinationDescription: body.ElasticsearchDestinationConfiguration });
          if (body.HttpEndpointDestinationConfiguration) destinations.push({ destinationId: "destinationId-000000000001", HttpEndpointDestinationDescription: body.HttpEndpointDestinationConfiguration });

          const arn = this.service.createDeliveryStream(
            body.DeliveryStreamName,
            body.DeliveryStreamType,
            destinations,
            body.Tags,
            ctx.region,
          );
          return this.json({ DeliveryStreamARN: arn }, ctx);
        }
        case "DescribeDeliveryStream": {
          const s = this.service.describeDeliveryStream(body.DeliveryStreamName, ctx.region);
          return this.json({
            DeliveryStreamDescription: {
              DeliveryStreamName: s.deliveryStreamName,
              DeliveryStreamARN: s.deliveryStreamARN,
              DeliveryStreamStatus: s.deliveryStreamStatus,
              DeliveryStreamType: s.deliveryStreamType,
              VersionId: s.versionId,
              CreateTimestamp: s.createTimestamp,
              Destinations: s.destinations.map((d) => ({ DestinationId: d.destinationId, ...d })),
              DeliveryStreamEncryptionConfiguration: s.encryptionConfiguration ?? { Status: "DISABLED" },
              HasMoreDestinations: false,
            },
          }, ctx);
        }
        case "ListDeliveryStreams": {
          const result = this.service.listDeliveryStreams(ctx.region, body.DeliveryStreamType, body.ExclusiveStartDeliveryStreamName, body.Limit);
          return this.json({
            DeliveryStreamNames: result.deliveryStreamNames,
            HasMoreDeliveryStreams: result.hasMoreDeliveryStreams,
          }, ctx);
        }
        case "DeleteDeliveryStream": {
          this.service.deleteDeliveryStream(body.DeliveryStreamName, ctx.region);
          return this.json({}, ctx);
        }
        case "PutRecord": {
          const recordId = this.service.putRecord(body.DeliveryStreamName, body.Record.Data, ctx.region);
          return this.json({ RecordId: recordId, Encrypted: false }, ctx);
        }
        case "PutRecordBatch": {
          const result = this.service.putRecordBatch(body.DeliveryStreamName, body.Records, ctx.region);
          return this.json({
            FailedPutCount: result.failedPutCount,
            RequestResponses: result.requestResponses,
            Encrypted: false,
          }, ctx);
        }
        case "UpdateDestination": {
          const destUpdate = body.S3DestinationUpdate ?? body.ExtendedS3DestinationUpdate ?? body.RedshiftDestinationUpdate ?? body.ElasticsearchDestinationUpdate ?? body.HttpEndpointDestinationUpdate ?? {};
          this.service.updateDestination(
            body.DeliveryStreamName,
            body.DestinationId,
            body.CurrentDeliveryStreamVersionId,
            destUpdate,
            ctx.region,
          );
          return this.json({}, ctx);
        }
        case "ListTagsForDeliveryStream": {
          const result = this.service.listTagsForDeliveryStream(body.DeliveryStreamName, ctx.region, body.ExclusiveStartTagKey, body.Limit);
          return this.json({ Tags: result.tags, HasMoreTags: result.hasMoreTags }, ctx);
        }
        case "TagDeliveryStream": {
          this.service.tagDeliveryStream(body.DeliveryStreamName, body.Tags, ctx.region);
          return this.json({}, ctx);
        }
        case "UntagDeliveryStream": {
          this.service.untagDeliveryStream(body.DeliveryStreamName, body.TagKeys, ctx.region);
          return this.json({}, ctx);
        }
        case "StartDeliveryStreamEncryption": {
          const enc = body.DeliveryStreamEncryptionConfigurationInput ?? {};
          this.service.startDeliveryStreamEncryption(body.DeliveryStreamName, enc.KeyType, enc.KeyARN, ctx.region);
          return this.json({}, ctx);
        }
        case "StopDeliveryStreamEncryption": {
          this.service.stopDeliveryStreamEncryption(body.DeliveryStreamName, ctx.region);
          return this.json({}, ctx);
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
