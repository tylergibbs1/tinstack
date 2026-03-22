import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ServiceDiscoveryService } from "./servicediscovery-service";

export class ServiceDiscoveryHandler {
  constructor(private service: ServiceDiscoveryService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreatePrivateDnsNamespace":
          return this.createPrivateDnsNamespace(body, ctx);
        case "CreatePublicDnsNamespace":
          return this.createPublicDnsNamespace(body, ctx);
        case "GetNamespace":
          return this.getNamespace(body, ctx);
        case "ListNamespaces":
          return this.listNamespaces(ctx);
        case "DeleteNamespace":
          return this.deleteNamespace(body, ctx);
        case "CreateService":
          return this.createServiceOp(body, ctx);
        case "GetService":
          return this.getService(body, ctx);
        case "ListServices":
          return this.listServicesOp(ctx);
        case "DeleteService":
          return this.deleteService(body, ctx);
        case "RegisterInstance":
          return this.registerInstance(body, ctx);
        case "DeregisterInstance":
          return this.deregisterInstance(body, ctx);
        case "ListInstances":
          return this.listInstances(body, ctx);
        case "DiscoverInstances":
          return this.discoverInstances(body, ctx);
        case "TagResource":
          return this.tagResource(body, ctx);
        case "UntagResource":
          return this.untagResource(body, ctx);
        case "ListTagsForResource":
          return this.listTagsForResource(body, ctx);
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

  private createPrivateDnsNamespace(body: any, ctx: RequestContext): Response {
    const result = this.service.createPrivateDnsNamespace({
      name: body.Name,
      vpc: body.Vpc,
      description: body.Description,
      creatorRequestId: body.CreatorRequestId,
      tags: body.Tags ? this.tagsArrayToMap(body.Tags) : undefined,
    });
    return this.json({ OperationId: result.operationId }, ctx);
  }

  private createPublicDnsNamespace(body: any, ctx: RequestContext): Response {
    const result = this.service.createPublicDnsNamespace({
      name: body.Name,
      description: body.Description,
      creatorRequestId: body.CreatorRequestId,
      tags: body.Tags ? this.tagsArrayToMap(body.Tags) : undefined,
    });
    return this.json({ OperationId: result.operationId }, ctx);
  }

  private getNamespace(body: any, ctx: RequestContext): Response {
    const ns = this.service.getNamespace(body.Id);
    return this.json({
      Namespace: {
        Id: ns.id,
        Arn: ns.arn,
        Name: ns.name,
        Type: ns.type,
        Description: ns.description,
        Properties: ns.properties,
        CreateDate: ns.createDate,
        CreatorRequestId: ns.creatorRequestId,
      },
    }, ctx);
  }

  private listNamespaces(ctx: RequestContext): Response {
    const namespaces = this.service.listNamespaces();
    return this.json({
      Namespaces: namespaces.map((ns) => ({
        Id: ns.id,
        Arn: ns.arn,
        Name: ns.name,
        Type: ns.type,
        Description: ns.description,
        Properties: ns.properties,
        CreateDate: ns.createDate,
      })),
    }, ctx);
  }

  private deleteNamespace(body: any, ctx: RequestContext): Response {
    const operationId = this.service.deleteNamespace(body.Id);
    return this.json({ OperationId: operationId }, ctx);
  }

  private createServiceOp(body: any, ctx: RequestContext): Response {
    const svc = this.service.createService({
      name: body.Name,
      namespaceId: body.NamespaceId,
      description: body.Description,
      creatorRequestId: body.CreatorRequestId,
      dnsConfig: body.DnsConfig,
      healthCheckConfig: body.HealthCheckConfig,
      healthCheckCustomConfig: body.HealthCheckCustomConfig,
      type: body.Type,
      tags: body.Tags ? this.tagsArrayToMap(body.Tags) : undefined,
    });
    return this.json({
      Service: {
        Id: svc.id,
        Arn: svc.arn,
        Name: svc.name,
        NamespaceId: svc.namespaceId,
        Description: svc.description,
        DnsConfig: svc.dnsConfig,
        HealthCheckConfig: svc.healthCheckConfig,
        HealthCheckCustomConfig: svc.healthCheckCustomConfig,
        Type: svc.type,
        CreateDate: svc.createDate,
      },
    }, ctx);
  }

  private getService(body: any, ctx: RequestContext): Response {
    const svc = this.service.getService(body.Id);
    return this.json({
      Service: {
        Id: svc.id,
        Arn: svc.arn,
        Name: svc.name,
        NamespaceId: svc.namespaceId,
        Description: svc.description,
        DnsConfig: svc.dnsConfig,
        HealthCheckConfig: svc.healthCheckConfig,
        CreateDate: svc.createDate,
      },
    }, ctx);
  }

  private listServicesOp(ctx: RequestContext): Response {
    const services = this.service.listServices();
    return this.json({
      Services: services.map((s) => ({
        Id: s.id,
        Arn: s.arn,
        Name: s.name,
        NamespaceId: s.namespaceId,
        Description: s.description,
        Type: s.type,
        CreateDate: s.createDate,
      })),
    }, ctx);
  }

  private deleteService(body: any, ctx: RequestContext): Response {
    this.service.deleteService(body.Id);
    return this.json({}, ctx);
  }

  private registerInstance(body: any, ctx: RequestContext): Response {
    const operationId = this.service.registerInstance({
      serviceId: body.ServiceId,
      instanceId: body.InstanceId,
      creatorRequestId: body.CreatorRequestId,
      attributes: body.Attributes,
    });
    return this.json({ OperationId: operationId }, ctx);
  }

  private deregisterInstance(body: any, ctx: RequestContext): Response {
    const operationId = this.service.deregisterInstance(body.ServiceId, body.InstanceId);
    return this.json({ OperationId: operationId }, ctx);
  }

  private listInstances(body: any, ctx: RequestContext): Response {
    const instances = this.service.listInstances(body.ServiceId);
    return this.json({
      Instances: instances.map((i) => ({
        Id: i.instanceId,
        Attributes: i.attributes,
      })),
    }, ctx);
  }

  private discoverInstances(body: any, ctx: RequestContext): Response {
    const instances = this.service.discoverInstances(body.NamespaceName, body.ServiceName);
    return this.json({
      Instances: instances.map((i) => ({
        InstanceId: i.instanceId,
        NamespaceName: body.NamespaceName,
        ServiceName: body.ServiceName,
        HealthStatus: "HEALTHY",
        Attributes: i.attributes,
      })),
    }, ctx);
  }

  private tagResource(body: any, ctx: RequestContext): Response {
    const tags = this.tagsArrayToMap(body.Tags ?? []);
    this.service.tagResource(body.ResourceARN, tags);
    return this.json({}, ctx);
  }

  private untagResource(body: any, ctx: RequestContext): Response {
    this.service.untagResource(body.ResourceARN, body.TagKeys ?? []);
    return this.json({}, ctx);
  }

  private listTagsForResource(body: any, ctx: RequestContext): Response {
    const tags = this.service.listTagsForResource(body.ResourceARN);
    return this.json({
      Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    }, ctx);
  }

  private tagsArrayToMap(tags: Array<{ Key: string; Value: string }>): Record<string, string> {
    const map: Record<string, string> = {};
    for (const t of tags) map[t.Key] = t.Value;
    return map;
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
