import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AppConfigClient,
  CreateApplicationCommand,
  GetApplicationCommand,
  ListApplicationsCommand,
  DeleteApplicationCommand,
  CreateEnvironmentCommand,
  GetEnvironmentCommand,
  ListEnvironmentsCommand,
  DeleteEnvironmentCommand,
  CreateConfigurationProfileCommand,
  GetConfigurationProfileCommand,
  ListConfigurationProfilesCommand,
  CreateHostedConfigurationVersionCommand,
  GetHostedConfigurationVersionCommand,
  StartDeploymentCommand,
  GetDeploymentCommand,
  ListDeploymentsCommand,
} from "@aws-sdk/client-appconfig";
import { startServer, stopServer, clientConfig } from "./helpers";

const appconfig = new AppConfigClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("AppConfig", () => {
  let appId: string;
  let envId: string;
  let profileId: string;
  let versionNumber: number;
  let deploymentNumber: number;

  // --- Applications ---

  test("CreateApplication", async () => {
    const res = await appconfig.send(new CreateApplicationCommand({
      Name: "test-app",
      Description: "A test application",
    }));
    appId = res.Id!;
    expect(appId).toBeDefined();
    expect(res.Name).toBe("test-app");
    expect(res.Description).toBe("A test application");
  });

  test("GetApplication", async () => {
    const res = await appconfig.send(new GetApplicationCommand({
      ApplicationId: appId,
    }));
    expect(res.Id).toBe(appId);
    expect(res.Name).toBe("test-app");
  });

  test("ListApplications", async () => {
    const res = await appconfig.send(new ListApplicationsCommand({}));
    expect(res.Items?.some((a) => a.Id === appId)).toBe(true);
  });

  // --- Environments ---

  test("CreateEnvironment", async () => {
    const res = await appconfig.send(new CreateEnvironmentCommand({
      ApplicationId: appId,
      Name: "production",
      Description: "Production environment",
    }));
    envId = res.Id!;
    expect(envId).toBeDefined();
    expect(res.Name).toBe("production");
    expect(res.State).toBe("READY_FOR_DEPLOYMENT");
  });

  test("GetEnvironment", async () => {
    const res = await appconfig.send(new GetEnvironmentCommand({
      ApplicationId: appId,
      EnvironmentId: envId,
    }));
    expect(res.Id).toBe(envId);
    expect(res.Name).toBe("production");
  });

  test("ListEnvironments", async () => {
    const res = await appconfig.send(new ListEnvironmentsCommand({
      ApplicationId: appId,
    }));
    expect(res.Items?.some((e) => e.Id === envId)).toBe(true);
  });

  // --- Configuration Profiles ---

  test("CreateConfigurationProfile", async () => {
    const res = await appconfig.send(new CreateConfigurationProfileCommand({
      ApplicationId: appId,
      Name: "feature-flags",
      LocationUri: "hosted",
      Description: "Feature flag configuration",
    }));
    profileId = res.Id!;
    expect(profileId).toBeDefined();
    expect(res.Name).toBe("feature-flags");
    expect(res.LocationUri).toBe("hosted");
  });

  test("GetConfigurationProfile", async () => {
    const res = await appconfig.send(new GetConfigurationProfileCommand({
      ApplicationId: appId,
      ConfigurationProfileId: profileId,
    }));
    expect(res.Id).toBe(profileId);
    expect(res.Name).toBe("feature-flags");
  });

  test("ListConfigurationProfiles", async () => {
    const res = await appconfig.send(new ListConfigurationProfilesCommand({
      ApplicationId: appId,
    }));
    expect(res.Items?.some((p) => p.Id === profileId)).toBe(true);
  });

  // --- Hosted Configuration Versions ---

  test("CreateHostedConfigurationVersion", async () => {
    const content = new TextEncoder().encode(JSON.stringify({ feature_x: true }));
    const res = await appconfig.send(new CreateHostedConfigurationVersionCommand({
      ApplicationId: appId,
      ConfigurationProfileId: profileId,
      Content: content,
      ContentType: "application/json",
      Description: "Initial version",
    }));
    versionNumber = res.VersionNumber!;
    expect(versionNumber).toBe(1);
    expect(res.ContentType).toBe("application/json");
    // Verify the content round-trips
    const decoded = JSON.parse(new TextDecoder().decode(res.Content!));
    expect(decoded.feature_x).toBe(true);
  });

  test("GetHostedConfigurationVersion", async () => {
    const res = await appconfig.send(new GetHostedConfigurationVersionCommand({
      ApplicationId: appId,
      ConfigurationProfileId: profileId,
      VersionNumber: versionNumber,
    }));
    expect(res.VersionNumber).toBe(versionNumber);
    expect(res.ContentType).toBe("application/json");
    const decoded = JSON.parse(new TextDecoder().decode(res.Content!));
    expect(decoded.feature_x).toBe(true);
  });

  test("CreateHostedConfigurationVersion increments version", async () => {
    const content = new TextEncoder().encode(JSON.stringify({ feature_x: false }));
    const res = await appconfig.send(new CreateHostedConfigurationVersionCommand({
      ApplicationId: appId,
      ConfigurationProfileId: profileId,
      Content: content,
      ContentType: "application/json",
    }));
    expect(res.VersionNumber).toBe(2);
  });

  // --- Deployments ---

  test("StartDeployment", async () => {
    const res = await appconfig.send(new StartDeploymentCommand({
      ApplicationId: appId,
      EnvironmentId: envId,
      ConfigurationProfileId: profileId,
      ConfigurationVersion: String(versionNumber),
      DeploymentStrategyId: "AppConfig.AllAtOnce",
      Description: "First deployment",
    }));
    deploymentNumber = res.DeploymentNumber!;
    expect(deploymentNumber).toBe(1);
    expect(res.State).toBe("COMPLETE");
    expect(res.ConfigurationName).toBe("feature-flags");
  });

  test("GetDeployment", async () => {
    const res = await appconfig.send(new GetDeploymentCommand({
      ApplicationId: appId,
      EnvironmentId: envId,
      DeploymentNumber: deploymentNumber,
    }));
    expect(res.DeploymentNumber).toBe(deploymentNumber);
    expect(res.State).toBe("COMPLETE");
    expect(res.ConfigurationProfileId).toBe(profileId);
  });

  test("ListDeployments", async () => {
    const res = await appconfig.send(new ListDeploymentsCommand({
      ApplicationId: appId,
      EnvironmentId: envId,
    }));
    expect(res.Items?.length).toBeGreaterThanOrEqual(1);
    expect(res.Items?.some((d) => d.DeploymentNumber === deploymentNumber)).toBe(true);
  });

  // --- Cleanup / Delete ---

  test("DeleteEnvironment", async () => {
    await appconfig.send(new DeleteEnvironmentCommand({
      ApplicationId: appId,
      EnvironmentId: envId,
    }));
    // Verify it's gone
    try {
      await appconfig.send(new GetEnvironmentCommand({
        ApplicationId: appId,
        EnvironmentId: envId,
      }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toMatch(/ResourceNotFoundException|404/);
    }
  });

  test("DeleteApplication", async () => {
    await appconfig.send(new DeleteApplicationCommand({
      ApplicationId: appId,
    }));
    // Verify it's gone
    try {
      await appconfig.send(new GetApplicationCommand({
        ApplicationId: appId,
      }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.name).toMatch(/ResourceNotFoundException|404/);
    }
  });

  // --- Error cases ---

  test("GetApplication not found", async () => {
    try {
      await appconfig.send(new GetApplicationCommand({
        ApplicationId: "nonexistent",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.$metadata?.httpStatusCode).toBe(404);
    }
  });

  test("CreateEnvironment for nonexistent app", async () => {
    try {
      await appconfig.send(new CreateEnvironmentCommand({
        ApplicationId: "nonexistent",
        Name: "test",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.$metadata?.httpStatusCode).toBe(404);
    }
  });
});
