import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AppConfigService } from "./appconfig-service";

export class AppConfigHandler {
  constructor(private service: AppConfigService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Hosted Configuration Versions ---
      // POST /applications/{appId}/configurationprofiles/{profileId}/hostedconfigurationversions
      const hostedVersionsMatch = path.match(
        /^\/applications\/([^/]+)\/configurationprofiles\/([^/]+)\/hostedconfigurationversions$/,
      );
      if (hostedVersionsMatch && method === "POST") {
        const [, appId, profileId] = hostedVersionsMatch;
        const contentType = req.headers.get("content-type") ?? "application/json";
        const description = req.headers.get("description") ?? undefined;
        const content = new Uint8Array(await req.arrayBuffer());
        const version = this.service.createHostedConfigurationVersion(
          appId, profileId, content, contentType, description, ctx.region,
        );
        return new Response(version.Content, {
          status: 201,
          headers: {
            "Content-Type": version.ContentType,
            "x-amzn-RequestId": ctx.requestId,
            "Application-Id": version.ApplicationId,
            "Configuration-Profile-Id": version.ConfigurationProfileId,
            "Version-Number": String(version.VersionNumber),
          },
        });
      }

      // GET /applications/{appId}/configurationprofiles/{profileId}/hostedconfigurationversions/{version}
      const hostedVersionMatch = path.match(
        /^\/applications\/([^/]+)\/configurationprofiles\/([^/]+)\/hostedconfigurationversions\/(\d+)$/,
      );
      if (hostedVersionMatch && method === "GET") {
        const [, appId, profileId, versionStr] = hostedVersionMatch;
        const version = this.service.getHostedConfigurationVersion(
          appId, profileId, parseInt(versionStr, 10), ctx.region,
        );
        return new Response(version.Content, {
          status: 200,
          headers: {
            "Content-Type": version.ContentType,
            "x-amzn-RequestId": ctx.requestId,
            "Application-Id": version.ApplicationId,
            "Configuration-Profile-Id": version.ConfigurationProfileId,
            "Version-Number": String(version.VersionNumber),
          },
        });
      }

      // --- Deployments ---
      // POST /applications/{appId}/environments/{envId}/deployments
      const deploymentsMatch = path.match(
        /^\/applications\/([^/]+)\/environments\/([^/]+)\/deployments$/,
      );
      if (deploymentsMatch) {
        const [, appId, envId] = deploymentsMatch;
        if (method === "POST") {
          const body = await req.json();
          const deployment = this.service.startDeployment(
            appId, envId,
            body.ConfigurationProfileId,
            body.ConfigurationVersion,
            body.DeploymentStrategyId,
            body.Description,
            ctx.region,
          );
          return this.json(deploymentToJson(deployment), ctx, 201);
        }
        if (method === "GET") {
          const deployments = this.service.listDeployments(appId, envId, ctx.region);
          return this.json({ Items: deployments.map(deploymentSummaryToJson) }, ctx);
        }
      }

      // GET /applications/{appId}/environments/{envId}/deployments/{number}
      const deploymentMatch = path.match(
        /^\/applications\/([^/]+)\/environments\/([^/]+)\/deployments\/(\d+)$/,
      );
      if (deploymentMatch && method === "GET") {
        const [, appId, envId, numStr] = deploymentMatch;
        const deployment = this.service.getDeployment(appId, envId, parseInt(numStr, 10), ctx.region);
        return this.json(deploymentToJson(deployment), ctx);
      }

      // --- Configuration Profiles ---
      // POST/GET /applications/{appId}/configurationprofiles
      const profilesMatch = path.match(/^\/applications\/([^/]+)\/configurationprofiles$/);
      if (profilesMatch) {
        const appId = profilesMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const profile = this.service.createConfigurationProfile(
            appId, body.Name, body.LocationUri, body.Description, body.Type, body.Validators, ctx.region,
          );
          return this.json(profileToJson(profile), ctx, 201);
        }
        if (method === "GET") {
          const profiles = this.service.listConfigurationProfiles(appId, ctx.region);
          return this.json({ Items: profiles.map(profileToJson) }, ctx);
        }
      }

      // GET /applications/{appId}/configurationprofiles/{profileId}
      const profileMatch = path.match(/^\/applications\/([^/]+)\/configurationprofiles\/([^/]+)$/);
      if (profileMatch && method === "GET") {
        const [, appId, profileId] = profileMatch;
        const profile = this.service.getConfigurationProfile(appId, profileId, ctx.region);
        return this.json(profileToJson(profile), ctx);
      }

      // --- Environments ---
      // POST/GET /applications/{appId}/environments
      const envsMatch = path.match(/^\/applications\/([^/]+)\/environments$/);
      if (envsMatch) {
        const appId = envsMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const env = this.service.createEnvironment(appId, body.Name, body.Description, ctx.region);
          return this.json(envToJson(env), ctx, 201);
        }
        if (method === "GET") {
          const envs = this.service.listEnvironments(appId, ctx.region);
          return this.json({ Items: envs.map(envToJson) }, ctx);
        }
      }

      // GET/DELETE /applications/{appId}/environments/{envId}
      const envMatch = path.match(/^\/applications\/([^/]+)\/environments\/([^/]+)$/);
      if (envMatch) {
        const [, appId, envId] = envMatch;
        if (method === "GET") return this.json(envToJson(this.service.getEnvironment(appId, envId, ctx.region)), ctx);
        if (method === "DELETE") { this.service.deleteEnvironment(appId, envId, ctx.region); return this.empty(ctx); }
      }

      // --- Applications ---
      // POST/GET /applications
      if (path === "/applications" && method === "POST") {
        const body = await req.json();
        const app = this.service.createApplication(body.Name, body.Description, ctx.region);
        return this.json(appToJson(app), ctx, 201);
      }
      if (path === "/applications" && method === "GET") {
        const apps = this.service.listApplications(ctx.region);
        return this.json({ Items: apps.map(appToJson) }, ctx);
      }

      // GET/DELETE /applications/{appId}
      const appMatch = path.match(/^\/applications\/([^/]+)$/);
      if (appMatch) {
        const appId = appMatch[1];
        if (method === "GET") return this.json(appToJson(this.service.getApplication(appId, ctx.region)), ctx);
        if (method === "DELETE") { this.service.deleteApplication(appId, ctx.region); return this.empty(ctx); }
      }

      return jsonErrorResponse(
        new AwsError("NotFoundException", `Unknown AppConfig operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private empty(ctx: RequestContext): Response {
    return new Response(null, { status: 204, headers: { "x-amzn-RequestId": ctx.requestId } });
  }
}

function appToJson(a: any) {
  return { Id: a.Id, Name: a.Name, Description: a.Description };
}

function envToJson(e: any) {
  return {
    ApplicationId: e.ApplicationId, Id: e.EnvironmentId, Name: e.Name,
    Description: e.Description, State: e.State,
  };
}

function profileToJson(p: any) {
  return {
    ApplicationId: p.ApplicationId, Id: p.Id, Name: p.Name,
    Description: p.Description, LocationUri: p.LocationUri, Type: p.Type,
    Validators: p.Validators,
  };
}

function deploymentToJson(d: any) {
  return {
    ApplicationId: d.ApplicationId, EnvironmentId: d.EnvironmentId,
    DeploymentNumber: d.DeploymentNumber, ConfigurationName: d.ConfigurationName,
    ConfigurationProfileId: d.ConfigurationProfileId,
    ConfigurationVersion: d.ConfigurationVersion,
    DeploymentStrategyId: d.DeploymentStrategyId, State: d.State,
    StartedAt: d.StartedAt, CompletedAt: d.CompletedAt, Description: d.Description,
  };
}

function deploymentSummaryToJson(d: any) {
  return {
    DeploymentNumber: d.DeploymentNumber, ConfigurationName: d.ConfigurationName,
    ConfigurationVersion: d.ConfigurationVersion, State: d.State,
    StartedAt: d.StartedAt, CompletedAt: d.CompletedAt,
  };
}
