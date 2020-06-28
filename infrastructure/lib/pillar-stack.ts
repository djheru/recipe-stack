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

type Stage = {
  pipelineManager?: PipelineManager;
  pillarVpc?: PillarVpc;
  bastionHost?: BastionHostInstance;
  assetBucket?: AssetBucket;
  recipesDbCluster?: DbClusterServerless;
  recipeWebsite?: Website;
  recipeService?: Service;
};

export interface PillarStackProps extends StackProps {
  environmentName: Environment;
  hostedZoneDomainName: string;
}

export class PillarStack extends Stack {
  public id: string;
  public stage: Stage;
  public environmentName: Environment;

  public gitRepository: Repository;
  public hostedZoneDomainName: string;
  public hostedZone: IHostedZone;

  public pipelineManager: PipelineManager;
  public pillarVpc: PillarVpc;
  public bastionHost: BastionHostInstance;
  public assetBucket: AssetBucket;
  public recipesDbCluster: DbClusterServerless;
  public recipeWebsite: Website;
  public recipeService: Service;

  constructor(scope: Construct, id: string, props: PillarStackProps) {
    super(scope, id, props);

    this.id = id;
    this.hostedZoneDomainName = props.hostedZoneDomainName;
    this.environmentName = props.environmentName;

    this.hostedZoneLookup();
    this.buildGitRepo(id);
    this.buildStage();
  }

  public buildStage() {
    this.buildPipelineManager();
    this.buildVpcs();
    this.buildBastionHosts();
    this.buildAssetBuckets();
    this.buildDbClusters();
    this.buildWebsites();
    this.buildServices();

    this.stage = {
      pipelineManager: this.pipelineManager,
      pillarVpc: this.pillarVpc,
      bastionHost: this.bastionHost,
      assetBucket: this.assetBucket,
      recipesDbCluster: this.recipesDbCluster,
      recipeWebsite: this.recipeWebsite,
      recipeService: this.recipeService,
    };

    this.registerPipelineConstructs();
  }

  private hostedZoneLookup() {
    this.hostedZone = HostedZone.fromLookup(this, this.node.tryGetContext('domain'), {
      domainName: this.hostedZoneDomainName,
      privateZone: false,
    });
  }

  private buildGitRepo(id: string) {
    this.gitRepository = new Repository(this, `${id}-repository`, {
      repositoryName: id,
      description: `Git repository for ${id}`,
    });
  }

  private buildPipelineManager() {
    const pipelineManagerName = `${this.environmentName}-pipeline-manager`;
    const pipelineManager = new PipelineManager(this, pipelineManagerName, {
      name: pipelineManagerName,
      environmentName: this.environmentName,
      gitRepository: this.gitRepository,
    });
    this.pipelineManager = pipelineManager;
  }

  private buildVpcs() {
    const vpcName = `${this.environmentName}-vpc`;
    const pillarVpc = new PillarVpc(this, vpcName, {
      name: vpcName,
      environmentName: this.environmentName,
    });
    this.pillarVpc = pillarVpc;
  }

  private buildBastionHosts() {
    const bastionHostName = `${this.environmentName}-bastion-host`;
    const bastionHost = new BastionHostInstance(this, bastionHostName, {
      name: bastionHostName,
      environmentName: this.environmentName,
      vpc: this.pillarVpc.instance,
    });
    this.bastionHost = bastionHost;
  }

  private buildAssetBuckets() {
    const assetBucketName = `${this.environmentName}-${this.id}-assets`;
    const assetBucket = new AssetBucket(this, assetBucketName, {
      name: assetBucketName,
      environmentName: this.environmentName,
    });
    this.assetBucket = assetBucket;
  }

  private buildDbClusters() {
    const recipesDbClusterName = `${this.environmentName}-recipes-db`;
    const recipesDbCluster = new DbClusterServerless(this, recipesDbClusterName, {
      name: recipesDbClusterName,
      environmentName: this.environmentName,
      vpc: this.pillarVpc.instance,
      subnetIds: this.pillarVpc.isolatedSubnetIds,
      allowedConnections: [this.bastionHost.instance],
    });
    this.recipesDbCluster = recipesDbCluster;
  }

  private buildWebsites() {
    const certificateDomainName =
      this.environmentName === 'prod' ? 'web.di-metal.net' : `${this.environmentName}.web.di-metal.net`;
    const websiteName = `${this.environmentName}-recipe-website`;
    const recipeWebsite = new Website(this, websiteName, {
      name: websiteName,
      environmentName: this.environmentName,
      sourcePath: 'websites/recipe-web',
      hostedZone: this.hostedZone,
      certificateDomainName,
    });
    this.recipeWebsite = recipeWebsite;
  }

  private buildServices() {
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
    const recipeService = new Service(this, serviceName, {
      name: serviceName,
      domainName: 'di-metal.net',
      environmentName: this.environmentName,
      secrets: serviceSecrets,
      environment: serviceEnvironmentVariables,
      hostedZone: this.hostedZone,
      sourcePath: 'services/recipe-service',
      routePath: '/recipes',
      vpc: this.pillarVpc.instance,
    });
    this.recipeService = recipeService;
    this.recipesDbCluster.allowConnection(recipeService.fargateService.service);
  }

  private registerPipelineConstructs(): void {
    const stackConstructs = Object.values(this.stage);
    // typeguard function
    function isPipelineable(construct: Construct) {
      return construct && 'pipelineable' in construct;
    }
    const registeredConstructs: Pipelineable[] = <Pipelineable[]>(
      stackConstructs.filter((construct: any) => isPipelineable(construct))
    );
    this.pipelineManager.registerConstructs(registeredConstructs);
  }
}
