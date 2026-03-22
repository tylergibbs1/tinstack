import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ElasticLoadBalancingV2Client,
  CreateLoadBalancerCommand,
  DescribeLoadBalancersCommand,
  DeleteLoadBalancerCommand,
  DescribeLoadBalancerAttributesCommand,
  ModifyLoadBalancerAttributesCommand,
  CreateTargetGroupCommand,
  DescribeTargetGroupsCommand,
  DeleteTargetGroupCommand,
  DescribeTargetGroupAttributesCommand,
  ModifyTargetGroupAttributesCommand,
  CreateListenerCommand,
  DescribeListenersCommand,
  DeleteListenerCommand,
  DescribeTagsCommand,
  AddTagsCommand,
  RemoveTagsCommand,
  RegisterTargetsCommand,
  DeregisterTargetsCommand,
  DescribeTargetHealthCommand,
  CreateRuleCommand,
  DescribeRulesCommand,
  DeleteRuleCommand,
  ModifyListenerCommand,
  ModifyTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { startServer, stopServer, clientConfig } from "./helpers";

const elbv2 = new ElasticLoadBalancingV2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ELBv2", () => {
  let loadBalancerArn: string;
  let targetGroupArn: string;
  let listenerArn: string;

  test("CreateLoadBalancer", async () => {
    const res = await elbv2.send(new CreateLoadBalancerCommand({
      Name: "my-alb",
      Subnets: ["subnet-12345", "subnet-67890"],
      SecurityGroups: ["sg-12345"],
      Scheme: "internet-facing",
      Type: "application",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    expect(res.LoadBalancers).toBeDefined();
    expect(res.LoadBalancers!.length).toBe(1);
    const lb = res.LoadBalancers![0];
    expect(lb.LoadBalancerName).toBe("my-alb");
    expect(lb.State!.Code).toBe("active");
    expect(lb.Type).toBe("application");
    expect(lb.Scheme).toBe("internet-facing");
    expect(lb.DNSName).toBeDefined();
    expect(lb.LoadBalancerArn).toBeDefined();
    loadBalancerArn = lb.LoadBalancerArn!;
  });

  test("CreateLoadBalancer - duplicate fails", async () => {
    try {
      await elbv2.send(new CreateLoadBalancerCommand({
        Name: "my-alb",
        Subnets: ["subnet-12345"],
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("DuplicateLoadBalancerNameException");
    }
  });

  test("DescribeLoadBalancers - all", async () => {
    const res = await elbv2.send(new DescribeLoadBalancersCommand({}));
    expect(res.LoadBalancers!.length).toBeGreaterThanOrEqual(1);
    expect(res.LoadBalancers!.some((lb) => lb.LoadBalancerName === "my-alb")).toBe(true);
  });

  test("DescribeLoadBalancers - by ARN", async () => {
    const res = await elbv2.send(new DescribeLoadBalancersCommand({
      LoadBalancerArns: [loadBalancerArn],
    }));
    expect(res.LoadBalancers!.length).toBe(1);
    expect(res.LoadBalancers![0].LoadBalancerArn).toBe(loadBalancerArn);
  });

  test("DescribeLoadBalancerAttributes", async () => {
    const res = await elbv2.send(new DescribeLoadBalancerAttributesCommand({
      LoadBalancerArn: loadBalancerArn,
    }));
    expect(res.Attributes).toBeDefined();
    expect(res.Attributes!.length).toBeGreaterThan(0);
    expect(res.Attributes!.some((a) => a.Key === "idle_timeout.timeout_seconds")).toBe(true);
  });

  test("ModifyLoadBalancerAttributes", async () => {
    const res = await elbv2.send(new ModifyLoadBalancerAttributesCommand({
      LoadBalancerArn: loadBalancerArn,
      Attributes: [{ Key: "idle_timeout.timeout_seconds", Value: "120" }],
    }));
    expect(res.Attributes!.some((a) => a.Key === "idle_timeout.timeout_seconds" && a.Value === "120")).toBe(true);
  });

  test("CreateTargetGroup", async () => {
    const res = await elbv2.send(new CreateTargetGroupCommand({
      Name: "my-tg",
      Protocol: "HTTP",
      Port: 8080,
      VpcId: "vpc-12345",
      TargetType: "instance",
      HealthCheckPath: "/health",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    expect(res.TargetGroups).toBeDefined();
    expect(res.TargetGroups!.length).toBe(1);
    const tg = res.TargetGroups![0];
    expect(tg.TargetGroupName).toBe("my-tg");
    expect(tg.Protocol).toBe("HTTP");
    expect(tg.Port).toBe(8080);
    expect(tg.VpcId).toBe("vpc-12345");
    expect(tg.HealthCheckPath).toBe("/health");
    targetGroupArn = tg.TargetGroupArn!;
  });

  test("DescribeTargetGroups", async () => {
    const res = await elbv2.send(new DescribeTargetGroupsCommand({}));
    expect(res.TargetGroups!.length).toBeGreaterThanOrEqual(1);
    expect(res.TargetGroups!.some((tg) => tg.TargetGroupName === "my-tg")).toBe(true);
  });

  test("DescribeTargetGroupAttributes", async () => {
    const res = await elbv2.send(new DescribeTargetGroupAttributesCommand({
      TargetGroupArn: targetGroupArn,
    }));
    expect(res.Attributes).toBeDefined();
    expect(res.Attributes!.length).toBeGreaterThan(0);
  });

  test("ModifyTargetGroupAttributes", async () => {
    const res = await elbv2.send(new ModifyTargetGroupAttributesCommand({
      TargetGroupArn: targetGroupArn,
      Attributes: [{ Key: "deregistration_delay.timeout_seconds", Value: "60" }],
    }));
    expect(res.Attributes!.some((a) => a.Key === "deregistration_delay.timeout_seconds" && a.Value === "60")).toBe(true);
  });

  test("CreateListener", async () => {
    const res = await elbv2.send(new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: "HTTP",
      Port: 80,
      DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    }));
    expect(res.Listeners).toBeDefined();
    expect(res.Listeners!.length).toBe(1);
    const l = res.Listeners![0];
    expect(l.Protocol).toBe("HTTP");
    expect(l.Port).toBe(80);
    expect(l.LoadBalancerArn).toBe(loadBalancerArn);
    expect(l.DefaultActions!.length).toBe(1);
    expect(l.DefaultActions![0].Type).toBe("forward");
    listenerArn = l.ListenerArn!;
  });

  test("DescribeListeners - by LB", async () => {
    const res = await elbv2.send(new DescribeListenersCommand({
      LoadBalancerArn: loadBalancerArn,
    }));
    expect(res.Listeners!.length).toBeGreaterThanOrEqual(1);
    expect(res.Listeners!.some((l) => l.ListenerArn === listenerArn)).toBe(true);
  });

  test("DescribeTags", async () => {
    const res = await elbv2.send(new DescribeTagsCommand({
      ResourceArns: [loadBalancerArn],
    }));
    expect(res.TagDescriptions).toBeDefined();
    expect(res.TagDescriptions!.length).toBe(1);
    expect(res.TagDescriptions![0].ResourceArn).toBe(loadBalancerArn);
    expect(res.TagDescriptions![0].Tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("AddTags", async () => {
    await elbv2.send(new AddTagsCommand({
      ResourceArns: [loadBalancerArn],
      Tags: [{ Key: "team", Value: "platform" }],
    }));
    const res = await elbv2.send(new DescribeTagsCommand({
      ResourceArns: [loadBalancerArn],
    }));
    expect(res.TagDescriptions![0].Tags!.some((t) => t.Key === "team" && t.Value === "platform")).toBe(true);
  });

  test("RemoveTags", async () => {
    await elbv2.send(new RemoveTagsCommand({
      ResourceArns: [loadBalancerArn],
      TagKeys: ["team"],
    }));
    const res = await elbv2.send(new DescribeTagsCommand({
      ResourceArns: [loadBalancerArn],
    }));
    expect(res.TagDescriptions![0].Tags!.some((t) => t.Key === "team")).toBe(false);
  });

  // --- Target registration ---

  test("RegisterTargets", async () => {
    await elbv2.send(new RegisterTargetsCommand({
      TargetGroupArn: targetGroupArn,
      Targets: [
        { Id: "i-1234567890abcdef0", Port: 8080 },
        { Id: "i-0987654321fedcba0", Port: 8080 },
      ],
    }));
    // Verify via DescribeTargetHealth
    const res = await elbv2.send(new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn,
    }));
    expect(res.TargetHealthDescriptions).toBeDefined();
    expect(res.TargetHealthDescriptions!.length).toBe(2);
    expect(res.TargetHealthDescriptions!.every((t) => t.TargetHealth!.State === "healthy")).toBe(true);
  });

  test("DescribeTargetHealth", async () => {
    const res = await elbv2.send(new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn,
    }));
    expect(res.TargetHealthDescriptions!.length).toBe(2);
    const ids = res.TargetHealthDescriptions!.map((t) => t.Target!.Id);
    expect(ids).toContain("i-1234567890abcdef0");
    expect(ids).toContain("i-0987654321fedcba0");
  });

  test("DeregisterTargets", async () => {
    await elbv2.send(new DeregisterTargetsCommand({
      TargetGroupArn: targetGroupArn,
      Targets: [{ Id: "i-0987654321fedcba0", Port: 8080 }],
    }));
    const res = await elbv2.send(new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn,
    }));
    expect(res.TargetHealthDescriptions!.length).toBe(1);
    expect(res.TargetHealthDescriptions![0].Target!.Id).toBe("i-1234567890abcdef0");
  });

  test("RegisterTargets - duplicate is idempotent", async () => {
    await elbv2.send(new RegisterTargetsCommand({
      TargetGroupArn: targetGroupArn,
      Targets: [{ Id: "i-1234567890abcdef0", Port: 8080 }],
    }));
    const res = await elbv2.send(new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn,
    }));
    expect(res.TargetHealthDescriptions!.length).toBe(1);
  });

  // --- Listener rules ---

  let ruleArn: string;

  test("CreateRule with path-pattern condition", async () => {
    const res = await elbv2.send(new CreateRuleCommand({
      ListenerArn: listenerArn,
      Priority: 10,
      Conditions: [
        { Field: "path-pattern", Values: ["/api/*"] },
      ],
      Actions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
    }));
    expect(res.Rules).toBeDefined();
    expect(res.Rules!.length).toBe(1);
    const rule = res.Rules![0];
    expect(rule.RuleArn).toBeDefined();
    expect(rule.Priority).toBe("10");
    expect(rule.IsDefault).toBe(false);
    expect(rule.Conditions!.length).toBe(1);
    expect(rule.Conditions![0].Field).toBe("path-pattern");
    expect(rule.Conditions![0].Values).toContain("/api/*");
    expect(rule.Actions!.length).toBe(1);
    expect(rule.Actions![0].Type).toBe("forward");
    ruleArn = rule.RuleArn!;
  });

  test("DescribeRules", async () => {
    const res = await elbv2.send(new DescribeRulesCommand({
      ListenerArn: listenerArn,
    }));
    expect(res.Rules).toBeDefined();
    expect(res.Rules!.length).toBeGreaterThanOrEqual(1);
    expect(res.Rules!.some((r) => r.RuleArn === ruleArn)).toBe(true);
  });

  test("DeleteRule", async () => {
    await elbv2.send(new DeleteRuleCommand({ RuleArn: ruleArn }));
    const res = await elbv2.send(new DescribeRulesCommand({
      ListenerArn: listenerArn,
    }));
    expect(res.Rules!.some((r) => r.RuleArn === ruleArn)).toBe(false);
  });

  // --- ModifyListener ---

  test("ModifyListener", async () => {
    const res = await elbv2.send(new ModifyListenerCommand({
      ListenerArn: listenerArn,
      Port: 8080,
      Protocol: "HTTPS",
    }));
    expect(res.Listeners).toBeDefined();
    expect(res.Listeners!.length).toBe(1);
    expect(res.Listeners![0].Port).toBe(8080);
    expect(res.Listeners![0].Protocol).toBe("HTTPS");
  });

  // --- ModifyTargetGroup ---

  test("ModifyTargetGroup", async () => {
    const res = await elbv2.send(new ModifyTargetGroupCommand({
      TargetGroupArn: targetGroupArn,
      HealthCheckPath: "/healthz",
      HealthCheckIntervalSeconds: 15,
    }));
    expect(res.TargetGroups).toBeDefined();
    expect(res.TargetGroups!.length).toBe(1);
    expect(res.TargetGroups![0].HealthCheckPath).toBe("/healthz");
    expect(res.TargetGroups![0].HealthCheckIntervalSeconds).toBe(15);
  });

  // --- Cleanup ---

  test("DeleteListener", async () => {
    await elbv2.send(new DeleteListenerCommand({ ListenerArn: listenerArn }));
    const res = await elbv2.send(new DescribeListenersCommand({
      LoadBalancerArn: loadBalancerArn,
    }));
    expect(res.Listeners!.some((l) => l.ListenerArn === listenerArn)).toBe(false);
  });

  test("DeleteTargetGroup", async () => {
    await elbv2.send(new DeleteTargetGroupCommand({ TargetGroupArn: targetGroupArn }));
    const res = await elbv2.send(new DescribeTargetGroupsCommand({}));
    expect(res.TargetGroups!.some((tg) => tg.TargetGroupArn === targetGroupArn)).toBe(false);
  });

  test("DeleteLoadBalancer", async () => {
    await elbv2.send(new DeleteLoadBalancerCommand({ LoadBalancerArn: loadBalancerArn }));
    const res = await elbv2.send(new DescribeLoadBalancersCommand({}));
    expect(res.LoadBalancers!.some((lb) => lb.LoadBalancerArn === loadBalancerArn)).toBe(false);
  });
});
