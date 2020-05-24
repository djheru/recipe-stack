import { Bucket } from '@aws-cdk/aws-s3';
import { existsSync } from 'fs';
import * as path from 'path';
import { Construct, RemovalPolicy, CfnOutput } from '@aws-cdk/core';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { CloudFrontWebDistribution, SSLMethod, SecurityPolicyProtocol } from '@aws-cdk/aws-cloudfront';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { HostedZone, ARecord, AddressRecordTarget, IHostedZone } from '@aws-cdk/aws-route53';
import { Environment } from './../pillar-stack';

export interface WebsiteProps {
  name: string;
  environmentName: Environment;
  hostedZoneDomainName: string;
  certificateDomainName: string;
}

export class Website extends Construct {
  public name: string;
  public environmentName: Environment;
  public hostedZoneDomainName: string;
  public certificateDomainName: string;
  public hostedZone: IHostedZone;
  public frontEndCertificate: DnsValidatedCertificate;
  public siteBucket: Bucket;
  public distribution: CloudFrontWebDistribution;
  public deployment: BucketDeployment;
  public aRecord: ARecord;

  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id);
    const { name, environmentName, hostedZoneDomainName, certificateDomainName } = props;

    this.name = name;
    this.environmentName = environmentName;
    this.hostedZoneDomainName = hostedZoneDomainName;
    this.certificateDomainName = certificateDomainName;

    this.hostedZoneLookup();
    this.buildCertificate();
    this.buildBucket();
    this.buildCloudFrontDistribution();

    const websiteAssetPath = `../websites/${name}/build`;
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
    const certificateName = `${this.name}-${this.environmentName}-cert`;
    this.frontEndCertificate = new DnsValidatedCertificate(this, certificateName, {
      domainName: this.certificateDomainName,
      hostedZone: this.hostedZone,
      region: 'us-east-1',
    });
  }

  private buildBucket() {
    const stackName = `${this.name}-${this.environmentName}-bucket`;
    const bucketName = `${this.certificateDomainName.replace(/\./g, '-')}-assets`;
    this.siteBucket = new Bucket(this, stackName, {
      bucketName,
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
      description: `ARN for the ${bucketName} bucket`,
    });

    this.exportValue({
      exportName: `${stackName}-name`,
      value: this.siteBucket.bucketName,
      description: `Name for the ${bucketName} bucket`,
    });
  }

  private buildCloudFrontDistribution() {
    const distributionName = `${this.name}-${this.environmentName}-distribution`;
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
    const deploymentName = `${this.name}-${this.environmentName}-bucket-deployment`;
    const deployment = new BucketDeployment(this, deploymentName, {
      sources: [Source.asset(websiteAssetPath)],
      destinationBucket: this.siteBucket,
      destinationKeyPrefix: 'live',
      distribution: this.distribution,
      distributionPaths: ['/index.html'],
    });
  }

  private buildARecord() {
    this.aRecord = new ARecord(this, `${this.name}-${this.environmentName}-website-a-record`, {
      recordName: this.certificateDomainName,
      zone: this.hostedZone,
      target: AddressRecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });
  }

  static checkWebsitePathExists(path: string) {
    try {
      return existsSync(path);
    } catch (e) {
      console.log('Website path does not exist, skipping initial deployment', path);
      return false;
    }
  }

  private exportValue(params: { exportName: string; value: string; description: string }) {
    const { exportName, value, description } = params;
    new CfnOutput(this, exportName, {
      value,
      description,
      exportName,
    });
  }
}
