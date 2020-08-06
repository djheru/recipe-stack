# Install nestjs

`npm i -g @nestjs/cli`

# Create a project

`nestjs new nestjs-task-management`

# Generate a module

`nest g module tasks`

- Creates a file src/tasks/tasks.module.ts
- Imports it into the app module in src
- Uses `@Module()` decorator on the exported class

# Generate a controller

`nest g controller tasks --no-spec`

- Creates a file src/tasks/tasks.controller.ts
- Bound to a specific path
- Contains handlers that process endpoints and request methods
- Uses dependency injection to access other providers
- Uses the `@Controller()` decorator to define the path for that controller

### Defining a Handler

- Handlers are methods in the controller class
- They are decorated with `@Get(), @Post(), @Delete()`, etc decorators
- The handler processes the request that correlates to the decorator

# Providers

- Can be a plain value, a class, a sync/async factory, etc
- Can be injected into constructors if decorated with `@Injectable`
- Are provided to modules to make them work
  - In the `providers` key of the config
- Can be exported from a module

# Services

- A type of Provider
- Main source of business logic
  - Called from Controller for things like validation, db access, etc
- When wrapped with `@Injectable()` and provided to a module, they are created as singletons
- If you add a service as an argument to the constructor of a Controller class, it is injected as a class property
- When nestjs instantiates the Tasks Controller, it will automatically pass the service in because the service is registered as a provider on the module

# Generate Tasks Service

`nest g service tasks --no-spec`

- Helps with separation of concerns
  - Separates the business logic from the HTTP handlers
  - Injects a type, so you can swap services with keeping the same interface

# Define a Tasks model

- src/tasks/task.model.ts
- Class or interface defining the data objects
- It defines the properties on the objects you're passing around

# Creating a Task

- In the service
  - CRUD operations here
- In the controller
  - Call the service methods
  - Decorate the controller method params with `@Body('inputFieldNamee') inputParamName: string` arguments to automatically access the request body

# Creating a DTO

- Data Transfer
- Use classes not interfaces
- Encapsulate the shape of the object you're passing around to create/modify models
- Defines how data is sent over the network
- Useful for validation
- Not the same as models
- Should be for a purpose, like the fields you need for a create operation

# Nestjs Pipes

- Pipes operate the arguments passed to the route handler, before the handler is invoked
- Pipes can perform data transformation or data validation
- Pipes can return data - either the original or modified, which is then passed to the route handler
- Pipes can throw exceptions, which are handled by Nestjs and parsed into error responses
- Pipes can be async
- Comes with some default installed pipes
  - ValidationPipe - Validates an object against a class (e.g. DTOs). If it cannot be mapped, it fails
  - ParseIntPipe - Handles converting HTTP body strings into Numbers
- Custom pipes
  - Pipes are classes that implement the PipeTransform interface, which requires a `transform()` method
  - Pipes are annotated with the `@Injectable` decorator
  - `transform()` accepts two arguments
    - `value` - the value of the argument
    - `metadata` - optional, an object containing metadata about the argument
    - The return value of the `transform` method is passed to the handler
    - The exceptions are returned to the client as http errors
  - Pipes can be Parameter (i.e. Controller)- level pipes or Handler level
    - Parameter-level pipes are slimmer and cleaner
      - Often result in additional code added to handlers :-(
    - Handler-level pipes require more code, but are cleaner
      - Don't need extra code at the parameter level
      - Easier to maintain and extend
      - Responsibility of identifying arguments to process is moved into the central location of the pipe
      - Promotes usage of DTOs

## Creating a Validation Pipe

- `npm i -S class-validator class-transformer`
- Class validator provides a bunch of helpful decorators to enforce type
  - https://github.com/typestack/class-validator#validation-decorators
- Create new pipe file
  - `mkdir src/tasks/pipes && touch src/tasks/pipes/task-status-validator.pipe.ts`

# Data Persistence

## TypeORM

- https://typeorm.io
- `npm i -S typeorm @nestjs/typeorm pg`
- Create src/config/typeorm.config.ts for the db config
- Use the `TypeOrmModule` as an import in the app module, passing it the config in the `forRoot` method
- Register it in imports in the tasks module scope by calling `forFeature` and passing it the array of entities
- Inject it into a service with a constructor param argument
  - e.g. `constructor(@InjectRepository(TaskRepository) private taskRepository: TaskRepository){}`
  - then `async someMethod() {const foo = await this.taskRepository.find({foo: 'bar'}); return foo;}`

# Authentication

- `nest g module auth`
- `nest g controller auth --no-spec`
- `nest g service auth --no-spec`
- The auth module will use passport and a JWT strategy

## Passport

- `npm i -S @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs`
- create `src/auth/jwt.strategy.ts` to implement the validate method
  - `validate(payload: JwtPayload)` is called by passport after it automatically verifies that the token is valid
  - The method needs to hydrate the full user object from the token payload
  - The full user object is stored in the request
- Create a `GetUser` decorator
  - The decorator is used in any route handler (in the handler method arguments) where you want to pull the user out of the request object and inject it into a handler (to pass it to a service method)
- `@nestjs/passport` exposes a Guard, `AuthGuard` that you can pass to the `@UseGuards` decorator either on a controller class or method.
  - This will authenticate that route
- The Auth service needs to implement a `signIn` and `signUp` method
  - The signUp should delegate the logic for creating the user and hashing the password with a per-user hash to the repository for creating a new user
  - The signOut method should validate the credentials using the bcrypt logic in the repository and then, in the service, create an access token using the jwtService (from `@nest/jwt`) injected into the auth service constructor
- Import the Auth module into the App module
- Add the `PassportModule.register()` and `JwtModule.register()` to the `imports` of the auth module
- Add the `AuthService` and `JwtStrategy` to the `providers` array
- Export the `JwtStrategy` and `PassportModule` so they can be used by the other modules

### Using the Auth module in other modules

- Add the `AuthModule` to the Task module imports
- Now you can use `@UseGuards(AuthGuard())` and `@GetUser()` to protect the routes against unauthenticated users and obtain the user data

# Logging

- General purpose logs
- Warning - Unhandled issues, not fatal or destructive
- Error - Fatal or destructive
- Debug - Intended for devs
- Verbose - Intended for operators

- Nestjs ships with a logger in the `@nestjs/common` package
- Just add the logger as a property to your classes and call it.

# Configuration

- Defining values that are loaded at startup, not changed during runtime
- Configured per environment
- Defined in code or JSON,YML,etc
- Can also define in environment variables
- `npm i -S config`

# OAuth

- Signup - https://auth0.com/signup
- Create Auth Tenant - https://auth0.com/docs/getting-started/create-tenant
  - Isolated environment for users and service configuration
- Create Auth0 API - https://manage.auth0.com/ -> Applications -> APIs
  - Used by application to process authentication and authorization requests
- Register Auth0 Client Appliation
  - https://manage.auth0.com/ -> Applications -> Create Application -> SPA
- Connect client to API
  - Update "Auth0 Callbck URL" and "Allowed Logout URLs" to the Client application url they should hit after auth
    - e.g. (https://dashboard.whatabyte.now.sh/home)
  - Update the "Allowed Web Origins" field as well
    - e.g. (https://dashboard.whatabyte.now.sh)
  - Disable CORS

### Packages

- passport - authentication middleware
- @nestjs/passport - passport utility module for Nest
- passport-jwt - passport strategy authenticating with a JWT
- jwks-rsa - retrieves RSA signing keys from JWKS (JSON Web Key Set)

### Implementing RBAC

- Create permissions for the Menu API we created
- Create a role called `menu-admin`
- Assign permissions from Menu API to the `menu-admin` role

#### Create Permissions (Scopes)

- Applications -> APIs -> Menu API -> Permissions
- Add the permissions
  - `create:items`
  - `read:items`
  - `update:items`
  - `delete:items`

#### Enable Role-Based Access Control in the API

- Applications -> APIs -> Menu API -> Settings
  - `Enable RBAC` - Yes
  - `Add Permissions in the Access Token` - Yes

#### Create an Admin Role
- https://manage.auth0.com/#/roles
  - Create Role - "menu-admin"
  - Description - "Create, update, and delete items"
  - Permissions -> Add Permissions -> Menu API -> Select All

#### Use Rules to Enhance Tokens

- On login, Auth0 sends 2 tokens to the client
  - Access Token

    The access token is a credential that can be used by an application to access an API. The client passes this token when it calls an API. The token informs the API that the bearer of the token has the permissions encoded in the token.

  - ID Token

    JWT containing the User attributes. Typically used by the client to obtain user profile details

##### Auth0 Rules are JS functions that execute when a User authenticates to the system

- https://manage.auth0.com/#/rules
- Create Rule - Empty Rule -> "Add user roles to tokens"

```
function(user, context, callback) {
  const namespace = 'https://menu-api.demo.com';

  // If the user has roles, add those roles to the tokens
  if (context.authorization && context.authorization.roles) {
    const assignedRoles = context.authorization.roles;

    if (context.idToken) {
      const idTokenClaims = context.idToken;
      idTokenClaims[`${namespace}/roles`] = assignedRoles;
      context.idToken = idTokenClaims;
    }

    if (context.accessToken) {
      const accessTokenClaims = context.accessToken;
      accessTokenClaims[`${namespace}/roles`] = assignedRoles;
      context.accessToken = accessTokenClaims;
    }
  }

  callback(null, user, context);
}
```

After a user authenticates, this is executed, invoked with 3 arguments

- user - Returned by identity provider, e.g. Google or Auth0
- context - Context like user IP addr, application, etc
- callback - Allows you to pass in the modified tokens or an error
  - Must invoke callback or the script will timeout

### Create Admin User in Auth0

- User Management -> Users -> Create User
  - Email: `some@email.com`
  - Password: `yeahyouknow`
  - Connection: `Username-Password-Authentication`
  - -> `Create` -> Auto nav to User page
- (From user page) -> Roles Tab
  - -> `Assign Roles`
  - Select the `menu-admin` role from the dropdown -> `Assign`

### Implement RBAC in NestJS

- Attach custom metadata to a route handler using the `@Permissions()` decorator
- The custom metadata will specify the permissions needed to access that route
  - e.g `create:items`
- Supply the permission data to a custom guard, `PermissionsGuard`
- `PermissionsGuard` inspects the access token provided by the client and verifies that it has the required permissions.

#### Permissions Decorator in Nest App

- `nest generate decorator permissions --no-spec`
- This will use the `SetMetadata` method to associate an array of strings representing permissions with a `permissions` key.
- The key-value pair will be attached to whatever method we decorate with `@Permissions`

#### Permissions Guard

- `npx nest generate guard permissions --no-spec`

##### Flow Overview

1. JwtStrategy / Passport validates the client request
1. The Controller configured for the requested route begins handling the request
1. The Controller matches the request verb/route combo with a route handler
1. The Controller invokes the route Guards attached to the handler and invokes the handler if the Guard(s) return true or Promise<true>

- These steps need to share data. Nest shares data using the `ExecutionContext`
- The `PermissionsGuard` uses the NestJS built-in (injected) class `Reflector` to get the `permissions` metadata placed on the handler by the `@Permissions()` deocorator
  - These are the required permissions to access the route
- The `PermissionsGuard` then uses the ExecutionContext to get the user object and retrieve the user's permissions
- Finally, it compares the required permissions for the route to the permissions available on the user.
