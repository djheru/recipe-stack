const getS3VersionPath = (bucketName: string) => `${bucketName}/versions/${Date.now()}`;
const s3GrantsUri = 'http://acs.amazonaws.com/groups/global/AllUsers';

export const buildInfrastructureBuildSpec = ({ name, sourcePath }: { name: string; sourcePath: string }) => ({
  version: '0.2',
  phases: {
    install: {
      commands: [
        'echo Build started at `date`',
        `echo Beginning build operations for "${name}"`,
        'echo Building the AWS infrastructure stack...',
        `cd ${sourcePath}`,
        'npm install',
      ],
    },
    build: { commands: ['npm run build'] },
    post_build: {
      commands: [
        'echo Updating the CDK infrastructure stack...',
        'npm run cdk -- diff',
        'npm run deploy -- --require-approval never',
        'echo Build completed at `date`',
      ],
    },
  },
});

export const buildServiceBuildSpec = ({
  name,
  sourcePath,
  imageName,
}: {
  name: string;
  sourcePath: string;
  imageName: string;
}) => ({
  version: '0.2',
  phases: {
    pre_build: {
      commands: [
        'echo Build started at `date`',
        `echo Beginning build operations for "${name}"`,
        'echo Logging in to AWS ECR...',
        '$(aws ecr get-login --no-include-email --region us-west-2)',
      ],
    },
    build: {
      commands: [
        'echo Building the Docker image...',
        `cd ${sourcePath}`,
        'export BUILD_TAG=${CODEBUILD_RESOLVED_SOURCE_VERSION:0:8}',
        'echo BUILD_TAG: $BUILD_TAG',
        'echo Tagging the Docker image...',
        `docker build -t ${name} .`,
        `docker tag ${name}:latest ${imageName}:$BUILD_TAG`,
      ],
    },
    post_build: {
      commands: [
        'echo Pushing the Docker image...',
        `docker push ${imageName}:$BUILD_TAG`,
        `echo "Saving new imagedefinitions.json as a build artifact..."`,
        `printf '[{"name": "${name}", "imageUri": "${imageName}:%s"}]' $BUILD_TAG > imagedefinitions.json`,
        'cat imagedefinitions.json',
        'echo Build completed on `date`',
      ],
    },
  },
  artifacts: {
    files: ['imagedefinitions.json'],
    'base-directory': sourcePath,
    'discard-paths': true,
  },
});

export const buildWebsiteBuildSpec = ({ name, sourcePath }: { name: string; sourcePath: string }) => ({
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': {
        nodejs: 10,
      },
      commands: [
        'echo Build started at `date`',
        `echo Beginning build operations for "${name}"`,
        'echo Installing AWS CLI...',
        'pip install awscli --upgrade --user',
        'aws --version',
        `cd ${sourcePath}`,
        'echo Installing NPM Dependencies...',
        'npm install',
        'echo Installation Complete',
      ],
    },
    pre_build: {
      commands: ['echo Running tests...', 'CI=true npm test'],
    },
    build: {
      commands: ['echo building web app...', 'CI=true npm run build', 'echo Build completed on `date`'],
    },
  },
  artifacts: {
    files: ['build/**/*'],
    'base-directory': sourcePath,
  },
});

export const deployWebsiteBuildSpec = ({
  bucketName,
  distributionId,
  name,
}: {
  bucketName: string;
  distributionId: string;
  name: string;
}) => ({
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': {
        nodejs: 10,
      },
      commands: [
        'echo Build started at `date`',
        `echo Beginning deploy operations for "${name}"`,
        'echo Installing AWS CLI...',
        'pip install awscli --upgrade --user',
        'aws --version',
      ],
    },
    pre_build: {
      commands: [
        `echo Copying build files to ${getS3VersionPath(bucketName)}...`,
        `aws s3 cp build s3://${getS3VersionPath(bucketName)} --recursive`,
      ],
    },
    build: {
      commands: [
        'echo Copying build files to CloudFront origin folder...',
        `aws s3 rm s3://${bucketName}/live --recursive`,
        `aws s3 cp build s3://${bucketName}/live --recursive --grants read=uri=${s3GrantsUri}`,
      ],
    },
    post_build: {
      commands: [
        `echo Creating CloudFront invalidation to reset the cache...`,
        `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/index.html"`,
        'echo Build completed on `date`',
      ],
    },
  },
});
