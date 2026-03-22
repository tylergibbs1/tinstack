import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ShieldClient,
  CreateProtectionCommand,
  DescribeProtectionCommand,
  ListProtectionsCommand,
  DeleteProtectionCommand,
  CreateSubscriptionCommand,
  DescribeSubscriptionCommand,
  ListAttacksCommand,
  AssociateHealthCheckCommand,
  DisassociateHealthCheckCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-shield";
import { startServer, stopServer, clientConfig } from "./helpers";

const shield = new ShieldClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Shield", () => {
  let protectionId: string;
  let protectionArn: string;

  // --- Subscription ---

  test("CreateSubscription", async () => {
    const res = await shield.send(new CreateSubscriptionCommand({}));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("DescribeSubscription", async () => {
    const res = await shield.send(new DescribeSubscriptionCommand({}));
    expect(res.Subscription).toBeDefined();
    expect(res.Subscription!.AutoRenew).toBe("ENABLED");
    expect(res.Subscription!.TimeCommitmentInSeconds).toBe(31536000);
    expect(res.Subscription!.SubscriptionArn).toContain("shield");
  });

  // --- Protections ---

  test("CreateProtection", async () => {
    const res = await shield.send(new CreateProtectionCommand({
      Name: "test-protection",
      ResourceArn: "arn:aws:ec2:us-east-1:000000000000:eip-allocation/eipalloc-123",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    protectionId = res.ProtectionId!;
    expect(protectionId).toBeDefined();
  });

  test("CreateProtection - duplicate resource", async () => {
    await expect(
      shield.send(new CreateProtectionCommand({
        Name: "test-protection-2",
        ResourceArn: "arn:aws:ec2:us-east-1:000000000000:eip-allocation/eipalloc-123",
      })),
    ).rejects.toThrow();
  });

  test("DescribeProtection", async () => {
    const res = await shield.send(new DescribeProtectionCommand({
      ProtectionId: protectionId,
    }));
    expect(res.Protection).toBeDefined();
    expect(res.Protection!.Id).toBe(protectionId);
    expect(res.Protection!.Name).toBe("test-protection");
    protectionArn = res.Protection!.ProtectionArn!;
    expect(protectionArn).toContain("shield");
  });

  test("ListProtections", async () => {
    const res = await shield.send(new ListProtectionsCommand({}));
    expect(res.Protections).toBeDefined();
    expect(res.Protections!.length).toBeGreaterThanOrEqual(1);
    const found = res.Protections!.find((p) => p.Id === protectionId);
    expect(found).toBeDefined();
    expect(found!.Name).toBe("test-protection");
  });

  // --- Health Checks ---

  test("AssociateHealthCheck", async () => {
    await shield.send(new AssociateHealthCheckCommand({
      ProtectionId: protectionId,
      HealthCheckArn: "arn:aws:route53:::healthcheck/abc-123",
    }));

    const res = await shield.send(new DescribeProtectionCommand({
      ProtectionId: protectionId,
    }));
    expect(res.Protection!.HealthCheckIds).toContain("abc-123");
  });

  test("DisassociateHealthCheck", async () => {
    await shield.send(new DisassociateHealthCheckCommand({
      ProtectionId: protectionId,
      HealthCheckArn: "arn:aws:route53:::healthcheck/abc-123",
    }));

    const res = await shield.send(new DescribeProtectionCommand({
      ProtectionId: protectionId,
    }));
    expect(res.Protection!.HealthCheckIds!.length).toBe(0);
  });

  // --- Attacks ---

  test("ListAttacks - empty", async () => {
    const res = await shield.send(new ListAttacksCommand({}));
    expect(res.AttackSummaries).toBeDefined();
    expect(res.AttackSummaries!.length).toBe(0);
  });

  // --- Tags ---

  test("TagResource and ListTagsForResource", async () => {
    await shield.send(new TagResourceCommand({
      ResourceARN: protectionArn,
      Tags: [{ Key: "project", Value: "tinstack" }],
    }));
    const res = await shield.send(new ListTagsForResourceCommand({
      ResourceARN: protectionArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "project")?.Value).toBe("tinstack");
  });

  test("UntagResource", async () => {
    await shield.send(new UntagResourceCommand({
      ResourceARN: protectionArn,
      TagKeys: ["project"],
    }));
    const res = await shield.send(new ListTagsForResourceCommand({
      ResourceARN: protectionArn,
    }));
    expect(res.Tags!.find((t) => t.Key === "project")).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeleteProtection", async () => {
    await shield.send(new DeleteProtectionCommand({
      ProtectionId: protectionId,
    }));
    const res = await shield.send(new ListProtectionsCommand({}));
    const found = res.Protections!.find((p) => p.Id === protectionId);
    expect(found).toBeUndefined();
  });

  test("DescribeProtection - not found", async () => {
    await expect(
      shield.send(new DescribeProtectionCommand({ ProtectionId: "nonexistent" })),
    ).rejects.toThrow();
  });
});
