export class ImageGenerationService {
  /**
   * Generates or retrieves an image URL based on a description.
   * Uses a stable seeded image provider so generated URLs stay renderable.
   */
  static async generateImage(description: string): Promise<string> {
    try {
      const rawSeed = (description || 'professional training thumbnail')
        .split(' ')
        .filter(word => word.length > 3)
        .slice(0, 6)
        .join('-')
        .toLowerCase();
      const safeSeed = rawSeed.replace(/[^a-z0-9-]/g, '') || `training-${Date.now()}`;
      // picsum provides public, stable, direct image responses.
      const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(safeSeed)}/1200/800`;
      return imageUrl;
    } catch (error) {
      console.error('[ImageGenerationService] Error resolving image:', error);
      return 'https://picsum.photos/1200/800';
    }
  }
}
