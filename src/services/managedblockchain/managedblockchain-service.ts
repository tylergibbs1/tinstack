import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Network {
  id: string;
  name: string;
  description: string;
  framework: string;
  frameworkVersion: string;
  status: string;
  creationDate: string;
}

export interface Member {
  id: string;
  networkId: string;
  name: string;
  description: string;
  status: string;
  creationDate: string;
}

export interface MBNode {
  id: string;
  networkId: string;
  memberId: string;
  instanceType: string;
  status: string;
  availabilityZone: string;
  creationDate: string;
}

export class ManagedBlockchainService {
  private networks: StorageBackend<string, Network>;
  private members: StorageBackend<string, Member>;
  private nodes: StorageBackend<string, MBNode>;
  private counter = 0;

  constructor(private accountId: string) {
    this.networks = new InMemoryStorage();
    this.members = new InMemoryStorage();
    this.nodes = new InMemoryStorage();
  }

  createNetwork(name: string, framework: string, frameworkVersion: string, description?: string): Network {
    const id = `n-${crypto.randomUUID().slice(0, 26).replace(/-/g, "").toUpperCase()}`;
    const net: Network = {
      id, name, description: description ?? "", framework: framework ?? "HYPERLEDGER_FABRIC",
      frameworkVersion: frameworkVersion ?? "1.4", status: "AVAILABLE",
      creationDate: new Date().toISOString(),
    };
    this.networks.set(id, net);
    return net;
  }

  getNetwork(id: string): Network {
    const net = this.networks.get(id);
    if (!net) throw new AwsError("ResourceNotFoundException", `Network ${id} not found.`, 404);
    return net;
  }

  listNetworks(): Network[] { return this.networks.values(); }

  createMember(networkId: string, name: string, description?: string): Member {
    if (!this.networks.has(networkId)) throw new AwsError("ResourceNotFoundException", `Network ${networkId} not found.`, 404);
    const id = `m-${crypto.randomUUID().slice(0, 26).replace(/-/g, "").toUpperCase()}`;
    const member: Member = {
      id, networkId, name, description: description ?? "", status: "AVAILABLE",
      creationDate: new Date().toISOString(),
    };
    this.members.set(id, member);
    return member;
  }

  getMember(networkId: string, memberId: string): Member {
    const member = this.members.get(memberId);
    if (!member || member.networkId !== networkId) throw new AwsError("ResourceNotFoundException", `Member ${memberId} not found.`, 404);
    return member;
  }

  listMembers(networkId: string): Member[] {
    return this.members.values().filter(m => m.networkId === networkId);
  }

  createNode(networkId: string, memberId: string, instanceType: string, az: string): MBNode {
    if (!this.networks.has(networkId)) throw new AwsError("ResourceNotFoundException", `Network ${networkId} not found.`, 404);
    const id = `nd-${crypto.randomUUID().slice(0, 26).replace(/-/g, "").toUpperCase()}`;
    const node: MBNode = {
      id, networkId, memberId, instanceType: instanceType ?? "bc.t3.small",
      status: "AVAILABLE", availabilityZone: az ?? "us-east-1a",
      creationDate: new Date().toISOString(),
    };
    this.nodes.set(id, node);
    return node;
  }

  getNode(networkId: string, memberId: string, nodeId: string): MBNode {
    const node = this.nodes.get(nodeId);
    if (!node || node.networkId !== networkId) throw new AwsError("ResourceNotFoundException", `Node ${nodeId} not found.`, 404);
    return node;
  }

  listNodes(networkId: string, memberId: string): MBNode[] {
    return this.nodes.values().filter(n => n.networkId === networkId && n.memberId === memberId);
  }

  deleteNode(networkId: string, memberId: string, nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node || node.networkId !== networkId) throw new AwsError("ResourceNotFoundException", `Node ${nodeId} not found.`, 404);
    this.nodes.delete(nodeId);
  }
}
