import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface CodeBuildProject {
  name: string;
  arn: string;
  description?: string;
  source: any;
  artifacts: any;
  environment: any;
  serviceRole: string;
  timeoutInMinutes: number;
  encryptionKey?: string;
  tags: { key: string; value: string }[];
  created: number;
  lastModified: number;
  badge?: any;
  cache?: any;
  secondarySources?: any[];
  secondaryArtifacts?: any[];
}

export interface Build {
  id: string;
  arn: string;
  buildNumber: number;
  projectName: string;
  buildStatus: string;
  currentPhase: string;
  startTime: number;
  endTime?: number;
  source: any;
  artifacts: any;
  environment: any;
  serviceRole: string;
  timeoutInMinutes: number;
  phases: any[];
  logs: any;
  sourceVersion: string;
  buildComplete: boolean;
  initiator: string;
}

export interface ReportGroup {
  arn: string;
  name: string;
  type: string;
  exportConfig: any;
  created: number;
  lastModified: number;
  tags: { key: string; value: string }[];
}

export class CodeBuildService {
  private projects = new Map<string, CodeBuildProject>();
  private builds = new Map<string, Build>();
  private reportGroups = new Map<string, ReportGroup>();
  private buildCounter = 0;

  constructor(private accountId: string) {}

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createProject(params: any, region: string): CodeBuildProject {
    const key = this.regionKey(region, params.name);
    if (this.projects.has(key)) {
      throw new AwsError("ResourceAlreadyExistsException", `Project ${params.name} already exists.`, 400);
    }

    const project: CodeBuildProject = {
      name: params.name,
      arn: buildArn("codebuild", region, this.accountId, "project/", params.name),
      description: params.description,
      source: params.source ?? { type: "NO_SOURCE" },
      artifacts: params.artifacts ?? { type: "NO_ARTIFACTS" },
      environment: params.environment ?? {
        type: "LINUX_CONTAINER",
        image: "aws/codebuild/amazonlinux2-x86_64-standard:3.0",
        computeType: "BUILD_GENERAL1_SMALL",
      },
      serviceRole: params.serviceRole ?? `arn:aws:iam::${this.accountId}:role/codebuild-role`,
      timeoutInMinutes: params.timeoutInMinutes ?? 60,
      encryptionKey: params.encryptionKey,
      tags: params.tags ?? [],
      created: Date.now() / 1000,
      lastModified: Date.now() / 1000,
      cache: params.cache ?? { type: "NO_CACHE" },
      secondarySources: params.secondarySources,
      secondaryArtifacts: params.secondaryArtifacts,
    };

    this.projects.set(key, project);
    return project;
  }

  batchGetProjects(names: string[], region: string): { projects: CodeBuildProject[]; projectsNotFound: string[] } {
    const projects: CodeBuildProject[] = [];
    const notFound: string[] = [];
    for (const name of names) {
      const key = this.regionKey(region, name);
      const p = this.projects.get(key);
      if (p) projects.push(p);
      else notFound.push(name);
    }
    return { projects, projectsNotFound: notFound };
  }

  listProjects(region: string): string[] {
    return Array.from(this.projects.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, v]) => v.name);
  }

  updateProject(params: any, region: string): CodeBuildProject {
    const key = this.regionKey(region, params.name);
    const project = this.projects.get(key);
    if (!project) throw new AwsError("ResourceNotFoundException", `Project ${params.name} not found.`, 400);

    if (params.description !== undefined) project.description = params.description;
    if (params.source !== undefined) project.source = params.source;
    if (params.artifacts !== undefined) project.artifacts = params.artifacts;
    if (params.environment !== undefined) project.environment = params.environment;
    if (params.serviceRole !== undefined) project.serviceRole = params.serviceRole;
    if (params.timeoutInMinutes !== undefined) project.timeoutInMinutes = params.timeoutInMinutes;
    if (params.tags !== undefined) project.tags = params.tags;
    project.lastModified = Date.now() / 1000;

    return project;
  }

  deleteProject(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.projects.has(key)) {
      throw new AwsError("ResourceNotFoundException", `Project ${name} not found.`, 400);
    }
    this.projects.delete(key);
  }

  startBuild(params: any, region: string): Build {
    const key = this.regionKey(region, params.projectName);
    const project = this.projects.get(key);
    if (!project) throw new AwsError("ResourceNotFoundException", `Project ${params.projectName} not found.`, 400);

    this.buildCounter++;
    const buildId = `${params.projectName}:${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const now = Date.now() / 1000;

    const build: Build = {
      id: buildId,
      arn: buildArn("codebuild", region, this.accountId, "build/", buildId),
      buildNumber: this.buildCounter,
      projectName: params.projectName,
      buildStatus: "IN_PROGRESS",
      currentPhase: "QUEUED",
      startTime: now,
      source: project.source,
      artifacts: project.artifacts,
      environment: project.environment,
      serviceRole: project.serviceRole,
      timeoutInMinutes: project.timeoutInMinutes,
      sourceVersion: params.sourceVersion ?? "refs/heads/main",
      phases: [
        { phaseType: "SUBMITTED", phaseStatus: "SUCCEEDED", startTime: now, endTime: now, durationInSeconds: 0 },
        { phaseType: "QUEUED", startTime: now },
      ],
      logs: {
        cloudWatchLogs: { status: "ENABLED" },
        s3Logs: { status: "DISABLED" },
      },
      buildComplete: false,
      initiator: "user",
    };

    this.builds.set(buildId, build);
    return build;
  }

  batchGetBuilds(ids: string[]): { builds: Build[]; buildsNotFound: string[] } {
    const builds: Build[] = [];
    const notFound: string[] = [];
    for (const id of ids) {
      const b = this.builds.get(id);
      if (b) builds.push(b);
      else notFound.push(id);
    }
    return { builds, buildsNotFound: notFound };
  }

  listBuildsForProject(projectName: string, region: string): string[] {
    const key = this.regionKey(region, projectName);
    if (!this.projects.has(key)) {
      throw new AwsError("ResourceNotFoundException", `Project ${projectName} not found.`, 400);
    }
    return Array.from(this.builds.values())
      .filter((b) => b.projectName === projectName)
      .map((b) => b.id);
  }

  stopBuild(buildId: string): Build {
    const build = this.builds.get(buildId);
    if (!build) throw new AwsError("ResourceNotFoundException", `Build ${buildId} not found.`, 400);
    build.buildStatus = "STOPPED";
    build.currentPhase = "COMPLETED";
    build.buildComplete = true;
    build.endTime = Date.now() / 1000;
    return build;
  }

  createReportGroup(params: any, region: string): ReportGroup {
    const key = this.regionKey(region, params.name);
    if (this.reportGroups.has(key)) {
      throw new AwsError("ResourceAlreadyExistsException", `Report group ${params.name} already exists.`, 400);
    }

    const rg: ReportGroup = {
      arn: buildArn("codebuild", region, this.accountId, "report-group/", params.name),
      name: params.name,
      type: params.type ?? "TEST",
      exportConfig: params.exportConfig ?? { exportConfigType: "NO_EXPORT" },
      created: Date.now() / 1000,
      lastModified: Date.now() / 1000,
      tags: params.tags ?? [],
    };

    this.reportGroups.set(key, rg);
    return rg;
  }

  batchGetReportGroups(arns: string[], region: string): { reportGroups: ReportGroup[]; reportGroupsNotFound: string[] } {
    const groups: ReportGroup[] = [];
    const notFound: string[] = [];
    for (const arn of arns) {
      let found = false;
      for (const rg of this.reportGroups.values()) {
        if (rg.arn === arn) { groups.push(rg); found = true; break; }
      }
      if (!found) notFound.push(arn);
    }
    return { reportGroups: groups, reportGroupsNotFound: notFound };
  }

  listReportGroups(region: string): string[] {
    return Array.from(this.reportGroups.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, v]) => v.arn);
  }
}
