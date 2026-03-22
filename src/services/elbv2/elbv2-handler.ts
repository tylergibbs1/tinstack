import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { Elbv2Service, LoadBalancer, TargetGroup, Listener, Rule, ListenerAction, RuleCondition, TargetDescription, TargetHealthDescription } from "./elbv2-service";

const NS = "http://elasticloadbalancing.amazonaws.com/doc/2015-12-01/";

export class Elbv2QueryHandler {
  constructor(private service: Elbv2Service) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        // Load Balancers
        case "CreateLoadBalancer": return this.createLoadBalancer(params, ctx);
        case "DescribeLoadBalancers": return this.describeLoadBalancers(params, ctx);
        case "DeleteLoadBalancer": return this.deleteLoadBalancer(params, ctx);
        case "DescribeLoadBalancerAttributes": return this.describeLoadBalancerAttributes(params, ctx);
        case "ModifyLoadBalancerAttributes": return this.modifyLoadBalancerAttributes(params, ctx);

        // Target Groups
        case "CreateTargetGroup": return this.createTargetGroup(params, ctx);
        case "DescribeTargetGroups": return this.describeTargetGroups(params, ctx);
        case "DeleteTargetGroup": return this.deleteTargetGroup(params, ctx);
        case "DescribeTargetGroupAttributes": return this.describeTargetGroupAttributes(params, ctx);
        case "ModifyTargetGroupAttributes": return this.modifyTargetGroupAttributes(params, ctx);

        // Listeners
        case "CreateListener": return this.createListener(params, ctx);
        case "DescribeListeners": return this.describeListeners(params, ctx);
        case "DeleteListener": return this.deleteListener(params, ctx);
        case "ModifyListener": return this.modifyListener(params, ctx);

        // Targets
        case "RegisterTargets": return this.registerTargets(params, ctx);
        case "DeregisterTargets": return this.deregisterTargets(params, ctx);
        case "DescribeTargetHealth": return this.describeTargetHealth(params, ctx);

        // Target Group modification
        case "ModifyTargetGroup": return this.modifyTargetGroup(params, ctx);

        // Rules
        case "CreateRule": return this.createRule(params, ctx);
        case "DescribeRules": return this.describeRules(params, ctx);
        case "DeleteRule": return this.deleteRule(params, ctx);
        case "ModifyRule": return this.modifyRule(params, ctx);
        case "SetRulePriorities": return this.setRulePriorities(params, ctx);

        // Tags
        case "DescribeTags": return this.describeTags(params, ctx);
        case "AddTags": return this.addTags(params, ctx);
        case "RemoveTags": return this.removeTags(params, ctx);

        // Classic ELB actions
        case "RegisterInstancesWithLoadBalancer": return this.registerInstances(params, ctx);
        case "DeregisterInstancesFromLoadBalancer": return this.deregisterInstances(params, ctx);
        case "ConfigureHealthCheck": return this.configureHealthCheck(params, ctx);
        case "DescribeInstanceHealth": return this.describeInstanceHealth(params, ctx);
        case "CreateLoadBalancerListeners": return this.createLoadBalancerListeners(params, ctx);
        case "DeleteLoadBalancerListeners": return this.deleteLoadBalancerListeners(params, ctx);

        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  // --- Load Balancers ---

  private createLoadBalancer(params: URLSearchParams, ctx: RequestContext): Response {
    // Detect classic ELB: uses LoadBalancerName param and Listeners instead of Name and Type
    const classicName = params.get("LoadBalancerName");
    if (classicName && !params.has("Name")) {
      return this.createClassicLoadBalancer(params, ctx);
    }

    const name = params.get("Name")!;
    const subnets = this.extractMembers(params, "Subnets.member");
    const securityGroups = this.extractMembers(params, "SecurityGroups.member");
    const scheme = params.get("Scheme") ?? undefined;
    const type = params.get("Type") ?? undefined;
    const tags = this.extractTags(params);

    const lb = this.service.createLoadBalancer(name, subnets, securityGroups, scheme, type, tags, ctx.region);
    const xml = new XmlBuilder().start("LoadBalancers").raw(this.lbXml(lb)).end("LoadBalancers");
    return xmlResponse(xmlEnvelope("CreateLoadBalancer", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeLoadBalancers(params: URLSearchParams, ctx: RequestContext): Response {
    // Classic ELB uses LoadBalancerNames.member.N
    const classicNames = this.extractMembers(params, "LoadBalancerNames.member");
    if (classicNames.length > 0) {
      const lbs = this.service.describeClassicLoadBalancers(classicNames, ctx.region);
      const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
      const xml = new XmlBuilder().start("LoadBalancerDescriptions");
      for (const lb of lbs) {
        xml.start("member")
          .elem("LoadBalancerName", lb.loadBalancerName)
          .elem("DNSName", lb.dnsName)
          .elem("Scheme", lb.scheme)
          .elem("CreatedTime", lb.createdTime)
          .elem("VPCId", lb.vpcId)
          .start("AvailabilityZones");
        for (const az of lb.availabilityZones) xml.elem("member", az.zoneName);
        xml.end("AvailabilityZones").end("member");
      }
      xml.end("LoadBalancerDescriptions");
      return xmlResponse(xmlEnvelope("DescribeLoadBalancers", ctx.requestId, xml.build(), classicNS), ctx.requestId);
    }

    const arns = this.extractMembers(params, "LoadBalancerArns.member");
    const names = this.extractMembers(params, "Names.member");
    const lbs = this.service.describeLoadBalancers(
      arns.length > 0 ? arns : undefined,
      names.length > 0 ? names : undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("LoadBalancers");
    for (const lb of lbs) xml.raw(this.lbXml(lb));
    xml.end("LoadBalancers");
    return xmlResponse(xmlEnvelope("DescribeLoadBalancers", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteLoadBalancer(params: URLSearchParams, ctx: RequestContext): Response {
    // Classic ELB uses LoadBalancerName, v2 uses LoadBalancerArn
    const classicName = params.get("LoadBalancerName");
    if (classicName && !params.has("LoadBalancerArn")) {
      this.service.deleteClassicLoadBalancer(classicName, ctx.region);
      const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
      return xmlResponse(xmlEnvelopeNoResult("DeleteLoadBalancer", ctx.requestId, classicNS), ctx.requestId);
    }
    this.service.deleteLoadBalancer(params.get("LoadBalancerArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteLoadBalancer", ctx.requestId, NS), ctx.requestId);
  }

  private describeLoadBalancerAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = this.service.describeLoadBalancerAttributes(params.get("LoadBalancerArn")!);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of attrs) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("DescribeLoadBalancerAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private modifyLoadBalancerAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("LoadBalancerArn")!;
    const attrs = this.extractAttributes(params);
    const result = this.service.modifyLoadBalancerAttributes(arn, attrs);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of result) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("ModifyLoadBalancerAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Target Groups ---

  private createTargetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.extractTags(params);
    const tg = this.service.createTargetGroup(
      params.get("Name")!,
      params.get("Protocol") ?? undefined,
      params.get("Port") ? parseInt(params.get("Port")!) : undefined,
      params.get("VpcId") ?? undefined,
      params.get("TargetType") ?? undefined,
      params.get("HealthCheckProtocol") ?? undefined,
      params.get("HealthCheckPath") ?? undefined,
      tags,
      ctx.region,
    );
    const xml = new XmlBuilder().start("TargetGroups").raw(this.tgXml(tg)).end("TargetGroups");
    return xmlResponse(xmlEnvelope("CreateTargetGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeTargetGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "TargetGroupArns.member");
    const tgs = this.service.describeTargetGroups(arns.length > 0 ? arns : undefined, ctx.region);
    const xml = new XmlBuilder().start("TargetGroups");
    for (const tg of tgs) xml.raw(this.tgXml(tg));
    xml.end("TargetGroups");
    return xmlResponse(xmlEnvelope("DescribeTargetGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteTargetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteTargetGroup(params.get("TargetGroupArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteTargetGroup", ctx.requestId, NS), ctx.requestId);
  }

  private describeTargetGroupAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const attrs = this.service.describeTargetGroupAttributes(params.get("TargetGroupArn")!);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of attrs) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("DescribeTargetGroupAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private modifyTargetGroupAttributes(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("TargetGroupArn")!;
    const attrs = this.extractAttributes(params);
    const result = this.service.modifyTargetGroupAttributes(arn, attrs);
    const xml = new XmlBuilder().start("Attributes");
    for (const a of result) {
      xml.start("member").elem("Key", a.key).elem("Value", a.value).end("member");
    }
    xml.end("Attributes");
    return xmlResponse(xmlEnvelope("ModifyTargetGroupAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Listeners ---

  private createListener(params: URLSearchParams, ctx: RequestContext): Response {
    const lbArn = params.get("LoadBalancerArn")!;
    const protocol = params.get("Protocol") ?? undefined;
    const port = parseInt(params.get("Port") ?? "80");
    const actions = this.extractDefaultActions(params);
    const tags = this.extractTags(params);

    const listener = this.service.createListener(lbArn, protocol, port, actions, tags, ctx.region);
    const xml = new XmlBuilder().start("Listeners").raw(this.listenerXml(listener)).end("Listeners");
    return xmlResponse(xmlEnvelope("CreateListener", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeListeners(params: URLSearchParams, ctx: RequestContext): Response {
    const lbArn = params.get("LoadBalancerArn") ?? undefined;
    const arns = this.extractMembers(params, "ListenerArns.member");
    const listeners = this.service.describeListeners(lbArn, arns.length > 0 ? arns : undefined, ctx.region);
    const xml = new XmlBuilder().start("Listeners");
    for (const l of listeners) xml.raw(this.listenerXml(l));
    xml.end("Listeners");
    return xmlResponse(xmlEnvelope("DescribeListeners", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteListener(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteListener(params.get("ListenerArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteListener", ctx.requestId, NS), ctx.requestId);
  }

  // --- Modify Listener ---

  private modifyListener(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("ListenerArn")!;
    const protocol = params.get("Protocol") ?? undefined;
    const port = params.has("Port") ? parseInt(params.get("Port")!) : undefined;
    const actions = this.extractDefaultActions(params);
    const listener = this.service.modifyListener(arn, protocol, port, actions.length > 0 ? actions : undefined);
    const xml = new XmlBuilder().start("Listeners").raw(this.listenerXml(listener)).end("Listeners");
    return xmlResponse(xmlEnvelope("ModifyListener", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Targets ---

  private registerTargets(params: URLSearchParams, ctx: RequestContext): Response {
    const targetGroupArn = params.get("TargetGroupArn")!;
    const targets = this.extractTargetDescriptions(params);
    this.service.registerTargets(targetGroupArn, targets);
    return xmlResponse(xmlEnvelopeNoResult("RegisterTargets", ctx.requestId, NS), ctx.requestId);
  }

  private deregisterTargets(params: URLSearchParams, ctx: RequestContext): Response {
    const targetGroupArn = params.get("TargetGroupArn")!;
    const targets = this.extractTargetDescriptions(params);
    this.service.deregisterTargets(targetGroupArn, targets);
    return xmlResponse(xmlEnvelopeNoResult("DeregisterTargets", ctx.requestId, NS), ctx.requestId);
  }

  private describeTargetHealth(params: URLSearchParams, ctx: RequestContext): Response {
    const targetGroupArn = params.get("TargetGroupArn")!;
    const targets = this.extractTargetDescriptions(params);
    const healthDescriptions = this.service.describeTargetHealth(targetGroupArn, targets.length > 0 ? targets : undefined);
    const xml = new XmlBuilder().start("TargetHealthDescriptions");
    for (const thd of healthDescriptions) {
      xml.start("member");
      xml.start("Target");
      xml.elem("Id", thd.target.id);
      if (thd.target.port !== undefined) xml.elem("Port", thd.target.port);
      if (thd.target.availabilityZone) xml.elem("AvailabilityZone", thd.target.availabilityZone);
      xml.end("Target");
      xml.start("TargetHealth");
      xml.elem("State", thd.targetHealth.state);
      if (thd.targetHealth.reason) xml.elem("Reason", thd.targetHealth.reason);
      if (thd.targetHealth.description) xml.elem("Description", thd.targetHealth.description);
      xml.end("TargetHealth");
      xml.end("member");
    }
    xml.end("TargetHealthDescriptions");
    return xmlResponse(xmlEnvelope("DescribeTargetHealth", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- ModifyTargetGroup ---

  private modifyTargetGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("TargetGroupArn")!;
    const tg = this.service.modifyTargetGroup(
      arn,
      params.get("HealthCheckProtocol") ?? undefined,
      params.get("HealthCheckPath") ?? undefined,
      params.get("HealthCheckPort") ?? undefined,
      params.has("HealthCheckIntervalSeconds") ? parseInt(params.get("HealthCheckIntervalSeconds")!) : undefined,
      params.has("HealthCheckTimeoutSeconds") ? parseInt(params.get("HealthCheckTimeoutSeconds")!) : undefined,
      params.has("HealthyThresholdCount") ? parseInt(params.get("HealthyThresholdCount")!) : undefined,
      params.has("UnhealthyThresholdCount") ? parseInt(params.get("UnhealthyThresholdCount")!) : undefined,
    );
    const xml = new XmlBuilder().start("TargetGroups").raw(this.tgXml(tg)).end("TargetGroups");
    return xmlResponse(xmlEnvelope("ModifyTargetGroup", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Rules ---

  private createRule(params: URLSearchParams, ctx: RequestContext): Response {
    const listenerArn = params.get("ListenerArn")!;
    const priority = params.get("Priority")!;
    const conditions = this.extractConditions(params);
    const actions = this.extractActions(params);
    const rule = this.service.createRule(listenerArn, priority, conditions, actions, ctx.region);
    const xml = new XmlBuilder().start("Rules").raw(this.ruleXml(rule)).end("Rules");
    return xmlResponse(xmlEnvelope("CreateRule", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describeRules(params: URLSearchParams, ctx: RequestContext): Response {
    const listenerArn = params.get("ListenerArn") ?? undefined;
    const ruleArns = this.extractMembers(params, "RuleArns.member");
    const rules = this.service.describeRules(listenerArn, ruleArns.length > 0 ? ruleArns : undefined);
    const xml = new XmlBuilder().start("Rules");
    for (const r of rules) xml.raw(this.ruleXml(r));
    xml.end("Rules");
    return xmlResponse(xmlEnvelope("DescribeRules", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteRule(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteRule(params.get("RuleArn")!);
    return xmlResponse(xmlEnvelopeNoResult("DeleteRule", ctx.requestId, NS), ctx.requestId);
  }

  private modifyRule(params: URLSearchParams, ctx: RequestContext): Response {
    const arn = params.get("RuleArn")!;
    const conditions = this.extractConditions(params);
    const actions = this.extractActions(params);
    const rule = this.service.modifyRule(
      arn,
      conditions.length > 0 ? conditions : undefined,
      actions.length > 0 ? actions : undefined,
    );
    const xml = new XmlBuilder().start("Rules").raw(this.ruleXml(rule)).end("Rules");
    return xmlResponse(xmlEnvelope("ModifyRule", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private setRulePriorities(params: URLSearchParams, ctx: RequestContext): Response {
    const priorities: { ruleArn: string; priority: number }[] = [];
    let i = 1;
    while (params.has(`RulePriorities.member.${i}.RuleArn`)) {
      priorities.push({
        ruleArn: params.get(`RulePriorities.member.${i}.RuleArn`)!,
        priority: parseInt(params.get(`RulePriorities.member.${i}.Priority`)!),
      });
      i++;
    }
    const rules = this.service.setRulePriorities(priorities);
    const xml = new XmlBuilder().start("Rules");
    for (const r of rules) xml.raw(this.ruleXml(r));
    xml.end("Rules");
    return xmlResponse(xmlEnvelope("SetRulePriorities", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Tags ---

  private describeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "ResourceArns.member");
    const descriptions = this.service.describeTags(arns);
    const xml = new XmlBuilder().start("TagDescriptions");
    for (const desc of descriptions) {
      xml.start("member");
      xml.elem("ResourceArn", desc.resourceArn);
      xml.start("Tags");
      for (const t of desc.tags) {
        xml.start("member").elem("Key", t.key).elem("Value", t.value).end("member");
      }
      xml.end("Tags");
      xml.end("member");
    }
    xml.end("TagDescriptions");
    return xmlResponse(xmlEnvelope("DescribeTags", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private addTags(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "ResourceArns.member");
    const tags: { key: string; value: string }[] = [];
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags.push({ key: params.get(`Tags.member.${i}.Key`)!, value: params.get(`Tags.member.${i}.Value`)! });
      i++;
    }
    this.service.addTags(arns, tags);
    return xmlResponse(xmlEnvelopeNoResult("AddTags", ctx.requestId, NS), ctx.requestId);
  }

  private removeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const arns = this.extractMembers(params, "ResourceArns.member");
    const tagKeys = this.extractMembers(params, "TagKeys.member");
    this.service.removeTags(arns, tagKeys);
    return xmlResponse(xmlEnvelopeNoResult("RemoveTags", ctx.requestId, NS), ctx.requestId);
  }

  // --- Classic ELB ---

  private createClassicLoadBalancer(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("LoadBalancerName")!;
    const azs = this.extractMembers(params, "AvailabilityZones.member");
    const subnets = this.extractMembers(params, "Subnets.member");
    const securityGroups = this.extractMembers(params, "SecurityGroups.member");
    const scheme = params.get("Scheme") ?? undefined;

    const listeners: { protocol: string; loadBalancerPort: number; instanceProtocol: string; instancePort: number }[] = [];
    let i = 1;
    while (params.has(`Listeners.member.${i}.Protocol`)) {
      listeners.push({
        protocol: params.get(`Listeners.member.${i}.Protocol`)!,
        loadBalancerPort: parseInt(params.get(`Listeners.member.${i}.LoadBalancerPort`)!),
        instanceProtocol: params.get(`Listeners.member.${i}.InstanceProtocol`) ?? params.get(`Listeners.member.${i}.Protocol`)!,
        instancePort: parseInt(params.get(`Listeners.member.${i}.InstancePort`)!),
      });
      i++;
    }

    const lb = this.service.createClassicLoadBalancer(name, listeners, azs, subnets, securityGroups, scheme, ctx.region);
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    const xml = new XmlBuilder().elem("DNSName", lb.dnsName);
    return xmlResponse(xmlEnvelope("CreateLoadBalancer", ctx.requestId, xml.build(), classicNS), ctx.requestId);
  }

  private registerInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("LoadBalancerName")!;
    const instances: { instanceId: string }[] = [];
    let i = 1;
    while (params.has(`Instances.member.${i}.InstanceId`)) {
      instances.push({ instanceId: params.get(`Instances.member.${i}.InstanceId`)! });
      i++;
    }
    const result = this.service.registerInstancesWithLoadBalancer(name, instances, ctx.region);
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    const xml = new XmlBuilder().start("Instances");
    for (const inst of result) {
      xml.start("member").elem("InstanceId", inst.instanceId).end("member");
    }
    xml.end("Instances");
    return xmlResponse(xmlEnvelope("RegisterInstancesWithLoadBalancer", ctx.requestId, xml.build(), classicNS), ctx.requestId);
  }

  private deregisterInstances(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("LoadBalancerName")!;
    const instances: { instanceId: string }[] = [];
    let i = 1;
    while (params.has(`Instances.member.${i}.InstanceId`)) {
      instances.push({ instanceId: params.get(`Instances.member.${i}.InstanceId`)! });
      i++;
    }
    const result = this.service.deregisterInstancesFromLoadBalancer(name, instances, ctx.region);
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    const xml = new XmlBuilder().start("Instances");
    for (const inst of result) {
      xml.start("member").elem("InstanceId", inst.instanceId).end("member");
    }
    xml.end("Instances");
    return xmlResponse(xmlEnvelope("DeregisterInstancesFromLoadBalancer", ctx.requestId, xml.build(), classicNS), ctx.requestId);
  }

  private configureHealthCheck(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("LoadBalancerName")!;
    const healthCheck = {
      target: params.get("HealthCheck.Target") ?? "TCP:80",
      interval: parseInt(params.get("HealthCheck.Interval") ?? "30"),
      timeout: parseInt(params.get("HealthCheck.Timeout") ?? "5"),
      unhealthyThreshold: parseInt(params.get("HealthCheck.UnhealthyThreshold") ?? "2"),
      healthyThreshold: parseInt(params.get("HealthCheck.HealthyThreshold") ?? "10"),
    };
    const result = this.service.configureHealthCheck(name, healthCheck, ctx.region);
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    const xml = new XmlBuilder()
      .start("HealthCheck")
      .elem("Target", result.target)
      .elem("Interval", result.interval)
      .elem("Timeout", result.timeout)
      .elem("UnhealthyThreshold", result.unhealthyThreshold)
      .elem("HealthyThreshold", result.healthyThreshold)
      .end("HealthCheck");
    return xmlResponse(xmlEnvelope("ConfigureHealthCheck", ctx.requestId, xml.build(), classicNS), ctx.requestId);
  }

  private describeInstanceHealth(params: URLSearchParams, ctx: RequestContext): Response {
    const name = params.get("LoadBalancerName")!;
    const instances = this.service.describeInstanceHealth(name, ctx.region);
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    const xml = new XmlBuilder().start("InstanceStates");
    for (const inst of instances) {
      xml.start("member")
        .elem("InstanceId", inst.instanceId)
        .elem("State", inst.state)
        .elem("Description", "N/A")
        .elem("ReasonCode", "N/A")
        .end("member");
    }
    xml.end("InstanceStates");
    return xmlResponse(xmlEnvelope("DescribeInstanceHealth", ctx.requestId, xml.build(), classicNS), ctx.requestId);
  }

  private createLoadBalancerListeners(params: URLSearchParams, ctx: RequestContext): Response {
    // Classic ELB listener creation is a no-op in our mock (listeners created at LB creation)
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    return xmlResponse(xmlEnvelopeNoResult("CreateLoadBalancerListeners", ctx.requestId, classicNS), ctx.requestId);
  }

  private deleteLoadBalancerListeners(params: URLSearchParams, ctx: RequestContext): Response {
    const classicNS = "http://elasticloadbalancing.amazonaws.com/doc/2012-06-01/";
    return xmlResponse(xmlEnvelopeNoResult("DeleteLoadBalancerListeners", ctx.requestId, classicNS), ctx.requestId);
  }

  // --- XML helpers ---

  private lbXml(lb: LoadBalancer): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("LoadBalancerArn", lb.loadBalancerArn)
      .elem("LoadBalancerName", lb.loadBalancerName)
      .elem("DNSName", lb.dnsName)
      .elem("Scheme", lb.scheme)
      .elem("Type", lb.type)
      .elem("VpcId", lb.vpcId)
      .elem("CreatedTime", lb.createdTime)
      .start("State").elem("Code", lb.state.code).end("State")
      .start("AvailabilityZones");
    for (const az of lb.availabilityZones) {
      xml.start("member").elem("ZoneName", az.zoneName).elem("SubnetId", az.subnetId).end("member");
    }
    xml.end("AvailabilityZones")
      .start("SecurityGroups");
    for (const sg of lb.securityGroups) {
      xml.elem("member", sg);
    }
    xml.end("SecurityGroups")
      .end("member");
    return xml.build();
  }

  private tgXml(tg: TargetGroup): string {
    return new XmlBuilder()
      .start("member")
      .elem("TargetGroupArn", tg.targetGroupArn)
      .elem("TargetGroupName", tg.targetGroupName)
      .elem("Protocol", tg.protocol)
      .elem("Port", tg.port)
      .elem("VpcId", tg.vpcId)
      .elem("TargetType", tg.targetType)
      .elem("HealthCheckProtocol", tg.healthCheckProtocol)
      .elem("HealthCheckPath", tg.healthCheckPath)
      .elem("HealthCheckPort", tg.healthCheckPort)
      .elem("HealthCheckIntervalSeconds", tg.healthCheckIntervalSeconds)
      .elem("HealthCheckTimeoutSeconds", tg.healthCheckTimeoutSeconds)
      .elem("HealthyThresholdCount", tg.healthyThresholdCount)
      .elem("UnhealthyThresholdCount", tg.unhealthyThresholdCount)
      .end("member")
      .build();
  }

  private listenerXml(l: Listener): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("ListenerArn", l.listenerArn)
      .elem("LoadBalancerArn", l.loadBalancerArn)
      .elem("Protocol", l.protocol)
      .elem("Port", l.port)
      .start("DefaultActions");
    for (const a of l.defaultActions) {
      xml.start("member").elem("Type", a.type);
      if (a.targetGroupArn) xml.elem("TargetGroupArn", a.targetGroupArn);
      if (a.order !== undefined) xml.elem("Order", a.order);
      xml.end("member");
    }
    xml.end("DefaultActions").end("member");
    return xml.build();
  }

  // --- Param extraction helpers ---

  private extractMembers(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.${i}`)) {
      result.push(params.get(`${prefix}.${i}`)!);
      i++;
    }
    return result;
  }

  private extractTags(params: URLSearchParams): Record<string, string> {
    const tags: Record<string, string> = {};
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags[params.get(`Tags.member.${i}.Key`)!] = params.get(`Tags.member.${i}.Value`) ?? "";
      i++;
    }
    return tags;
  }

  private extractAttributes(params: URLSearchParams): { key: string; value: string }[] {
    const attrs: { key: string; value: string }[] = [];
    let i = 1;
    while (params.has(`Attributes.member.${i}.Key`)) {
      attrs.push({
        key: params.get(`Attributes.member.${i}.Key`)!,
        value: params.get(`Attributes.member.${i}.Value`) ?? "",
      });
      i++;
    }
    return attrs;
  }

  private extractDefaultActions(params: URLSearchParams): ListenerAction[] {
    return this.extractActionsWithPrefix(params, "DefaultActions");
  }

  private extractActions(params: URLSearchParams): ListenerAction[] {
    return this.extractActionsWithPrefix(params, "Actions");
  }

  private extractActionsWithPrefix(params: URLSearchParams, prefix: string): ListenerAction[] {
    const actions: ListenerAction[] = [];
    let i = 1;
    while (params.has(`${prefix}.member.${i}.Type`)) {
      const action: ListenerAction = { type: params.get(`${prefix}.member.${i}.Type`)! };
      const tgArn = params.get(`${prefix}.member.${i}.TargetGroupArn`);
      if (tgArn) action.targetGroupArn = tgArn;
      const order = params.get(`${prefix}.member.${i}.Order`);
      if (order) action.order = parseInt(order);
      actions.push(action);
      i++;
    }
    return actions;
  }

  private extractTargetDescriptions(params: URLSearchParams): TargetDescription[] {
    const targets: TargetDescription[] = [];
    let i = 1;
    while (params.has(`Targets.member.${i}.Id`)) {
      const target: TargetDescription = { id: params.get(`Targets.member.${i}.Id`)! };
      const port = params.get(`Targets.member.${i}.Port`);
      if (port) target.port = parseInt(port);
      const az = params.get(`Targets.member.${i}.AvailabilityZone`);
      if (az) target.availabilityZone = az;
      targets.push(target);
      i++;
    }
    return targets;
  }

  private extractConditions(params: URLSearchParams): RuleCondition[] {
    const conditions: RuleCondition[] = [];
    let i = 1;
    while (params.has(`Conditions.member.${i}.Field`)) {
      const field = params.get(`Conditions.member.${i}.Field`)!;
      const values: string[] = [];
      let j = 1;
      while (params.has(`Conditions.member.${i}.Values.member.${j}`)) {
        values.push(params.get(`Conditions.member.${i}.Values.member.${j}`)!);
        j++;
      }
      // Also check PathPatternConfig and HostHeaderConfig
      if (values.length === 0) {
        let j = 1;
        const configKey = field === "path-pattern" ? "PathPatternConfig" : field === "host-header" ? "HostHeaderConfig" : "HttpRequestMethodConfig";
        while (params.has(`Conditions.member.${i}.${configKey}.Values.member.${j}`)) {
          values.push(params.get(`Conditions.member.${i}.${configKey}.Values.member.${j}`)!);
          j++;
        }
      }
      conditions.push({ field, values });
      i++;
    }
    return conditions;
  }

  private ruleXml(rule: Rule): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("RuleArn", rule.ruleArn)
      .elem("Priority", rule.priority)
      .elem("IsDefault", rule.isDefault);
    xml.start("Conditions");
    for (const c of rule.conditions) {
      xml.start("member");
      xml.elem("Field", c.field);
      xml.start("Values");
      for (const v of c.values) xml.elem("member", v);
      xml.end("Values");
      xml.end("member");
    }
    xml.end("Conditions");
    xml.start("Actions");
    for (const a of rule.actions) {
      xml.start("member").elem("Type", a.type);
      if (a.targetGroupArn) xml.elem("TargetGroupArn", a.targetGroupArn);
      if (a.order !== undefined) xml.elem("Order", a.order);
      xml.end("member");
    }
    xml.end("Actions");
    xml.end("member");
    return xml.build();
  }
}
