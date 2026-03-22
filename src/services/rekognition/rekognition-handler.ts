import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { RekognitionService } from "./rekognition-service";

export class RekognitionHandler {
  constructor(private service: RekognitionService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "DetectFaces":
          return this.json(this.service.detectFaces(body.Image), ctx);
        case "DetectLabels":
          return this.json(this.service.detectLabels(body.Image), ctx);
        case "DetectText":
          return this.json(this.service.detectText(body.Image), ctx);
        case "DetectModerationLabels":
          return this.json(this.service.detectModerationLabels(body.Image), ctx);
        case "CompareFaces":
          return this.json(this.service.compareFaces(body.SourceImage, body.TargetImage, body.SimilarityThreshold), ctx);
        case "RecognizeCelebrities":
          return this.json(this.service.recognizeCelebrities(body.Image), ctx);
        case "CreateCollection":
          return this.createCollection(body, ctx);
        case "DescribeCollection":
          return this.describeCollection(body, ctx);
        case "ListCollections":
          return this.json({ CollectionIds: this.service.listCollections() }, ctx);
        case "DeleteCollection":
          this.service.deleteCollection(body.CollectionId);
          return this.json({ StatusCode: 200 }, ctx);
        case "IndexFaces":
          return this.json(this.service.indexFaces(body.CollectionId, body.Image, body.ExternalImageId), ctx);
        case "SearchFaces":
          return this.json(this.service.searchFaces(body.CollectionId, body.FaceId, body.MaxFaces), ctx);
        case "StartFaceDetection": {
          const jobId = this.service.startFaceDetection(body.Video);
          return this.json({ JobId: jobId }, ctx);
        }
        case "GetFaceDetection":
          return this.json(this.service.getFaceDetection(body.JobId), ctx);
        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createCollection(body: any, ctx: RequestContext): Response {
    const collection = this.service.createCollection(body.CollectionId, ctx.region);
    return this.json({
      CollectionArn: collection.collectionArn,
      FaceModelVersion: "6.0",
      StatusCode: 200,
    }, ctx);
  }

  private describeCollection(body: any, ctx: RequestContext): Response {
    const collection = this.service.describeCollection(body.CollectionId);
    return this.json({
      CollectionARN: collection.collectionArn,
      FaceCount: collection.faceCount,
      FaceModelVersion: "6.0",
      CreationTimestamp: Math.floor(new Date(collection.createdAt).getTime() / 1000),
    }, ctx);
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
