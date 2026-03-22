import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  RAMClient,
  CreateResourceShareCommand,
  GetResourceSharesCommand,
  UpdateResourceShareCommand,
  DeleteResourceShareCommand,
  AssociateResourceShareCommand,
  DisassociateResourceShareCommand,
  GetResourceShareAssociationsCommand,
  ListResourcesCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-ram";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new RAMClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("RAM", () => {
  let shareArn: string;

  test("CreateResourceShare", async () => {
    const res = await client.send(new CreateResourceShareCommand({
      name: "test-share",
      allowExternalPrincipals: true,
      resourceArns: ["arn:aws:ec2:us-east-1:000000000000:subnet/subnet-123"],
      tags: [{ key: "env", value: "test" }],
    }));
    expect(res.resourceShare).toBeDefined();
    expect(res.resourceShare!.name).toBe("test-share");
    expect(res.resourceShare!.status).toBe("ACTIVE");
    shareArn = res.resourceShare!.resourceShareArn!;
  });

  test("GetResourceShares", async () => {
    const res = await client.send(new GetResourceSharesCommand({
      resourceOwner: "SELF",
    }));
    expect(res.resourceShares).toBeDefined();
    const found = res.resourceShares!.find((s) => s.resourceShareArn === shareArn);
    expect(found).toBeDefined();
    expect(found!.name).toBe("test-share");
  });

  test("UpdateResourceShare", async () => {
    const res = await client.send(new UpdateResourceShareCommand({
      resourceShareArn: shareArn,
      name: "updated-share",
    }));
    expect(res.resourceShare).toBeDefined();
    expect(res.resourceShare!.name).toBe("updated-share");
  });

  test("AssociateResourceShare", async () => {
    const res = await client.send(new AssociateResourceShareCommand({
      resourceShareArn: shareArn,
      principals: ["123456789012"],
    }));
    expect(res.resourceShareAssociations).toBeDefined();
    expect(res.resourceShareAssociations!.length).toBe(1);
    expect(res.resourceShareAssociations![0].associationType).toBe("PRINCIPAL");
  });

  test("GetResourceShareAssociations", async () => {
    const res = await client.send(new GetResourceShareAssociationsCommand({
      associationType: "PRINCIPAL",
      resourceShareArns: [shareArn],
    }));
    expect(res.resourceShareAssociations).toBeDefined();
    expect(res.resourceShareAssociations!.length).toBeGreaterThanOrEqual(1);
  });

  test("DisassociateResourceShare", async () => {
    const res = await client.send(new DisassociateResourceShareCommand({
      resourceShareArn: shareArn,
      principals: ["123456789012"],
    }));
    expect(res.resourceShareAssociations).toBeDefined();
    expect(res.resourceShareAssociations![0].status).toBe("DISASSOCIATED");
  });

  test("ListResources", async () => {
    const res = await client.send(new ListResourcesCommand({
      resourceOwner: "SELF",
    }));
    expect(res.resources).toBeDefined();
  });

  test("TagResource", async () => {
    await client.send(new TagResourceCommand({
      resourceShareArn: shareArn,
      tags: [{ key: "team", value: "platform" }],
    }));

    const shares = await client.send(new GetResourceSharesCommand({
      resourceOwner: "SELF",
    }));
    const share = shares.resourceShares!.find((s) => s.resourceShareArn === shareArn);
    expect(share!.tags!.find((t) => t.key === "team")?.value).toBe("platform");
  });

  test("UntagResource", async () => {
    await client.send(new UntagResourceCommand({
      resourceShareArn: shareArn,
      tagKeys: ["team"],
    }));

    const shares = await client.send(new GetResourceSharesCommand({
      resourceOwner: "SELF",
    }));
    const share = shares.resourceShares!.find((s) => s.resourceShareArn === shareArn);
    expect(share!.tags!.find((t) => t.key === "team")).toBeUndefined();
  });

  test("DeleteResourceShare", async () => {
    const res = await client.send(new DeleteResourceShareCommand({
      resourceShareArn: shareArn,
    }));
    expect(res.returnValue).toBe(true);
  });
});
