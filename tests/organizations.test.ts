import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  OrganizationsClient,
  CreateOrganizationCommand,
  DescribeOrganizationCommand,
  ListAccountsCommand,
  CreateAccountCommand,
  DescribeAccountCommand,
  CreateOrganizationalUnitCommand,
  ListOrganizationalUnitsForParentCommand,
  MoveAccountCommand,
  ListRootsCommand,
  CreatePolicyCommand,
  ListPoliciesCommand,
  AttachPolicyCommand,
  DetachPolicyCommand,
  ListChildrenCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-organizations";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new OrganizationsClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Organizations", () => {
  let orgId: string;
  let rootId: string;
  let accountId: string;
  let ouId: string;
  let policyId: string;

  test("CreateOrganization", async () => {
    const res = await client.send(new CreateOrganizationCommand({ FeatureSet: "ALL" }));
    expect(res.Organization).toBeDefined();
    orgId = res.Organization!.Id!;
    expect(orgId).toMatch(/^o-/);
    expect(res.Organization!.FeatureSet).toBe("ALL");
  });

  test("DescribeOrganization", async () => {
    const res = await client.send(new DescribeOrganizationCommand({}));
    expect(res.Organization!.Id).toBe(orgId);
  });

  test("ListRoots", async () => {
    const res = await client.send(new ListRootsCommand({}));
    expect(res.Roots!.length).toBe(1);
    rootId = res.Roots![0].Id!;
    expect(rootId).toMatch(/^r-/);
    expect(res.Roots![0].Name).toBe("Root");
  });

  test("ListAccounts (master only)", async () => {
    const res = await client.send(new ListAccountsCommand({}));
    expect(res.Accounts!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateAccount", async () => {
    const res = await client.send(new CreateAccountCommand({
      AccountName: "Test Account",
      Email: "test@example.com",
    }));
    expect(res.CreateAccountStatus!.State).toBe("SUCCEEDED");
    accountId = res.CreateAccountStatus!.AccountId!;
    expect(accountId).toBeDefined();
  });

  test("DescribeAccount", async () => {
    const res = await client.send(new DescribeAccountCommand({ AccountId: accountId }));
    expect(res.Account!.Name).toBe("Test Account");
    expect(res.Account!.Email).toBe("test@example.com");
    expect(res.Account!.Status).toBe("ACTIVE");
  });

  test("CreateOrganizationalUnit", async () => {
    const res = await client.send(new CreateOrganizationalUnitCommand({
      ParentId: rootId,
      Name: "Engineering",
    }));
    ouId = res.OrganizationalUnit!.Id!;
    expect(ouId).toMatch(/^ou-/);
    expect(res.OrganizationalUnit!.Name).toBe("Engineering");
  });

  test("ListOrganizationalUnitsForParent", async () => {
    const res = await client.send(new ListOrganizationalUnitsForParentCommand({
      ParentId: rootId,
    }));
    expect(res.OrganizationalUnits!.some((ou) => ou.Id === ouId)).toBe(true);
  });

  test("MoveAccount", async () => {
    await client.send(new MoveAccountCommand({
      AccountId: accountId,
      SourceParentId: rootId,
      DestinationParentId: ouId,
    }));
    // Verify by listing children
    const res = await client.send(new ListChildrenCommand({
      ParentId: ouId,
      ChildType: "ACCOUNT",
    }));
    expect(res.Children!.some((c) => c.Id === accountId)).toBe(true);
  });

  test("CreatePolicy", async () => {
    const res = await client.send(new CreatePolicyCommand({
      Name: "TestSCP",
      Description: "Test SCP policy",
      Content: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] }),
      Type: "SERVICE_CONTROL_POLICY",
    }));
    policyId = res.Policy!.PolicySummary!.Id!;
    expect(policyId).toMatch(/^p-/);
  });

  test("ListPolicies", async () => {
    const res = await client.send(new ListPoliciesCommand({
      Filter: "SERVICE_CONTROL_POLICY",
    }));
    expect(res.Policies!.some((p) => p.Id === policyId)).toBe(true);
  });

  test("AttachPolicy and DetachPolicy", async () => {
    await client.send(new AttachPolicyCommand({
      PolicyId: policyId,
      TargetId: rootId,
    }));
    // No error means success; now detach
    await client.send(new DetachPolicyCommand({
      PolicyId: policyId,
      TargetId: rootId,
    }));
  });

  test("ListChildren", async () => {
    const res = await client.send(new ListChildrenCommand({
      ParentId: rootId,
      ChildType: "ORGANIZATIONAL_UNIT",
    }));
    expect(res.Children!.some((c) => c.Id === ouId)).toBe(true);
  });

  test("TagResource and UntagResource", async () => {
    await client.send(new TagResourceCommand({
      ResourceId: ouId,
      Tags: [{ Key: "env", Value: "prod" }],
    }));
    await client.send(new UntagResourceCommand({
      ResourceId: ouId,
      TagKeys: ["env"],
    }));
  });
});
