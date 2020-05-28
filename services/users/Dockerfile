FROM node:lts as development

ENV NODE_ENV=development

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=development

COPY . .

EXPOSE 9229
EXPOSE 3030

RUN npm run build

# seperate build for production
FROM node:lts as production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY . .

COPY --from=development /usr/src/app/lib ./lib

CMD ["npm", "start"]
