### Build for development
FROM node:lts as development
ENV NODE_ENV=development
WORKDIR /usr/src/app
# Install development packages so we can build and test
COPY package*.json ./
RUN npm install
# Copy the files from the local environment
COPY . .
# Transpile TS to JS
RUN npm run build

# -----------------------------------------------------------------------

### Build for test
FROM node:lts as test
ARG NODE_ENV=test
ENV NODE_ENV=${NODE_ENV}
WORKDIR /usr/src/app
# Copy the installed and built files from the development stage
COPY --from=development /usr/src/app ./
RUN npm run test --passWithNoTests

# -----------------------------------------------------------------------

### Build for production
FROM node:lts as production
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . .
# Copy the build files from the development stage
COPY --from=development /usr/src/app/dist ./dist
CMD ["node", "dist/main"]
