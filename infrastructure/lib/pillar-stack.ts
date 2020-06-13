import { Repository } from '@aws-cdk/aws-codecommit';
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
  usersDbCluster?: DbClusterServerless;
  website?: Website;
  adminWebsite?: Website;
};

export class PillarStack extends cdk.Stack {
  public id: string;
  public stages: { [key in Environment]?: Stage };
  public gitRepository: Repository;

  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.id = id;

    this.gitRepository = new Repository(this, `${id}-repository`, {
      repositoryName: id,
      description: `Git repository for ${id}`,
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

    const usersDbClusterName = `${environmentName}-users-db`;
    const usersDbCluster = new DbClusterServerless(this, usersDbClusterName, {
      name: usersDbClusterName,
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
      hostedZoneDomainName: 'di-metal.net',
      certificateDomainName,
    });

    const serviceName = `${environmentName}-recipe-service`;
    const service = new Service(this, serviceName, {
      name: serviceName,
      environmentName,
      sourcePath: 'services/recipe-service',
      vpc: pillarVpc.instance,
    });

    pipelineManager.registerConstructs([website]);

    const stage: Stage = {
      pipelineManager,
      pillarVpc,
      bastionHost,
      assetBucket,
      usersDbCluster,
      website,
    };

    if (!this.stages) {
      this.stages = { [environmentName]: stage };
    } else {
      this.stages[environmentName] = stage;
    }
  }
}
