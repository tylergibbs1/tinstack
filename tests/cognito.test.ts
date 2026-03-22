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
