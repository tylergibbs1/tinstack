import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface IdentityUser {
  userId: string;
  identityStoreId: string;
  userName: string;
  displayName: string;
  name: { familyName: string; givenName: string };
  emails: { value: string; primary: boolean; type: string }[];
}

export interface IdentityGroup {
  groupId: string;
  identityStoreId: string;
  displayName: string;
  description: string;
}

export interface GroupMembership {
  membershipId: string;
  identityStoreId: string;
  groupId: string;
  memberId: { userId: string };
}

export class IdentityStoreService {
  private users: StorageBackend<string, IdentityUser>;
  private groups: StorageBackend<string, IdentityGroup>;
  private memberships: StorageBackend<string, GroupMembership>;

  constructor(private accountId: string) {
    this.users = new InMemoryStorage();
    this.groups = new InMemoryStorage();
    this.memberships = new InMemoryStorage();
  }

  createUser(identityStoreId: string, userName: string, displayName: string, name?: { familyName: string; givenName: string }, emails?: any[]): IdentityUser {
    const userId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const user: IdentityUser = {
      userId, identityStoreId, userName, displayName: displayName ?? userName,
      name: name ?? { familyName: "", givenName: "" },
      emails: emails ?? [],
    };
    this.users.set(userId, user);
    return user;
  }

  describeUser(identityStoreId: string, userId: string): IdentityUser {
    const user = this.users.get(userId);
    if (!user || user.identityStoreId !== identityStoreId) throw new AwsError("ResourceNotFoundException", `User ${userId} not found.`, 404);
    return user;
  }

  listUsers(identityStoreId: string): IdentityUser[] {
    return this.users.values().filter(u => u.identityStoreId === identityStoreId);
  }

  deleteUser(identityStoreId: string, userId: string): void {
    const user = this.users.get(userId);
    if (!user || user.identityStoreId !== identityStoreId) throw new AwsError("ResourceNotFoundException", `User ${userId} not found.`, 404);
    this.users.delete(userId);
  }

  createGroup(identityStoreId: string, displayName: string, description?: string): IdentityGroup {
    const groupId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const group: IdentityGroup = { groupId, identityStoreId, displayName, description: description ?? "" };
    this.groups.set(groupId, group);
    return group;
  }

  describeGroup(identityStoreId: string, groupId: string): IdentityGroup {
    const group = this.groups.get(groupId);
    if (!group || group.identityStoreId !== identityStoreId) throw new AwsError("ResourceNotFoundException", `Group ${groupId} not found.`, 404);
    return group;
  }

  listGroups(identityStoreId: string): IdentityGroup[] {
    return this.groups.values().filter(g => g.identityStoreId === identityStoreId);
  }

  deleteGroup(identityStoreId: string, groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group || group.identityStoreId !== identityStoreId) throw new AwsError("ResourceNotFoundException", `Group ${groupId} not found.`, 404);
    this.groups.delete(groupId);
  }

  createGroupMembership(identityStoreId: string, groupId: string, userId: string): GroupMembership {
    const membershipId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const membership: GroupMembership = {
      membershipId, identityStoreId, groupId, memberId: { userId },
    };
    this.memberships.set(membershipId, membership);
    return membership;
  }

  listGroupMemberships(identityStoreId: string, groupId: string): GroupMembership[] {
    return this.memberships.values().filter(m => m.identityStoreId === identityStoreId && m.groupId === groupId);
  }

  deleteGroupMembership(identityStoreId: string, membershipId: string): void {
    const m = this.memberships.get(membershipId);
    if (!m || m.identityStoreId !== identityStoreId) throw new AwsError("ResourceNotFoundException", `Membership ${membershipId} not found.`, 404);
    this.memberships.delete(membershipId);
  }
}
