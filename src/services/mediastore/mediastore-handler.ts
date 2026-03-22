import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { MediaStoreService } from "./mediastore-service";

export class MediaStoreHandler {
  constructor(private service: MediaStoreService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateContainer": {
          const container = this.service.createContainer(body.ContainerName, body.Tags, ctx.region);
          return this.json({ Container: this.containerToJson(container) }, ctx);
        }
        case "DescribeContainer": {
          const container = this.service.describeContainer(body.ContainerName);
          return this.json({ Container: this.containerToJson(container) }, ctx);
        }
        case "ListContainers": {
          const containers = this.service.listContainers();
          return this.json({ Containers: containers.map((c) => this.containerToJson(c)) }, ctx);
        }
        case "DeleteContainer": {
          this.service.deleteContainer(body.ContainerName);
          return this.json({}, ctx);
        }
        case "PutContainerPolicy": {
          this.service.putContainerPolicy(body.ContainerName, body.Policy);
          return this.json({}, ctx);
        }
        case "GetContainerPolicy": {
          const policy = this.service.getContainerPolicy(body.ContainerName);
          return this.json({ Policy: policy }, ctx);
        }
        case "PutLifecyclePolicy": {
          this.service.putLifecyclePolicy(body.ContainerName, body.LifecyclePolicy);
          return this.json({}, ctx);
        }
        case "GetLifecyclePolicy": {
          const policy = this.service.getLifecyclePolicy(body.ContainerName);
          return this.json({ LifecyclePolicy: policy }, ctx);
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

  private containerToJson(c: any): any {
    return {
      ARN: c.containerARN, Name: c.name, Endpoint: c.endpoint,
      Status: c.status, CreationTime: c.creationTime,
      AccessLoggingEnabled: c.accessLoggingEnabled,
    };
  }
}
