import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface SigningProfile {
  profileName: string;
  profileVersion: string;
  profileVersionArn: string;
  signingMaterial?: { certificateArn: string };
  platformId: string;
  status: string;
  tags: Record<string, string>;
  createdAt: number;
}

export interface SigningJob {
  jobId: string;
  profileName: string;
  source: { s3: { bucketName: string; key: string; version?: string } };
  destination: { s3: { bucketName: string; prefix?: string } };
  status: string;
  createdAt: number;
}

export class SignerService {
  private profiles: StorageBackend<string, SigningProfile>;
  private jobs: StorageBackend<string, SigningJob>;

  constructor(private accountId: string) {
    this.profiles = new InMemoryStorage();
    this.jobs = new InMemoryStorage();
  }

  putSigningProfile(name: string, platformId: string, tags?: Record<string, string>, region?: string): SigningProfile {
    const version = crypto.randomUUID().substring(0, 10);
    const profile: SigningProfile = {
      profileName: name,
      profileVersion: version,
      profileVersionArn: `arn:aws:signer:${region ?? "us-east-1"}:${this.accountId}:/signing-profiles/${name}/${version}`,
      platformId: platformId ?? "AWSLambda-SHA384-ECDSA",
      status: "Active",
      tags: tags ?? {},
      createdAt: Date.now() / 1000,
    };
    this.profiles.set(name, profile);
    return profile;
  }

  getSigningProfile(name: string): SigningProfile {
    const profile = this.profiles.get(name);
    if (!profile) throw new AwsError("ResourceNotFoundException", `Signing profile ${name} not found.`, 404);
    return profile;
  }

  listSigningProfiles(): SigningProfile[] {
    return this.profiles.values();
  }

  cancelSigningProfile(name: string): void {
    const profile = this.getSigningProfile(name);
    profile.status = "Canceled";
  }

  startSigningJob(profileName: string, source: any, destination: any): SigningJob {
    this.getSigningProfile(profileName);
    const job: SigningJob = {
      jobId: crypto.randomUUID(),
      profileName, source, destination,
      status: "Succeeded",
      createdAt: Date.now() / 1000,
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  describeSigningJob(jobId: string): SigningJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new AwsError("ResourceNotFoundException", `Signing job ${jobId} not found.`, 404);
    return job;
  }

  listSigningJobs(): SigningJob[] {
    return this.jobs.values();
  }
}
