import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EC2InstanceConnectClient,
  SendSSHPublicKeyCommand,
  SendSerialConsoleSSHPublicKeyCommand,
} from "@aws-sdk/client-ec2-instance-connect";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new EC2InstanceConnectClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EC2 Instance Connect", () => {
  test("SendSSHPublicKey", async () => {
    const res = await client.send(new SendSSHPublicKeyCommand({
      InstanceId: "i-1234567890abcdef0",
      InstanceOSUser: "ec2-user",
      SSHPublicKey: "ssh-rsa AAAAB3... test@test",
      AvailabilityZone: "us-east-1a",
    }));
    expect(res.Success).toBe(true);
  });

  test("SendSerialConsoleSSHPublicKey", async () => {
    const res = await client.send(new SendSerialConsoleSSHPublicKeyCommand({
      InstanceId: "i-1234567890abcdef0",
      SSHPublicKey: "ssh-rsa AAAAB3... test@test",
    }));
    expect(res.Success).toBe(true);
  });
});
