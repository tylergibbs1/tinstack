import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlResponse } from "../../core/xml";
import type { ElasticBeanstalkService, BeanstalkApp, BeanstalkEnv, AppVersion } from "./elastic-beanstalk-service";

const NS = "http://elasticbeanstalk.amazonaws.com/docs/2010-12-01/";

export class ElasticBeanstalkQueryHandler {
  constructor(private service: ElasticBeanstalkService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateApplication": return this.createApplication(params, ctx);
        case "DescribeApplications": return this.describeApplications(params, ctx);
        case "DeleteApplication": return this.deleteApplication(params, ctx);
        case "CreateApplicationVersion": return this.createApplicationVersion(params, ctx);
        case "DescribeApplicationVersions": return this.describeApplicationVersions(params, ctx);
        case "CreateEnvironment": return this.createEnvironment(params, ctx);
        case "DescribeEnvironments": return this.describeEnvironments(params, ctx);
        case "TerminateEnvironment": return this.terminateEnvironment(params, ctx);
        case "UpdateEnvironment": return this.updateEnvironment(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createApplication(params: URLSearchParams, ctx: RequestContext): Response {
    const app = this.service.createApplication(params.get("ApplicationName")!, params.get("Description") ?? undefined, ctx.region);
    return xmlResponse(xmlEnvelope("CreateApplication", ctx.requestId, `<Application>${this.appXml(app)}</Application>`, NS), ctx.requestId);
  }

  private describeApplications(params: URLSearchParams, ctx: RequestContext): Response {
    const names = this.extractList(params, "ApplicationNames.member");
    const apps = this.service.describeApplications(names.length ? names : undefined);
    const xml = new XmlBuilder().start("Applications");
    for (const app of apps) xml.raw(`<member>${this.appXml(app)}</member>`);
    xml.end("Applications");
    return xmlResponse(xmlEnvelope("DescribeApplications", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteApplication(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteApplication(params.get("ApplicationName")!);
    return xmlResponse(xmlEnvelope("DeleteApplication", ctx.requestId, "", NS), ctx.requestId);
  }

  private createApplicationVersion(params: URLSearchParams, ctx: RequestContext): Response {
    const version = this.service.createApplicationVersion(
      params.get("ApplicationName")!,
      params.get("VersionLabel")!,
      params.get("Description") ?? undefined,
      params.get("SourceBundle.S3Bucket") ? { s3Bucket: params.get("SourceBundle.S3Bucket")!, s3Key: params.get("SourceBundle.S3Key")! } : undefined,
    );
    return xmlResponse(xmlEnvelope("CreateApplicationVersion", ctx.requestId, `<ApplicationVersion>${this.versionXml(version)}</ApplicationVersion>`, NS), ctx.requestId);
  }

  private describeApplicationVersions(params: URLSearchParams, ctx: RequestContext): Response {
    const versions = this.service.describeApplicationVersions(params.get("ApplicationName") ?? undefined);
    const xml = new XmlBuilder().start("ApplicationVersions");
    for (const v of versions) xml.raw(`<member>${this.versionXml(v)}</member>`);
    xml.end("ApplicationVersions");
    return xmlResponse(xmlEnvelope("DescribeApplicationVersions", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private createEnvironment(params: URLSearchParams, ctx: RequestContext): Response {
    const env = this.service.createEnvironment(
      params.get("ApplicationName")!, params.get("EnvironmentName")!,
      params.get("VersionLabel") ?? undefined,
      params.get("SolutionStackName") ?? undefined,
      undefined, ctx.region,
    );
    return xmlResponse(xmlEnvelope("CreateEnvironment", ctx.requestId, this.envXml(env), NS), ctx.requestId);
  }

  private describeEnvironments(params: URLSearchParams, ctx: RequestContext): Response {
    const envNames = this.extractList(params, "EnvironmentNames.member");
    const envIds = this.extractList(params, "EnvironmentIds.member");
    const envs = this.service.describeEnvironments(params.get("ApplicationName") ?? undefined, envNames.length ? envNames : undefined, envIds.length ? envIds : undefined);
    const xml = new XmlBuilder().start("Environments");
    for (const env of envs) xml.raw(`<member>${this.envXml(env)}</member>`);
    xml.end("Environments");
    return xmlResponse(xmlEnvelope("DescribeEnvironments", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private terminateEnvironment(params: URLSearchParams, ctx: RequestContext): Response {
    const env = this.service.terminateEnvironment(params.get("EnvironmentId")!);
    return xmlResponse(xmlEnvelope("TerminateEnvironment", ctx.requestId, this.envXml(env), NS), ctx.requestId);
  }

  private updateEnvironment(params: URLSearchParams, ctx: RequestContext): Response {
    const env = this.service.updateEnvironment(params.get("EnvironmentId")!, params.get("VersionLabel") ?? undefined);
    return xmlResponse(xmlEnvelope("UpdateEnvironment", ctx.requestId, this.envXml(env), NS), ctx.requestId);
  }

  private appXml(app: BeanstalkApp): string {
    return new XmlBuilder()
      .elem("ApplicationName", app.applicationName)
      .elem("ApplicationArn", app.applicationArn)
      .elem("Description", app.description ?? "")
      .elem("DateCreated", app.dateCreated)
      .elem("DateUpdated", app.dateUpdated)
      .build();
  }

  private envXml(env: BeanstalkEnv): string {
    return new XmlBuilder()
      .elem("EnvironmentId", env.environmentId)
      .elem("EnvironmentName", env.environmentName)
      .elem("ApplicationName", env.applicationName)
      .elem("VersionLabel", env.versionLabel ?? "")
      .elem("SolutionStackName", env.solutionStackName ?? "")
      .elem("Status", env.status)
      .elem("Health", env.health)
      .elem("EnvironmentArn", env.environmentArn)
      .elem("DateCreated", env.dateCreated)
      .elem("DateUpdated", env.dateUpdated)
      .elem("EndpointURL", env.endpointURL ?? "")
      .elem("CNAME", env.cname ?? "")
      .build();
  }

  private versionXml(v: AppVersion): string {
    return new XmlBuilder()
      .elem("ApplicationName", v.applicationName)
      .elem("VersionLabel", v.versionLabel)
      .elem("Description", v.description ?? "")
      .elem("DateCreated", v.dateCreated)
      .build();
  }

  private extractList(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    for (let i = 1; i <= 100; i++) {
      const val = params.get(`${prefix}.${i}`);
      if (!val) break;
      result.push(val);
    }
    return result;
  }
}
