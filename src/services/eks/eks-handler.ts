import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EksService } from "./eks-service";

export class EksHandler {
  constructor(private service: EksService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Tag operations: /tags/{resourceArn}
      const tagsMatch = path.match(/^\/tags\/(.+)$/);
      if (tagsMatch) {
        const resourceArn = decodeURIComponent(tagsMatch[1]);
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(resourceArn, body.tags ?? {});
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const tags = this.service.listTagsForResource(resourceArn);
          return this.json({ tags }, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("tagKeys");
          this.service.untagResource(resourceArn, tagKeys);
          return this.json({}, ctx);
        }
      }

      // Fargate profiles: /clusters/{clusterName}/fargate-profiles[/{fargateProfileName}]
      const fargateProfileMatch = path.match(/^\/clusters\/([^/]+)\/fargate-profiles\/([^/]+)$/);
      if (fargateProfileMatch) {
        const [, clusterName, fargateProfileName] = fargateProfileMatch;
        if (method === "GET") {
          const fargateProfile = this.service.describeFargateProfile(clusterName, fargateProfileName, ctx.region);
          return this.json({ fargateProfile }, ctx);
        }
        if (method === "DELETE") {
          const fargateProfile = this.service.deleteFargateProfile(clusterName, fargateProfileName, ctx.region);
          return this.json({ fargateProfile }, ctx);
        }
      }

      const fargateListMatch = path.match(/^\/clusters\/([^/]+)\/fargate-profiles$/);
      if (fargateListMatch) {
        const clusterName = fargateListMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const fargateProfile = this.service.createFargateProfile(
            clusterName, body.fargateProfileName, body.podExecutionRoleArn,
            body.subnets, body.selectors, body.tags, ctx.region,
          );
          return this.json({ fargateProfile }, ctx);
        }
        if (method === "GET") {
          const fargateProfileNames = this.service.listFargateProfiles(clusterName, ctx.region);
          return this.json({ fargateProfileNames }, ctx);
        }
      }

      // Nodegroups: /clusters/{clusterName}/node-groups[/{nodegroupName}]
      const nodegroupMatch = path.match(/^\/clusters\/([^/]+)\/node-groups\/([^/]+)$/);
      if (nodegroupMatch) {
        const [, clusterName, nodegroupName] = nodegroupMatch;
        if (method === "GET") {
          const nodegroup = this.service.describeNodegroup(clusterName, nodegroupName, ctx.region);
          return this.json({ nodegroup }, ctx);
        }
        if (method === "DELETE") {
          const nodegroup = this.service.deleteNodegroup(clusterName, nodegroupName, ctx.region);
          return this.json({ nodegroup }, ctx);
        }
      }

      const nodegroupListMatch = path.match(/^\/clusters\/([^/]+)\/node-groups$/);
      if (nodegroupListMatch) {
        const clusterName = nodegroupListMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const nodegroup = this.service.createNodegroup(
            clusterName, body.nodegroupName, body.nodeRole, body.subnets,
            body.scalingConfig, body.instanceTypes, body.amiType,
            body.diskSize, body.capacityType, body.labels, body.tags, ctx.region,
          );
          return this.json({ nodegroup }, ctx);
        }
        if (method === "GET") {
          const nodegroups = this.service.listNodegroups(clusterName, ctx.region);
          return this.json({ nodegroups }, ctx);
        }
      }

      // UpdateClusterConfig: POST /clusters/{name}/update-config
      const updateConfigMatch = path.match(/^\/clusters\/([^/]+)\/update-config$/);
      if (updateConfigMatch && method === "POST") {
        const name = updateConfigMatch[1];
        const body = await req.json();
        this.service.updateClusterConfig(name, body.resourcesVpcConfig, body.logging, ctx.region);
        return this.json({
          update: { id: crypto.randomUUID(), status: "InProgress", type: "ConfigUpdate", createdAt: Date.now() / 1000 },
        }, ctx);
      }

      // Clusters: /clusters[/{name}]
      const clusterMatch = path.match(/^\/clusters\/([^/]+)$/);
      if (clusterMatch) {
        const name = clusterMatch[1];
        if (method === "GET") {
          const cluster = this.service.describeCluster(name, ctx.region);
          return this.json({ cluster }, ctx);
        }
        if (method === "DELETE") {
          const cluster = this.service.deleteCluster(name, ctx.region);
          return this.json({ cluster }, ctx);
        }
      }

      if (path === "/clusters") {
        if (method === "POST") {
          const body = await req.json();
          const cluster = this.service.createCluster(
            body.name, body.roleArn, body.resourcesVpcConfig,
            body.version, body.tags, ctx.region,
          );
          return this.json({ cluster }, ctx);
        }
        if (method === "GET") {
          const clusters = this.service.listClusters(ctx.region);
          return this.json({ clusters }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnsupportedOperation", `Unsupported: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
