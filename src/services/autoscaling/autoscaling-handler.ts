import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse } from "../../core/xml";
import type { AutoScalingService, AutoScalingGroup, LaunchConfiguration, ScalingPolicy, ScalingActivity } from "./autoscaling-service";

const NS = "http://autoscaling.amazonaws.com/doc/2011-01-01/";

export class AutoScalingQueryHandler {
  constructor(private service: AutoScalingService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateAutoScalingGroup": return this.createAutoScalingGroup(params, ctx);
        case "DescribeAutoScalingGroups": return this.describeAutoScalingGroups(params, ctx);
        case "UpdateAutoScalingGroup": return this.updateAutoScalingGroup(params, ctx);
        case "DeleteAutoScalingGroup": return this.deleteAutoScalingGroup(params, ctx);
        case "CreateLaunchConfiguration": return this.createLaunchConfiguration(params, ctx);
        case "DescribeLaunchConfigurations": return this.describeLaunchConfigurations(params, ctx);
        case "DeleteLaunchConfiguration": return this.deleteLaunchConfiguration(params, ctx);
        case "SetDesiredCapacity": return this.setDesiredCapacity(params, ctx);
        case "DescribeScalingActivities": return this.describeScalingActivities(params, ctx);
        case "PutScalingPolicy": return this.putScalingPolicy(params, ctx);
        case "DescribePolicies": return this.describePolicies(params, ctx);
        case "DeletePolicy": return this.deletePolicy(params, ctx);
        case "CreateOrUpdateTags": return this.createOrUpdateTags(params, ctx);
        case "DescribeTags": return this.describeTags(params, ctx);
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private extractMembers(params: URLSearchParams, prefix: string): string[] {
    const result: string[] = [];
    let i = 1;
    while (params.has(`${prefix}.${i}`)) {
      result.push(params.get(`${prefix}.${i}`)!);
      i++;
    }
    return result;
  }

  // --- Launch Configurations ---

  private createLaunchConfiguration(params: URLSearchParams, ctx: RequestContext): Response {
    const securityGroups = this.extractMembers(params, "SecurityGroups.member");
    this.service.createLaunchConfiguration(
      params.get("LaunchConfigurationName")!,
      params.get("ImageId") ?? "ami-12345678",
      params.get("InstanceType") ?? "t2.micro",
      params.get("KeyName") ?? undefined,
      securityGroups,
      params.get("UserData") ?? undefined,
      ctx.region,
    );
    return xmlResponse(xmlEnvelopeNoResult("CreateLaunchConfiguration", ctx.requestId, NS), ctx.requestId);
  }

  private describeLaunchConfigurations(params: URLSearchParams, ctx: RequestContext): Response {
    const names = this.extractMembers(params, "LaunchConfigurationNames.member");
    const lcs = this.service.describeLaunchConfigurations(names.length > 0 ? names : undefined, ctx.region);
    const xml = new XmlBuilder().start("LaunchConfigurations");
    for (const lc of lcs) xml.raw(this.lcXml(lc));
    xml.end("LaunchConfigurations");
    return xmlResponse(xmlEnvelope("DescribeLaunchConfigurations", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deleteLaunchConfiguration(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteLaunchConfiguration(params.get("LaunchConfigurationName")!, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteLaunchConfiguration", ctx.requestId, NS), ctx.requestId);
  }

  // --- Auto Scaling Groups ---

  private createAutoScalingGroup(params: URLSearchParams, ctx: RequestContext): Response {
    const azs = this.extractMembers(params, "AvailabilityZones.member");
    const tags = this.extractTags(params);

    let launchTemplate: { launchTemplateId?: string; launchTemplateName?: string; version?: string } | undefined;
    if (params.has("LaunchTemplate.LaunchTemplateId") || params.has("LaunchTemplate.LaunchTemplateName")) {
      launchTemplate = {
        launchTemplateId: params.get("LaunchTemplate.LaunchTemplateId") ?? undefined,
        launchTemplateName: params.get("LaunchTemplate.LaunchTemplateName") ?? undefined,
        version: params.get("LaunchTemplate.Version") ?? undefined,
      };
    }

    this.service.createAutoScalingGroup(
      params.get("AutoScalingGroupName")!,
      params.get("LaunchConfigurationName") ?? undefined,
      launchTemplate,
      parseInt(params.get("MinSize") ?? "0"),
      parseInt(params.get("MaxSize") ?? "1"),
      params.has("DesiredCapacity") ? parseInt(params.get("DesiredCapacity")!) : undefined,
      azs,
      params.get("VPCZoneIdentifier") ?? undefined,
      params.get("HealthCheckType") ?? undefined,
      params.has("HealthCheckGracePeriod") ? parseInt(params.get("HealthCheckGracePeriod")!) : undefined,
      params.has("DefaultCooldown") ? parseInt(params.get("DefaultCooldown")!) : undefined,
      tags,
      ctx.region,
    );
    return xmlResponse(xmlEnvelopeNoResult("CreateAutoScalingGroup", ctx.requestId, NS), ctx.requestId);
  }

  private describeAutoScalingGroups(params: URLSearchParams, ctx: RequestContext): Response {
    const names = this.extractMembers(params, "AutoScalingGroupNames.member");
    const asgs = this.service.describeAutoScalingGroups(names.length > 0 ? names : undefined, ctx.region);
    const xml = new XmlBuilder().start("AutoScalingGroups");
    for (const asg of asgs) xml.raw(this.asgXml(asg));
    xml.end("AutoScalingGroups");
    return xmlResponse(xmlEnvelope("DescribeAutoScalingGroups", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private updateAutoScalingGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.updateAutoScalingGroup(
      params.get("AutoScalingGroupName")!,
      params.has("MinSize") ? parseInt(params.get("MinSize")!) : undefined,
      params.has("MaxSize") ? parseInt(params.get("MaxSize")!) : undefined,
      params.has("DesiredCapacity") ? parseInt(params.get("DesiredCapacity")!) : undefined,
      params.has("DefaultCooldown") ? parseInt(params.get("DefaultCooldown")!) : undefined,
      params.get("HealthCheckType") ?? undefined,
      params.has("HealthCheckGracePeriod") ? parseInt(params.get("HealthCheckGracePeriod")!) : undefined,
      ctx.region,
    );
    return xmlResponse(xmlEnvelopeNoResult("UpdateAutoScalingGroup", ctx.requestId, NS), ctx.requestId);
  }

  private deleteAutoScalingGroup(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deleteAutoScalingGroup(params.get("AutoScalingGroupName")!, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("DeleteAutoScalingGroup", ctx.requestId, NS), ctx.requestId);
  }

  private setDesiredCapacity(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.setDesiredCapacity(
      params.get("AutoScalingGroupName")!,
      parseInt(params.get("DesiredCapacity")!),
      ctx.region,
    );
    return xmlResponse(xmlEnvelopeNoResult("SetDesiredCapacity", ctx.requestId, NS), ctx.requestId);
  }

  // --- Scaling Policies ---

  private putScalingPolicy(params: URLSearchParams, ctx: RequestContext): Response {
    const policy = this.service.putScalingPolicy(
      params.get("AutoScalingGroupName")!,
      params.get("PolicyName")!,
      params.get("PolicyType") ?? undefined,
      params.get("AdjustmentType") ?? undefined,
      params.has("ScalingAdjustment") ? parseInt(params.get("ScalingAdjustment")!) : undefined,
      params.has("Cooldown") ? parseInt(params.get("Cooldown")!) : undefined,
      undefined, // targetTrackingConfiguration - simplified
      ctx.region,
    );
    const xml = new XmlBuilder()
      .elem("PolicyARN", policy.policyARN)
      .start("Alarms").end("Alarms");
    return xmlResponse(xmlEnvelope("PutScalingPolicy", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private describePolicies(params: URLSearchParams, ctx: RequestContext): Response {
    const policyNames = this.extractMembers(params, "PolicyNames.member");
    const policies = this.service.describePolicies(
      params.get("AutoScalingGroupName") ?? undefined,
      policyNames.length > 0 ? policyNames : undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("ScalingPolicies");
    for (const p of policies) xml.raw(this.policyXml(p));
    xml.end("ScalingPolicies");
    return xmlResponse(xmlEnvelope("DescribePolicies", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  private deletePolicy(params: URLSearchParams, ctx: RequestContext): Response {
    this.service.deletePolicy(
      params.get("AutoScalingGroupName") ?? undefined,
      params.get("PolicyName")!,
      ctx.region,
    );
    return xmlResponse(xmlEnvelopeNoResult("DeletePolicy", ctx.requestId, NS), ctx.requestId);
  }

  // --- Activities ---

  private describeScalingActivities(params: URLSearchParams, ctx: RequestContext): Response {
    const activities = this.service.describeScalingActivities(
      params.get("AutoScalingGroupName") ?? undefined,
      ctx.region,
    );
    const xml = new XmlBuilder().start("Activities");
    for (const a of activities) {
      xml.start("member")
        .elem("ActivityId", a.activityId)
        .elem("AutoScalingGroupName", a.autoScalingGroupName)
        .elem("Description", a.description)
        .elem("Cause", a.cause)
        .elem("StartTime", a.startTime)
        .elem("EndTime", a.endTime)
        .elem("StatusCode", a.statusCode)
        .elem("Progress", a.progress)
        .end("member");
    }
    xml.end("Activities");
    return xmlResponse(xmlEnvelope("DescribeScalingActivities", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- Tags ---

  private createOrUpdateTags(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.extractTags(params);
    this.service.createOrUpdateTags(tags, ctx.region);
    return xmlResponse(xmlEnvelopeNoResult("CreateOrUpdateTags", ctx.requestId, NS), ctx.requestId);
  }

  private describeTags(params: URLSearchParams, ctx: RequestContext): Response {
    const tags = this.service.describeTags(ctx.region);
    const xml = new XmlBuilder().start("Tags");
    for (const t of tags) {
      xml.start("member")
        .elem("Key", t.key)
        .elem("Value", t.value)
        .elem("ResourceId", t.resourceId)
        .elem("ResourceType", t.resourceType)
        .elem("PropagateAtLaunch", t.propagateAtLaunch)
        .end("member");
    }
    xml.end("Tags");
    return xmlResponse(xmlEnvelope("DescribeTags", ctx.requestId, xml.build(), NS), ctx.requestId);
  }

  // --- XML helpers ---

  private lcXml(lc: LaunchConfiguration): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("LaunchConfigurationName", lc.launchConfigurationName)
      .elem("LaunchConfigurationARN", lc.launchConfigurationARN)
      .elem("ImageId", lc.imageId)
      .elem("InstanceType", lc.instanceType)
      .elem("CreatedTime", lc.createdTime);
    if (lc.keyName) xml.elem("KeyName", lc.keyName);
    xml.start("SecurityGroups");
    for (const sg of lc.securityGroups) xml.elem("member", sg);
    xml.end("SecurityGroups");
    xml.end("member");
    return xml.build();
  }

  private asgXml(asg: AutoScalingGroup): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("AutoScalingGroupName", asg.autoScalingGroupName)
      .elem("AutoScalingGroupARN", asg.autoScalingGroupARN)
      .elem("MinSize", asg.minSize)
      .elem("MaxSize", asg.maxSize)
      .elem("DesiredCapacity", asg.desiredCapacity)
      .elem("DefaultCooldown", asg.defaultCooldown)
      .elem("HealthCheckType", asg.healthCheckType)
      .elem("HealthCheckGracePeriod", asg.healthCheckGracePeriod)
      .elem("CreatedTime", asg.createdTime);
    if (asg.launchConfigurationName) xml.elem("LaunchConfigurationName", asg.launchConfigurationName);
    if (asg.launchTemplate) {
      xml.start("LaunchTemplate");
      if (asg.launchTemplate.launchTemplateId) xml.elem("LaunchTemplateId", asg.launchTemplate.launchTemplateId);
      if (asg.launchTemplate.launchTemplateName) xml.elem("LaunchTemplateName", asg.launchTemplate.launchTemplateName);
      if (asg.launchTemplate.version) xml.elem("Version", asg.launchTemplate.version);
      xml.end("LaunchTemplate");
    }
    xml.start("AvailabilityZones");
    for (const az of asg.availabilityZones) xml.elem("member", az);
    xml.end("AvailabilityZones");
    if (asg.vpcZoneIdentifier) xml.elem("VPCZoneIdentifier", asg.vpcZoneIdentifier);
    xml.start("Tags");
    for (const t of asg.tags) {
      xml.start("member")
        .elem("Key", t.key)
        .elem("Value", t.value)
        .elem("ResourceId", t.resourceId)
        .elem("ResourceType", t.resourceType)
        .elem("PropagateAtLaunch", t.propagateAtLaunch)
        .end("member");
    }
    xml.end("Tags");
    xml.end("member");
    return xml.build();
  }

  private policyXml(p: ScalingPolicy): string {
    const xml = new XmlBuilder()
      .start("member")
      .elem("PolicyName", p.policyName)
      .elem("PolicyARN", p.policyARN)
      .elem("AutoScalingGroupName", p.autoScalingGroupName)
      .elem("PolicyType", p.policyType);
    if (p.adjustmentType) xml.elem("AdjustmentType", p.adjustmentType);
    if (p.scalingAdjustment !== undefined) xml.elem("ScalingAdjustment", p.scalingAdjustment);
    if (p.cooldown !== undefined) xml.elem("Cooldown", p.cooldown);
    xml.elem("Enabled", p.enabled);
    xml.end("member");
    return xml.build();
  }

  private extractTags(params: URLSearchParams): { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[] {
    const tags: { key: string; value: string; resourceId: string; resourceType: string; propagateAtLaunch: boolean }[] = [];
    let i = 1;
    while (params.has(`Tags.member.${i}.Key`)) {
      tags.push({
        key: params.get(`Tags.member.${i}.Key`)!,
        value: params.get(`Tags.member.${i}.Value`) ?? "",
        resourceId: params.get(`Tags.member.${i}.ResourceId`) ?? "",
        resourceType: params.get(`Tags.member.${i}.ResourceType`) ?? "auto-scaling-group",
        propagateAtLaunch: params.get(`Tags.member.${i}.PropagateAtLaunch`) === "true",
      });
      i++;
    }
    return tags;
  }
}
