import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DirectoryServiceService } from "./directory-service-service";

export class DirectoryServiceHandler {
  constructor(private service: DirectoryServiceService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDirectory": {
          const id = this.service.createDirectory(body.Name, body.Size, body.Password, body.VpcSettings, ctx.region);
          return this.json({ DirectoryId: id }, ctx);
        }
        case "CreateMicrosoftAD": {
          const id = this.service.createMicrosoftAD(body.Name, body.Password, body.Edition, body.VpcSettings, ctx.region);
          return this.json({ DirectoryId: id }, ctx);
        }
        case "ConnectDirectory": {
          const id = this.service.connectDirectory(body.Name, body.Size, body.Password, body.ConnectSettings, ctx.region);
          return this.json({ DirectoryId: id }, ctx);
        }
        case "DescribeDirectories": {
          const dirs = this.service.describeDirectories(body.DirectoryIds);
          return this.json({ DirectoryDescriptions: dirs.map((d) => ({ DirectoryId: d.directoryId, Name: d.name, Type: d.type, Size: d.size, Alias: d.alias, Stage: d.stage, DnsIpAddrs: d.dnsIpAddrs, VpcSettings: d.vpcSettings, ConnectSettings: d.connectSettings, CreatedDateTime: d.createdDateTime })) }, ctx);
        }
        case "DeleteDirectory": {
          const id = this.service.deleteDirectory(body.DirectoryId);
          return this.json({ DirectoryId: id }, ctx);
        }
        case "CreateAlias": {
          const result = this.service.createAlias(body.DirectoryId, body.Alias);
          return this.json(result, ctx);
        }
        case "CreateConditionalForwarder":
          this.service.createConditionalForwarder(body.DirectoryId, body.RemoteDomainName, body.DnsIpAddrs);
          return this.json({}, ctx);
        case "DescribeConditionalForwarders": {
          const fwds = this.service.describeConditionalForwarders(body.DirectoryId);
          return this.json({ ConditionalForwarders: fwds.map((f) => ({ RemoteDomainName: f.remoteDomainName, DnsIpAddrs: f.dnsIpAddrs, ReplicationScope: f.replicationScope })) }, ctx);
        }
        case "CreateTrust": {
          const trustId = this.service.createTrust(body.DirectoryId, body.RemoteDomainName, body.TrustPassword, body.TrustDirection, body.TrustType);
          return this.json({ TrustId: trustId }, ctx);
        }
        case "DescribeTrusts": {
          const trusts = this.service.describeTrusts(body.DirectoryId, body.TrustIds);
          return this.json({ Trusts: trusts.map((t) => ({ TrustId: t.trustId, DirectoryId: t.directoryId, RemoteDomainName: t.remoteDomainName, TrustType: t.trustType, TrustDirection: t.trustDirection, TrustState: t.trustState, CreatedDateTime: t.createdDateTime })) }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId } });
  }
}
