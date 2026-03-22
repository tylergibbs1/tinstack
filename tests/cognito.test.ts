import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  ListUserPoolsCommand,
  DeleteUserPoolCommand,
  CreateUserPoolClientCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
  CreateGroupCommand,
  GetGroupCommand,
  ListGroupsCommand,
  DeleteGroupCommand,
  UpdateGroupCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  ListUsersInGroupCommand,
  CreateUserPoolDomainCommand,
  DescribeUserPoolDomainCommand,
  DeleteUserPoolDomainCommand,
  CreateIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  ListIdentityProvidersCommand,
  UpdateIdentityProviderCommand,
  DeleteIdentityProviderCommand,
  SignUpCommand,
  AdminSetUserPasswordCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { startServer, stopServer, clientConfig } from "./helpers";

const cognito = new CognitoIdentityProviderClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Cognito", () => {
  let poolId: string;
  let clientId: string;

  test("CreateUserPool", async () => {
    const res = await cognito.send(new CreateUserPoolCommand({ PoolName: "test-pool" }));
    poolId = res.UserPool!.Id!;
    expect(poolId).toBeDefined();
    expect(res.UserPool!.Name).toBe("test-pool");
  });

  test("DescribeUserPool", async () => {
    const res = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
    expect(res.UserPool!.Name).toBe("test-pool");
    expect(res.UserPool!.Status).toBe("Enabled");
  });

  test("ListUserPools", async () => {
    const res = await cognito.send(new ListUserPoolsCommand({ MaxResults: 10 }));
    expect(res.UserPools?.some((p) => p.Id === poolId)).toBe(true);
  });

  test("CreateUserPoolClient", async () => {
    const res = await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: "test-client",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    }));
    clientId = res.UserPoolClient!.ClientId!;
    expect(clientId).toBeDefined();
  });

  test("AdminCreateUser + AdminGetUser", async () => {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: "testuser",
      TemporaryPassword: "TempPass1!",
      UserAttributes: [{ Name: "email", Value: "test@example.com" }],
    }));

    const res = await cognito.send(new AdminGetUserCommand({
      UserPoolId: poolId,
      Username: "testuser",
    }));
    expect(res.Username).toBe("testuser");
    expect(res.Enabled).toBe(true);
    expect(res.UserAttributes?.some((a) => a.Name === "email" && a.Value === "test@example.com")).toBe(true);
  });

  test("ListUsers", async () => {
    const res = await cognito.send(new ListUsersCommand({ UserPoolId: poolId }));
    expect(res.Users?.some((u) => u.Username === "testuser")).toBe(true);
  });

  test("AdminDeleteUser", async () => {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: "testuser" }));
    const res = await cognito.send(new ListUsersCommand({ UserPoolId: poolId }));
    expect(res.Users?.some((u) => u.Username === "testuser")).toBeFalsy();
  });

  test("DeleteUserPool", async () => {
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
    const res = await cognito.send(new ListUserPoolsCommand({ MaxResults: 10 }));
    expect(res.UserPools?.some((p) => p.Id === poolId)).toBeFalsy();
  });
});

describe("Cognito User Groups", () => {
  let poolId: string;

  test("setup pool and users", async () => {
    const res = await cognito.send(new CreateUserPoolCommand({ PoolName: "group-test-pool" }));
    poolId = res.UserPool!.Id!;
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId, Username: "alice", TemporaryPassword: "TempPass1!",
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }));
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId, Username: "bob", TemporaryPassword: "TempPass1!",
      UserAttributes: [{ Name: "email", Value: "bob@example.com" }],
    }));
  });

  test("CreateGroup", async () => {
    const res = await cognito.send(new CreateGroupCommand({
      UserPoolId: poolId, GroupName: "admins", Description: "Admin group", Precedence: 1,
    }));
    expect(res.Group!.GroupName).toBe("admins");
    expect(res.Group!.Description).toBe("Admin group");
    expect(res.Group!.Precedence).toBe(1);
  });

  test("CreateGroup duplicate throws", async () => {
    try {
      await cognito.send(new CreateGroupCommand({ UserPoolId: poolId, GroupName: "admins" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("GroupExistsException");
    }
  });

  test("GetGroup", async () => {
    const res = await cognito.send(new GetGroupCommand({ UserPoolId: poolId, GroupName: "admins" }));
    expect(res.Group!.GroupName).toBe("admins");
    expect(res.Group!.Description).toBe("Admin group");
  });

  test("UpdateGroup", async () => {
    const res = await cognito.send(new UpdateGroupCommand({
      UserPoolId: poolId, GroupName: "admins", Description: "Updated admin group", Precedence: 5,
    }));
    expect(res.Group!.Description).toBe("Updated admin group");
    expect(res.Group!.Precedence).toBe(5);
  });

  test("ListGroups", async () => {
    await cognito.send(new CreateGroupCommand({ UserPoolId: poolId, GroupName: "editors" }));
    const res = await cognito.send(new ListGroupsCommand({ UserPoolId: poolId }));
    expect(res.Groups!.length).toBe(2);
    expect(res.Groups!.some((g) => g.GroupName === "admins")).toBe(true);
    expect(res.Groups!.some((g) => g.GroupName === "editors")).toBe(true);
  });

  test("AdminAddUserToGroup", async () => {
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: "alice", GroupName: "admins" }));
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: "bob", GroupName: "admins" }));
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId, Username: "alice", GroupName: "editors" }));
  });

  test("AdminListGroupsForUser", async () => {
    const res = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: poolId, Username: "alice" }));
    expect(res.Groups!.length).toBe(2);
    expect(res.Groups!.some((g) => g.GroupName === "admins")).toBe(true);
    expect(res.Groups!.some((g) => g.GroupName === "editors")).toBe(true);
  });

  test("ListUsersInGroup", async () => {
    const res = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: poolId, GroupName: "admins" }));
    expect(res.Users!.length).toBe(2);
    expect(res.Users!.some((u) => u.Username === "alice")).toBe(true);
    expect(res.Users!.some((u) => u.Username === "bob")).toBe(true);
  });

  test("AdminRemoveUserFromGroup", async () => {
    await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: poolId, Username: "bob", GroupName: "admins" }));
    const res = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: poolId, GroupName: "admins" }));
    expect(res.Users!.length).toBe(1);
    expect(res.Users![0].Username).toBe("alice");
  });

  test("DeleteGroup", async () => {
    await cognito.send(new DeleteGroupCommand({ UserPoolId: poolId, GroupName: "editors" }));
    const res = await cognito.send(new ListGroupsCommand({ UserPoolId: poolId }));
    expect(res.Groups!.length).toBe(1);
    expect(res.Groups![0].GroupName).toBe("admins");
  });

  test("DeleteGroup removes memberships", async () => {
    await cognito.send(new DeleteGroupCommand({ UserPoolId: poolId, GroupName: "admins" }));
    const res = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: poolId, Username: "alice" }));
    expect(res.Groups!.length).toBe(0);
  });

  test("cleanup", async () => {
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
  });
});

describe("Cognito User Pool Domains", () => {
  let poolId: string;

  test("setup pool", async () => {
    const res = await cognito.send(new CreateUserPoolCommand({ PoolName: "domain-test-pool" }));
    poolId = res.UserPool!.Id!;
  });

  test("CreateUserPoolDomain", async () => {
    const res = await cognito.send(new CreateUserPoolDomainCommand({
      UserPoolId: poolId,
      Domain: "my-test-domain",
    }));
    expect(res.CloudFrontDomain).toContain("my-test-domain");
  });

  test("DescribeUserPoolDomain", async () => {
    const res = await cognito.send(new DescribeUserPoolDomainCommand({
      Domain: "my-test-domain",
    }));
    expect(res.DomainDescription?.Domain).toBe("my-test-domain");
    expect(res.DomainDescription?.UserPoolId).toBe(poolId);
    expect(res.DomainDescription?.Status).toBe("ACTIVE");
  });

  test("CreateUserPoolDomain duplicate throws", async () => {
    try {
      await cognito.send(new CreateUserPoolDomainCommand({
        UserPoolId: poolId,
        Domain: "my-test-domain",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("DeleteUserPoolDomain", async () => {
    await cognito.send(new DeleteUserPoolDomainCommand({
      UserPoolId: poolId,
      Domain: "my-test-domain",
    }));
    try {
      await cognito.send(new DescribeUserPoolDomainCommand({ Domain: "my-test-domain" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("cleanup", async () => {
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
  });
});

describe("Cognito Identity Providers", () => {
  let poolId: string;

  test("setup pool", async () => {
    const res = await cognito.send(new CreateUserPoolCommand({ PoolName: "idp-test-pool" }));
    poolId = res.UserPool!.Id!;
  });

  test("CreateIdentityProvider (SAML)", async () => {
    const res = await cognito.send(new CreateIdentityProviderCommand({
      UserPoolId: poolId,
      ProviderName: "MySAMLProvider",
      ProviderType: "SAML",
      ProviderDetails: { MetadataURL: "https://idp.example.com/metadata.xml" },
      AttributeMapping: { email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" },
    }));
    expect(res.IdentityProvider?.ProviderName).toBe("MySAMLProvider");
    expect(res.IdentityProvider?.ProviderType).toBe("SAML");
  });

  test("CreateIdentityProvider (OIDC)", async () => {
    const res = await cognito.send(new CreateIdentityProviderCommand({
      UserPoolId: poolId,
      ProviderName: "MyOIDCProvider",
      ProviderType: "OIDC",
      ProviderDetails: {
        client_id: "oidc-client-id",
        authorize_scopes: "openid email profile",
        oidc_issuer: "https://accounts.google.com",
      },
    }));
    expect(res.IdentityProvider?.ProviderName).toBe("MyOIDCProvider");
    expect(res.IdentityProvider?.ProviderType).toBe("OIDC");
  });

  test("CreateIdentityProvider duplicate throws", async () => {
    try {
      await cognito.send(new CreateIdentityProviderCommand({
        UserPoolId: poolId,
        ProviderName: "MySAMLProvider",
        ProviderType: "SAML",
        ProviderDetails: {},
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("DescribeIdentityProvider", async () => {
    const res = await cognito.send(new DescribeIdentityProviderCommand({
      UserPoolId: poolId,
      ProviderName: "MySAMLProvider",
    }));
    expect(res.IdentityProvider?.ProviderName).toBe("MySAMLProvider");
    expect(res.IdentityProvider?.ProviderDetails?.MetadataURL).toBe("https://idp.example.com/metadata.xml");
    expect(res.IdentityProvider?.AttributeMapping?.email).toBe("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress");
  });

  test("ListIdentityProviders", async () => {
    const res = await cognito.send(new ListIdentityProvidersCommand({
      UserPoolId: poolId,
    }));
    expect(res.Providers?.length).toBe(2);
    expect(res.Providers?.some((p) => p.ProviderName === "MySAMLProvider")).toBe(true);
    expect(res.Providers?.some((p) => p.ProviderName === "MyOIDCProvider")).toBe(true);
  });

  test("UpdateIdentityProvider", async () => {
    const res = await cognito.send(new UpdateIdentityProviderCommand({
      UserPoolId: poolId,
      ProviderName: "MySAMLProvider",
      ProviderDetails: { MetadataURL: "https://idp.example.com/v2/metadata.xml" },
    }));
    expect(res.IdentityProvider?.ProviderDetails?.MetadataURL).toBe("https://idp.example.com/v2/metadata.xml");
  });

  test("DeleteIdentityProvider", async () => {
    await cognito.send(new DeleteIdentityProviderCommand({
      UserPoolId: poolId,
      ProviderName: "MyOIDCProvider",
    }));
    const res = await cognito.send(new ListIdentityProvidersCommand({ UserPoolId: poolId }));
    expect(res.Providers?.length).toBe(1);
    expect(res.Providers?.[0].ProviderName).toBe("MySAMLProvider");
  });

  test("DescribeIdentityProvider not found throws", async () => {
    try {
      await cognito.send(new DescribeIdentityProviderCommand({
        UserPoolId: poolId,
        ProviderName: "NonExistentProvider",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  test("cleanup", async () => {
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
  });
});

describe("Cognito Password Policy", () => {
  let poolId: string;
  let clientId: string;

  test("setup pool with strict password policy", async () => {
    const res = await cognito.send(new CreateUserPoolCommand({
      PoolName: "password-policy-pool",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 10,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    }));
    poolId = res.UserPool!.Id!;
    const clientRes = await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientName: "pw-test-client",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    }));
    clientId = clientRes.UserPoolClient!.ClientId!;
  });

  test("SignUp rejects password too short", async () => {
    try {
      await cognito.send(new SignUpCommand({
        ClientId: clientId,
        Username: "shortpw",
        Password: "Ab1!",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidPasswordException");
    }
  });

  test("SignUp rejects password missing uppercase", async () => {
    try {
      await cognito.send(new SignUpCommand({
        ClientId: clientId,
        Username: "nouppercase",
        Password: "abcdefgh1!",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidPasswordException");
    }
  });

  test("SignUp rejects password missing symbol", async () => {
    try {
      await cognito.send(new SignUpCommand({
        ClientId: clientId,
        Username: "nosymbol",
        Password: "Abcdefgh12",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidPasswordException");
    }
  });

  test("SignUp accepts valid password", async () => {
    const res = await cognito.send(new SignUpCommand({
      ClientId: clientId,
      Username: "validpw",
      Password: "ValidPass1!",
    }));
    expect(res.UserConfirmed).toBeDefined();
  });

  test("AdminCreateUser rejects weak temporary password", async () => {
    try {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: "weaktemp",
        TemporaryPassword: "short",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidPasswordException");
    }
  });

  test("AdminSetUserPassword rejects weak password", async () => {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: "setpwtest",
      TemporaryPassword: "TempPass12!x",
    }));
    try {
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: poolId,
        Username: "setpwtest",
        Password: "weak",
        Permanent: true,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidPasswordException");
    }
  });

  test("RespondToAuthChallenge NEW_PASSWORD_REQUIRED rejects weak password", async () => {
    await cognito.send(new AdminConfirmSignUpCommand({ UserPoolId: poolId, Username: "setpwtest" }));
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: "setpwtest",
      Password: "TempPass12!x",
      Permanent: false,
    }));

    const authRes = await cognito.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: { USERNAME: "setpwtest", PASSWORD: "TempPass12!x" },
    }));
    expect(authRes.ChallengeName).toBe("NEW_PASSWORD_REQUIRED");

    try {
      await cognito.send(new RespondToAuthChallengeCommand({
        ClientId: clientId,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: authRes.Session,
        ChallengeResponses: { USERNAME: "setpwtest", NEW_PASSWORD: "weak" },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidPasswordException");
    }
  });

  test("Pool with relaxed policy accepts simple password", async () => {
    const relaxedPool = await cognito.send(new CreateUserPoolCommand({
      PoolName: "relaxed-pool",
      Policies: {
        PasswordPolicy: {
          MinimumLength: 4,
          RequireUppercase: false,
          RequireLowercase: false,
          RequireNumbers: false,
          RequireSymbols: false,
        },
      },
    }));
    const relaxedPoolId = relaxedPool.UserPool!.Id!;
    const relaxedClient = await cognito.send(new CreateUserPoolClientCommand({
      UserPoolId: relaxedPoolId,
      ClientName: "relaxed-client",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    }));
    await cognito.send(new SignUpCommand({
      ClientId: relaxedClient.UserPoolClient!.ClientId!,
      Username: "simpleuser",
      Password: "abcd",
    }));
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: relaxedPoolId }));
  });

  test("cleanup", async () => {
    await cognito.send(new DeleteUserPoolCommand({ UserPoolId: poolId }));
  });
});
