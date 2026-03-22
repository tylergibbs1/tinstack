import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface Mesh { meshName: string; arn: string; status: { status: string }; metadata: { uid: string; createdAt: number; lastUpdatedAt: number; version: number }; spec: any; tags: Record<string, string>; }
interface VirtualService { meshName: string; virtualServiceName: string; arn: string; status: { status: string }; spec: any; metadata: { uid: string; createdAt: number; lastUpdatedAt: number; version: number }; }
interface VirtualNode { meshName: string; virtualNodeName: string; arn: string; status: { status: string }; spec: any; metadata: { uid: string; createdAt: number; lastUpdatedAt: number; version: number }; }
interface VirtualRouter { meshName: string; virtualRouterName: string; arn: string; status: { status: string }; spec: any; metadata: { uid: string; createdAt: number; lastUpdatedAt: number; version: number }; }
interface Route { meshName: string; virtualRouterName: string; routeName: string; arn: string; status: { status: string }; spec: any; metadata: { uid: string; createdAt: number; lastUpdatedAt: number; version: number }; }

export class AppMeshService {
  private meshes: StorageBackend<string, Mesh>;
  private virtualServices: StorageBackend<string, VirtualService>;
  private virtualNodes: StorageBackend<string, VirtualNode>;
  private virtualRouters: StorageBackend<string, VirtualRouter>;
  private routes: StorageBackend<string, Route>;

  constructor(private accountId: string) {
    this.meshes = new InMemoryStorage();
    this.virtualServices = new InMemoryStorage();
    this.virtualNodes = new InMemoryStorage();
    this.virtualRouters = new InMemoryStorage();
    this.routes = new InMemoryStorage();
  }

  private meta() { return { uid: crypto.randomUUID(), createdAt: Date.now() / 1000, lastUpdatedAt: Date.now() / 1000, version: 1 }; }

  createMesh(meshName: string, spec: any, tags: Record<string, string> | undefined, region: string): Mesh {
    if (this.meshes.has(meshName)) throw new AwsError("ConflictException", `Mesh ${meshName} already exists.`, 409);
    const mesh: Mesh = { meshName, arn: buildArn("appmesh", region, this.accountId, "mesh/", meshName), status: { status: "ACTIVE" }, metadata: this.meta(), spec: spec ?? {}, tags: tags ?? {} };
    this.meshes.set(meshName, mesh);
    return mesh;
  }

  describeMesh(meshName: string): Mesh {
    const mesh = this.meshes.get(meshName);
    if (!mesh) throw new AwsError("NotFoundException", `Mesh ${meshName} not found.`, 404);
    return mesh;
  }

  listMeshes(): Mesh[] { return this.meshes.values(); }

  deleteMesh(meshName: string): Mesh {
    const mesh = this.describeMesh(meshName);
    this.meshes.delete(meshName);
    mesh.status.status = "DELETED";
    return mesh;
  }

  createVirtualService(meshName: string, name: string, spec: any, region: string): VirtualService {
    this.describeMesh(meshName);
    const key = `${meshName}#${name}`;
    if (this.virtualServices.has(key)) throw new AwsError("ConflictException", `Virtual service ${name} already exists.`, 409);
    const vs: VirtualService = { meshName, virtualServiceName: name, arn: buildArn("appmesh", region, this.accountId, `mesh/${meshName}/virtualService/`, name), status: { status: "ACTIVE" }, spec: spec ?? {}, metadata: this.meta() };
    this.virtualServices.set(key, vs);
    return vs;
  }

  describeVirtualService(meshName: string, name: string): VirtualService {
    const vs = this.virtualServices.get(`${meshName}#${name}`);
    if (!vs) throw new AwsError("NotFoundException", `Virtual service ${name} not found.`, 404);
    return vs;
  }

  listVirtualServices(meshName: string): VirtualService[] { return this.virtualServices.values().filter((v) => v.meshName === meshName); }

  createVirtualNode(meshName: string, name: string, spec: any, region: string): VirtualNode {
    this.describeMesh(meshName);
    const key = `${meshName}#${name}`;
    if (this.virtualNodes.has(key)) throw new AwsError("ConflictException", `Virtual node ${name} already exists.`, 409);
    const vn: VirtualNode = { meshName, virtualNodeName: name, arn: buildArn("appmesh", region, this.accountId, `mesh/${meshName}/virtualNode/`, name), status: { status: "ACTIVE" }, spec: spec ?? {}, metadata: this.meta() };
    this.virtualNodes.set(key, vn);
    return vn;
  }

  describeVirtualNode(meshName: string, name: string): VirtualNode {
    const vn = this.virtualNodes.get(`${meshName}#${name}`);
    if (!vn) throw new AwsError("NotFoundException", `Virtual node ${name} not found.`, 404);
    return vn;
  }

  listVirtualNodes(meshName: string): VirtualNode[] { return this.virtualNodes.values().filter((v) => v.meshName === meshName); }

  createVirtualRouter(meshName: string, name: string, spec: any, region: string): VirtualRouter {
    this.describeMesh(meshName);
    const key = `${meshName}#${name}`;
    if (this.virtualRouters.has(key)) throw new AwsError("ConflictException", `Virtual router ${name} already exists.`, 409);
    const vr: VirtualRouter = { meshName, virtualRouterName: name, arn: buildArn("appmesh", region, this.accountId, `mesh/${meshName}/virtualRouter/`, name), status: { status: "ACTIVE" }, spec: spec ?? {}, metadata: this.meta() };
    this.virtualRouters.set(key, vr);
    return vr;
  }

  createRoute(meshName: string, virtualRouterName: string, routeName: string, spec: any, region: string): Route {
    this.describeMesh(meshName);
    const key = `${meshName}#${virtualRouterName}#${routeName}`;
    if (this.routes.has(key)) throw new AwsError("ConflictException", `Route ${routeName} already exists.`, 409);
    const route: Route = { meshName, virtualRouterName, routeName, arn: buildArn("appmesh", region, this.accountId, `mesh/${meshName}/virtualRouter/${virtualRouterName}/route/`, routeName), status: { status: "ACTIVE" }, spec: spec ?? {}, metadata: this.meta() };
    this.routes.set(key, route);
    return route;
  }

  tagResource(arn: string, tags: { key: string; value: string }[]): void {
    const mesh = this.meshes.values().find((m) => m.arn === arn);
    if (mesh) { for (const t of tags) mesh.tags[t.key] = t.value; return; }
    throw new AwsError("NotFoundException", `Resource ${arn} not found.`, 404);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const mesh = this.meshes.values().find((m) => m.arn === arn);
    if (mesh) { for (const k of tagKeys) delete mesh.tags[k]; return; }
    throw new AwsError("NotFoundException", `Resource ${arn} not found.`, 404);
  }
}
