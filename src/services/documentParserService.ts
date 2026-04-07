import fs from 'fs';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

class DocumentParserService {
  async parsePDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  async parseWord(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error('Word document parsing error:', error);
      throw new Error('Failed to parse Word document');
    }
  }

  async parseDocument(filePath: string, fileType: string): Promise<string> {
    const extension = fileType.toLowerCase();

    if (extension === 'pdf' || extension === 'application/pdf') {
      return this.parsePDF(filePath);
    }

    if (extension === 'docx' || extension === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return this.parseWord(filePath);
    }

    if (extension === 'doc' || extension === 'application/msword') {
      return this.parseWord(filePath);
    }

    throw new Error('Unsupported file type');
  }
}

export default new DocumentParserService();
