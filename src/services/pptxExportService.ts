import PptxGenJS from 'pptxgenjs';
import { IPresentation, ISlide } from '../models/TrainingJourney';

// Color palette — HARX Brand identity (Rose/Purple/Slate)
const C = {
  PURPLE:     '6D28D9', // Primary brand purple
  ROSE:       'F43F5E', // Secondary brand rose
  DARK:       '111827', // Dark slate background
  SLATE:      '4B5563', // Muted slate for text
  WHITE:      'FFFFFF',
  GRADIENT_1: '8B5CF6', // Lighter purple for accents
  BORDER:     'E5E7EB',
};

const SLIDE_W = 10;
const SLIDE_H = 5.625;

function makeShadow() {
  return { type: 'outer' as const, color: '000000', opacity: 0.12, blur: 8, offset: 3, angle: 135 };
}

/**
 * Slide generator for Cover type
 */
/**
 * Unified Dynamic Slide Generator
 */
function addDynamicSlide(pres: PptxGenJS, slide: ISlide, cfg: { bg: string, accent: string, layout: string, isDark?: boolean, title?: string }) {
  const s = pres.addSlide();
  s.background = { color: cfg.bg };
  const textColor = cfg.isDark ? C.WHITE : C.DARK;

  if (cfg.layout === 'cover' || cfg.layout === 'module') {
    // Left Accent Bar
    s.addShape('rect' as any, { x: 0, y: 0, w: 0.2, h: SLIDE_H, fill: { color: cfg.accent } });
    
    // Title
    s.addText(slide.title || cfg.title || '', {
      x: 0.6, y: 1.5, w: 8.8, h: 2,
      fontFace: 'Helvetica', fontSize: 36, bold: true, color: C.WHITE, valign: 'middle'
    });
    
    // Subtitle
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 0.6, y: 3.5, w: 8.8, h: 0.5, fontFace: 'Helvetica', fontSize: 16, color: 'D1D5DB'
      });
    }
  } else if (cfg.layout === 'quote') {
    s.addText('"', { x: 0.5, y: 0.5, w: 2, h: 1.5, fontFace: 'Georgia', fontSize: 96, color: cfg.accent, bold: true });
    s.addText(slide.content || slide.title || '', {
      x: 1, y: 1.5, w: 8, h: 2.5, fontFace: 'Helvetica', fontSize: 24, italic: true, color: textColor, align: 'center', valign: 'middle'
    });
  } else if (cfg.layout === 'split') {
    // Left side (Accent)
    s.addShape('rect' as any, { x: 0, y: 0, w: 4, h: SLIDE_H, fill: { color: cfg.accent } });
    s.addText(slide.title || '', { x: 0.4, y: 0.5, w: 3.2, h: 1.5, fontFace: 'Helvetica', fontSize: 28, bold: true, color: C.WHITE });
    
    // Right side (Content)
    if (slide.bullets && slide.bullets.length > 0) {
      const bulletItems = slide.bullets.map((b: string) => ({ text: b, options: { bullet: true, fontSize: 13, color: textColor } }));
      s.addText(bulletItems, { x: 4.4, y: 1, w: 5.2, h: 4, fontFace: 'Helvetica' });
    }
  } else {
    // Standard / Minimal / Highlight
    s.addText(slide.title || '', {
      x: 0.5, y: 0.3, w: 9, h: 0.8, fontFace: 'Helvetica', fontSize: 24, bold: true, color: cfg.accent
    });
    s.addShape('rect' as any, { x: 0.5, y: 1.1, w: 9, h: 0.03, fill: { color: C.BORDER } });

    const contentY = 1.3;
    if (slide.bullets && slide.bullets.length > 0) {
      const bulletItems = slide.bullets.map((b: string) => ({ text: b, options: { bullet: true, fontSize: 13, color: textColor, paraSpaceAfter: 8 } }));
      s.addText(bulletItems, { x: 0.6, y: contentY, w: 8.8, h: 4, fontFace: 'Helvetica' });
    } else if (slide.content) {
      s.addText(slide.content, { x: 0.6, y: contentY, w: 8.8, h: 4, fontFace: 'Helvetica', fontSize: 14, color: textColor });
    }
  }

  // Footer
  s.addText('HARX Smart Orchestrator', { x: 0.5, y: SLIDE_H - 0.4, w: 9, h: 0.3, fontFace: 'Helvetica', fontSize: 9, color: cfg.isDark ? '9CA3AF' : '6B7280' });
}

/**
 * Core export function
 */
export const generatePPTX = async (presentation: IPresentation): Promise<Buffer> => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  pres.title = presentation.title || 'Formation';

  for (const slide of presentation.slides) {
    const vc = (slide as any).visualConfig || {};
    const theme = vc.theme === 'dark' ? C.DARK : C.WHITE;
    const accent = vc.accent === 'rose' ? C.ROSE : (vc.accent === 'purple' ? C.PURPLE : C.GRADIENT_1);
    const textColor = vc.theme === 'dark' ? C.WHITE : C.DARK;

    let slideObj: any;
    switch (slide.type) {
      case 'cover':
        addDynamicSlide(pres, slide, { bg: C.DARK, accent: C.ROSE, layout: 'cover', title: presentation.title });
        break;
      case 'module':
        addDynamicSlide(pres, slide, { bg: C.DARK, accent: C.PURPLE, layout: 'module' });
        break;
      case 'quote':
        addDynamicSlide(pres, slide, { bg: theme, accent: accent, layout: 'quote', isDark: vc.theme === 'dark' });
        break;
      default:
        addDynamicSlide(pres, slide, { bg: theme, accent: accent, layout: vc.layout || 'content', isDark: vc.theme === 'dark' });
        break;
    }
    
    // Notes
    if (slide.note) {
      // In PptxGenJS v3.x, addNotes is on the Slide object
      // We can get the last slide added from the internal array if needed,
      // but standard practice is to use the return value of addSlide.
      // However, our helper functions don't return the slide yet.
      // Let's modify them slightly or use the internal slides array.
      const slides = (pres as any).slides;
      if (slides && slides.length > 0) {
        slides[slides.length - 1].addNotes(slide.note);
      }
    }
  }

  const result = await pres.write({ outputType: 'nodebuffer' });
  return result as Buffer;
};
