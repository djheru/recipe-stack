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

  public environmentName: Environment;
  public id: string;
  public stackResources: StackResources;

  private assetBucket: AssetBucket;
  private bastionHost: BastionHostInstance;
  private gitRepository: Repository;
  private hostedZoneDomainName: string;
  private hostedZone: IHostedZone;
  private pillarVpc: PillarVpc;
  private pipelineManager: PipelineManager;
  private recipesDbCluster: DbClusterServerless;
  private recipeService: Service;
  private recipeWebsite: Website;

  constructor(scope: Construct, id: string, props: PillarStackProps) {
    super(scope, id, props);

    const { environmentName, hostedZoneDomainName } = props;

    this.environmentName = environmentName;
    this.id = id;
    this.hostedZoneDomainName = hostedZoneDomainName;

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
      description: `Git repository for ${this.id}`,
      repositoryName: this.id,
    });
  }

  private buildPipelineManager() {
    const pipelineManagerName = `${this.environmentName}-pipeline-manager`;
    this.pipelineManager = new PipelineManager(this, pipelineManagerName, {
      environmentName: this.environmentName,
      gitRepository: this.gitRepository,
      name: pipelineManagerName,
    });
  }

  private buildVpc() {
    const vpcName = `${this.environmentName}-vpc`;
    this.pillarVpc = new PillarVpc(this, vpcName, {
      environmentName: this.environmentName,
      name: vpcName,
    });
  }

  private buildBastionHost() {
    const bastionHostName = `${this.environmentName}-bastion-host`;
    this.bastionHost = new BastionHostInstance(this, bastionHostName, {
      environmentName: this.environmentName,
      name: bastionHostName,
      vpc: this.pillarVpc.instance,
    });
  }

  private buildAssetBucket() {
    const assetBucketName = `${this.environmentName}-${this.id}-assets`;
    this.assetBucket = new AssetBucket(this, assetBucketName, {
      environmentName: this.environmentName,
      name: assetBucketName,
    });
  }

  private buildDbCluster() {
    const recipesDbClusterName = `${this.environmentName}-recipes-db`;
    this.recipesDbCluster = new DbClusterServerless(this, recipesDbClusterName, {
      allowedConnections: [this.bastionHost.instance],
      environmentName: this.environmentName,
      name: recipesDbClusterName,
      subnetIds: this.pillarVpc.isolatedSubnetIds,
      vpc: this.pillarVpc.instance,
    });
  }

  private buildWebsite() {
    const certificateDomainName =
      this.environmentName === 'prod' ? `web.${this.domainName}` : `${this.environmentName}.web.${this.domainName}`;
    const websiteName = `${this.environmentName}-recipe-website`;
    this.recipeWebsite = new Website(this, websiteName, {
      environmentName: this.environmentName,
      certificateDomainName,
      hostedZone: this.hostedZone,
      name: websiteName,
      sourcePath: 'websites/recipe-web',
    });
  }

  private buildService() {
    const serviceName = `${this.environmentName}-recipe-service`;
    const serviceSecrets = {
      RECIPES_DB_PASSWORD: Secret.fromSecretsManager(this.recipesDbCluster.dbPasswordSecret),
    };
    const serviceEnvironmentVariables = {
      ADDRESS: '0.0.0.0',
      NAME: 'recipe-service',
      PORT: '3000',
      RECIPES_DB_HOST: this.recipesDbCluster.instance.attrEndpointAddress,
      RECIPES_DB_NAME: this.recipesDbCluster.instance.databaseName,
      RECIPES_DB_PORT: this.recipesDbCluster.instance.attrEndpointPort,
      RECIPES_DB_SYNC: 'true',
      RECIPES_DB_USERNAME: this.recipesDbCluster.dbUsername,
    };
    this.recipeService = new Service(this, serviceName, {
      domainName: this.domainName,
      environment: serviceEnvironmentVariables,
      environmentName: this.environmentName,
      hostedZone: this.hostedZone,
      name: serviceName,
      routePath: '/recipes',
      secrets: serviceSecrets,
      sourcePath: 'services/recipe-service',
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
