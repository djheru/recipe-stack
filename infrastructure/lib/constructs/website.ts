import { Bucket } from '@aws-cdk/aws-s3';
import { existsSync } from 'fs';
import * as path from 'path';
import { Construct, RemovalPolicy } from '@aws-cdk/core';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { CloudFrontWebDistribution, SSLMethod, SecurityPolicyProtocol } from '@aws-cdk/aws-cloudfront';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { HostedZone, ARecord, AddressRecordTarget } from '@aws-cdk/aws-route53';
import { Environment } from './../pillar-stack';

export interface WebsiteProps {
  name: string;
  environmentName: Environment;
  hostedZoneDomainName: string;
  certificateDomainName: string;
}

export class Website extends Construct {
  constructor(scope: Construct, id: string, props: WebsiteProps) {
    super(scope, id);
    const { name, environmentName, hostedZoneDomainName, certificateDomainName } = props;

    const hostedZone = HostedZone.fromLookup(this, this.node.tryGetContext('domain'), {
      domainName: hostedZoneDomainName,
      privateZone: false,
    });

    const certificateName = `${name}-${environmentName}-cert`;
    const frontEndCertificate = new DnsValidatedCertificate(this, certificateName, {
      domainName: certificateDomainName,
      hostedZone,
      region: 'us-east-1',
    });

    const stackName = `${name}-${environmentName}-bucket`;
    const bucketName = `${certificateDomainName.replace(/\./g, '-')}-assets`;
    const siteBucket = new Bucket(this, stackName, {
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

    const distributionName = `${name}-${environmentName}-distribution`;
    const distribution = new CloudFrontWebDistribution(this, distributionName, {
      aliasConfiguration: {
        acmCertRef: frontEndCertificate.certificateArn,
        names: [props.certificateDomainName],
        sslMethod: SSLMethod.SNI,
        securityPolicy: SecurityPolicyProtocol.TLS_V1_1_2016,
      },
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: siteBucket,
          },
          behaviors: [{ isDefaultBehavior: true }],
          originPath: '/live',
        },
      ],
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
    });

    const websiteAssetPath = `../websites/${name}/build`;
    if (Website.checkWebsitePathExists(websiteAssetPath)) {
      const deploymentName = `${name}-${environmentName}-bucket-deployment`;
      const deployment = new BucketDeployment(this, deploymentName, {
        sources: [Source.asset(websiteAssetPath)],
        destinationBucket: siteBucket,
        destinationKeyPrefix: 'live',
        distribution,
        distributionPaths: ['/index.html'],
      });
    }

    const aRecord = new ARecord(this, `${name}-${environmentName}-website-a-record`, {
      recordName: certificateDomainName,
      zone: hostedZone,
      target: AddressRecordTarget.fromAlias(new CloudFrontTarget(distribution)),
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
}
