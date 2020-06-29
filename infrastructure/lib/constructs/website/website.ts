import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { CloudFrontWebDistribution, SecurityPolicyProtocol, SSLMethod } from '@aws-cdk/aws-cloudfront';
import { AddressRecordTarget, ARecord, IHostedZone } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { Construct, RemovalPolicy, Tag } from '@aws-cdk/core';
import { Environment } from '../';
import { WebsitePipeline } from './website-pipeline';

export interface WebsiteProps {
  certificateDomainName: string;
  environmentName: Environment;
  hostedZone: IHostedZone;
  name: string;
  sourcePath: string;
}

export class Website extends WebsitePipeline {
  private aRecord: ARecord;
  private certificateDomainName: string;
  private frontEndCertificate: DnsValidatedCertificate;
  private hostedZone: IHostedZone;
  private siteBucket: Bucket;

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id, props);
    const { certificateDomainName, environmentName, hostedZone, name, sourcePath } = props;

    this.certificateDomainName = certificateDomainName;
    this.environmentName = environmentName;
    this.hostedZone = hostedZone;
    this.name = name;
    this.sourcePath = sourcePath;

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
    Tag.add(this, 'description', `CloudFront website for ${name} running in ${environmentName}`);
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
      blockPublicAccess: {
        restrictPublicBuckets: false,
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
      },
      bucketName: this.bucketName,
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
    });

    this.exportValue({
      description: `ARN for the ${this.bucketName} bucket`,
      exportName: `${stackName}-arn`,
      value: this.siteBucket.bucketArn,
    });

    this.exportValue({
      description: `Name for the ${this.bucketName} bucket`,
      exportName: `${stackName}-name`,
      value: this.siteBucket.bucketName,
    });
  }

  private buildCloudFrontDistribution() {
    const distributionName = `${this.name}-distribution`;
    this.distribution = new CloudFrontWebDistribution(this, distributionName, {
      aliasConfiguration: {
        acmCertRef: this.frontEndCertificate.certificateArn,
        names: [this.certificateDomainName],
        securityPolicy: SecurityPolicyProtocol.TLS_V1_1_2016,
        sslMethod: SSLMethod.SNI,
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
      description: `Distribution ID for ${distributionName}`,
      exportName: `${distributionName}-id`,
      value: this.distribution.distributionId,
    });
  }

  private bucketDeployment(websiteAssetPath: string) {
    const deploymentName = `${this.name}-bucket-deployment`;
    new BucketDeployment(this, deploymentName, {
      destinationBucket: this.siteBucket,
      destinationKeyPrefix: 'live',
      distribution: this.distribution,
      distributionPaths: ['/index.html'],
      sources: [Source.asset(websiteAssetPath)],
    });
  }

  private buildARecord() {
    this.aRecord = new ARecord(this, `${this.name}-a-record`, {
      recordName: this.certificateDomainName,
      target: AddressRecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      zone: this.hostedZone,
    });
  }
}
