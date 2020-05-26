import { Bucket } from '@aws-cdk/aws-s3';
import { Artifact, Pipeline } from '@aws-cdk/aws-codepipeline';
import { BuildSpec, PipelineProject, Project } from '@aws-cdk/aws-codebuild';
import { Role, ManagedPolicy, ServicePrincipal } from '@aws-cdk/aws-iam';
import { CodeBuildAction, CodeCommitSourceAction, S3DeployAction } from '@aws-cdk/aws-codepipeline-actions';
import { existsSync } from 'fs';
import { Repository } from '@aws-cdk/aws-codecommit';
import { Construct, RemovalPolicy, CfnOutput } from '@aws-cdk/core';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { CloudFrontWebDistribution, SSLMethod, SecurityPolicyProtocol } from '@aws-cdk/aws-cloudfront';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { HostedZone, ARecord, AddressRecordTarget, IHostedZone } from '@aws-cdk/aws-route53';
import { Environment } from '../pillar-stack';
import { buildWebsiteBuildSpec, deployWebsiteBuildSpec } from '../utils/buildSpec.js';
import { Pipelineable } from './pipelineManager';

export interface WebsiteProps {
  name: string;
  environmentName: Environment;
  sourcePath: string;
  hostedZoneDomainName: string;
  certificateDomainName: string;
}

export class Website extends Construct implements Pipelineable {
  public name: string;
  public environmentName: Environment;
  public sourcePath: string;
  public hostedZoneDomainName: string;
  public certificateDomainName: string;
  public hostedZone: IHostedZone;
  public frontEndCertificate: DnsValidatedCertificate;
  public bucketName: string;
  public siteBucket: Bucket;
  public distribution: CloudFrontWebDistribution;
  public deployment: BucketDeployment;
  public aRecord: ARecord;
  public pipelineRole: Role;

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id);
    const { name, environmentName, sourcePath, hostedZoneDomainName, certificateDomainName } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.sourcePath = sourcePath;
    this.hostedZoneDomainName = hostedZoneDomainName;
    this.certificateDomainName = certificateDomainName;

    this.hostedZoneLookup();
    this.buildCertificate();
    this.buildBucket();
    this.buildCloudFrontDistribution();

    // Deploy the website if it exists
    const websiteAssetPath = `../${this.sourcePath}/build`;
    if (Website.checkWebsitePathExists(websiteAssetPath)) {
      this.bucketDeployment(websiteAssetPath);
    }

    this.buildARecord();
  }

  private hostedZoneLookup() {
    this.hostedZone = HostedZone.fromLookup(this, this.node.tryGetContext('domain'), {
      domainName: this.hostedZoneDomainName,
      privateZone: false,
    });
  }

  private buildCertificate() {
    const certificateName = `${this.name}-cert`;
    this.frontEndCertificate = new DnsValidatedCertificate(this, certificateName, {
      domainName: this.certificateDomainName,
      hostedZone: this.hostedZone,
      region: 'us-east-1',
    });
  }

  private buildBucket() {
    const stackName = `${this.name}-bucket`;
    this.bucketName = `${this.certificateDomainName.replace(/\./g, '-')}-assets`;
    this.siteBucket = new Bucket(this, stackName, {
      bucketName: this.bucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: {
        restrictPublicBuckets: false,
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
      },
    });

    this.exportValue({
      exportName: `${stackName}-arn`,
      value: this.siteBucket.bucketArn,
      description: `ARN for the ${this.bucketName} bucket`,
    });

    this.exportValue({
      exportName: `${stackName}-name`,
      value: this.siteBucket.bucketName,
      description: `Name for the ${this.bucketName} bucket`,
    });
  }

  private buildCloudFrontDistribution() {
    const distributionName = `${this.name}-distribution`;
    this.distribution = new CloudFrontWebDistribution(this, distributionName, {
      aliasConfiguration: {
        acmCertRef: this.frontEndCertificate.certificateArn,
        names: [this.certificateDomainName],
        sslMethod: SSLMethod.SNI,
        securityPolicy: SecurityPolicyProtocol.TLS_V1_1_2016,
      },
      errorConfigurations: [
        {
          errorCode: 404,
          errorCachingMinTtl: 300,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
        {
          errorCode: 403,
          errorCachingMinTtl: 300,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
      ],
      loggingConfig: {
        bucket: this.siteBucket,
        prefix: 'logs',
      },
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: this.siteBucket,
          },
          behaviors: [{ isDefaultBehavior: true }],
          originPath: '/live',
        },
      ],
    });

    this.exportValue({
      exportName: `${distributionName}-id`,
      value: this.distribution.distributionId,
      description: `Distribution ID for ${distributionName}`,
    });
  }

  private bucketDeployment(websiteAssetPath: string) {
    const deploymentName = `${this.name}-bucket-deployment`;
    const deployment = new BucketDeployment(this, deploymentName, {
      sources: [Source.asset(websiteAssetPath)],
      destinationBucket: this.siteBucket,
      destinationKeyPrefix: 'live',
      distribution: this.distribution,
      distributionPaths: ['/index.html'],
    });
  }

  private buildARecord() {
    this.aRecord = new ARecord(this, `${this.name}-a-record`, {
      recordName: this.certificateDomainName,
      zone: this.hostedZone,
      target: AddressRecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });
  }

  private exportValue(params: { exportName: string; value: string; description: string }) {
    const { exportName, value, description } = params;
    new CfnOutput(this, exportName, {
      value,
      description,
      exportName,
    });
  }

  private getPipelineRole() {
    if (this.pipelineRole) {
      return this.pipelineRole;
    }
    const roleName = `${this.name}-code-build-role`;
    this.pipelineRole = new Role(this, roleName, {
      roleName,
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });
    return this.pipelineRole;
  }

  public getBuildActions({
    buildInputArtifact,
    buildOutputArtifact,
  }: {
    buildInputArtifact: Artifact;
    buildOutputArtifact: Artifact;
  }) {
    const role = this.getPipelineRole();
    const buildProjectName = `${this.name}-build-project`;
    const buildProjectBuildSpec = buildWebsiteBuildSpec({
      name: this.name,
      sourcePath: this.sourcePath,
    });
    const buildProject = new PipelineProject(this, buildProjectName, {
      projectName: buildProjectName,
      role,
      buildSpec: BuildSpec.fromObject(buildProjectBuildSpec),
    });
    const buildActionName = `${this.name}-codebuild-build-action`;
    const buildAction = new CodeBuildAction({
      actionName: buildActionName,
      project: buildProject,
      input: buildInputArtifact,
      outputs: [buildOutputArtifact],
      runOrder: 2,
    });
    return [buildAction];
  }

  public getDeployActions({ deployInputArtifact }: { deployInputArtifact: Artifact; deployOutputArtifact?: Artifact }) {
    const role = this.getPipelineRole();
    const deployProjectName = `${this.name}-deploy-project`;
    const deployProjectBuildSpec = deployWebsiteBuildSpec({
      name: this.name,
      bucketName: this.bucketName,
      distributionId: this.distribution.distributionId,
    });
    const deployProject = new PipelineProject(this, deployProjectName, {
      projectName: deployProjectName,
      role,
      buildSpec: BuildSpec.fromObject(deployProjectBuildSpec),
    });

    const deployActionName = `${this.name}-${this.environmentName}-deploy-action`;
    const deployAction = new CodeBuildAction({
      actionName: deployActionName,
      project: deployProject,
      input: deployInputArtifact,
      runOrder: 3,
    });
    return [deployAction];
  }

  static checkWebsitePathExists(path: string) {
    try {
      return existsSync(path);
    } catch (e) {
      console.log('Website path does not exist, skipping initial deployment', path);
      return false;
    }
  }
}
