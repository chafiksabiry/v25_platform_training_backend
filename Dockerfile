FROM openjdk:17-jdk-slim

WORKDIR /app

# Copy Maven wrapper and pom.xml
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .

# Download dependencies
RUN ./mvnw dependency:go-offline -B

# Copy source code
COPY src src

# Build application
RUN ./mvnw clean package -DskipTests

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8080

# Run application
CMD ["java", "-jar", "target/training-platform-api-1.0.0.jar"]