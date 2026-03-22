export class EC2InstanceConnectService {
  constructor(private accountId: string) {}

  sendSSHPublicKey(instanceId: string, instanceOSUser: string, sshPublicKey: string, availabilityZone: string): boolean {
    return true; // Always succeed in mock
  }

  sendSerialConsoleSSHPublicKey(instanceId: string, serialPort: number, sshPublicKey: string): boolean {
    return true;
  }
}
