import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  NetworkFirewallClient,
  CreateFirewallCommand,
  DescribeFirewallCommand,
  ListFirewallsCommand,
  DeleteFirewallCommand,
  UpdateFirewallDescriptionCommand,
  CreateFirewallPolicyCommand,
  DescribeFirewallPolicyCommand,
  ListFirewallPoliciesCommand,
  DeleteFirewallPolicyCommand,
  CreateRuleGroupCommand,
  DescribeRuleGroupCommand,
  ListRuleGroupsCommand,
  DeleteRuleGroupCommand,
  AssociateFirewallPolicyCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-network-firewall";
import { startServer, stopServer, clientConfig } from "./helpers";

const nfw = new NetworkFirewallClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Network Firewall", () => {
  let firewallArn: string;
  let policyArn: string;
  let ruleGroupArn: string;

  test("CreateFirewallPolicy", async () => {
    const res = await nfw.send(new CreateFirewallPolicyCommand({
      FirewallPolicyName: "test-policy",
      FirewallPolicy: {
        StatelessDefaultActions: ["aws:pass"],
        StatelessFragmentDefaultActions: ["aws:pass"],
      },
      Description: "Test policy",
    }));
    expect(res.FirewallPolicyResponse).toBeDefined();
    expect(res.FirewallPolicyResponse!.FirewallPolicyName).toBe("test-policy");
    policyArn = res.FirewallPolicyResponse!.FirewallPolicyArn!;
  });

  test("DescribeFirewallPolicy", async () => {
    const res = await nfw.send(new DescribeFirewallPolicyCommand({
      FirewallPolicyArn: policyArn,
    }));
    expect(res.FirewallPolicy).toBeDefined();
    expect(res.FirewallPolicy!.StatelessDefaultActions).toEqual(["aws:pass"]);
    expect(res.FirewallPolicyResponse!.Description).toBe("Test policy");
  });

  test("ListFirewallPolicies", async () => {
    const res = await nfw.send(new ListFirewallPoliciesCommand({}));
    expect(res.FirewallPolicies!.length).toBeGreaterThanOrEqual(1);
    expect(res.FirewallPolicies!.some((p) => p.Arn === policyArn)).toBe(true);
  });

  test("CreateFirewall", async () => {
    const res = await nfw.send(new CreateFirewallCommand({
      FirewallName: "test-firewall",
      FirewallPolicyArn: policyArn,
      VpcId: "vpc-test123",
      SubnetMappings: [{ SubnetId: "subnet-abc123" }],
      Description: "A test firewall",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    expect(res.Firewall).toBeDefined();
    expect(res.Firewall!.FirewallName).toBe("test-firewall");
    expect(res.Firewall!.FirewallPolicyArn).toBe(policyArn);
    expect(res.FirewallStatus!.Status).toBe("READY");
    firewallArn = res.Firewall!.FirewallArn!;
  });

  test("DescribeFirewall", async () => {
    const res = await nfw.send(new DescribeFirewallCommand({
      FirewallArn: firewallArn,
    }));
    expect(res.Firewall!.FirewallName).toBe("test-firewall");
    expect(res.Firewall!.Description).toBe("A test firewall");
    expect(res.Firewall!.VpcId).toBe("vpc-test123");
  });

  test("ListFirewalls", async () => {
    const res = await nfw.send(new ListFirewallsCommand({}));
    expect(res.Firewalls!.length).toBeGreaterThanOrEqual(1);
    expect(res.Firewalls!.some((f) => f.FirewallArn === firewallArn)).toBe(true);
  });

  test("UpdateFirewallDescription", async () => {
    const res = await nfw.send(new UpdateFirewallDescriptionCommand({
      FirewallArn: firewallArn,
      Description: "Updated description",
    }));
    expect(res.Description).toBe("Updated description");
    expect(res.UpdateToken).toBeDefined();
  });

  test("CreateRuleGroup", async () => {
    const res = await nfw.send(new CreateRuleGroupCommand({
      RuleGroupName: "test-rule-group",
      Type: "STATEFUL",
      Capacity: 100,
      RuleGroup: {
        RulesSource: {
          RulesString: "pass tcp any any -> any any (msg:\"test\"; sid:1; rev:1;)",
        },
      },
      Description: "Test rule group",
    }));
    expect(res.RuleGroupResponse).toBeDefined();
    expect(res.RuleGroupResponse!.RuleGroupName).toBe("test-rule-group");
    expect(res.RuleGroupResponse!.Type).toBe("STATEFUL");
    expect(res.RuleGroupResponse!.Capacity).toBe(100);
    ruleGroupArn = res.RuleGroupResponse!.RuleGroupArn!;
  });

  test("DescribeRuleGroup", async () => {
    const res = await nfw.send(new DescribeRuleGroupCommand({
      RuleGroupArn: ruleGroupArn,
    }));
    expect(res.RuleGroupResponse!.RuleGroupName).toBe("test-rule-group");
    expect(res.RuleGroup!.RulesSource).toBeDefined();
  });

  test("ListRuleGroups", async () => {
    const res = await nfw.send(new ListRuleGroupsCommand({}));
    expect(res.RuleGroups!.length).toBeGreaterThanOrEqual(1);
    expect(res.RuleGroups!.some((rg) => rg.Arn === ruleGroupArn)).toBe(true);
  });

  test("AssociateFirewallPolicy", async () => {
    // Create a second policy and associate it
    const policyRes = await nfw.send(new CreateFirewallPolicyCommand({
      FirewallPolicyName: "test-policy-2",
      FirewallPolicy: {
        StatelessDefaultActions: ["aws:drop"],
        StatelessFragmentDefaultActions: ["aws:drop"],
      },
    }));
    const newPolicyArn = policyRes.FirewallPolicyResponse!.FirewallPolicyArn!;

    const res = await nfw.send(new AssociateFirewallPolicyCommand({
      FirewallArn: firewallArn,
      FirewallPolicyArn: newPolicyArn,
    }));
    expect(res.FirewallPolicyArn).toBe(newPolicyArn);
    expect(res.UpdateToken).toBeDefined();

    // Verify
    const desc = await nfw.send(new DescribeFirewallCommand({
      FirewallArn: firewallArn,
    }));
    expect(desc.Firewall!.FirewallPolicyArn).toBe(newPolicyArn);

    // Cleanup second policy
    await nfw.send(new DeleteFirewallPolicyCommand({ FirewallPolicyArn: newPolicyArn }));
  });

  test("TagResource + ListTagsForResource", async () => {
    await nfw.send(new TagResourceCommand({
      ResourceArn: firewallArn,
      Tags: [{ Key: "team", Value: "platform" }],
    }));

    const res = await nfw.send(new ListTagsForResourceCommand({
      ResourceArn: firewallArn,
    }));
    expect(res.Tags!.length).toBeGreaterThanOrEqual(1);
    expect(res.Tags!.some((t) => t.Key === "team" && t.Value === "platform")).toBe(true);
  });

  test("UntagResource", async () => {
    await nfw.send(new UntagResourceCommand({
      ResourceArn: firewallArn,
      TagKeys: ["team"],
    }));

    const res = await nfw.send(new ListTagsForResourceCommand({
      ResourceArn: firewallArn,
    }));
    expect(res.Tags!.some((t) => t.Key === "team")).toBe(false);
  });

  test("DeleteRuleGroup", async () => {
    await nfw.send(new DeleteRuleGroupCommand({
      RuleGroupArn: ruleGroupArn,
    }));
    const res = await nfw.send(new ListRuleGroupsCommand({}));
    expect(res.RuleGroups!.some((rg) => rg.Arn === ruleGroupArn)).toBe(false);
  });

  test("DeleteFirewall", async () => {
    const res = await nfw.send(new DeleteFirewallCommand({
      FirewallArn: firewallArn,
    }));
    expect(res.FirewallStatus!.Status).toBe("DELETING");
  });

  test("DeleteFirewallPolicy", async () => {
    await nfw.send(new DeleteFirewallPolicyCommand({
      FirewallPolicyArn: policyArn,
    }));
    const res = await nfw.send(new ListFirewallPoliciesCommand({}));
    expect(res.FirewallPolicies!.some((p) => p.Arn === policyArn)).toBe(false);
  });
});
