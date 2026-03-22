import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DirectoryServiceClient,
  CreateDirectoryCommand,
  DescribeDirectoriesCommand,
  DeleteDirectoryCommand,
  CreateMicrosoftADCommand,
  CreateAliasCommand,
  CreateTrustCommand,
  DescribeTrustsCommand,
} from "@aws-sdk/client-directory-service";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new DirectoryServiceClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Directory Service", () => {
  let directoryId: string;

  test("CreateDirectory", async () => {
    const result = await client.send(new CreateDirectoryCommand({
      Name: "corp.example.com",
      Password: "SuperSecret123!",
      Size: "Small",
    }));
    expect(result.DirectoryId).toBeDefined();
    expect(result.DirectoryId).toMatch(/^d-/);
    directoryId = result.DirectoryId!;
  });

  test("DescribeDirectories", async () => {
    const result = await client.send(new DescribeDirectoriesCommand({ DirectoryIds: [directoryId] }));
    expect(result.DirectoryDescriptions?.length).toBe(1);
    expect(result.DirectoryDescriptions![0].Name).toBe("corp.example.com");
    expect(result.DirectoryDescriptions![0].Type).toBe("SimpleAD");
    expect(result.DirectoryDescriptions![0].Stage).toBe("Active");
  });

  test("DescribeDirectories — list all", async () => {
    const result = await client.send(new DescribeDirectoriesCommand({}));
    expect(result.DirectoryDescriptions!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateMicrosoftAD", async () => {
    const result = await client.send(new CreateMicrosoftADCommand({
      Name: "ad.example.com",
      Password: "SuperSecret123!",
      Edition: "Standard",
      VpcSettings: { VpcId: "vpc-12345", SubnetIds: ["subnet-a", "subnet-b"] },
    }));
    expect(result.DirectoryId).toBeDefined();
    expect(result.DirectoryId).toMatch(/^d-/);
  });

  test("CreateAlias", async () => {
    const result = await client.send(new CreateAliasCommand({
      DirectoryId: directoryId,
      Alias: "my-alias",
    }));
    expect(result.DirectoryId).toBe(directoryId);
    expect(result.Alias).toBe("my-alias");
  });

  test("CreateTrust + DescribeTrusts", async () => {
    const createResult = await client.send(new CreateTrustCommand({
      DirectoryId: directoryId,
      RemoteDomainName: "remote.example.com",
      TrustPassword: "TrustPass123!",
      TrustDirection: "One-Way: Outgoing",
      TrustType: "Forest",
    }));
    expect(createResult.TrustId).toBeDefined();

    const descResult = await client.send(new DescribeTrustsCommand({ DirectoryId: directoryId }));
    expect(descResult.Trusts!.length).toBeGreaterThanOrEqual(1);
    expect(descResult.Trusts![0].RemoteDomainName).toBe("remote.example.com");
  });

  test("DeleteDirectory", async () => {
    const result = await client.send(new DeleteDirectoryCommand({ DirectoryId: directoryId }));
    expect(result.DirectoryId).toBe(directoryId);
  });
});
