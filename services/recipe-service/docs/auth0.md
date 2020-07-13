# OAuth Authentication and OpenID Authorization with Oauth

- Signup - https://auth0.com/signup
- Create Auth Tenant (dev-urlastname) - https://auth0.com/docs/getting-started/create-tenant
  - Isolated environment for users and service configuration
- Create Auth0 API (Recipe API) - https://manage.auth0.com/ -> Applications -> APIs
  - Used by application to process authentication and authorization requests
- Register Auth0 Client Appliation (Recipe Web)
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
- `npm i -S passport @nestjs/passport passport-jwt jwks-rsa`

### Creating the Nest.js Authorization module

- `nest generate module auth`

### Implementing RBAC

- Create permissions for the Recipe API we created
- Create a role called `recipe-admin`
- Assign permissions from Recipe API to the `recipe-admin` role

#### Create Permissions (Scopes)

- Applications -> APIs -> Recipe API -> Permissions
- Add the permissions
  - `create:items`
  - `read:items`
  - `update:items`
  - `delete:items`
- Applications -> APIs -> Recipe API -> Settings
  - `Enable RBAC` - Yes
  - `Add Permissions in the Access Token` - Yes
- https://manage.auth0.com/#/roles
  - Create Role - "recipe-admin"
  - Description - "Create, update, and delete items"
  - Permissions -> Add Permissions -> Recipe API -> Select All

### Use Rules to Enhance Tokens

- Auth0 Rules are JS functions that execute when a User authenticates to the system.
- https://manage.auth0.com/#/rules
- Create Rule - Empty Rule -> "Add user roles to tokens"

```
function(user, context, callback) {
  const namespace = 'https://recipe-api.demo.com';

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
- (From user) -> Roles -> Assign Roles
  - Select Recipe API
  - Select the recipe-admin

## Permissions Decorator in Nest App

- nest generate decorator permissions --no-spec
- This will use the `SetMetadata` method to associate an array of strings representing permissions with a `permissions` key.
- The key-value pair will be attached to whatever method we decorate with `@Permissions`

## Permissions guard
