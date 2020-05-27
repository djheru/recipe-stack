const getS3VersionPath = (bucketName: string) => `${bucketName}/versions/${Date.now()}`;
const s3GrantsUri = 'http://acs.amazonaws.com/groups/global/AllUsers';

export const buildWebsiteBuildSpec = ({ name, sourcePath }: { name: string; sourcePath: string }) => ({
  version: '0.2',
  phases: {
    install: {
      'runtime-versions': {
        nodejs: 10,
      },
      commands: [
        `echo Beginning Build Operations for "${name}"`,
        'echo Installing AWS CLI',
        'pip install awscli --upgrade --user',
        'echo check version',
        'aws --version',
        `cd ${sourcePath}`,
        'echo Installing NPM Dependencies',
        'npm install',
        'echo Installation Complete',
      ],
    },
    pre_build: {
      commands: ['echo Running Tests', 'CI=true npm test'],
    },
    build: {
      commands: ['echo Build Started on `date`', 'echo Building Web App', 'CI=true npm run build'],
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
        `echo Beginning Deploy Operations for "${name}"`,
        'echo Installing AWS CLI',
        'pip install awscli --upgrade --user',
        'echo check version',
        'aws --version',
      ],
    },
    pre_build: {
      commands: [
        `echo Copying Build Files to ${getS3VersionPath(bucketName)}`,
        `aws s3 cp build s3://${getS3VersionPath(bucketName)} --recursive`,
      ],
    },
    build: {
      commands: [
        'echo Copying Build Files to CloudFront Origin Folder',
        `aws s3 rm s3://${bucketName}/live --recursive`,
        `aws s3 cp build s3://${bucketName}/live --recursive --grants read=uri=${s3GrantsUri}`,
      ],
    },
    post_build: {
      commands: [
        `echo Creating CloudFront Invalidation to reset the cache`,
        `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/index.html"`,
      ],
    },
  },
});