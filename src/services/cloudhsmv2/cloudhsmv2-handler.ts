import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CloudHsmV2Service } from "./cloudhsmv2-service";

export class CloudHsmV2Handler {
  constructor(private service: CloudHsmV2Service) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateCluster": {
          const cluster = this.service.createCluster(
            body.HsmType, body.SubnetIds ?? [], ctx.region, body.TagList ? Object.fromEntries(body.TagList.map((t: any) => [t.Key, t.Value])) : undefined,
          );
          return this.json({ Cluster: this.clusterResponse(cluster) }, ctx);
        }
        case "DescribeClusters": {
          const clusters = this.service.describeClusters(body.Filters);
          return this.json({ Clusters: clusters.map(c => this.clusterResponse(c)) }, ctx);
        }
        case "DeleteCluster": {
          const cluster = this.service.deleteCluster(body.ClusterId);
          return this.json({ Cluster: this.clusterResponse(cluster) }, ctx);
        }
        case "CreateHsm": {
          const hsm = this.service.createHsm(body.ClusterId, body.AvailabilityZone);
          return this.json({ Hsm: hsm }, ctx);
        }
        case "DeleteHsm": {
          const hsmId = this.service.deleteHsm(body.ClusterId, body.HsmId ?? body.EniId ?? "");
          return this.json({ HsmId: hsmId }, ctx);
        }
        case "InitializeCluster": {
          const result = this.service.initializeCluster(body.ClusterId, body.SignedCert ?? "", body.TrustAnchor ?? "");
          return this.json({ State: result.state, StateMessage: result.stateMessage }, ctx);
        }
        case "TagResource": {
          const tags = Object.fromEntries((body.TagList ?? []).map((t: any) => [t.Key, t.Value]));
          this.service.tagResource(body.ResourceId, tags);
          return this.json({}, ctx);
        }
        case "UntagResource": {
          this.service.untagResource(body.ResourceId, body.TagKeyList ?? []);
          return this.json({}, ctx);
        }
        case "ListTags": {
          const tags = this.service.listTags(body.ResourceId);
          return this.json({ TagList: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown CloudHSMv2 action: ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private clusterResponse(c: any): any {
    return {
      ClusterId: c.clusterId, State: c.state, HsmType: c.hsmType,
      SubnetMapping: c.subnetMapping, Hsms: c.hsms, BackupPolicy: c.backupPolicy,
      SecurityGroup: c.securityGroup, CreateTimestamp: c.createTimestamp,
    };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
