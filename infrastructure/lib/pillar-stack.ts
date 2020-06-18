import { Repository } from '@aws-cdk/aws-codecommit';
import { Secret } from '@aws-cdk/aws-ecs';
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { AssetBucket } from './constructs/assetBucket';
import { BastionHostInstance } from './constructs/bastionHostInstance';
import { DbClusterServerless } from './constructs/dbClusterServerless';
import { PipelineManager } from './constructs/pipelineManager';
import { Service } from './constructs/service';
import { PillarVpc } from './constructs/vpc';
import { Website } from './constructs/website';

export type Environment = 'demo' | 'dev' | 'prod' | 'prototype';

type Stage = {
  pipelineManager?: PipelineManager;
  pillarVpc?: PillarVpc;
  bastionHost?: BastionHostInstance;
  assetBucket?: AssetBucket;
  recipesDbCluster?: DbClusterServerless;
  website?: Website;
  service?: Service;
  adminWebsite?: Website;
};

export class PillarStack extends cdk.Stack {
  public id: string;
  public stages: { [key in Environment]?: Stage };
  public gitRepository: Repository;
  public hostedZoneDomainName: string;
  public hostedZone: IHostedZone;

  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.id = id;
    this.hostedZoneDomainName = 'di-metal.net';

    this.hostedZoneLookup();

    this.gitRepository = new Repository(this, `${id}-repository`, {
      repositoryName: id,
      description: `Git repository for ${id}`,
    });
  }

  private hostedZoneLookup() {
    this.hostedZone = HostedZone.fromLookup(this, this.node.tryGetContext('domain'), {
      domainName: this.hostedZoneDomainName,
      privateZone: false,
    });
  }

  public buildStage(environmentName: Environment) {
    const pipelineManagerName = `${environmentName}-pipeline-manager`;
    const pipelineManager = new PipelineManager(this, pipelineManagerName, {
      name: pipelineManagerName,
      environmentName,
      gitRepository: this.gitRepository,
    });

    const vpcName = `${environmentName}-vpc`;
    const pillarVpc = new PillarVpc(this, vpcName, {
      name: vpcName,
      environmentName: environmentName,
    });

    const bastionHostName = `${environmentName}-bastion-host`;
    const bastionHost = new BastionHostInstance(this, bastionHostName, {
      name: bastionHostName,
      environmentName: environmentName,
      vpc: pillarVpc.instance,
    });

    const assetBucketName = `${environmentName}-${this.id}-assets`;
    const assetBucket = new AssetBucket(this, assetBucketName, {
      name: assetBucketName,
      environmentName: environmentName,
    });

    const recipesDbClusterName = `${environmentName}-recipes-db`;
    const recipesDbCluster = new DbClusterServerless(this, recipesDbClusterName, {
      name: recipesDbClusterName,
      environmentName: environmentName,
      vpc: pillarVpc.instance,
      subnetIds: pillarVpc.isolatedSubnetIds,
      allowedConnections: [bastionHost.instance],
    });

    const certificateDomainName =
      environmentName === 'prod' ? 'web.di-metal.net' : `${environmentName}.web.di-metal.net`;
    const websiteName = `${environmentName}-recipe-website`;
    const website = new Website(this, websiteName, {
      name: websiteName,
      environmentName: environmentName,
      sourcePath: 'websites/recipe-web',
      hostedZone: this.hostedZone,
      certificateDomainName,
    });

    const serviceName = `${environmentName}-recipe-service`;
    const serviceSecrets = {
      RECIPES_DB_PASSWORD: Secret.fromSecretsManager(recipesDbCluster.dbPasswordSecret),
    };
    const serviceEnvironmentVariables = {
      NAME: 'recipe-service',
      ADDRESS: '0.0.0.0',
      PORT: '3000',
      RECIPES_DB_HOST: recipesDbCluster.instance.attrEndpointAddress,
      RECIPES_DB_PORT: recipesDbCluster.instance.attrEndpointPort,
      RECIPES_DB_USERNAME: recipesDbCluster.dbUsername,
      RECIPES_DB_NAME: recipesDbCluster.instance.databaseName,
      RECIPES_DB_SYNC: 'true',
    };
    const service = new Service(this, serviceName, {
      name: serviceName,
      domainName: 'di-metal.net',
      environmentName,
      secrets: serviceSecrets,
      environment: serviceEnvironmentVariables,
      hostedZone: this.hostedZone,
      sourcePath: 'services/recipe-service',
      routePath: '/recipes',
      vpc: pillarVpc.instance,
    });

    recipesDbCluster.allowConnection(service.fargateService.service);

    pipelineManager.registerConstructs([website, service]);

    const stage: Stage = {
      pipelineManager,
      pillarVpc,
      bastionHost,
      assetBucket,
      recipesDbCluster,
      website,
      service,
    };

    if (!this.stages) {
      this.stages = { [environmentName]: stage };
    } else {
      this.stages[environmentName] = stage;
    }
  }
}
