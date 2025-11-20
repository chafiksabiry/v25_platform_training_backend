package com.trainingplatform.infrastructure.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.BeanProperty;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.ContextualSerializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.io.IOException;
import java.util.regex.Pattern;

/**
 * Configuration for MongoDB ObjectId serialization
 * Serializes ObjectIds (as strings) in Extended JSON format: {"$oid": "..."}
 * Only ID fields (ending with "Id" or "_id" or "id") that match MongoDB ObjectId format are serialized as $oid
 */
@Configuration
public class MongoConfig {

    private static final Pattern OBJECT_ID_PATTERN = Pattern.compile("^[0-9a-fA-F]{24}$");

    @Bean
    @Primary
    public ObjectMapper objectMapper(Jackson2ObjectMapperBuilder builder) {
        ObjectMapper mapper = builder.build();
        
        // Create a custom module for ObjectId string serialization
        SimpleModule module = new SimpleModule("ObjectIdStringModule");
        
        // Custom serializer for String fields that are MongoDB ObjectIds
        module.addSerializer(String.class, new ObjectIdStringSerializer());
        
        mapper.registerModule(module);
        return mapper;
    }
    
    /**
     * Custom serializer that serializes MongoDB ObjectId strings as Extended JSON format
     */
    private static class ObjectIdStringSerializer extends JsonSerializer<String> implements ContextualSerializer {
        
        private String fieldName;
        
        public ObjectIdStringSerializer() {
            this(null);
        }
        
        public ObjectIdStringSerializer(String fieldName) {
            this.fieldName = fieldName;
        }
        
        @Override
        public JsonSerializer<?> createContextual(SerializerProvider prov, BeanProperty property) {
            String name = property != null ? property.getName() : null;
            return new ObjectIdStringSerializer(name);
        }
        
        @Override
        public void serialize(String value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
            if (value == null) {
                gen.writeNull();
                return;
            }
            
            // Check if this is an ID field and matches ObjectId pattern
            boolean isIdField = fieldName != null && (
                fieldName.equals("_id") || 
                fieldName.equals("id") || 
                fieldName.endsWith("Id") ||
                fieldName.endsWith("Ids")
            );
            
            if (isIdField && OBJECT_ID_PATTERN.matcher(value).matches()) {
                // Serialize as Extended JSON format
                gen.writeStartObject();
                gen.writeFieldName("$oid");
                gen.writeString(value);
                gen.writeEndObject();
            } else {
                // Regular string serialization
                gen.writeString(value);
            }
        }
    }
}
