import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudControlClient,
  CreateResourceCommand,
  GetResourceCommand,
  ListResourcesCommand,
  UpdateResourceCommand,
  DeleteResourceCommand,
  GetResourceRequestStatusCommand,
} from "@aws-sdk/client-cloudcontrol";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CloudControlClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Cloud Control", () => {
  const typeName = "AWS::Test::Resource";
  let identifier: string;
  let requestToken: string;

  test("CreateResource", async () => {
    const res = await client.send(new CreateResourceCommand({
      TypeName: typeName,
      DesiredState: JSON.stringify({ Name: "test-resource", Value: "hello" }),
    }));
    expect(res.ProgressEvent).toBeDefined();
    expect(res.ProgressEvent!.OperationStatus).toBe("SUCCESS");
    identifier = res.ProgressEvent!.Identifier!;
    requestToken = res.ProgressEvent!.RequestToken!;
    expect(identifier).toBeDefined();
  });

  test("GetResource", async () => {
    const res = await client.send(new GetResourceCommand({
      TypeName: typeName,
      Identifier: identifier,
    }));
    expect(res.ResourceDescription).toBeDefined();
    expect(res.ResourceDescription!.Identifier).toBe(identifier);
    const props = JSON.parse(res.ResourceDescription!.Properties!);
    expect(props.Name).toBe("test-resource");
    expect(props.Value).toBe("hello");
  });

  test("ListResources", async () => {
    const res = await client.send(new ListResourcesCommand({ TypeName: typeName }));
    expect(res.ResourceDescriptions).toBeDefined();
    expect(res.ResourceDescriptions!.length).toBeGreaterThanOrEqual(1);
  });

  test("GetResourceRequestStatus", async () => {
    const res = await client.send(new GetResourceRequestStatusCommand({
      RequestToken: requestToken,
    }));
    expect(res.ProgressEvent).toBeDefined();
    expect(res.ProgressEvent!.OperationStatus).toBe("SUCCESS");
    expect(res.ProgressEvent!.Operation).toBe("CREATE");
  });

  test("UpdateResource", async () => {
    const res = await client.send(new UpdateResourceCommand({
      TypeName: typeName,
      Identifier: identifier,
      PatchDocument: JSON.stringify([{ op: "replace", path: "/Value", value: "updated" }]),
    }));
    expect(res.ProgressEvent!.OperationStatus).toBe("SUCCESS");

    const get = await client.send(new GetResourceCommand({
      TypeName: typeName,
      Identifier: identifier,
    }));
    const props = JSON.parse(get.ResourceDescription!.Properties!);
    expect(props.Value).toBe("updated");
  });

  test("DeleteResource", async () => {
    const res = await client.send(new DeleteResourceCommand({
      TypeName: typeName,
      Identifier: identifier,
    }));
    expect(res.ProgressEvent!.OperationStatus).toBe("SUCCESS");

    await expect(
      client.send(new GetResourceCommand({ TypeName: typeName, Identifier: identifier })),
    ).rejects.toThrow();
  });

  test("GetResource - not found", async () => {
    await expect(
      client.send(new GetResourceCommand({ TypeName: typeName, Identifier: "nonexistent" })),
    ).rejects.toThrow();
  });
});
