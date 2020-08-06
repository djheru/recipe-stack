# Designing Cloud-Based Applications with NestJS, React, GraphQL, and the AWS Cloud Development Kit

## Initial Setup

### Create Project Directory

```
mkdir nestjs-react-graphql-cdk && cdk $_
mkdir -p recipe-site/infrastructure recipe-site/services recipe-site/websites
```

### Set up VS Code workspace configuration

```
touch recipe-site.code-workspace
```

### Website Setup

```
cd ./recipe-site/websites
npx create-react-app recipe-web --use-npm
cd recipe-web && npm start
```

### API Setup

```
cd ../../services
npm i -g @nestjs/cli
nest new recipe-service # At the prompt, select npm
cd recipe-service
```

- Nestjs applications and create-react-app applications both use port 3000 to listen for requests
- If we attempt to run both the web development server (create-react-app) and the API server, we will get an error
- Update `recipe-service/src/main.ts` to use port 4000
  - Soon we will be reading this port from an environment variable, so this is just a temporary adjustment

```
npm start
```

- Using Postman, make a GET request to `http://localhost:4000`

## Initial Deployment

### Introduction to the AWS CDK (Cloud Development Kit)

#### AWS Credentials Setup

#### AWS CLI Setup

#### CDK CLI Setup

### VPC Infrastructure

### Website Infrastructure

### API Infrastructure

## API Development

### Local Environment Setup

### Server Authentication with Auth0

### Update Infrastructure

## Website Development

### Website Authentication with Auth0

### Authenticated Routes

### Role-Based Access Control

## GraphQL API Development

### Adding the GraphQL Endpoint for our Recipe service

### Adding Resolvers

### Adding Mutations

### Testing in the GraphQL Playground

## GraphQL Website Development

### Adding Apollo GraphQL Client

### Executing GraphQL Queries

### Executing GraphQL Mutations
