import { Repository } from '@aws-cdk/aws-codecommit';
import { Website } from './constructs/website';
import * as cdk from '@aws-cdk/core';
import { PillarVpc } from './constructs/vpc';
import { BastionHostInstance } from './constructs/bastionHostInstance';
import { AssetBucket } from './constructs/assetBucket';
// import { DbCluster } from './constructs/dbCluster';
import { DbClusterServerless } from './constructs/dbClusterServerless';

export type Environment = 'demo' | 'dev' | 'prod' | 'prototype';

type Stage = {
  pillarVpc: PillarVpc;
  bastionHost: BastionHostInstance;
  assetBucket: AssetBucket;
  // usersDbCluster: DbCluster;
  usersDbCluster: DbClusterServerless;
  website: Website;
};

export class PillarStack extends cdk.Stack {
  public stages: { [key in Environment]?: Stage };
  public gitRepository: Repository;

  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.gitRepository = new Repository(this, 'stack-repo', {
      repositoryName: 'recipe-stack',
      description: 'Git repo for recipe-stack',
    });
  }
  public buildStage(environmentName: Environment) {
    const pillarVpc = new PillarVpc(this, 'vpc', {
      name: 'vpc',
      environmentName: environmentName,
    });

    const bastionHost = new BastionHostInstance(this, 'bastionHostInstance', {
      name: 'bastionHost',
      environmentName: environmentName,
      vpc: pillarVpc.instance,
    });

    const assetBucket = new AssetBucket(this, 'assetBucket', {
      name: 'assetBucket',
      environmentName: environmentName,
    });

    // const usersDbCluster = new DbCluster(this, 'usersDb', {
    //   name: 'users',
    //   environmentName: this.environmentName,
    //   vpc: pillarVpc.instance,
    //   allowedConnections: [bastionHost.instance],
    // });

    const usersDbCluster = new DbClusterServerless(this, 'usersDb', {
      name: 'users',
      environmentName: environmentName,
      vpc: pillarVpc.instance,
      subnetIds: pillarVpc.isolatedSubnetIds,
      allowedConnections: [bastionHost.instance],
    });

    const website = new Website(this, 'website', {
      name: 'recipe-web',
      environmentName: environmentName,
      hostedZoneDomainName: 'di-metal.net',
      certificateDomainName: 'web.di-metal.net',
      gitRepository: this.gitRepository,
    });

    const stage: Stage = {
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
