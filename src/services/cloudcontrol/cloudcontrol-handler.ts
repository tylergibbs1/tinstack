import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CloudControlService } from "./cloudcontrol-service";

export class CloudControlHandler {
  constructor(private service: CloudControlService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateResource": {
          const status = this.service.createResource(body.TypeName, body.DesiredState);
          return this.json({ ProgressEvent: this.statusToJson(status) }, ctx);
        }
        case "GetResource": {
          const resource = this.service.getResource(body.TypeName, body.Identifier);
          return this.json({
            TypeName: resource.typeName,
            ResourceDescription: {
              Identifier: resource.identifier,
              Properties: resource.properties,
            },
          }, ctx);
        }
        case "ListResources": {
          const resources = this.service.listResources(body.TypeName);
          return this.json({
            TypeName: body.TypeName,
            ResourceDescriptions: resources.map((r) => ({
              Identifier: r.identifier,
              Properties: r.properties,
            })),
          }, ctx);
        }
        case "UpdateResource": {
          const status = this.service.updateResource(body.TypeName, body.Identifier, body.PatchDocument);
          return this.json({ ProgressEvent: this.statusToJson(status) }, ctx);
        }
        case "DeleteResource": {
          const status = this.service.deleteResource(body.TypeName, body.Identifier);
          return this.json({ ProgressEvent: this.statusToJson(status) }, ctx);
        }
        case "GetResourceRequestStatus": {
          const status = this.service.getResourceRequestStatus(body.RequestToken);
          return this.json({ ProgressEvent: this.statusToJson(status) }, ctx);
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
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private statusToJson(s: any): any {
    return {
      RequestToken: s.requestToken,
      OperationStatus: s.operationStatus,
      TypeName: s.typeName,
      Identifier: s.identifier,
      Operation: s.operation,
      StatusMessage: s.statusMessage,
      EventTime: s.eventTime,
    };
  }
}
