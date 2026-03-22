import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  Route53ResolverClient,
  CreateResolverEndpointCommand,
  GetResolverEndpointCommand,
  ListResolverEndpointsCommand,
  DeleteResolverEndpointCommand,
  UpdateResolverEndpointCommand,
  CreateResolverRuleCommand,
  GetResolverRuleCommand,
  ListResolverRulesCommand,
  DeleteResolverRuleCommand,
  AssociateResolverRuleCommand,
  DisassociateResolverRuleCommand,
  ListResolverRuleAssociationsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-route53resolver";
import { startServer, stopServer, clientConfig } from "./helpers";

const r53r = new Route53ResolverClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Route 53 Resolver", () => {
  let endpointId: string;
  let endpointArn: string;
  let ruleId: string;

  test("CreateResolverEndpoint", async () => {
    const res = await r53r.send(new CreateResolverEndpointCommand({
      CreatorRequestId: "test-req-1",
      Name: "test-endpoint",
      Direction: "OUTBOUND",
      IpAddresses: [
        { SubnetId: "subnet-abc123" },
        { SubnetId: "subnet-def456" },
      ],
      SecurityGroupIds: ["sg-12345"],
    }));
    expect(res.ResolverEndpoint).toBeDefined();
    expect(res.ResolverEndpoint!.Name).toBe("test-endpoint");
    expect(res.ResolverEndpoint!.Direction).toBe("OUTBOUND");
    expect(res.ResolverEndpoint!.Status).toBe("OPERATIONAL");
    endpointId = res.ResolverEndpoint!.Id!;
    endpointArn = res.ResolverEndpoint!.Arn!;
  });

  test("GetResolverEndpoint", async () => {
    const res = await r53r.send(new GetResolverEndpointCommand({
      ResolverEndpointId: endpointId,
    }));
    expect(res.ResolverEndpoint!.Name).toBe("test-endpoint");
    expect(res.ResolverEndpoint!.IpAddressCount).toBe(2);
  });

  test("ListResolverEndpoints", async () => {
    const res = await r53r.send(new ListResolverEndpointsCommand({}));
    expect(res.ResolverEndpoints!.length).toBeGreaterThanOrEqual(1);
    expect(res.ResolverEndpoints!.some((e) => e.Id === endpointId)).toBe(true);
  });

  test("UpdateResolverEndpoint", async () => {
    const res = await r53r.send(new UpdateResolverEndpointCommand({
      ResolverEndpointId: endpointId,
      Name: "updated-endpoint",
    }));
    expect(res.ResolverEndpoint!.Name).toBe("updated-endpoint");
  });

  test("CreateResolverRule", async () => {
    const res = await r53r.send(new CreateResolverRuleCommand({
      CreatorRequestId: "rule-req-1",
      Name: "test-rule",
      RuleType: "FORWARD",
      DomainName: "example.com",
      TargetIps: [{ Ip: "10.0.0.1", Port: 53 }],
      ResolverEndpointId: endpointId,
    }));
    expect(res.ResolverRule).toBeDefined();
    expect(res.ResolverRule!.Name).toBe("test-rule");
    expect(res.ResolverRule!.RuleType).toBe("FORWARD");
    ruleId = res.ResolverRule!.Id!;
  });

  test("GetResolverRule", async () => {
    const res = await r53r.send(new GetResolverRuleCommand({
      ResolverRuleId: ruleId,
    }));
    expect(res.ResolverRule!.DomainName).toBe("example.com");
    expect(res.ResolverRule!.TargetIps![0].Ip).toBe("10.0.0.1");
  });

  test("ListResolverRules", async () => {
    const res = await r53r.send(new ListResolverRulesCommand({}));
    expect(res.ResolverRules!.some((r) => r.Id === ruleId)).toBe(true);
  });

  test("AssociateResolverRule + ListResolverRuleAssociations", async () => {
    await r53r.send(new AssociateResolverRuleCommand({
      ResolverRuleId: ruleId,
      VPCId: "vpc-test123",
      Name: "test-assoc",
    }));

    const res = await r53r.send(new ListResolverRuleAssociationsCommand({}));
    expect(res.ResolverRuleAssociations!.length).toBeGreaterThanOrEqual(1);
    expect(res.ResolverRuleAssociations!.some((a) => a.ResolverRuleId === ruleId)).toBe(true);
  });

  test("DisassociateResolverRule", async () => {
    await r53r.send(new DisassociateResolverRuleCommand({
      ResolverRuleId: ruleId,
      VPCId: "vpc-test123",
    }));

    const res = await r53r.send(new ListResolverRuleAssociationsCommand({}));
    expect(res.ResolverRuleAssociations!.some((a) => a.ResolverRuleId === ruleId && a.VPCId === "vpc-test123")).toBe(false);
  });

  test("TagResource + ListTagsForResource", async () => {
    await r53r.send(new TagResourceCommand({
      ResourceArn: endpointArn,
      Tags: [{ Key: "env", Value: "test" }, { Key: "team", Value: "infra" }],
    }));

    const res = await r53r.send(new ListTagsForResourceCommand({
      ResourceArn: endpointArn,
    }));
    expect(res.Tags!.length).toBe(2);
    expect(res.Tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("UntagResource", async () => {
    await r53r.send(new UntagResourceCommand({
      ResourceArn: endpointArn,
      TagKeys: ["env"],
    }));

    const res = await r53r.send(new ListTagsForResourceCommand({
      ResourceArn: endpointArn,
    }));
    expect(res.Tags!.length).toBe(1);
    expect(res.Tags![0].Key).toBe("team");
  });

  test("DeleteResolverRule", async () => {
    await r53r.send(new DeleteResolverRuleCommand({
      ResolverRuleId: ruleId,
    }));
    const res = await r53r.send(new ListResolverRulesCommand({}));
    expect(res.ResolverRules!.some((r) => r.Id === ruleId)).toBe(false);
  });

  test("DeleteResolverEndpoint", async () => {
    await r53r.send(new DeleteResolverEndpointCommand({
      ResolverEndpointId: endpointId,
    }));
    const res = await r53r.send(new ListResolverEndpointsCommand({}));
    expect(res.ResolverEndpoints!.some((e) => e.Id === endpointId)).toBe(false);
  });
});
