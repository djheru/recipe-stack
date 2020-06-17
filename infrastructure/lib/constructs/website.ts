import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { CloudFrontWebDistribution, SecurityPolicyProtocol, SSLMethod } from '@aws-cdk/aws-cloudfront';
import { AddressRecordTarget, ARecord, IHostedZone } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { Construct, RemovalPolicy, Tag } from '@aws-cdk/core';
import { Environment } from '../pillar-stack';
import { WebsitePipeline } from './websitePipeline';

export interface WebsiteProps {
  name: string;
  environmentName: Environment;
  sourcePath: string;
  hostedZone: IHostedZone;
  certificateDomainName: string;
}

export class Website extends WebsitePipeline {
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

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id, props);
    const { name, environmentName, sourcePath, hostedZone, certificateDomainName } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.sourcePath = sourcePath;
    this.hostedZone = hostedZone;
    this.certificateDomainName = certificateDomainName;

    this.buildCertificate();
    this.buildBucket();
    this.buildCloudFrontDistribution();

    // Deploy the website if it exists
    const websiteAssetPath = `../${this.sourcePath}/build`;
    if (Website.checkWebsitePathExists(websiteAssetPath)) {
      this.bucketDeployment(websiteAssetPath);
    }

    this.buildARecord();

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Stack for ${name} running in the ${environmentName} environment`);
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
}
