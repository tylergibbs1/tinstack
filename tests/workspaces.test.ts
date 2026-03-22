import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  WorkSpacesClient,
  CreateWorkspacesCommand,
  DescribeWorkspacesCommand,
  TerminateWorkspacesCommand,
  StartWorkspacesCommand,
  StopWorkspacesCommand,
  RebootWorkspacesCommand,
  CreateWorkspaceBundleCommand,
  DescribeWorkspaceBundlesCommand,
  DescribeWorkspaceDirectoriesCommand,
  RegisterWorkspaceDirectoryCommand,
  DeregisterWorkspaceDirectoryCommand,
  CreateTagsCommand,
  DescribeTagsCommand,
  DeleteTagsCommand,
} from "@aws-sdk/client-workspaces";
import { startServer, stopServer, clientConfig } from "./helpers";

const ws = new WorkSpacesClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("WorkSpaces", () => {
  const directoryId = "d-test000001";
  let workspaceId: string;

  test("RegisterWorkspaceDirectory", async () => {
    await ws.send(new RegisterWorkspaceDirectoryCommand({
      DirectoryId: directoryId,
      SubnetIds: ["subnet-abc123"],
      EnableSelfService: false,
      Tenancy: "SHARED",
      Tags: [{ Key: "env", Value: "test" }],
    }));
  });

  test("DescribeWorkspaceDirectories", async () => {
    const res = await ws.send(new DescribeWorkspaceDirectoriesCommand({
      DirectoryIds: [directoryId],
    }));
    expect(res.Directories).toBeDefined();
    expect(res.Directories!.length).toBe(1);
    expect(res.Directories![0].DirectoryId).toBe(directoryId);
    expect(res.Directories![0].State).toBe("REGISTERED");
  });

  test("CreateWorkspaceBundles", async () => {
    // Create a bundle to use with workspaces
    const res = await ws.send(new CreateWorkspaceBundleCommand({
      BundleName: "test-bundle",
      BundleDescription: "A test bundle",
      ComputeType: { Name: "STANDARD" },
      ImageId: "wsi-test00001",
      RootStorage: { Capacity: "80" },
      UserStorage: { Capacity: "50" },
    }));
    expect(res.WorkspaceBundle).toBeDefined();
    expect(res.WorkspaceBundle!.Name).toBe("test-bundle");
  });

  test("DescribeWorkspaceBundles", async () => {
    const res = await ws.send(new DescribeWorkspaceBundlesCommand({}));
    expect(res.Bundles).toBeDefined();
    expect(res.Bundles!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateWorkspaces", async () => {
    const res = await ws.send(new CreateWorkspacesCommand({
      Workspaces: [
        {
          DirectoryId: directoryId,
          BundleId: "wsb-test00001",
          UserName: "testuser",
          WorkspaceProperties: { RunningMode: "AUTO_STOP", RunningModeAutoStopTimeoutInMinutes: 60 },
        },
      ],
    }));
    expect(res.PendingRequests).toBeDefined();
    expect(res.PendingRequests!.length).toBe(1);
    workspaceId = res.PendingRequests![0].WorkspaceId!;
    expect(workspaceId).toMatch(/^ws-/);
  });

  test("DescribeWorkspaces", async () => {
    const res = await ws.send(new DescribeWorkspacesCommand({
      WorkspaceIds: [workspaceId],
    }));
    expect(res.Workspaces).toBeDefined();
    expect(res.Workspaces!.length).toBe(1);
    expect(res.Workspaces![0].UserName).toBe("testuser");
    expect(res.Workspaces![0].State).toBe("AVAILABLE");
  });

  test("StopWorkspaces", async () => {
    await ws.send(new StopWorkspacesCommand({
      StopWorkspaceRequests: [{ WorkspaceId: workspaceId }],
    }));
    const res = await ws.send(new DescribeWorkspacesCommand({
      WorkspaceIds: [workspaceId],
    }));
    expect(res.Workspaces![0].State).toBe("STOPPED");
  });

  test("StartWorkspaces", async () => {
    await ws.send(new StartWorkspacesCommand({
      StartWorkspaceRequests: [{ WorkspaceId: workspaceId }],
    }));
    const res = await ws.send(new DescribeWorkspacesCommand({
      WorkspaceIds: [workspaceId],
    }));
    expect(res.Workspaces![0].State).toBe("AVAILABLE");
  });

  test("RebootWorkspaces", async () => {
    await ws.send(new RebootWorkspacesCommand({
      RebootWorkspaceRequests: [{ WorkspaceId: workspaceId }],
    }));
    const res = await ws.send(new DescribeWorkspacesCommand({
      WorkspaceIds: [workspaceId],
    }));
    expect(res.Workspaces![0].State).toBe("AVAILABLE");
  });

  test("CreateTags + DescribeTags", async () => {
    await ws.send(new CreateTagsCommand({
      ResourceId: workspaceId,
      Tags: [{ Key: "team", Value: "platform" }],
    }));
    const res = await ws.send(new DescribeTagsCommand({
      ResourceId: workspaceId,
    }));
    expect(res.TagList).toBeDefined();
    expect(res.TagList!.some((t) => t.Key === "team" && t.Value === "platform")).toBe(true);
  });

  test("DeleteTags", async () => {
    await ws.send(new DeleteTagsCommand({
      ResourceId: workspaceId,
      TagKeys: ["team"],
    }));
    const res = await ws.send(new DescribeTagsCommand({
      ResourceId: workspaceId,
    }));
    expect(res.TagList!.some((t) => t.Key === "team")).toBe(false);
  });

  test("TerminateWorkspaces", async () => {
    const res = await ws.send(new TerminateWorkspacesCommand({
      TerminateWorkspaceRequests: [{ WorkspaceId: workspaceId }],
    }));
    expect(res.FailedRequests).toEqual([]);

    const desc = await ws.send(new DescribeWorkspacesCommand({
      WorkspaceIds: [workspaceId],
    }));
    expect(desc.Workspaces!.length).toBe(0);
  });

  test("DeregisterWorkspaceDirectory", async () => {
    await ws.send(new DeregisterWorkspaceDirectoryCommand({
      DirectoryId: directoryId,
    }));
    const res = await ws.send(new DescribeWorkspaceDirectoriesCommand({
      DirectoryIds: [directoryId],
    }));
    expect(res.Directories!.length).toBe(0);
  });
});
