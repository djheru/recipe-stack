import { PipelineManager } from './constructs/pipelineManager';
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
  pipelineManager?: PipelineManager;
  pillarVpc?: PillarVpc;
  bastionHost?: BastionHostInstance;
  assetBucket?: AssetBucket;
  // usersDbCluster?: DbCluster;
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

    const adminCertificateDomainName =
      environmentName === 'prod' ? 'admin.di-metal.net' : `${environmentName}.admin.di-metal.net`;
    const adminWebsiteName = `${environmentName}-recipe-admin`;
    const adminWebsite = new Website(this, adminWebsiteName, {
      name: adminWebsiteName,
      environmentName: environmentName,
      sourcePath: 'websites/recipe-admin',
      hostedZoneDomainName: 'di-metal.net',
      certificateDomainName: adminCertificateDomainName,
    });

    const pipelineManagerName = `${environmentName}-pipeline-manager`;
    const pipelineManager = new PipelineManager(this, pipelineManagerName, {
      name: pipelineManagerName,
      environmentName,
      gitRepository: this.gitRepository,
    });

    pipelineManager.registerConstructs([website, adminWebsite]);

    const stage: Stage = {
      pipelineManager,
      pillarVpc,
      bastionHost,
      assetBucket,
      usersDbCluster,
      website,
      adminWebsite,
    };

    if (!this.stages) {
      this.stages = { [environmentName]: stage };
    } else {
      this.stages[environmentName] = stage;
    }
  }
}
