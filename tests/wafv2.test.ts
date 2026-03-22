import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  WAFV2Client,
  CreateWebACLCommand,
  GetWebACLCommand,
  ListWebACLsCommand,
  UpdateWebACLCommand,
  DeleteWebACLCommand,
  CreateIPSetCommand,
  GetIPSetCommand,
  ListIPSetsCommand,
  UpdateIPSetCommand,
  DeleteIPSetCommand,
  CreateRuleGroupCommand,
  GetRuleGroupCommand,
  ListRuleGroupsCommand,
  AssociateWebACLCommand,
  DisassociateWebACLCommand,
  GetWebACLForResourceCommand,
  CreateRegexPatternSetCommand,
  GetRegexPatternSetCommand,
  ListRegexPatternSetsCommand,
  UpdateRegexPatternSetCommand,
  DeleteRegexPatternSetCommand,
  PutLoggingConfigurationCommand,
  GetLoggingConfigurationCommand,
  DeleteLoggingConfigurationCommand,
  ListLoggingConfigurationsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-wafv2";
import { startServer, stopServer, clientConfig } from "./helpers";

const wafv2 = new WAFV2Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("WAFv2", () => {
  let webAclId: string;
  let webAclArn: string;
  let lockToken: string;

  test("CreateWebACL", async () => {
    const res = await wafv2.send(new CreateWebACLCommand({
      Name: "test-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      Rules: [],
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: "test-acl-metric",
      },
    }));
    expect(res.Summary).toBeDefined();
    expect(res.Summary!.Name).toBe("test-acl");
    webAclId = res.Summary!.Id!;
    webAclArn = res.Summary!.ARN!;
    lockToken = res.Summary!.LockToken!;
    expect(webAclId).toBeDefined();
    expect(webAclArn).toContain("wafv2");
  });

  test("GetWebACL", async () => {
    const res = await wafv2.send(new GetWebACLCommand({
      Name: "test-acl",
      Scope: "REGIONAL",
      Id: webAclId,
    }));
    expect(res.WebACL).toBeDefined();
    expect(res.WebACL!.Name).toBe("test-acl");
    expect(res.WebACL!.Id).toBe(webAclId);
    expect(res.LockToken).toBeDefined();
  });

  test("ListWebACLs", async () => {
    const res = await wafv2.send(new ListWebACLsCommand({ Scope: "REGIONAL" }));
    expect(res.WebACLs!.length).toBeGreaterThanOrEqual(1);
    expect(res.WebACLs!.some((a) => a.Id === webAclId)).toBe(true);
  });

  test("UpdateWebACL", async () => {
    const res = await wafv2.send(new UpdateWebACLCommand({
      Name: "test-acl",
      Scope: "REGIONAL",
      Id: webAclId,
      LockToken: lockToken,
      DefaultAction: { Block: {} },
      Rules: [],
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: "test-acl-metric",
      },
    }));
    expect(res.NextLockToken).toBeDefined();
    lockToken = res.NextLockToken!;

    // Verify the update
    const getRes = await wafv2.send(new GetWebACLCommand({
      Name: "test-acl",
      Scope: "REGIONAL",
      Id: webAclId,
    }));
    expect(getRes.WebACL!.DefaultAction!.Block).toBeDefined();
  });

  test("UpdateWebACL rejects wrong LockToken", async () => {
    await expect(
      wafv2.send(new UpdateWebACLCommand({
        Name: "test-acl",
        Scope: "REGIONAL",
        Id: webAclId,
        LockToken: "wrong-lock-token",
        DefaultAction: { Allow: {} },
        Rules: [],
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: "test-acl-metric",
        },
      })),
    ).rejects.toThrow();
  });

  // --- IPSet ---
  let ipSetId: string;
  let ipSetLockToken: string;

  test("CreateIPSet", async () => {
    const res = await wafv2.send(new CreateIPSetCommand({
      Name: "test-ipset",
      Scope: "REGIONAL",
      IPAddressVersion: "IPV4",
      Addresses: ["10.0.0.0/8", "192.168.0.0/16"],
    }));
    expect(res.Summary).toBeDefined();
    expect(res.Summary!.Name).toBe("test-ipset");
    ipSetId = res.Summary!.Id!;
    ipSetLockToken = res.Summary!.LockToken!;
  });

  test("GetIPSet", async () => {
    const res = await wafv2.send(new GetIPSetCommand({
      Name: "test-ipset",
      Scope: "REGIONAL",
      Id: ipSetId,
    }));
    expect(res.IPSet).toBeDefined();
    expect(res.IPSet!.Addresses).toContain("10.0.0.0/8");
    expect(res.IPSet!.IPAddressVersion).toBe("IPV4");
  });

  test("ListIPSets", async () => {
    const res = await wafv2.send(new ListIPSetsCommand({ Scope: "REGIONAL" }));
    expect(res.IPSets!.some((s) => s.Id === ipSetId)).toBe(true);
  });

  test("UpdateIPSet", async () => {
    const res = await wafv2.send(new UpdateIPSetCommand({
      Name: "test-ipset",
      Scope: "REGIONAL",
      Id: ipSetId,
      LockToken: ipSetLockToken,
      Addresses: ["172.16.0.0/12"],
    }));
    expect(res.NextLockToken).toBeDefined();
    ipSetLockToken = res.NextLockToken!;

    const getRes = await wafv2.send(new GetIPSetCommand({
      Name: "test-ipset",
      Scope: "REGIONAL",
      Id: ipSetId,
    }));
    expect(getRes.IPSet!.Addresses).toEqual(["172.16.0.0/12"]);
  });

  test("DeleteIPSet", async () => {
    await wafv2.send(new DeleteIPSetCommand({
      Name: "test-ipset",
      Scope: "REGIONAL",
      Id: ipSetId,
      LockToken: ipSetLockToken,
    }));

    const res = await wafv2.send(new ListIPSetsCommand({ Scope: "REGIONAL" }));
    expect(res.IPSets!.some((s) => s.Id === ipSetId)).toBe(false);
  });

  // --- RuleGroup ---
  let ruleGroupId: string;

  test("CreateRuleGroup", async () => {
    const res = await wafv2.send(new CreateRuleGroupCommand({
      Name: "test-rulegroup",
      Scope: "REGIONAL",
      Capacity: 100,
      Rules: [],
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: "test-rg-metric",
      },
    }));
    expect(res.Summary).toBeDefined();
    expect(res.Summary!.Name).toBe("test-rulegroup");
    ruleGroupId = res.Summary!.Id!;
  });

  test("GetRuleGroup", async () => {
    const res = await wafv2.send(new GetRuleGroupCommand({
      Name: "test-rulegroup",
      Scope: "REGIONAL",
      Id: ruleGroupId,
    }));
    expect(res.RuleGroup).toBeDefined();
    expect(res.RuleGroup!.Name).toBe("test-rulegroup");
    expect(res.RuleGroup!.Capacity).toBe(100);
  });

  test("ListRuleGroups", async () => {
    const res = await wafv2.send(new ListRuleGroupsCommand({ Scope: "REGIONAL" }));
    expect(res.RuleGroups!.some((rg) => rg.Id === ruleGroupId)).toBe(true);
  });

  // --- Associations ---
  test("AssociateWebACL", async () => {
    const resourceArn = "arn:aws:elasticloadbalancing:us-east-1:000000000000:loadbalancer/app/my-alb/1234";
    await wafv2.send(new AssociateWebACLCommand({
      WebACLArn: webAclArn,
      ResourceArn: resourceArn,
    }));

    const res = await wafv2.send(new GetWebACLForResourceCommand({
      ResourceArn: resourceArn,
    }));
    expect(res.WebACL).toBeDefined();
    expect(res.WebACL!.Name).toBe("test-acl");
  });

  test("DisassociateWebACL", async () => {
    const resourceArn = "arn:aws:elasticloadbalancing:us-east-1:000000000000:loadbalancer/app/my-alb/1234";
    await wafv2.send(new DisassociateWebACLCommand({
      ResourceArn: resourceArn,
    }));

    const res = await wafv2.send(new GetWebACLForResourceCommand({
      ResourceArn: resourceArn,
    }));
    expect(res.WebACL ?? null).toBeNull();
  });

  // --- Cleanup ---
  test("DeleteWebACL", async () => {
    await wafv2.send(new DeleteWebACLCommand({
      Name: "test-acl",
      Scope: "REGIONAL",
      Id: webAclId,
      LockToken: lockToken,
    }));

    const res = await wafv2.send(new ListWebACLsCommand({ Scope: "REGIONAL" }));
    expect(res.WebACLs!.some((a) => a.Id === webAclId)).toBe(false);
  });

  // --- RegexPatternSet ---
  let regexId: string;
  let regexLockToken: string;

  test("CreateRegexPatternSet", async () => {
    const res = await wafv2.send(new CreateRegexPatternSetCommand({
      Name: "test-regex",
      Scope: "REGIONAL",
      RegularExpressionList: [{ RegexString: "^/api/.*" }, { RegexString: "^/admin/.*" }],
      Description: "Test regex set",
    }));
    expect(res.Summary).toBeDefined();
    expect(res.Summary!.Name).toBe("test-regex");
    regexId = res.Summary!.Id!;
    regexLockToken = res.Summary!.LockToken!;
  });

  test("GetRegexPatternSet", async () => {
    const res = await wafv2.send(new GetRegexPatternSetCommand({
      Name: "test-regex",
      Scope: "REGIONAL",
      Id: regexId,
    }));
    expect(res.RegexPatternSet).toBeDefined();
    expect(res.RegexPatternSet!.Name).toBe("test-regex");
    expect(res.RegexPatternSet!.RegularExpressionList!.length).toBe(2);
    expect(res.LockToken).toBeDefined();
  });

  test("ListRegexPatternSets", async () => {
    const res = await wafv2.send(new ListRegexPatternSetsCommand({ Scope: "REGIONAL" }));
    expect(res.RegexPatternSets!.some((s) => s.Id === regexId)).toBe(true);
  });

  test("UpdateRegexPatternSet", async () => {
    const res = await wafv2.send(new UpdateRegexPatternSetCommand({
      Name: "test-regex",
      Scope: "REGIONAL",
      Id: regexId,
      LockToken: regexLockToken,
      RegularExpressionList: [{ RegexString: "^/v2/.*" }],
    }));
    expect(res.NextLockToken).toBeDefined();
    regexLockToken = res.NextLockToken!;

    const getRes = await wafv2.send(new GetRegexPatternSetCommand({
      Name: "test-regex",
      Scope: "REGIONAL",
      Id: regexId,
    }));
    expect(getRes.RegexPatternSet!.RegularExpressionList!.length).toBe(1);
    expect(getRes.RegexPatternSet!.RegularExpressionList![0].RegexString).toBe("^/v2/.*");
  });

  test("UpdateRegexPatternSet wrong LockToken throws", async () => {
    await expect(
      wafv2.send(new UpdateRegexPatternSetCommand({
        Name: "test-regex",
        Scope: "REGIONAL",
        Id: regexId,
        LockToken: "wrong-token",
        RegularExpressionList: [],
      })),
    ).rejects.toThrow();
  });

  test("DeleteRegexPatternSet", async () => {
    await wafv2.send(new DeleteRegexPatternSetCommand({
      Name: "test-regex",
      Scope: "REGIONAL",
      Id: regexId,
      LockToken: regexLockToken,
    }));

    const res = await wafv2.send(new ListRegexPatternSetsCommand({ Scope: "REGIONAL" }));
    expect(res.RegexPatternSets!.some((s) => s.Id === regexId)).toBe(false);
  });

  // --- Logging Configuration ---
  // Need a WebACL for logging tests; create a fresh one
  let loggingAclArn: string;
  let loggingAclId: string;
  let loggingLockToken: string;

  test("setup WebACL for logging tests", async () => {
    const res = await wafv2.send(new CreateWebACLCommand({
      Name: "logging-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      Rules: [],
      VisibilityConfig: { SampledRequestsEnabled: true, CloudWatchMetricsEnabled: true, MetricName: "logging-acl-metric" },
    }));
    loggingAclArn = res.Summary!.ARN!;
    loggingAclId = res.Summary!.Id!;
    loggingLockToken = res.Summary!.LockToken!;
  });

  test("PutLoggingConfiguration", async () => {
    const res = await wafv2.send(new PutLoggingConfigurationCommand({
      LoggingConfiguration: {
        ResourceArn: loggingAclArn,
        LogDestinationConfigs: ["arn:aws:firehose:us-east-1:000000000000:deliverystream/aws-waf-logs-test"],
      },
    }));
    expect(res.LoggingConfiguration).toBeDefined();
    expect(res.LoggingConfiguration!.ResourceArn).toBe(loggingAclArn);
    expect(res.LoggingConfiguration!.LogDestinationConfigs!.length).toBe(1);
  });

  test("GetLoggingConfiguration", async () => {
    const res = await wafv2.send(new GetLoggingConfigurationCommand({
      ResourceArn: loggingAclArn,
    }));
    expect(res.LoggingConfiguration!.ResourceArn).toBe(loggingAclArn);
  });

  test("ListLoggingConfigurations", async () => {
    const res = await wafv2.send(new ListLoggingConfigurationsCommand({ Scope: "REGIONAL" }));
    expect(res.LoggingConfigurations!.some((c) => c.ResourceArn === loggingAclArn)).toBe(true);
  });

  test("DeleteLoggingConfiguration", async () => {
    await wafv2.send(new DeleteLoggingConfigurationCommand({ ResourceArn: loggingAclArn }));
    try {
      await wafv2.send(new GetLoggingConfigurationCommand({ ResourceArn: loggingAclArn }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("WAFNonexistentItemException");
    }
  });

  // --- Tags ---
  test("TagResource + ListTagsForResource", async () => {
    await wafv2.send(new TagResourceCommand({
      ResourceARN: loggingAclArn,
      Tags: [{ Key: "env", Value: "test" }, { Key: "team", Value: "platform" }],
    }));

    const res = await wafv2.send(new ListTagsForResourceCommand({ ResourceARN: loggingAclArn }));
    expect(res.TagInfoForResource!.TagList!.length).toBe(2);
    expect(res.TagInfoForResource!.TagList!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("UntagResource", async () => {
    await wafv2.send(new UntagResourceCommand({
      ResourceARN: loggingAclArn,
      TagKeys: ["env"],
    }));

    const res = await wafv2.send(new ListTagsForResourceCommand({ ResourceARN: loggingAclArn }));
    expect(res.TagInfoForResource!.TagList!.length).toBe(1);
    expect(res.TagInfoForResource!.TagList![0].Key).toBe("team");
  });

  // cleanup logging ACL
  test("cleanup logging WebACL", async () => {
    await wafv2.send(new DeleteWebACLCommand({
      Name: "logging-acl",
      Scope: "REGIONAL",
      Id: loggingAclId,
      LockToken: loggingLockToken,
    }));
  });

  test("CreateWebACL duplicate name rejected", async () => {
    await wafv2.send(new CreateWebACLCommand({
      Name: "dup-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      Rules: [],
      VisibilityConfig: {
        SampledRequestsEnabled: true,
        CloudWatchMetricsEnabled: true,
        MetricName: "dup-acl-metric",
      },
    }));

    await expect(
      wafv2.send(new CreateWebACLCommand({
        Name: "dup-acl",
        Scope: "REGIONAL",
        DefaultAction: { Allow: {} },
        Rules: [],
        VisibilityConfig: {
          SampledRequestsEnabled: true,
          CloudWatchMetricsEnabled: true,
          MetricName: "dup-acl-metric",
        },
      })),
    ).rejects.toThrow();
  });
});
