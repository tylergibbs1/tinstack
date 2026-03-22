import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CognitoIdentityClient,
  CreateIdentityPoolCommand,
  DescribeIdentityPoolCommand,
  ListIdentityPoolsCommand,
  DeleteIdentityPoolCommand,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from "@aws-sdk/client-cognito-identity";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CognitoIdentityClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Cognito Identity", () => {
  let poolId: string;

  test("CreateIdentityPool", async () => {
    const res = await client.send(new CreateIdentityPoolCommand({
      IdentityPoolName: "test-pool",
      AllowUnauthenticatedIdentities: true,
    }));
    poolId = res.IdentityPoolId!;
    expect(poolId).toBeDefined();
    expect(res.IdentityPoolName).toBe("test-pool");
    expect(res.AllowUnauthenticatedIdentities).toBe(true);
  });

  test("DescribeIdentityPool", async () => {
    const res = await client.send(new DescribeIdentityPoolCommand({ IdentityPoolId: poolId }));
    expect(res.IdentityPoolId).toBe(poolId);
    expect(res.IdentityPoolName).toBe("test-pool");
  });

  test("ListIdentityPools", async () => {
    const res = await client.send(new ListIdentityPoolsCommand({ MaxResults: 10 }));
    expect(res.IdentityPools).toBeDefined();
    expect(res.IdentityPools!.length).toBeGreaterThanOrEqual(1);
    const found = res.IdentityPools!.find((p) => p.IdentityPoolId === poolId);
    expect(found).toBeDefined();
  });

  test("GetId", async () => {
    const res = await client.send(new GetIdCommand({ IdentityPoolId: poolId }));
    expect(res.IdentityId).toBeDefined();
  });

  test("GetCredentialsForIdentity", async () => {
    const idRes = await client.send(new GetIdCommand({ IdentityPoolId: poolId }));
    const res = await client.send(new GetCredentialsForIdentityCommand({ IdentityId: idRes.IdentityId }));
    expect(res.Credentials).toBeDefined();
    expect(res.Credentials!.AccessKeyId).toBeDefined();
    expect(res.Credentials!.SecretKey).toBeDefined();
    expect(res.Credentials!.SessionToken).toBeDefined();
  });

  test("DeleteIdentityPool", async () => {
    await client.send(new DeleteIdentityPoolCommand({ IdentityPoolId: poolId }));
    const res = await client.send(new ListIdentityPoolsCommand({ MaxResults: 60 }));
    expect(res.IdentityPools!.find((p) => p.IdentityPoolId === poolId)).toBeUndefined();
  });

  test("DeleteIdentityPool - not found", async () => {
    await expect(
      client.send(new DeleteIdentityPoolCommand({ IdentityPoolId: "us-east-1:nonexistent" })),
    ).rejects.toThrow();
  });
});
