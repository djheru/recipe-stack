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

export interface PillarStackProps extends StackProps {
  environmentName: Environment;
  hostedZoneDomainName: string;
  name: string;
}

export class PillarStack extends Stack {
  public environmentName: Environment;
  public id: string;
  public name: string;
  public stackResources: Construct[];

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

    const { environmentName, hostedZoneDomainName, name } = props;

    this.environmentName = environmentName;
    this.id = id;
    this.name = name;
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
    this.buildRecipesWebsite();
    this.buildRecipesService();

    this.stackResources = [
      this.assetBucket,
      this.bastionHost,
      this.pillarVpc,
      this.pipelineManager,
      this.recipesDbCluster,
      this.recipeService,
      this.recipeWebsite,
    ];

    this.registerPipelineConstructs();
  }

  private hostedZoneLookup() {
    this.hostedZone = HostedZone.fromLookup(this, this.node.tryGetContext('domain'), {
      domainName: this.hostedZoneDomainName,
      privateZone: false,
    });
  }

  private buildGitRepo() {
    const repositoryId = `${this.id}-repository`;
    this.gitRepository = new Repository(this, repositoryId, {
      description: `Git repository for ${this.id}`,
      repositoryName: this.id,
    });
  }

  private buildPipelineManager() {
    const pipelineManagerId = `${this.id}-pipeline-manager`;
    this.pipelineManager = new PipelineManager(this, pipelineManagerId, {
      environmentName: this.environmentName,
      gitRepository: this.gitRepository,
      name: this.id,
    });
  }

  private buildVpc() {
    const vpcId = `${this.id}-vpc`;
    this.pillarVpc = new PillarVpc(this, vpcId, {
      environmentName: this.environmentName,
      name: vpcId,
    });
  }

  private buildBastionHost() {
    const bastionHostId = `${this.id}-bastion-host`;
    this.bastionHost = new BastionHostInstance(this, bastionHostId, {
      environmentName: this.environmentName,
      name: bastionHostId,
      vpc: this.pillarVpc.instance,
    });
  }

  private buildAssetBucket() {
    const assetBucketId = `${this.id}-assets`;
    this.assetBucket = new AssetBucket(this, assetBucketId, {
      environmentName: this.environmentName,
      name: assetBucketId,
    });
  }

  private buildDbCluster() {
    const recipesDbClusterId = `${this.id}-db-cluster`;
    this.recipesDbCluster = new DbClusterServerless(this, recipesDbClusterId, {
      allowedConnections: [this.bastionHost.instance],
      environmentName: this.environmentName,
      name: recipesDbClusterId,
      subnetIds: this.pillarVpc.isolatedSubnetIds,
      vpc: this.pillarVpc.instance,
    });
  }

  private buildRecipesWebsite() {
    const certificateDomainName =
      this.environmentName === 'prod'
        ? `${this.name}.${this.hostedZoneDomainName}`
        : `${this.environmentName}.${this.name}.${this.hostedZoneDomainName}`;
    const websiteId = `${this.id}-website`;
    this.recipeWebsite = new Website(this, websiteId, {
      environmentName: this.environmentName,
      certificateDomainName,
      hostedZone: this.hostedZone,
      name: websiteId,
      sourcePath: 'websites/recipe-web',
    });
  }

  private buildRecipesService() {
    const serviceId = `${this.id}-service`;
    const serviceSecrets = {
      RECIPES_DB_PASSWORD: Secret.fromSecretsManager(this.recipesDbCluster.dbPasswordSecret),
    };
    const serviceEnvironmentVariables = {
      ADDRESS: '0.0.0.0',
      NAME: this.id,
      PORT: '4000',
      RECIPES_DB_HOST: this.recipesDbCluster.instance.attrEndpointAddress,
      RECIPES_DB_NAME: this.recipesDbCluster.instance.databaseName,
      RECIPES_DB_PORT: this.recipesDbCluster.instance.attrEndpointPort,
      RECIPES_DB_SYNC: 'true',
      RECIPES_DB_USERNAME: this.recipesDbCluster.dbUsername,
    };
    this.recipeService = new Service(this, serviceId, {
      domainName: this.hostedZoneDomainName,
      environment: serviceEnvironmentVariables,
      environmentName: this.environmentName,
      hostedZone: this.hostedZone,
      name: this.id,
      routePath: `/${this.name}`,
      secrets: serviceSecrets,
      sourcePath: 'services/recipe-service',
      vpc: this.pillarVpc.instance,
    });
    this.recipesDbCluster.allowConnection(this.recipeService.fargateService.service);
  }

  private registerPipelineConstructs(): void {
    const pipelineableFilter = (construct: Construct) => !!(construct && 'pipelineable' in construct);
    const registeredConstructs = this.stackResources.filter(pipelineableFilter);
    this.pipelineManager.registerConstructs(<Pipelineable[]>(<unknown>registeredConstructs));
  }
}
