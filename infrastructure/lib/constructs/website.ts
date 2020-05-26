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

export interface WebsiteProps {
  name: string;
  environmentName: Environment;
  sourcePath: string;
  hostedZoneDomainName: string;
  certificateDomainName: string;
  gitRepository: Repository;
}

export class Website extends Construct {
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
  public gitRepository: Repository;

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id);
    const { name, environmentName, sourcePath, hostedZoneDomainName, certificateDomainName, gitRepository } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.sourcePath = sourcePath;
    this.hostedZoneDomainName = hostedZoneDomainName;
    this.certificateDomainName = certificateDomainName;
    this.gitRepository = gitRepository;

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
    this.buildPipeline();
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

  private buildPipeline() {
    const roleName = `${this.name}-code-build-role`;
    const role = new Role(this, 'CodeBuildRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
      ],
    });

    const pipelineName = `${this.name}-pipeline`;
    const pipeline = new Pipeline(this, pipelineName, {
      pipelineName,
    });

    const sourceOutput = new Artifact();
    const sourceActionName = `${this.name}-codecommit-source-action`;
    const sourceAction = new CodeCommitSourceAction({
      actionName: sourceActionName,
      repository: this.gitRepository,
      output: sourceOutput,
      runOrder: 1,
    });
    const sourceStage = pipeline.addStage({
      stageName: `source-${this.environmentName}`,
      actions: [sourceAction],
    });

    const buildProjectName = `${this.name}-build-project`;
    const buildProject = new PipelineProject(this, buildProjectName, {
      projectName: buildProjectName,
      role,
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 10,
            },
            commands: [
              'echo Installing Dependencies',
              'echo Installing AWS CLI',
              'pip install awscli --upgrade --user',
              'echo check version',
              'aws --version',
              `cd ${this.sourcePath}`,
              'npm install',
              'echo Installation Complete',
            ],
          },
          pre_build: {
            commands: ['echo Running Tests', 'CI=true npm test'],
          },
          build: {
            commands: ['echo Build started on `date`', 'echo Building web app', 'CI=true npm run build'],
          },
        },
        artifacts: {
          files: ['build/**/*'],
          'base-directory': this.sourcePath,
        },
      }),
    });

    const buildOutput = new Artifact();
    const buildActionName = `${this.name}-codebuild-build-action`;
    const buildAction = new CodeBuildAction({
      actionName: buildActionName,
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
      runOrder: 2,
    });
    const buildStage = pipeline.addStage({
      stageName: `build-${this.environmentName}`,
      actions: [buildAction],
      placement: {
        justAfter: sourceStage,
      },
    });

    const deployProjectName = `${this.name}-deploy-project`;
    const deployProject = new PipelineProject(this, deployProjectName, {
      projectName: deployProjectName,
      role,
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 10,
            },
            commands: [
              'echo Installing Dependencies',
              'echo Installing AWS CLI',
              'pip install awscli --upgrade --user',
              'echo check version',
              'aws --version',
            ],
          },
          pre_build: {
            commands: [
              `aws s3 cp build s3://${this.bucketName}/versions/$CODEBUILD_RESOLVED_SOURCE_VERSION --recursive`,
            ],
          },
          build: {
            commands: [
              'echo BUILD COMPLETE running sync with s3',
              `aws s3 rm s3://${this.bucketName}/live --recursive`,
              `aws s3 cp build s3://${this.bucketName}/live --recursive --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers`,
            ],
          },
          post_build: {
            commands: [
              `aws cloudfront create-invalidation --distribution-id ${this.distribution.distributionId} --paths "/index.html"`,
            ],
          },
        },
      }),
    });

    const deployActionName = `${this.name}-${this.environmentName}-deploy-action`;
    const deployAction = new CodeBuildAction({
      actionName: deployActionName,
      project: deployProject,
      input: buildOutput,
      runOrder: 3,
    });
    const deployStage = pipeline.addStage({
      stageName: `deploy-${this.environmentName}`,
      actions: [deployAction],
      placement: {
        justAfter: buildStage,
      },
    });
  }

  // private buildCIPipeline() {
  //   const pipeline = new Pipeline(this, 'stack-pipeline', {
  //     pipelineName: 'stack-pipeline',
  //   });
  //   const sourceStage = pipeline.addStage({
  //     stageName: 'source',
  //   });
  //   const buildStage = pipeline.addStage({
  //     stageName: 'build',
  //     placement: {
  //       justAfter: sourceStage,
  //     },
  //   });

  //   /*
  //   each Pipelineable supplies its own build and deploy actions, and share the source action
  //   */

  //   const sourceOutput = new Artifact();
  //   const sourceAction = new CodeCommitSourceAction({
  //     actionName: 'CodeCommit',
  //     repository: this.gitRepository,
  //     output: sourceOutput,
  //   });

  //   sourceStage.addAction(sourceAction);

  //   const role = new Role(this, 'CodeBuildRole', {
  //     assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
  //     managedPolicies: [
  //       ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
  //       ManagedPolicy.fromAwsManagedPolicyName('CloudFrontFullAccess'),
  //     ],
  //   });

  //   const codeBuild = new Project(this, 'CodeBuildProject', {
  //     role,
  //     buildSpec: BuildSpec.fromObject({
  //       version: 0.2,
  //       phases: {
  //         install: {
  //           'runtime-versions': {
  //             nodejs: 10,
  //           },
  //           commands: [
  //             'echo installing dependencies',
  //             'echo installing aws cli',
  //             'pip install awscli --upgrade --user',
  //             'echo check version',
  //             'aws --version',
  //             `cd websites/${this.name}`,
  //             'npm install',
  //           ],
  //         },
  //         build: {
  //           commands: ['echo Build started on `date`', 'echo Building web app', `ls`, 'npm run build'],
  //           artifacts: {
  //             files: ['**/*'],
  //             'base-directory': `websites/${this.name}/build`,
  //             'discard-paths': 'yes',
  //           },
  //         },
  //         post_build: {
  //           commands: [
  //             'echo BUILD COMPLETE running sync with s3',
  //             `aws s3 rm s3://${this.bucketName}/live --recursive`,
  //             `aws s3 cp build s3://${this.bucketName}/live --recursive --grants read=uri=http://acs.amazonaws.com/groups/global/AllUsers`,
  //             `aws cloudfront create-invalidation --distribution-id ${this.distribution.distributionId} --paths "/index.html"`,
  //           ],
  //         },
  //       },
  //     }),
  //   });

  //   const buildAction = new CodeBuildAction({
  //     actionName: 'Build',
  //     input: sourceOutput,
  //     project: codeBuild,
  //   });

  //   buildStage.addAction(buildAction);
  // }

  static checkWebsitePathExists(path: string) {
    try {
      return existsSync(path);
    } catch (e) {
      console.log('Website path does not exist, skipping initial deployment', path);
      return false;
    }
  }
}
