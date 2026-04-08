import axios from 'axios';

export class ImageGenerationService {
  /**
   * Generates or retrieves an image URL based on a description.
   * Currently uses Unsplash Source API as a "smart placeholder" service.
   * High-quality professional images based on keywords found in the description.
   */
  static async generateImage(description: string): Promise<string> {
    if (!description) {
      return 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200'; // Default tech/learning image
    }

    try {
      // Extract keywords from description (simplified for now)
      // We look for nouns or key concepts. 
      // Claude is already good at providing clean descriptions.
      const keywords = description
        .split(' ')
        .filter(word => word.length > 3)
        .slice(0, 3)
        .join(',');

      // Using Unsplash Source for high-quality contextual images
      // Format: https://source.unsplash.com/featured/?<keywords>
      // Note: Source Unsplash is being deprecated, but for now it's a great mock.
      // A better fallback is https://images.unsplash.com/photo-... if we had specific IDs.
      
      const imageUrl = `https://source.unsplash.com/featured/1200x800/?${encodeURIComponent(keywords)}`;
      
      // Verify the URL is responsive (optional, but good for robust "WOW" factor)
      // Since this is a redirect, we just return it.
      return imageUrl;
    } catch (error) {
      console.error('[ImageGenerationService] Error resolving image:', error);
      return 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1200'; // Fallback team/learning image
    }
  }
}
