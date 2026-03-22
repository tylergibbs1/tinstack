import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  DeleteParameterCommand,
  DescribeParametersCommand,
  AddTagsToResourceCommand,
  ListTagsForResourceCommand,
  RemoveTagsFromResourceCommand,
  CreateDocumentCommand,
  GetDocumentCommand,
  DescribeDocumentCommand,
  ListDocumentsCommand,
  UpdateDocumentCommand,
  DeleteDocumentCommand,
  SendCommandCommand,
  GetCommandInvocationCommand,
  ListCommandsCommand,
  ListCommandInvocationsCommand,
  CreateMaintenanceWindowCommand,
  GetMaintenanceWindowCommand,
  DescribeMaintenanceWindowsCommand,
  UpdateMaintenanceWindowCommand,
  DeleteMaintenanceWindowCommand,
} from "@aws-sdk/client-ssm";
import { startServer, stopServer, clientConfig } from "./helpers";

const ssm = new SSMClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SSM Parameter Store", () => {
  test("PutParameter + GetParameter", async () => {
    await ssm.send(new PutParameterCommand({
      Name: "/app/db/host",
      Value: "localhost",
      Type: "String",
    }));

    const res = await ssm.send(new GetParameterCommand({ Name: "/app/db/host" }));
    expect(res.Parameter?.Value).toBe("localhost");
    expect(res.Parameter?.Version).toBe(1);
    expect(res.Parameter?.Type).toBe("String");
  });

  test("PutParameter overwrite", async () => {
    await ssm.send(new PutParameterCommand({
      Name: "/app/db/host",
      Value: "db.example.com",
      Type: "String",
      Overwrite: true,
    }));

    const res = await ssm.send(new GetParameterCommand({ Name: "/app/db/host" }));
    expect(res.Parameter?.Value).toBe("db.example.com");
    expect(res.Parameter?.Version).toBe(2);
  });

  test("PutParameter without overwrite fails", async () => {
    try {
      await ssm.send(new PutParameterCommand({
        Name: "/app/db/host",
        Value: "other",
        Type: "String",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ParameterAlreadyExists");
    }
  });

  test("GetParametersByPath", async () => {
    await ssm.send(new PutParameterCommand({ Name: "/app/db/port", Value: "5432", Type: "String" }));
    await ssm.send(new PutParameterCommand({ Name: "/app/db/name", Value: "mydb", Type: "String" }));

    const res = await ssm.send(new GetParametersByPathCommand({ Path: "/app/db" }));
    expect(res.Parameters?.length).toBeGreaterThanOrEqual(3);
  });

  test("DescribeParameters", async () => {
    const res = await ssm.send(new DescribeParametersCommand({}));
    expect(res.Parameters?.length).toBeGreaterThan(0);
  });

  test("DeleteParameter", async () => {
    await ssm.send(new DeleteParameterCommand({ Name: "/app/db/port" }));
    try {
      await ssm.send(new GetParameterCommand({ Name: "/app/db/port" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ParameterNotFound");
    }
  });
});

describe("SSM - RemoveTagsFromResource", () => {
  const paramName = "/test/tags-remove-" + Date.now();

  test("AddTags then RemoveTags", async () => {
    await ssm.send(new PutParameterCommand({ Name: paramName, Value: "v", Type: "String", Tags: [{ Key: "env", Value: "prod" }, { Key: "team", Value: "backend" }] }));

    const before = await ssm.send(new ListTagsForResourceCommand({ ResourceType: "Parameter", ResourceId: paramName }));
    expect(before.TagList?.length).toBe(2);

    await ssm.send(new RemoveTagsFromResourceCommand({ ResourceType: "Parameter", ResourceId: paramName, TagKeys: ["env"] }));

    const after = await ssm.send(new ListTagsForResourceCommand({ ResourceType: "Parameter", ResourceId: paramName }));
    expect(after.TagList?.length).toBe(1);
    expect(after.TagList![0].Key).toBe("team");
  });
});

describe("SSM - Documents", () => {
  const docName = "test-doc-" + Date.now();
  const docContent = JSON.stringify({
    schemaVersion: "2.2",
    description: "Test document",
    mainSteps: [{ action: "aws:runShellScript", name: "run", inputs: { runCommand: ["echo hello"] } }],
  });

  test("CreateDocument", async () => {
    const res = await ssm.send(new CreateDocumentCommand({
      Name: docName,
      Content: docContent,
      DocumentType: "Command",
      DocumentFormat: "JSON",
    }));
    expect(res.DocumentDescription?.Name).toBe(docName);
    expect(res.DocumentDescription?.DocumentType).toBe("Command");
    expect(res.DocumentDescription?.DocumentFormat).toBe("JSON");
    expect(res.DocumentDescription?.DocumentVersion).toBe("1");
    expect(res.DocumentDescription?.Status).toBe("Active");
  });

  test("CreateDocument duplicate throws", async () => {
    try {
      await ssm.send(new CreateDocumentCommand({ Name: docName, Content: docContent, DocumentType: "Command" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("DocumentAlreadyExists");
    }
  });

  test("GetDocument", async () => {
    const res = await ssm.send(new GetDocumentCommand({ Name: docName }));
    expect(res.Name).toBe(docName);
    expect(res.Content).toBe(docContent);
    expect(res.DocumentType).toBe("Command");
    expect(res.DocumentVersion).toBe("1");
  });

  test("DescribeDocument", async () => {
    const res = await ssm.send(new DescribeDocumentCommand({ Name: docName }));
    expect(res.Document?.Name).toBe(docName);
    expect(res.Document?.Status).toBe("Active");
    expect(res.Document?.Description).toBe("Test document");
  });

  test("ListDocuments", async () => {
    const res = await ssm.send(new ListDocumentsCommand({}));
    expect(res.DocumentIdentifiers?.some((d) => d.Name === docName)).toBe(true);
  });

  test("UpdateDocument increments version", async () => {
    const newContent = JSON.stringify({
      schemaVersion: "2.2",
      description: "Updated document",
      mainSteps: [{ action: "aws:runShellScript", name: "run", inputs: { runCommand: ["echo updated"] } }],
    });
    const res = await ssm.send(new UpdateDocumentCommand({
      Name: docName,
      Content: newContent,
      DocumentVersion: "$LATEST",
    }));
    expect(res.DocumentDescription?.DocumentVersion).toBe("2");
    expect(res.DocumentDescription?.Description).toBe("Updated document");
  });

  test("DeleteDocument", async () => {
    await ssm.send(new DeleteDocumentCommand({ Name: docName }));
    try {
      await ssm.send(new GetDocumentCommand({ Name: docName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidDocument");
    }
  });

  test("DeleteDocument nonexistent throws", async () => {
    try {
      await ssm.send(new DeleteDocumentCommand({ Name: "nonexistent-doc" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidDocument");
    }
  });
});

describe("SSM - Commands", () => {
  let commandId: string;

  test("SendCommand", async () => {
    const res = await ssm.send(new SendCommandCommand({
      DocumentName: "AWS-RunShellScript",
      InstanceIds: ["i-1234567890abcdef0", "i-0987654321fedcba0"],
      Parameters: { commands: ["echo hello"] },
      Comment: "Test command",
      TimeoutSeconds: 30,
    }));
    expect(res.Command).toBeDefined();
    expect(res.Command!.CommandId).toBeDefined();
    expect(res.Command!.DocumentName).toBe("AWS-RunShellScript");
    expect(res.Command!.Status).toBe("Success");
    expect(res.Command!.InstanceIds).toEqual(["i-1234567890abcdef0", "i-0987654321fedcba0"]);
    commandId = res.Command!.CommandId!;
  });

  test("GetCommandInvocation", async () => {
    const res = await ssm.send(new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: "i-1234567890abcdef0",
    }));
    expect(res.CommandId).toBe(commandId);
    expect(res.InstanceId).toBe("i-1234567890abcdef0");
    expect(res.Status).toBe("Success");
    expect(res.ResponseCode).toBe(0);
  });

  test("GetCommandInvocation nonexistent instance throws", async () => {
    try {
      await ssm.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: "i-nonexistent",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvocationDoesNotExist");
    }
  });

  test("ListCommands", async () => {
    const res = await ssm.send(new ListCommandsCommand({}));
    expect(res.Commands!.length).toBeGreaterThanOrEqual(1);
    expect(res.Commands!.some((c) => c.CommandId === commandId)).toBe(true);
  });

  test("ListCommands with filter", async () => {
    const res = await ssm.send(new ListCommandsCommand({ CommandId: commandId }));
    expect(res.Commands!.length).toBe(1);
    expect(res.Commands![0].CommandId).toBe(commandId);
  });

  test("ListCommandInvocations", async () => {
    const res = await ssm.send(new ListCommandInvocationsCommand({ CommandId: commandId }));
    expect(res.CommandInvocations!.length).toBe(2);
    expect(res.CommandInvocations!.every((i) => i.Status === "Success")).toBe(true);
  });
});

describe("SSM - Maintenance Windows", () => {
  let windowId: string;

  test("CreateMaintenanceWindow", async () => {
    const res = await ssm.send(new CreateMaintenanceWindowCommand({
      Name: "test-mw",
      Schedule: "cron(0 2 ? * SUN *)",
      Duration: 4,
      Cutoff: 1,
      AllowUnassociatedTargets: true,
    }));
    expect(res.WindowId).toBeDefined();
    expect(res.WindowId).toMatch(/^mw-/);
    windowId = res.WindowId!;
  });

  test("GetMaintenanceWindow", async () => {
    const res = await ssm.send(new GetMaintenanceWindowCommand({ WindowId: windowId }));
    expect(res.WindowId).toBe(windowId);
    expect(res.Name).toBe("test-mw");
    expect(res.Schedule).toBe("cron(0 2 ? * SUN *)");
    expect(res.Duration).toBe(4);
    expect(res.Cutoff).toBe(1);
    expect(res.AllowUnassociatedTargets).toBe(true);
    expect(res.Enabled).toBe(true);
  });

  test("DescribeMaintenanceWindows", async () => {
    const res = await ssm.send(new DescribeMaintenanceWindowsCommand({}));
    expect(res.WindowIdentities!.some((w) => w.WindowId === windowId)).toBe(true);
  });

  test("UpdateMaintenanceWindow", async () => {
    await ssm.send(new UpdateMaintenanceWindowCommand({
      WindowId: windowId,
      Schedule: "cron(0 3 ? * SAT *)",
      Duration: 6,
    }));
    const res = await ssm.send(new GetMaintenanceWindowCommand({ WindowId: windowId }));
    expect(res.Schedule).toBe("cron(0 3 ? * SAT *)");
    expect(res.Duration).toBe(6);
    expect(res.Name).toBe("test-mw"); // unchanged
  });

  test("DeleteMaintenanceWindow", async () => {
    const res = await ssm.send(new DeleteMaintenanceWindowCommand({ WindowId: windowId }));
    expect(res.WindowId).toBe(windowId);

    try {
      await ssm.send(new GetMaintenanceWindowCommand({ WindowId: windowId }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("DoesNotExistException");
    }
  });
});
