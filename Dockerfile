# Use Node.js LTS version as the base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy other necessary files like .env
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "run",  "start:prod"]
#CMD ["node", "dist/src/index.js"]
