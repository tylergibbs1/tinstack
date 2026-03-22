import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AmpClient,
  CreateWorkspaceCommand,
  DescribeWorkspaceCommand,
  ListWorkspacesCommand,
  DeleteWorkspaceCommand,
  CreateRuleGroupsNamespaceCommand,
  DescribeRuleGroupsNamespaceCommand,
  ListRuleGroupsNamespacesCommand,
  CreateAlertManagerDefinitionCommand,
  DescribeAlertManagerDefinitionCommand,
} from "@aws-sdk/client-amp";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new AmpClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("AMP (Prometheus)", () => {
  let workspaceId: string;

  test("CreateWorkspace", async () => {
    const result = await client.send(new CreateWorkspaceCommand({ alias: "test-ws" }));
    expect(result.workspaceId).toBeDefined();
    expect(result.arn).toContain("aps");
    workspaceId = result.workspaceId!;
  });

  test("DescribeWorkspace", async () => {
    const result = await client.send(new DescribeWorkspaceCommand({ workspaceId }));
    expect(result.workspace?.workspaceId).toBe(workspaceId);
    expect(result.workspace?.alias).toBe("test-ws");
    expect(result.workspace?.status?.statusCode).toBe("ACTIVE");
  });

  test("ListWorkspaces", async () => {
    const result = await client.send(new ListWorkspacesCommand({}));
    expect(result.workspaces?.some((w) => w.workspaceId === workspaceId)).toBe(true);
  });

  test("CreateRuleGroupsNamespace", async () => {
    const result = await client.send(new CreateRuleGroupsNamespaceCommand({
      workspaceId,
      name: "test-rules",
      data: Buffer.from("groups: []"),
    }));
    expect(result.name).toBe("test-rules");
    expect(result.status?.statusCode).toBe("ACTIVE");
  });

  test("DescribeRuleGroupsNamespace", async () => {
    const result = await client.send(new DescribeRuleGroupsNamespaceCommand({
      workspaceId,
      name: "test-rules",
    }));
    expect(result.ruleGroupsNamespace?.name).toBe("test-rules");
  });

  test("ListRuleGroupsNamespaces", async () => {
    const result = await client.send(new ListRuleGroupsNamespacesCommand({ workspaceId }));
    expect(result.ruleGroupsNamespaces?.length).toBe(1);
  });

  test("CreateAlertManagerDefinition", async () => {
    const result = await client.send(new CreateAlertManagerDefinitionCommand({
      workspaceId,
      data: Buffer.from("route: {}"),
    }));
    expect(result.status?.statusCode).toBe("ACTIVE");
  });

  test("DescribeAlertManagerDefinition", async () => {
    const result = await client.send(new DescribeAlertManagerDefinitionCommand({ workspaceId }));
    expect(result.alertManagerDefinition?.status?.statusCode).toBe("ACTIVE");
  });

  test("DeleteWorkspace", async () => {
    await client.send(new DeleteWorkspaceCommand({ workspaceId }));
    try {
      await client.send(new DescribeWorkspaceCommand({ workspaceId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});
