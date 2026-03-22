import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AppMeshService } from "./appmesh-service";

export class AppMeshHandler {
  constructor(private service: AppMeshService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // List/Create meshes
      if ((path === "/v20190125/meshes" || path === "/v20190125/meshes/") && method === "GET") {
        const meshes = this.service.listMeshes();
        return this.json({ meshes: meshes.map((m) => ({ meshName: m.meshName, arn: m.arn, status: m.status, metadata: m.metadata })) }, ctx);
      }
      if ((path === "/v20190125/meshes" || path === "/v20190125/meshes/") && method === "PUT") {
        const body = await req.json();
        const mesh = this.service.createMesh(body.meshName, body.spec, body.tags?.reduce?.((a: any, t: any) => ({ ...a, [t.key]: t.value }), {}), ctx.region);
        return this.json(this.formatMesh(mesh), ctx);
      }

      // Single mesh
      const meshMatch = path.match(/^\/v20190125\/meshes\/([^/]+)$/);
      if (meshMatch) {
        const name = decodeURIComponent(meshMatch[1]);
        if (method === "GET") return this.json(this.formatMesh(this.service.describeMesh(name)), ctx);
        if (method === "DELETE") return this.json(this.formatMesh(this.service.deleteMesh(name)), ctx);
      }

      // Virtual services
      const vsListMatch = path.match(/^\/v20190125\/meshes\/([^/]+)\/virtualServices$/);
      if (vsListMatch) {
        const meshName = decodeURIComponent(vsListMatch[1]);
        if (method === "GET") return this.json({ virtualServices: this.service.listVirtualServices(meshName).map((v) => ({ meshName: v.meshName, virtualServiceName: v.virtualServiceName, arn: v.arn, status: v.status })) }, ctx);
        if (method === "PUT") {
          const body = await req.json();
          const vs = this.service.createVirtualService(meshName, body.virtualServiceName, body.spec, ctx.region);
          return this.json(this.formatVs(vs), ctx);
        }
      }

      const vsMatch = path.match(/^\/v20190125\/meshes\/([^/]+)\/virtualServices\/([^/]+)$/);
      if (vsMatch && method === "GET") {
        const vs = this.service.describeVirtualService(decodeURIComponent(vsMatch[1]), decodeURIComponent(vsMatch[2]));
        return this.json(this.formatVs(vs), ctx);
      }

      // Virtual nodes
      const vnListMatch = path.match(/^\/v20190125\/meshes\/([^/]+)\/virtualNodes$/);
      if (vnListMatch) {
        const meshName = decodeURIComponent(vnListMatch[1]);
        if (method === "GET") return this.json({ virtualNodes: this.service.listVirtualNodes(meshName).map((v) => ({ meshName: v.meshName, virtualNodeName: v.virtualNodeName, arn: v.arn, status: v.status })) }, ctx);
        if (method === "PUT") {
          const body = await req.json();
          const vn = this.service.createVirtualNode(meshName, body.virtualNodeName, body.spec, ctx.region);
          return this.json(this.formatVn(vn), ctx);
        }
      }

      const vnMatch = path.match(/^\/v20190125\/meshes\/([^/]+)\/virtualNodes\/([^/]+)$/);
      if (vnMatch && method === "GET") {
        const vn = this.service.describeVirtualNode(decodeURIComponent(vnMatch[1]), decodeURIComponent(vnMatch[2]));
        return this.json(this.formatVn(vn), ctx);
      }

      // Virtual routers
      const vrListMatch = path.match(/^\/v20190125\/meshes\/([^/]+)\/virtualRouters$/);
      if (vrListMatch && method === "PUT") {
        const meshName = decodeURIComponent(vrListMatch[1]);
        const body = await req.json();
        const vr = this.service.createVirtualRouter(meshName, body.virtualRouterName, body.spec, ctx.region);
        return this.json({ meshName: vr.meshName, virtualRouterName: vr.virtualRouterName, arn: vr.arn, status: vr.status, spec: vr.spec, metadata: vr.metadata }, ctx);
      }

      // Routes
      const routeListMatch = path.match(/^\/v20190125\/meshes\/([^/]+)\/virtualRouter\/([^/]+)\/routes$/);
      if (routeListMatch && method === "PUT") {
        const body = await req.json();
        const route = this.service.createRoute(decodeURIComponent(routeListMatch[1]), decodeURIComponent(routeListMatch[2]), body.routeName, body.spec, ctx.region);
        return this.json({ meshName: route.meshName, virtualRouterName: route.virtualRouterName, routeName: route.routeName, arn: route.arn, status: route.status, spec: route.spec, metadata: route.metadata }, ctx);
      }

      // Tags
      if (path.startsWith("/v20190125/tag")) {
        const arn = url.searchParams.get("resourceArn") ?? "";
        if (method === "PUT") {
          const body = await req.json();
          this.service.tagResource(arn, body.tags ?? []);
          return this.json({}, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("tagKeys");
          this.service.untagResource(arn, tagKeys);
          return this.json({}, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown App Mesh operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private formatMesh(m: any) { return { meshName: m.meshName, arn: m.arn, status: m.status, spec: m.spec, metadata: m.metadata }; }
  private formatVs(v: any) { return { meshName: v.meshName, virtualServiceName: v.virtualServiceName, arn: v.arn, status: v.status, spec: v.spec, metadata: v.metadata }; }
  private formatVn(v: any) { return { meshName: v.meshName, virtualNodeName: v.virtualNodeName, arn: v.arn, status: v.status, spec: v.spec, metadata: v.metadata }; }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
