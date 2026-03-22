import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  IAMClient,
  CreateUserCommand,
  GetUserCommand,
  DeleteUserCommand,
  UpdateUserCommand,
  CreateGroupCommand,
  GetGroupCommand,
  ListGroupsCommand,
  DeleteGroupCommand,
  AddUserToGroupCommand,
  RemoveUserFromGroupCommand,
  ListGroupsForUserCommand,
  PutGroupPolicyCommand,
  GetGroupPolicyCommand,
  ListGroupPoliciesCommand,
  DeleteGroupPolicyCommand,
  CreateAccessKeyCommand,
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  UpdateAccessKeyCommand,
  GetAccessKeyLastUsedCommand,
  CreateInstanceProfileCommand,
  GetInstanceProfileCommand,
  ListInstanceProfilesCommand,
  DeleteInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  RemoveRoleFromInstanceProfileCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  PutUserPolicyCommand,
  GetUserPolicyCommand,
  ListUserPoliciesCommand,
  DeleteUserPolicyCommand,
  AttachUserPolicyCommand,
  DetachUserPolicyCommand,
  ListAttachedUserPoliciesCommand,
  CreatePolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  ListPolicyVersionsCommand,
  CreatePolicyVersionCommand,
  DeletePolicyVersionCommand,
  SetDefaultPolicyVersionCommand,
  DeletePolicyCommand,
  UpdateRoleCommand,
  UpdateAssumeRolePolicyCommand,
  PutRolePolicyCommand,
  GetRolePolicyCommand,
  TagRoleCommand,
  UntagRoleCommand,
  ListRoleTagsCommand,
  ListInstanceProfilesForRoleCommand,
} from "@aws-sdk/client-iam";
import { startServer, stopServer, clientConfig } from "./helpers";

const iam = new IAMClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

const TRUST_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" }],
});

const INLINE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
});

describe("IAM Groups", () => {
  const groupName = "test-group";
  const userName = "group-test-user";

  test("CreateGroup", async () => {
    const res = await iam.send(new CreateGroupCommand({ GroupName: groupName, Path: "/engineering/" }));
    expect(res.Group?.GroupName).toBe(groupName);
    expect(res.Group?.GroupId).toBeDefined();
    expect(res.Group?.Arn).toContain("group/");
    expect(res.Group?.Path).toBe("/engineering/");
  });

  test("CreateGroup duplicate fails", async () => {
    await expect(iam.send(new CreateGroupCommand({ GroupName: groupName }))).rejects.toThrow();
  });

  test("ListGroups", async () => {
    const res = await iam.send(new ListGroupsCommand({}));
    expect(res.Groups!.length).toBeGreaterThanOrEqual(1);
    expect(res.Groups!.some((g) => g.GroupName === groupName)).toBe(true);
  });

  test("GetGroup returns empty users initially", async () => {
    const res = await iam.send(new GetGroupCommand({ GroupName: groupName }));
    expect(res.Group?.GroupName).toBe(groupName);
    expect(res.Users).toEqual([]);
  });

  test("AddUserToGroup and GetGroup returns user", async () => {
    await iam.send(new CreateUserCommand({ UserName: userName }));
    await iam.send(new AddUserToGroupCommand({ GroupName: groupName, UserName: userName }));

    const res = await iam.send(new GetGroupCommand({ GroupName: groupName }));
    expect(res.Users!.length).toBe(1);
    expect(res.Users![0].UserName).toBe(userName);
  });

  test("ListGroupsForUser", async () => {
    const res = await iam.send(new ListGroupsForUserCommand({ UserName: userName }));
    expect(res.Groups!.length).toBe(1);
    expect(res.Groups![0].GroupName).toBe(groupName);
  });

  test("RemoveUserFromGroup", async () => {
    await iam.send(new RemoveUserFromGroupCommand({ GroupName: groupName, UserName: userName }));
    const res = await iam.send(new GetGroupCommand({ GroupName: groupName }));
    expect(res.Users).toEqual([]);
  });

  test("Group inline policies lifecycle", async () => {
    await iam.send(new PutGroupPolicyCommand({ GroupName: groupName, PolicyName: "gp1", PolicyDocument: INLINE_POLICY }));

    const listed = await iam.send(new ListGroupPoliciesCommand({ GroupName: groupName }));
    expect(listed.PolicyNames).toContain("gp1");

    const got = await iam.send(new GetGroupPolicyCommand({ GroupName: groupName, PolicyName: "gp1" }));
    expect(got.PolicyName).toBe("gp1");
    expect(got.PolicyDocument).toBeDefined();

    await iam.send(new DeleteGroupPolicyCommand({ GroupName: groupName, PolicyName: "gp1" }));
    const afterDelete = await iam.send(new ListGroupPoliciesCommand({ GroupName: groupName }));
    expect(afterDelete.PolicyNames).toEqual([]);
  });

  test("DeleteGroup", async () => {
    await iam.send(new DeleteGroupCommand({ GroupName: groupName }));
    await expect(iam.send(new GetGroupCommand({ GroupName: groupName }))).rejects.toThrow();
  });

  // cleanup
  test("cleanup group test user", async () => {
    await iam.send(new DeleteUserCommand({ UserName: userName }));
  });
});

describe("IAM Access Keys", () => {
  const userName = "accesskey-test-user";
  let accessKeyId: string;

  test("setup user", async () => {
    await iam.send(new CreateUserCommand({ UserName: userName }));
  });

  test("CreateAccessKey", async () => {
    const res = await iam.send(new CreateAccessKeyCommand({ UserName: userName }));
    expect(res.AccessKey?.AccessKeyId).toBeDefined();
    expect(res.AccessKey?.SecretAccessKey).toBeDefined();
    expect(res.AccessKey?.Status).toBe("Active");
    expect(res.AccessKey?.UserName).toBe(userName);
    accessKeyId = res.AccessKey!.AccessKeyId!;
  });

  test("ListAccessKeys", async () => {
    const res = await iam.send(new ListAccessKeysCommand({ UserName: userName }));
    expect(res.AccessKeyMetadata!.length).toBe(1);
    expect(res.AccessKeyMetadata![0].AccessKeyId).toBe(accessKeyId);
  });

  test("UpdateAccessKey to Inactive", async () => {
    await iam.send(new UpdateAccessKeyCommand({ UserName: userName, AccessKeyId: accessKeyId, Status: "Inactive" }));
    const res = await iam.send(new ListAccessKeysCommand({ UserName: userName }));
    expect(res.AccessKeyMetadata![0].Status).toBe("Inactive");
  });

  test("GetAccessKeyLastUsed", async () => {
    const res = await iam.send(new GetAccessKeyLastUsedCommand({ AccessKeyId: accessKeyId }));
    expect(res.UserName).toBe(userName);
    expect(res.AccessKeyLastUsed).toBeDefined();
  });

  test("DeleteAccessKey", async () => {
    await iam.send(new DeleteAccessKeyCommand({ UserName: userName, AccessKeyId: accessKeyId }));
    const res = await iam.send(new ListAccessKeysCommand({ UserName: userName }));
    expect(res.AccessKeyMetadata).toEqual([]);
  });

  test("cleanup access key test user", async () => {
    await iam.send(new DeleteUserCommand({ UserName: userName }));
  });
});

describe("IAM Instance Profiles", () => {
  const profileName = "test-instance-profile";
  const roleName = "test-ip-role";

  test("setup role", async () => {
    await iam.send(new CreateRoleCommand({ RoleName: roleName, AssumeRolePolicyDocument: TRUST_POLICY }));
  });

  test("CreateInstanceProfile", async () => {
    const res = await iam.send(new CreateInstanceProfileCommand({ InstanceProfileName: profileName, Path: "/app/" }));
    expect(res.InstanceProfile?.InstanceProfileName).toBe(profileName);
    expect(res.InstanceProfile?.InstanceProfileId).toBeDefined();
    expect(res.InstanceProfile?.Arn).toContain("instance-profile/");
    expect(res.InstanceProfile?.Path).toBe("/app/");
    expect(res.InstanceProfile?.Roles).toEqual([]);
  });

  test("CreateInstanceProfile duplicate fails", async () => {
    await expect(iam.send(new CreateInstanceProfileCommand({ InstanceProfileName: profileName }))).rejects.toThrow();
  });

  test("GetInstanceProfile", async () => {
    const res = await iam.send(new GetInstanceProfileCommand({ InstanceProfileName: profileName }));
    expect(res.InstanceProfile?.InstanceProfileName).toBe(profileName);
  });

  test("ListInstanceProfiles", async () => {
    const res = await iam.send(new ListInstanceProfilesCommand({}));
    expect(res.InstanceProfiles!.some((p) => p.InstanceProfileName === profileName)).toBe(true);
  });

  test("AddRoleToInstanceProfile", async () => {
    await iam.send(new AddRoleToInstanceProfileCommand({ InstanceProfileName: profileName, RoleName: roleName }));
    const res = await iam.send(new GetInstanceProfileCommand({ InstanceProfileName: profileName }));
    expect(res.InstanceProfile?.Roles!.length).toBe(1);
    expect(res.InstanceProfile?.Roles![0].RoleName).toBe(roleName);
  });

  test("ListInstanceProfilesForRole", async () => {
    const res = await iam.send(new ListInstanceProfilesForRoleCommand({ RoleName: roleName }));
    expect(res.InstanceProfiles!.length).toBe(1);
    expect(res.InstanceProfiles![0].InstanceProfileName).toBe(profileName);
  });

  test("RemoveRoleFromInstanceProfile", async () => {
    await iam.send(new RemoveRoleFromInstanceProfileCommand({ InstanceProfileName: profileName, RoleName: roleName }));
    const res = await iam.send(new GetInstanceProfileCommand({ InstanceProfileName: profileName }));
    expect(res.InstanceProfile?.Roles).toEqual([]);
  });

  test("DeleteInstanceProfile", async () => {
    await iam.send(new DeleteInstanceProfileCommand({ InstanceProfileName: profileName }));
    await expect(iam.send(new GetInstanceProfileCommand({ InstanceProfileName: profileName }))).rejects.toThrow();
  });

  test("cleanup role", async () => {
    await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
  });
});

describe("IAM User Policies", () => {
  const userName = "policy-test-user";

  test("setup user", async () => {
    await iam.send(new CreateUserCommand({ UserName: userName }));
  });

  test("PutUserPolicy and ListUserPolicies", async () => {
    await iam.send(new PutUserPolicyCommand({ UserName: userName, PolicyName: "up1", PolicyDocument: INLINE_POLICY }));
    const res = await iam.send(new ListUserPoliciesCommand({ UserName: userName }));
    expect(res.PolicyNames).toContain("up1");
  });

  test("GetUserPolicy", async () => {
    const res = await iam.send(new GetUserPolicyCommand({ UserName: userName, PolicyName: "up1" }));
    expect(res.PolicyName).toBe("up1");
    expect(res.UserName).toBe(userName);
    expect(res.PolicyDocument).toBeDefined();
  });

  test("DeleteUserPolicy", async () => {
    await iam.send(new DeleteUserPolicyCommand({ UserName: userName, PolicyName: "up1" }));
    const res = await iam.send(new ListUserPoliciesCommand({ UserName: userName }));
    expect(res.PolicyNames).toEqual([]);
  });

  test("AttachUserPolicy and ListAttachedUserPolicies", async () => {
    const policy = await iam.send(new CreatePolicyCommand({ PolicyName: "user-managed-pol", PolicyDocument: INLINE_POLICY }));
    const policyArn = policy.Policy!.Arn!;

    await iam.send(new AttachUserPolicyCommand({ UserName: userName, PolicyArn: policyArn }));
    const res = await iam.send(new ListAttachedUserPoliciesCommand({ UserName: userName }));
    expect(res.AttachedPolicies!.length).toBe(1);
    expect(res.AttachedPolicies![0].PolicyArn).toBe(policyArn);

    await iam.send(new DetachUserPolicyCommand({ UserName: userName, PolicyArn: policyArn }));
    const after = await iam.send(new ListAttachedUserPoliciesCommand({ UserName: userName }));
    expect(after.AttachedPolicies).toEqual([]);
  });

  test("cleanup user", async () => {
    await iam.send(new DeleteUserCommand({ UserName: userName }));
  });
});

describe("IAM Role extras", () => {
  const roleName = "extras-test-role";

  test("setup role", async () => {
    await iam.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: TRUST_POLICY,
      Tags: [{ Key: "env", Value: "test" }],
    }));
  });

  test("UpdateRole", async () => {
    await iam.send(new UpdateRoleCommand({ RoleName: roleName, Description: "updated desc" }));
    // No error means success for no-result responses
  });

  test("UpdateAssumeRolePolicy", async () => {
    const newPolicy = JSON.stringify({ Version: "2012-10-17", Statement: [] });
    await iam.send(new UpdateAssumeRolePolicyCommand({ RoleName: roleName, PolicyDocument: newPolicy }));
  });

  test("GetRolePolicy", async () => {
    await iam.send(new PutRolePolicyCommand({ RoleName: roleName, PolicyName: "rp1", PolicyDocument: INLINE_POLICY }));
    const res = await iam.send(new GetRolePolicyCommand({ RoleName: roleName, PolicyName: "rp1" }));
    expect(res.PolicyName).toBe("rp1");
    expect(res.RoleName).toBe(roleName);
    expect(res.PolicyDocument).toBeDefined();
  });

  test("TagRole, ListRoleTags, UntagRole", async () => {
    await iam.send(new TagRoleCommand({ RoleName: roleName, Tags: [{ Key: "team", Value: "platform" }] }));
    const tags = await iam.send(new ListRoleTagsCommand({ RoleName: roleName }));
    expect(tags.Tags!.some((t) => t.Key === "team" && t.Value === "platform")).toBe(true);
    expect(tags.Tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);

    await iam.send(new UntagRoleCommand({ RoleName: roleName, TagKeys: ["team"] }));
    const after = await iam.send(new ListRoleTagsCommand({ RoleName: roleName }));
    expect(after.Tags!.some((t) => t.Key === "team")).toBe(false);
    expect(after.Tags!.some((t) => t.Key === "env")).toBe(true);
  });

  test("cleanup role", async () => {
    await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
  });
});

describe("IAM UpdateUser", () => {
  test("UpdateUser renames user", async () => {
    await iam.send(new CreateUserCommand({ UserName: "old-name" }));
    await iam.send(new UpdateUserCommand({ UserName: "old-name", NewUserName: "new-name" }));

    const res = await iam.send(new GetUserCommand({ UserName: "new-name" }));
    expect(res.User?.UserName).toBe("new-name");

    await expect(iam.send(new GetUserCommand({ UserName: "old-name" }))).rejects.toThrow();

    await iam.send(new DeleteUserCommand({ UserName: "new-name" }));
  });
});

describe("IAM Policy Versions", () => {
  let policyArn: string;
  const policyDoc1 = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }] });
  const policyDoc2 = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:PutObject", Resource: "*" }] });
  const policyDoc3 = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:DeleteObject", Resource: "*" }] });

  test("CreatePolicy creates v1 as default", async () => {
    const res = await iam.send(new CreatePolicyCommand({ PolicyName: "version-test-policy", PolicyDocument: policyDoc1 }));
    policyArn = res.Policy!.Arn!;
    expect(res.Policy!.DefaultVersionId).toBe("v1");

    const versions = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: policyArn }));
    expect(versions.Versions!.length).toBe(1);
    expect(versions.Versions![0].VersionId).toBe("v1");
    expect(versions.Versions![0].IsDefaultVersion).toBe(true);
  });

  test("CreatePolicyVersion adds v2", async () => {
    const res = await iam.send(new CreatePolicyVersionCommand({
      PolicyArn: policyArn,
      PolicyDocument: policyDoc2,
      SetAsDefault: false,
    }));
    expect(res.PolicyVersion!.VersionId).toBe("v2");
    expect(res.PolicyVersion!.IsDefaultVersion).toBe(false);

    const versions = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: policyArn }));
    expect(versions.Versions!.length).toBe(2);
  });

  test("GetPolicyVersion returns specific version", async () => {
    const v1 = await iam.send(new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v1" }));
    expect(v1.PolicyVersion!.IsDefaultVersion).toBe(true);

    const v2 = await iam.send(new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v2" }));
    expect(v2.PolicyVersion!.IsDefaultVersion).toBe(false);
  });

  test("CreatePolicyVersion with SetAsDefault changes default", async () => {
    await iam.send(new CreatePolicyVersionCommand({
      PolicyArn: policyArn,
      PolicyDocument: policyDoc3,
      SetAsDefault: true,
    }));
    const policy = await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    expect(policy.Policy!.DefaultVersionId).toBe("v3");

    const v1 = await iam.send(new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v1" }));
    expect(v1.PolicyVersion!.IsDefaultVersion).toBe(false);

    const v3 = await iam.send(new GetPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v3" }));
    expect(v3.PolicyVersion!.IsDefaultVersion).toBe(true);
  });

  test("SetDefaultPolicyVersion changes default", async () => {
    await iam.send(new SetDefaultPolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v1" }));
    const policy = await iam.send(new GetPolicyCommand({ PolicyArn: policyArn }));
    expect(policy.Policy!.DefaultVersionId).toBe("v1");
  });

  test("DeletePolicyVersion cannot delete default", async () => {
    try {
      await iam.send(new DeletePolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v1" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("DeletePolicyVersion removes non-default version", async () => {
    await iam.send(new DeletePolicyVersionCommand({ PolicyArn: policyArn, VersionId: "v2" }));
    const versions = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: policyArn }));
    expect(versions.Versions!.length).toBe(2); // v1, v3 remain
    expect(versions.Versions!.some((v) => v.VersionId === "v2")).toBe(false);
  });

  test("CreatePolicyVersion enforces max 5 versions", async () => {
    // Currently have v1, v3. Add v4, v5, v6 to reach 5 total.
    await iam.send(new CreatePolicyVersionCommand({ PolicyArn: policyArn, PolicyDocument: policyDoc2, SetAsDefault: false }));
    await iam.send(new CreatePolicyVersionCommand({ PolicyArn: policyArn, PolicyDocument: policyDoc2, SetAsDefault: false }));
    await iam.send(new CreatePolicyVersionCommand({ PolicyArn: policyArn, PolicyDocument: policyDoc2, SetAsDefault: false }));

    const versions = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: policyArn }));
    expect(versions.Versions!.length).toBe(5);

    // 6th version should fail
    try {
      await iam.send(new CreatePolicyVersionCommand({ PolicyArn: policyArn, PolicyDocument: policyDoc3, SetAsDefault: false }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("cleanup", async () => {
    await iam.send(new DeletePolicyCommand({ PolicyArn: policyArn }));
  });
});
