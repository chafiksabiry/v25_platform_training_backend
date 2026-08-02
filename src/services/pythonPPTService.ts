import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IPresentation } from '../models/TrainingJourney';
import aiService from './aiService';

const execAsync = promisify(exec);

export class PythonPPTService {
  /**
   * Generates a PPTX file using the AI-to-Python method
   */
  static async generateWithPython(presentation: IPresentation): Promise<Buffer> {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp_pptx');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const uniqueId = uuidv4();
    const pythonScriptPath = path.join(tempDir, `${uniqueId}.py`);
    const outputPath = path.join(tempDir, `${uniqueId}.pptx`);

    try {
      // 1. Ask AI (Claude/OpenAI) to generate the Python script using python-pptx
      const pythonCode = await this.requestPythonCodeFromAI(presentation);
      
      // 2. Clean up the code (remove markdown fences if any)
      const cleanedCode = this.extractPythonCode(pythonCode);

      // 3. Ensure the script saves to the exact outputPath
      const scriptWithFixedPath = cleanedCode.replace(/['"]output\.pptx['"]/g, `r"${outputPath}"`);

      console.log(`[PythonPPTService] Writing script to ${pythonScriptPath}`);
      fs.writeFileSync(pythonScriptPath, scriptWithFixedPath);

      // 4. Execute the Python script
      console.log(`[PythonPPTService] Executing Python script...`);
      let pythonCmd = 'python3';
      try {
         await execAsync('python3 --version');
      } catch (e) {
         pythonCmd = 'python';
      }
      
      const { stdout, stderr } = await execAsync(`${pythonCmd} "${pythonScriptPath}"`);
      if (stdout) console.log('[PythonPPTService] Python stdout:', stdout);
      if (stderr) console.warn('[PythonPPTService] Python stderr:', stderr);

      // 5. Read the generated file
      if (!fs.existsSync(outputPath)) {
        throw new Error('Python script failed to generate PPTX file. Check Python environment and script output.');
      }

      const buffer = fs.readFileSync(outputPath);
      return buffer;

    } catch (error) {
      console.error('[PythonPPTService] error:', error);
      throw error;
    } finally {
      // Cleanup temp files (optional: keep for debugging if needed)
      try {
        if (fs.existsSync(pythonScriptPath)) fs.unlinkSync(pythonScriptPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.warn('[PythonPPTService] Cleanup error:', cleanupErr);
      }
    }
  }

  private static async requestPythonCodeFromAI(presentation: IPresentation): Promise<string> {
    const prompt = `
Generate a Python script using the 'python-pptx' library to create a professional training presentation.
Title: "${presentation.title}"

Slides data (JSON):
${JSON.stringify(presentation.slides, null, 2)}

Requirements:
1. USE 'python-pptx' library.
2. Design: Create a premium, modern design. Use different slide layouts for different content types.
3. Colors: Purple (HEX: 6D28D9), Rose (HEX: F43F5E), Dark (HEX: 111827). Use white text for dark backgrounds.
4. Content: Include all titles and main text/bullets from the JSON.
5. Speaker Notes: If a slide has a 'note' field, add it as speaker notes in PowerPoint.
6. EXPORT: The script MUST save the presentation to exactly 'output.pptx'.
7. CLEAN CODE: ONLY return the Python code, NO explanation, NO markdown blocks if possible (just raw code or code inside fences).
`;

    console.log('[PythonPPTService] Requesting Python code from AI...');
    // Use the backend's aiService directly
    const response = await aiService.generateWithClaude(prompt, "You are a Python Data Visualization and Graphic Design expert. You write perfect python-pptx code.");
    return response;
  }

  private static extractPythonCode(text: string): string {
    // Remove markdown markdown if present
    const match = text.match(/```python\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (match) return match[1];
    return text.trim();
  }
}
