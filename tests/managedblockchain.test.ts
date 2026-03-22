import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ManagedBlockchainClient,
  CreateNetworkCommand,
  GetNetworkCommand,
  ListNetworksCommand,
} from "@aws-sdk/client-managedblockchain";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ManagedBlockchainClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ManagedBlockchain", () => {
  let networkId: string;

  test("CreateNetwork", async () => {
    const res = await client.send(new CreateNetworkCommand({
      Name: "test-network",
      Framework: "HYPERLEDGER_FABRIC",
      FrameworkVersion: "1.4",
      VotingPolicy: { ApprovalThresholdPolicy: { ThresholdPercentage: 50, ProposalDurationInHours: 24, ThresholdComparator: "GREATER_THAN" } },
      MemberConfiguration: { Name: "test-member", FrameworkConfiguration: { Fabric: { AdminUsername: "admin", AdminPassword: "Password123" } } },
    }));
    expect(res.NetworkId).toBeDefined();
    networkId = res.NetworkId!;
  });

  test("GetNetwork", async () => {
    const res = await client.send(new GetNetworkCommand({ NetworkId: networkId }));
    expect(res.Network).toBeDefined();
    expect(res.Network!.Name).toBe("test-network");
  });

  test("ListNetworks", async () => {
    const res = await client.send(new ListNetworksCommand({}));
    expect(res.Networks).toBeDefined();
    expect(res.Networks!.length).toBeGreaterThanOrEqual(1);
  });
});
