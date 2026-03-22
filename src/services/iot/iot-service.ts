import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface Thing {
  thingName: string;
  thingId: string;
  thingArn: string;
  thingTypeName?: string;
  attributes: Record<string, string>;
  version: number;
}

export interface ThingType {
  thingTypeName: string;
  thingTypeArn: string;
  thingTypeId: string;
  thingTypeProperties?: { thingTypeDescription?: string; searchableAttributes?: string[] };
}

export interface ThingGroup {
  thingGroupName: string;
  thingGroupArn: string;
  thingGroupId: string;
  thingArns: Set<string>;
}

export interface IoTPolicy {
  policyName: string;
  policyArn: string;
  policyDocument: string;
  policyVersionId: string;
}

export interface TopicRule {
  ruleName: string;
  ruleArn: string;
  sql: string;
  description?: string;
  actions: any[];
  ruleDisabled: boolean;
  createdAt: number;
}

export interface IoTCertificate {
  certificateId: string;
  certificateArn: string;
  certificatePem: string;
  status: string;
  createdAt: number;
}

export class IoTService {
  private things: StorageBackend<string, Thing>;
  private thingTypes: StorageBackend<string, ThingType>;
  private thingGroups: StorageBackend<string, ThingGroup>;
  private policies: StorageBackend<string, IoTPolicy>;
  private topicRules: StorageBackend<string, TopicRule>;
  private certificates: StorageBackend<string, IoTCertificate>;
  private policyAttachments = new Map<string, Set<string>>();

  constructor(
    private accountId: string,
    private region: string,
  ) {
    this.things = new InMemoryStorage();
    this.thingTypes = new InMemoryStorage();
    this.thingGroups = new InMemoryStorage();
    this.policies = new InMemoryStorage();
    this.topicRules = new InMemoryStorage();
    this.certificates = new InMemoryStorage();
  }

  // --- Things ---

  createThing(
    thingName: string,
    thingTypeName?: string,
    attributes?: Record<string, string>,
  ): Thing {
    if (this.things.has(thingName)) {
      throw new AwsError("ResourceAlreadyExistsException", `Thing ${thingName} already exists.`, 409);
    }
    if (thingTypeName && !this.thingTypes.has(thingTypeName)) {
      throw new AwsError("ResourceNotFoundException", `ThingType ${thingTypeName} does not exist.`, 404);
    }
    const thingId = crypto.randomUUID();
    const thing: Thing = {
      thingName,
      thingId,
      thingArn: buildArn("iot", this.region, this.accountId, "thing/", thingName),
      thingTypeName,
      attributes: attributes ?? {},
      version: 1,
    };
    this.things.set(thingName, thing);
    return thing;
  }

  describeThing(thingName: string): Thing {
    const thing = this.things.get(thingName);
    if (!thing) throw new AwsError("ResourceNotFoundException", `Thing ${thingName} does not exist.`, 404);
    return thing;
  }

  listThings(): Thing[] {
    return this.things.values();
  }

  updateThing(
    thingName: string,
    thingTypeName?: string,
    attributes?: Record<string, string>,
    removeThingType?: boolean,
  ): void {
    const thing = this.describeThing(thingName);
    if (removeThingType) {
      thing.thingTypeName = undefined;
    } else if (thingTypeName !== undefined) {
      if (!this.thingTypes.has(thingTypeName)) {
        throw new AwsError("ResourceNotFoundException", `ThingType ${thingTypeName} does not exist.`, 404);
      }
      thing.thingTypeName = thingTypeName;
    }
    if (attributes !== undefined) {
      thing.attributes = attributes;
    }
    thing.version++;
    this.things.set(thingName, thing);
  }

  deleteThing(thingName: string): void {
    if (!this.things.has(thingName)) {
      throw new AwsError("ResourceNotFoundException", `Thing ${thingName} does not exist.`, 404);
    }
    this.things.delete(thingName);
  }

  // --- Thing Types ---

  createThingType(
    thingTypeName: string,
    thingTypeProperties?: ThingType["thingTypeProperties"],
  ): ThingType {
    if (this.thingTypes.has(thingTypeName)) {
      throw new AwsError("ResourceAlreadyExistsException", `ThingType ${thingTypeName} already exists.`, 409);
    }
    const tt: ThingType = {
      thingTypeName,
      thingTypeArn: buildArn("iot", this.region, this.accountId, "thingtype/", thingTypeName),
      thingTypeId: crypto.randomUUID(),
      thingTypeProperties,
    };
    this.thingTypes.set(thingTypeName, tt);
    return tt;
  }

  listThingTypes(): ThingType[] {
    return this.thingTypes.values();
  }

  // --- Thing Groups ---

  createThingGroup(thingGroupName: string): ThingGroup {
    if (this.thingGroups.has(thingGroupName)) {
      throw new AwsError("ResourceAlreadyExistsException", `ThingGroup ${thingGroupName} already exists.`, 409);
    }
    const tg: ThingGroup = {
      thingGroupName,
      thingGroupArn: buildArn("iot", this.region, this.accountId, "thinggroup/", thingGroupName),
      thingGroupId: crypto.randomUUID(),
      thingArns: new Set(),
    };
    this.thingGroups.set(thingGroupName, tg);
    return tg;
  }

  listThingGroups(): ThingGroup[] {
    return this.thingGroups.values();
  }

  addThingToThingGroup(thingName: string, thingGroupName: string): void {
    const group = this.thingGroups.get(thingGroupName);
    if (!group) throw new AwsError("ResourceNotFoundException", `ThingGroup ${thingGroupName} does not exist.`, 404);
    const thing = this.describeThing(thingName);
    group.thingArns.add(thing.thingArn);
  }

  // --- Policies ---

  createPolicy(policyName: string, policyDocument: string): IoTPolicy {
    if (this.policies.has(policyName)) {
      throw new AwsError("ResourceAlreadyExistsException", `Policy ${policyName} already exists.`, 409);
    }
    const policy: IoTPolicy = {
      policyName,
      policyArn: buildArn("iot", this.region, this.accountId, "policy/", policyName),
      policyDocument,
      policyVersionId: "1",
    };
    this.policies.set(policyName, policy);
    return policy;
  }

  getPolicy(policyName: string): IoTPolicy {
    const policy = this.policies.get(policyName);
    if (!policy) throw new AwsError("ResourceNotFoundException", `Policy ${policyName} does not exist.`, 404);
    return policy;
  }

  listPolicies(): IoTPolicy[] {
    return this.policies.values();
  }

  deletePolicy(policyName: string): void {
    if (!this.policies.has(policyName)) {
      throw new AwsError("ResourceNotFoundException", `Policy ${policyName} does not exist.`, 404);
    }
    this.policies.delete(policyName);
  }

  attachPolicy(policyName: string, targetArn: string): void {
    if (!this.policies.has(policyName)) {
      throw new AwsError("ResourceNotFoundException", `Policy ${policyName} does not exist.`, 404);
    }
    let targets = this.policyAttachments.get(policyName);
    if (!targets) {
      targets = new Set();
      this.policyAttachments.set(policyName, targets);
    }
    targets.add(targetArn);
  }

  detachPolicy(policyName: string, targetArn: string): void {
    const targets = this.policyAttachments.get(policyName);
    if (targets) targets.delete(targetArn);
  }

  // --- Topic Rules ---

  createTopicRule(
    ruleName: string,
    sql: string,
    actions: any[],
    description?: string,
    ruleDisabled?: boolean,
  ): TopicRule {
    if (this.topicRules.has(ruleName)) {
      throw new AwsError("ResourceAlreadyExistsException", `TopicRule ${ruleName} already exists.`, 409);
    }
    const rule: TopicRule = {
      ruleName,
      ruleArn: buildArn("iot", this.region, this.accountId, "rule/", ruleName),
      sql,
      description,
      actions: actions ?? [],
      ruleDisabled: ruleDisabled ?? false,
      createdAt: Date.now() / 1000,
    };
    this.topicRules.set(ruleName, rule);
    return rule;
  }

  getTopicRule(ruleName: string): TopicRule {
    const rule = this.topicRules.get(ruleName);
    if (!rule) throw new AwsError("ResourceNotFoundException", `TopicRule ${ruleName} does not exist.`, 404);
    return rule;
  }

  listTopicRules(): TopicRule[] {
    return this.topicRules.values();
  }

  deleteTopicRule(ruleName: string): void {
    if (!this.topicRules.has(ruleName)) {
      throw new AwsError("ResourceNotFoundException", `TopicRule ${ruleName} does not exist.`, 404);
    }
    this.topicRules.delete(ruleName);
  }

  // --- Certificates ---

  createCertificateFromCsr(csr: string, setAsActive: boolean): IoTCertificate {
    const certId = crypto.randomUUID().replace(/-/g, "").substring(0, 64);
    const cert: IoTCertificate = {
      certificateId: certId,
      certificateArn: buildArn("iot", this.region, this.accountId, "cert/", certId),
      certificatePem: `-----BEGIN CERTIFICATE-----\nMOCK_CERT_${certId}\n-----END CERTIFICATE-----`,
      status: setAsActive ? "ACTIVE" : "INACTIVE",
      createdAt: Date.now() / 1000,
    };
    this.certificates.set(certId, cert);
    return cert;
  }

  listCertificates(): IoTCertificate[] {
    return this.certificates.values();
  }

  // --- Endpoint ---

  describeEndpoint(endpointType?: string): string {
    const prefix = crypto.randomUUID().replace(/-/g, "").substring(0, 14);
    if (endpointType === "iot:Data-ATS") {
      return `${prefix}-ats.iot.${this.region}.amazonaws.com`;
    }
    return `${prefix}.iot.${this.region}.amazonaws.com`;
  }
}
