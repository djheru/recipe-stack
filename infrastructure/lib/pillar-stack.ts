import { Repository } from '@aws-cdk/aws-codecommit';
import { Secret } from '@aws-cdk/aws-ecs';
import { HostedZone, IHostedZone } from '@aws-cdk/aws-route53';
import { Construct, Stack, StackProps } from '@aws-cdk/core';
import {
  AssetBucket,
  BastionHostInstance,
  DbClusterServerless,
  Environment,
  PillarVpc,
  PipelineManager,
  Service,
  Website,
} from './constructs';
import { Pipelineable } from './constructs/pipeline-manager';

type StackResources = {
  assetBucket?: AssetBucket;
  bastionHost?: BastionHostInstance;
  pillarVpc?: PillarVpc;
  pipelineManager?: PipelineManager;
  recipesDbCluster?: DbClusterServerless;
  recipeService?: Service;
  recipeWebsite?: Website;
};

export interface PillarStackProps extends StackProps {
  environmentName: Environment;
  hostedZoneDomainName: string;
}

export class PillarStack extends Stack {
  public readonly domainName: string = 'di-metal.net';

  public id: string;
  public stackResources: StackResources;
  public environmentName: Environment;

  private gitRepository: Repository;
  private hostedZoneDomainName: string;
  private hostedZone: IHostedZone;

  private pipelineManager: PipelineManager;
  private pillarVpc: PillarVpc;
  private bastionHost: BastionHostInstance;
  private assetBucket: AssetBucket;
  private recipesDbCluster: DbClusterServerless;
  private recipeWebsite: Website;
  private recipeService: Service;

  constructor(scope: Construct, id: string, props: PillarStackProps) {
    super(scope, id, props);

    const { environmentName, hostedZoneDomainName } = props;

    this.id = id;
    this.hostedZoneDomainName = hostedZoneDomainName;
    this.environmentName = environmentName;

    this.buildStackResources();
  }

  private buildStackResources() {
    this.hostedZoneLookup();
    this.buildGitRepo();
    this.buildPipelineManager();
    this.buildVpc();
    this.buildBastionHost();
    this.buildAssetBucket();
    this.buildDbCluster();
    this.buildWebsite();
    this.buildService();

    this.stackResources = {
      assetBucket: this.assetBucket,
      bastionHost: this.bastionHost,
      pillarVpc: this.pillarVpc,
      pipelineManager: this.pipelineManager,
      recipesDbCluster: this.recipesDbCluster,
      recipeService: this.recipeService,
      recipeWebsite: this.recipeWebsite,
    };

    this.registerPipelineConstructs();
  }

  private hostedZoneLookup() {
    this.hostedZone = HostedZone.fromLookup(this, this.node.tryGetContext('domain'), {
      domainName: this.hostedZoneDomainName,
      privateZone: false,
    });
  }

  private buildGitRepo() {
    this.gitRepository = new Repository(this, `${this.id}-repository`, {
      repositoryName: this.id,
      description: `Git repository for ${this.id}`,
    });
  }

  private buildPipelineManager() {
    const pipelineManagerName = `${this.environmentName}-pipeline-manager`;
    this.pipelineManager = new PipelineManager(this, pipelineManagerName, {
      name: pipelineManagerName,
      environmentName: this.environmentName,
      gitRepository: this.gitRepository,
    });
  }

  private buildVpc() {
    const vpcName = `${this.environmentName}-vpc`;
    this.pillarVpc = new PillarVpc(this, vpcName, {
      name: vpcName,
      environmentName: this.environmentName,
    });
  }

  private buildBastionHost() {
    const bastionHostName = `${this.environmentName}-bastion-host`;
    this.bastionHost = new BastionHostInstance(this, bastionHostName, {
      name: bastionHostName,
      environmentName: this.environmentName,
      vpc: this.pillarVpc.instance,
    });
  }

  private buildAssetBucket() {
    const assetBucketName = `${this.environmentName}-${this.id}-assets`;
    this.assetBucket = new AssetBucket(this, assetBucketName, {
      name: assetBucketName,
      environmentName: this.environmentName,
    });
  }

  private buildDbCluster() {
    const recipesDbClusterName = `${this.environmentName}-recipes-db`;
    this.recipesDbCluster = new DbClusterServerless(this, recipesDbClusterName, {
      name: recipesDbClusterName,
      environmentName: this.environmentName,
      vpc: this.pillarVpc.instance,
      subnetIds: this.pillarVpc.isolatedSubnetIds,
      allowedConnections: [this.bastionHost.instance],
    });
  }

  private buildWebsite() {
    const certificateDomainName =
      this.environmentName === 'prod' ? `web.${this.domainName}` : `${this.environmentName}.web.${this.domainName}`;
    const websiteName = `${this.environmentName}-recipe-website`;
    this.recipeWebsite = new Website(this, websiteName, {
      name: websiteName,
      environmentName: this.environmentName,
      sourcePath: 'websites/recipe-web',
      hostedZone: this.hostedZone,
      certificateDomainName,
    });
  }

  private buildService() {
    const serviceName = `${this.environmentName}-recipe-service`;
    const serviceSecrets = {
      RECIPES_DB_PASSWORD: Secret.fromSecretsManager(this.recipesDbCluster.dbPasswordSecret),
    };
    const serviceEnvironmentVariables = {
      NAME: 'recipe-service',
      ADDRESS: '0.0.0.0',
      PORT: '3000',
      RECIPES_DB_HOST: this.recipesDbCluster.instance.attrEndpointAddress,
      RECIPES_DB_PORT: this.recipesDbCluster.instance.attrEndpointPort,
      RECIPES_DB_USERNAME: this.recipesDbCluster.dbUsername,
      RECIPES_DB_NAME: this.recipesDbCluster.instance.databaseName,
      RECIPES_DB_SYNC: 'true',
    };
    this.recipeService = new Service(this, serviceName, {
      name: serviceName,
      domainName: this.domainName,
      environmentName: this.environmentName,
      secrets: serviceSecrets,
      environment: serviceEnvironmentVariables,
      hostedZone: this.hostedZone,
      sourcePath: 'services/recipe-service',
      routePath: '/recipes',
      vpc: this.pillarVpc.instance,
    });
    this.recipesDbCluster.allowConnection(this.recipeService.fargateService.service);
  }

  private registerPipelineConstructs(): void {
    const stackConstructs = Object.values(this.stackResources);
    const registeredConstructs: Pipelineable[] = <Pipelineable[]>(
      stackConstructs.filter((construct: any) => !!(construct && 'pipelineable' in construct))
    );
    this.pipelineManager.registerConstructs(registeredConstructs);
  }
}
