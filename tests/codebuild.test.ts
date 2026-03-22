import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CodeBuildClient,
  CreateProjectCommand,
  BatchGetProjectsCommand,
  ListProjectsCommand,
  UpdateProjectCommand,
  DeleteProjectCommand,
  StartBuildCommand,
  BatchGetBuildsCommand,
  ListBuildsForProjectCommand,
  StopBuildCommand,
  CreateReportGroupCommand,
  BatchGetReportGroupsCommand,
  ListReportGroupsCommand,
} from "@aws-sdk/client-codebuild";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CodeBuildClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CodeBuild", () => {
  const projectName = "test-project";
  let buildId: string;
  let reportGroupArn: string;

  test("CreateProject", async () => {
    const res = await client.send(new CreateProjectCommand({
      name: projectName,
      description: "Test project",
      source: { type: "NO_SOURCE", buildspec: "version: 0.2\nphases:\n  build:\n    commands:\n      - echo Hello" },
      artifacts: { type: "NO_ARTIFACTS" },
      environment: {
        type: "LINUX_CONTAINER",
        image: "aws/codebuild/amazonlinux2-x86_64-standard:3.0",
        computeType: "BUILD_GENERAL1_SMALL",
      },
      serviceRole: "arn:aws:iam::000000000000:role/codebuild-role",
    }));
    expect(res.project!.name).toBe(projectName);
    expect(res.project!.arn).toContain("codebuild");
  });

  test("BatchGetProjects", async () => {
    const res = await client.send(new BatchGetProjectsCommand({ names: [projectName] }));
    expect(res.projects!.length).toBe(1);
    expect(res.projects![0].name).toBe(projectName);
    expect(res.projects![0].description).toBe("Test project");
  });

  test("ListProjects", async () => {
    const res = await client.send(new ListProjectsCommand({}));
    expect(res.projects!.includes(projectName)).toBe(true);
  });

  test("UpdateProject", async () => {
    const res = await client.send(new UpdateProjectCommand({
      name: projectName,
      description: "Updated project",
    }));
    expect(res.project!.description).toBe("Updated project");
  });

  test("StartBuild", async () => {
    const res = await client.send(new StartBuildCommand({ projectName }));
    expect(res.build!.projectName).toBe(projectName);
    expect(res.build!.buildStatus).toBe("IN_PROGRESS");
    buildId = res.build!.id!;
  });

  test("BatchGetBuilds", async () => {
    const res = await client.send(new BatchGetBuildsCommand({ ids: [buildId] }));
    expect(res.builds!.length).toBe(1);
    expect(res.builds![0].projectName).toBe(projectName);
  });

  test("ListBuildsForProject", async () => {
    const res = await client.send(new ListBuildsForProjectCommand({ projectName }));
    expect(res.ids!.includes(buildId)).toBe(true);
  });

  test("StopBuild", async () => {
    const res = await client.send(new StopBuildCommand({ id: buildId }));
    expect(res.build!.buildStatus).toBe("STOPPED");
    expect(res.build!.buildComplete).toBe(true);
  });

  test("CreateReportGroup", async () => {
    const res = await client.send(new CreateReportGroupCommand({
      name: "test-report-group",
      type: "TEST",
      exportConfig: { exportConfigType: "NO_EXPORT" },
    }));
    reportGroupArn = res.reportGroup!.arn!;
    expect(reportGroupArn).toContain("report-group");
  });

  test("BatchGetReportGroups", async () => {
    const res = await client.send(new BatchGetReportGroupsCommand({
      reportGroupArns: [reportGroupArn],
    }));
    expect(res.reportGroups!.length).toBe(1);
    expect(res.reportGroups![0].name).toBe("test-report-group");
  });

  test("ListReportGroups", async () => {
    const res = await client.send(new ListReportGroupsCommand({}));
    expect(res.reportGroups!.includes(reportGroupArn)).toBe(true);
  });

  test("DeleteProject", async () => {
    await client.send(new DeleteProjectCommand({ name: projectName }));
    const res = await client.send(new ListProjectsCommand({}));
    expect(res.projects!.includes(projectName)).toBe(false);
  });
});
