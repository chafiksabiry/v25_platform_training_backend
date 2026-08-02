import axios from 'axios';
import { JSDOM } from 'jsdom';

class UrlContentExtractor {
  async extractContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TrainingPlatform/1.0)'
        }
      });

      const dom = new JSDOM(response.data);
      const document = dom.window.document;

      const title = document.querySelector('title')?.textContent || '';

      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map((p: Element) => p.textContent?.trim())
        .filter(text => text && text.length > 20)
        .join('\n\n');

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map((h: Element) => h.textContent?.trim())
        .filter(text => text)
        .join('\n');

      return `Title: ${title}\n\n${headings}\n\n${paragraphs}`;
    } catch (error) {
      console.error('URL content extraction error:', error);
      throw new Error('Failed to extract content from URL');
    }
  }

  async extractMultipleUrls(urls: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const url of urls) {
      try {
        const content = await this.extractContent(url);
        results.set(url, content);
      } catch (error) {
        results.set(url, `Error extracting content: ${error}`);
      }
    }

    return results;
  }
}

export default new UrlContentExtractor();
