import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CodeDeployClient,
  CreateApplicationCommand,
  GetApplicationCommand,
  ListApplicationsCommand,
  DeleteApplicationCommand,
  CreateDeploymentGroupCommand,
  GetDeploymentGroupCommand,
  ListDeploymentGroupsCommand,
  DeleteDeploymentGroupCommand,
  CreateDeploymentCommand,
  GetDeploymentCommand,
  ListDeploymentsCommand,
  StopDeploymentCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-codedeploy";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CodeDeployClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CodeDeploy", () => {
  const appName = "test-app";
  let applicationId: string;
  const dgName = "test-dg";
  let deploymentId: string;

  test("CreateApplication", async () => {
    const res = await client.send(new CreateApplicationCommand({
      applicationName: appName,
      computePlatform: "Server",
    }));
    applicationId = res.applicationId!;
    expect(applicationId).toBeDefined();
  });

  test("GetApplication", async () => {
    const res = await client.send(new GetApplicationCommand({ applicationName: appName }));
    expect(res.application!.applicationName).toBe(appName);
    expect(res.application!.computePlatform).toBe("Server");
  });

  test("ListApplications", async () => {
    const res = await client.send(new ListApplicationsCommand({}));
    expect(res.applications!.includes(appName)).toBe(true);
  });

  test("CreateDeploymentGroup", async () => {
    const res = await client.send(new CreateDeploymentGroupCommand({
      applicationName: appName,
      deploymentGroupName: dgName,
      serviceRoleArn: "arn:aws:iam::000000000000:role/codedeploy-role",
      ec2TagFilters: [{ Key: "env", Value: "test", Type: "KEY_AND_VALUE" }],
    }));
    expect(res.deploymentGroupId).toBeDefined();
  });

  test("GetDeploymentGroup", async () => {
    const res = await client.send(new GetDeploymentGroupCommand({
      applicationName: appName,
      deploymentGroupName: dgName,
    }));
    expect(res.deploymentGroupInfo!.deploymentGroupName).toBe(dgName);
    expect(res.deploymentGroupInfo!.serviceRoleArn).toBe("arn:aws:iam::000000000000:role/codedeploy-role");
  });

  test("ListDeploymentGroups", async () => {
    const res = await client.send(new ListDeploymentGroupsCommand({ applicationName: appName }));
    expect(res.deploymentGroups!.includes(dgName)).toBe(true);
  });

  test("CreateDeployment", async () => {
    const res = await client.send(new CreateDeploymentCommand({
      applicationName: appName,
      deploymentGroupName: dgName,
      revision: {
        revisionType: "S3",
        s3Location: { bucket: "deploy-bucket", key: "app.zip", bundleType: "zip" },
      },
      description: "Test deployment",
    }));
    deploymentId = res.deploymentId!;
    expect(deploymentId).toBeDefined();
  });

  test("GetDeployment", async () => {
    const res = await client.send(new GetDeploymentCommand({ deploymentId }));
    expect(res.deploymentInfo!.deploymentId).toBe(deploymentId);
    expect(res.deploymentInfo!.applicationName).toBe(appName);
    expect(res.deploymentInfo!.status).toBe("Created");
  });

  test("ListDeployments", async () => {
    const res = await client.send(new ListDeploymentsCommand({
      applicationName: appName,
      deploymentGroupName: dgName,
    }));
    expect(res.deployments!.includes(deploymentId)).toBe(true);
  });

  test("StopDeployment", async () => {
    const res = await client.send(new StopDeploymentCommand({ deploymentId }));
    expect(res.status).toBe("Stopped");
  });

  test("TagResource and UntagResource", async () => {
    const arn = `arn:aws:codedeploy:us-east-1:000000000000:application:${appName}`;
    await client.send(new TagResourceCommand({
      ResourceArn: arn,
      Tags: [{ Key: "team", Value: "platform" }],
    }));
    await client.send(new UntagResourceCommand({
      ResourceArn: arn,
      TagKeys: ["team"],
    }));
  });

  test("DeleteDeploymentGroup", async () => {
    await client.send(new DeleteDeploymentGroupCommand({
      applicationName: appName,
      deploymentGroupName: dgName,
    }));
    const res = await client.send(new ListDeploymentGroupsCommand({ applicationName: appName }));
    expect(res.deploymentGroups!.includes(dgName)).toBe(false);
  });

  test("DeleteApplication", async () => {
    await client.send(new DeleteApplicationCommand({ applicationName: appName }));
    const res = await client.send(new ListApplicationsCommand({}));
    expect(res.applications!.includes(appName)).toBe(false);
  });
});
