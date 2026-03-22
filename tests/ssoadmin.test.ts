import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SSOAdminClient,
  ListInstancesCommand,
  CreatePermissionSetCommand,
  DescribePermissionSetCommand,
  ListPermissionSetsCommand,
  DeletePermissionSetCommand,
  CreateAccountAssignmentCommand,
  ListAccountAssignmentsCommand,
  DeleteAccountAssignmentCommand,
  AttachManagedPolicyToPermissionSetCommand,
  ListManagedPoliciesInPermissionSetCommand,
  DetachManagedPolicyFromPermissionSetCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-sso-admin";
import { startServer, stopServer, clientConfig } from "./helpers";

const sso = new SSOAdminClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("SSO Admin / Identity Center", () => {
  let instanceArn: string;
  let permissionSetArn: string;

  // --- Instances ---

  test("ListInstances", async () => {
    const res = await sso.send(new ListInstancesCommand({}));
    expect(res.Instances).toBeDefined();
    expect(res.Instances!.length).toBeGreaterThanOrEqual(1);
    instanceArn = res.Instances![0].InstanceArn!;
    expect(instanceArn).toContain("sso:::instance/ssoins-");
    expect(res.Instances![0].IdentityStoreId).toBeDefined();
    expect(res.Instances![0].Status).toBe("ACTIVE");
  });

  // --- Permission Sets ---

  test("CreatePermissionSet", async () => {
    const res = await sso.send(new CreatePermissionSetCommand({
      InstanceArn: instanceArn,
      Name: "AdminAccess",
      Description: "Full admin access",
      SessionDuration: "PT2H",
      Tags: [{ Key: "env", Value: "test" }],
    }));
    expect(res.PermissionSet).toBeDefined();
    permissionSetArn = res.PermissionSet!.PermissionSetArn!;
    expect(permissionSetArn).toContain("/ps-");
    expect(res.PermissionSet!.Name).toBe("AdminAccess");
    expect(res.PermissionSet!.Description).toBe("Full admin access");
    expect(res.PermissionSet!.SessionDuration).toBe("PT2H");
  });

  test("DescribePermissionSet", async () => {
    const res = await sso.send(new DescribePermissionSetCommand({
      InstanceArn: instanceArn,
      PermissionSetArn: permissionSetArn,
    }));
    expect(res.PermissionSet).toBeDefined();
    expect(res.PermissionSet!.Name).toBe("AdminAccess");
    expect(res.PermissionSet!.PermissionSetArn).toBe(permissionSetArn);
  });

  test("ListPermissionSets", async () => {
    const res = await sso.send(new ListPermissionSetsCommand({
      InstanceArn: instanceArn,
    }));
    expect(res.PermissionSets).toBeDefined();
    expect(res.PermissionSets!).toContain(permissionSetArn);
  });

  // --- Managed Policies ---

  test("AttachManagedPolicyToPermissionSet", async () => {
    await sso.send(new AttachManagedPolicyToPermissionSetCommand({
      InstanceArn: instanceArn,
      PermissionSetArn: permissionSetArn,
      ManagedPolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    }));
    const res = await sso.send(new ListManagedPoliciesInPermissionSetCommand({
      InstanceArn: instanceArn,
      PermissionSetArn: permissionSetArn,
    }));
    expect(res.AttachedManagedPolicies).toBeDefined();
    expect(res.AttachedManagedPolicies!.length).toBe(1);
    expect(res.AttachedManagedPolicies![0].Arn).toBe("arn:aws:iam::aws:policy/AdministratorAccess");
  });

  test("AttachManagedPolicyToPermissionSet - duplicate", async () => {
    await expect(
      sso.send(new AttachManagedPolicyToPermissionSetCommand({
        InstanceArn: instanceArn,
        PermissionSetArn: permissionSetArn,
        ManagedPolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
      })),
    ).rejects.toThrow();
  });

  test("DetachManagedPolicyFromPermissionSet", async () => {
    await sso.send(new DetachManagedPolicyFromPermissionSetCommand({
      InstanceArn: instanceArn,
      PermissionSetArn: permissionSetArn,
      ManagedPolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    }));
    const res = await sso.send(new ListManagedPoliciesInPermissionSetCommand({
      InstanceArn: instanceArn,
      PermissionSetArn: permissionSetArn,
    }));
    expect(res.AttachedManagedPolicies!.length).toBe(0);
  });

  // --- Account Assignments ---

  test("CreateAccountAssignment", async () => {
    const res = await sso.send(new CreateAccountAssignmentCommand({
      InstanceArn: instanceArn,
      TargetId: "123456789012",
      TargetType: "AWS_ACCOUNT",
      PermissionSetArn: permissionSetArn,
      PrincipalType: "USER",
      PrincipalId: "user-001",
    }));
    expect(res.AccountAssignmentCreationStatus).toBeDefined();
    expect(res.AccountAssignmentCreationStatus!.Status).toBe("SUCCEEDED");
    expect(res.AccountAssignmentCreationStatus!.TargetId).toBe("123456789012");
  });

  test("ListAccountAssignments", async () => {
    const res = await sso.send(new ListAccountAssignmentsCommand({
      InstanceArn: instanceArn,
      AccountId: "123456789012",
      PermissionSetArn: permissionSetArn,
    }));
    expect(res.AccountAssignments).toBeDefined();
    expect(res.AccountAssignments!.length).toBe(1);
    expect(res.AccountAssignments![0].PrincipalType).toBe("USER");
    expect(res.AccountAssignments![0].PrincipalId).toBe("user-001");
  });

  test("DeleteAccountAssignment", async () => {
    const res = await sso.send(new DeleteAccountAssignmentCommand({
      InstanceArn: instanceArn,
      TargetId: "123456789012",
      TargetType: "AWS_ACCOUNT",
      PermissionSetArn: permissionSetArn,
      PrincipalType: "USER",
      PrincipalId: "user-001",
    }));
    expect(res.AccountAssignmentDeletionStatus).toBeDefined();
    expect(res.AccountAssignmentDeletionStatus!.Status).toBe("SUCCEEDED");

    const list = await sso.send(new ListAccountAssignmentsCommand({
      InstanceArn: instanceArn,
      AccountId: "123456789012",
      PermissionSetArn: permissionSetArn,
    }));
    expect(list.AccountAssignments!.length).toBe(0);
  });

  // --- Tags ---

  test("TagResource and ListTagsForResource", async () => {
    await sso.send(new TagResourceCommand({
      InstanceArn: instanceArn,
      ResourceArn: permissionSetArn,
      Tags: [{ Key: "project", Value: "tinstack" }],
    }));
    const res = await sso.send(new ListTagsForResourceCommand({
      InstanceArn: instanceArn,
      ResourceArn: permissionSetArn,
    }));
    expect(res.Tags).toBeDefined();
    expect(res.Tags!.find((t) => t.Key === "project")?.Value).toBe("tinstack");
  });

  test("UntagResource", async () => {
    await sso.send(new UntagResourceCommand({
      InstanceArn: instanceArn,
      ResourceArn: permissionSetArn,
      TagKeys: ["project"],
    }));
    const res = await sso.send(new ListTagsForResourceCommand({
      InstanceArn: instanceArn,
      ResourceArn: permissionSetArn,
    }));
    expect(res.Tags!.find((t) => t.Key === "project")).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeletePermissionSet", async () => {
    await sso.send(new DeletePermissionSetCommand({
      InstanceArn: instanceArn,
      PermissionSetArn: permissionSetArn,
    }));
    const res = await sso.send(new ListPermissionSetsCommand({
      InstanceArn: instanceArn,
    }));
    expect(res.PermissionSets!).not.toContain(permissionSetArn);
  });

  test("DescribePermissionSet - not found", async () => {
    await expect(
      sso.send(new DescribePermissionSetCommand({
        InstanceArn: instanceArn,
        PermissionSetArn: permissionSetArn,
      })),
    ).rejects.toThrow();
  });
});
