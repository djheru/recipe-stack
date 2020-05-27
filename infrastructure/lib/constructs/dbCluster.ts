import {
  IConnectable,
  InstanceClass,
  InstanceProps,
  InstanceSize,
  InstanceType,
  Port,
  SubnetType,
  Vpc,
} from '@aws-cdk/aws-ec2';
import {
  BackupProps,
  DatabaseCluster,
  DatabaseClusterEngine,
  DatabaseSecret,
  IParameterGroup,
  Login,
  ParameterGroup,
} from '@aws-cdk/aws-rds';
import { CfnOutput, Construct, Duration, RemovalPolicy, Tag } from '@aws-cdk/core';
import { Environment } from './../pillar-stack';

export interface DbClusterProps {
  name: string;
  environmentName: Environment;
  vpc: Vpc;
  backup?: BackupProps;
  clusterIdentifier?: string;
  defaultDatabaseName?: string;
  engine?: DatabaseClusterEngine;
  engineVersion?: string;
  instanceIdentifierBase?: string;
  instanceProps?: InstanceProps;
  instances?: number;
  masterUser?: Login;
  parameterGroup?: IParameterGroup;
  port?: number;
  removalPolicy?: RemovalPolicy;
  storageEncrypted?: boolean;
  allowedConnections?: IConnectable[];
}

// const usersDbCluster = new DbCluster(this, 'usersDb', {
//   name: 'users',
//   environmentName: this.environmentName,
//   vpc: pillarVpc.instance,
//   allowedConnections: [bastionHost.instance],
// });

export class DbCluster extends Construct {
  public instance: DatabaseCluster;
  public dbSecret: DatabaseSecret;
  public secretArn: string;
  private connections: IConnectable[];
  private port: number;
  constructor(scope: Construct, id: string, props: DbClusterProps) {
    super(scope, id);
    const { name, environmentName, vpc, ...restProps } = props;
    const clusterName = `pillar-${name}-${environmentName}-db`.toLowerCase();
    const dbName = clusterName.replace(/-/g, '_');
    const clusterId = `${clusterName}-cluster`;
    const parameterGroup = ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10');
    const secretName = `${clusterName}-secret`;
    this.dbSecret = new DatabaseSecret(this, secretName, {
      username: `${dbName}_admin`,
    });
    this.secretArn = this.dbSecret.secretArn;
    this.exportValue({
      exportName: `${secretName}-arn`,
      value: this.secretArn,
      description: `DB Secret ARN for ${secretName}`,
    });

    const defaultProps = {
      allowedConnections: [],
      backup: { retention: Duration.days(31), preferredWindow: '1:00-2:00' },
      clusterIdentifier: clusterId,
      defaultDatabaseName: dbName,
      engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
      engineVersion: '10.11',
      instanceIdentifierBase: clusterName,
      instanceProps: {
        instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM),
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE,
        },
        vpc,
      },
      instances: 2,
      masterUser: {
        username: this.dbSecret.secretValueFromJson('username').toString(),
        password: this.dbSecret.secretValueFromJson('password'),
      },
      parameterGroup,
      port: 5432,
      removalPolicy: RemovalPolicy.RETAIN,
      storageEncrypted: true,
    };

    const params = { ...defaultProps, ...restProps };

    this.connections = params.allowedConnections;
    this.instance = new DatabaseCluster(this, clusterId, params);
    this.port = params.port;

    this.allowConnections();

    Tag.add(this, 'name', name);
    Tag.add(this, 'environmentName', environmentName);
    Tag.add(this, 'description', `Stack for ${name} running in the ${environmentName} environment`);
  }

  private exportValue(params: { exportName: string; value: string; description: string }) {
    const { exportName, value, description } = params;
    new CfnOutput(this, exportName, {
      value,
      description,
      exportName,
    });
  }

  private allowConnections() {
    this.connections.forEach((connection) => {
      this.instance.connections.allowFrom(connection, Port.tcp(this.port));
    });
  }
}
