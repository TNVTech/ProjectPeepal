# Use Node.js LTS version
FROM node:20-alpine

# Install MySQL client, curl for healthcheck, and SSL certificates
RUN apk add --no-cache mysql-client curl ca-certificates openssl

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source and wait-for-it script
COPY . .

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    TZ=UTC \
    WEBSITES_PORT=8080 \
    WEBSITES_CONTAINER_START_TIME_LIMIT=1800 \
    DB_SSL=true \
    DB_SSL_VERIFY=true \
    MYSQL_SSL_CA=/etc/ssl/certs/ca-certificates.crt

# Make wait-for-it.sh executable
RUN chmod +x wait-for-it.sh

# Expose port
EXPOSE 8080

# Health check for Azure Web App
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://projectpeepal-dev.azurewebsites.net:8080/ || exit 1

# Start the application with environment variables for database connection
CMD ["./wait-for-it.sh", "${DB_HOST}:${DB_PORT}", "-t", "60", "--", "node", "start"]
