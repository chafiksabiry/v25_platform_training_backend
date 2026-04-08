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
function addCoverSlide(pres: PptxGenJS, slide: ISlide, title?: string, subtitle?: string) {
  const s = pres.addSlide();
  s.background = { color: C.DARK };

  // Rose accent bar left
  s.addShape('rect' as any, {
    x: 0, y: 0, w: 0.18, h: SLIDE_H,
    fill: { color: C.ROSE }, line: { width: 0 }
  });

  // Subtle geometric decoration top-right (Purple glow)
  s.addShape('rect' as any, {
    x: 7.5, y: 0, w: 2.5, h: 2.2,
    fill: { color: C.PURPLE, transparency: 85 }, line: { width: 0 }
  });
  s.addShape('rect' as any, {
    x: 8.2, y: 0, w: 1.8, h: 2.2,
    fill: { color: C.ROSE, transparency: 90 }, line: { width: 0 }
  });

  // Icon
  if (slide.icon) {
    s.addText(slide.icon, {
      x: 0.5, y: 0.5, w: 1.2, h: 1,
      fontSize: 40, align: 'left', valign: 'top'
    });
  }

  // Title
  s.addText(slide.title || title || 'Présentation', {
    x: 0.5, y: 1.3, w: 8.5, h: 1.8,
    fontFace: 'Georgia', fontSize: 40, bold: true,
    color: C.WHITE, align: 'left', valign: 'middle',
  });

  // Subtitle
  const sub = (slide.subtitle || subtitle || '') as string;
  if (sub) {
    s.addText(sub, {
      x: 0.5, y: 3.15, w: 8, h: 0.6,
      fontFace: 'Helvetica', fontSize: 16, color: 'E5E7EB',
      align: 'left', valign: 'middle',
    });
  }

  // Bottom bar
  s.addShape('rect' as any, {
    x: 0, y: SLIDE_H - 0.55, w: SLIDE_W, h: 0.55,
    fill: { color: C.PURPLE, transparency: 80 }, line: { width: 0 }
  });
  s.addText('Généré par HARX Smart Orchestrator', {
    x: 0.5, y: SLIDE_H - 0.5, w: 9, h: 0.4,
    fontFace: 'Helvetica', fontSize: 10, color: C.WHITE, align: 'left',
  });
}

/**
 * Slide generator for Module divider
 */
function addModuleSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: C.DARK };

  s.addShape('rect' as any, {
    x: 0, y: 0, w: SLIDE_W, h: 0.12,
    fill: { color: C.PURPLE }, line: { width: 0 }
  });
  
  s.addShape('rect' as any, {
    x: 7.5, y: 0.12, w: 2.5, h: SLIDE_H - 0.12,
    fill: { color: C.ROSE, transparency: 90 }, line: { width: 0 }
  });

  s.addText(slide.icon || '📘', {
    x: 0.5, y: 0.7, w: 1.2, h: 1, fontSize: 36, align: 'left',
  });
  s.addText(slide.title || '', {
    x: 0.5, y: 1.7, w: 6.8, h: 1.5,
    fontFace: 'Helvetica', fontSize: 36, bold: true,
    color: C.WHITE, align: 'left', valign: 'middle',
  });
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.5, y: 3.3, w: 6.8, h: 0.7,
      fontFace: 'Helvetica', fontSize: 16, color: 'E5E7EB', align: 'left',
    });
  }
}

/**
 * Slide generator for standard Content
 */
function addContentSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: C.WHITE };

  s.addShape('rect' as any, {
    x: 0, y: 0, w: 0.07, h: SLIDE_H,
    fill: { color: C.PURPLE }, line: { width: 0 }
  });

  s.addText(slide.title || '', {
    x: 0.35, y: 0.25, w: 9.2, h: 0.75,
    fontFace: 'Helvetica', fontSize: 24, bold: true,
    color: C.DARK, align: 'left', valign: 'middle',
  });
  
  s.addShape('rect' as any, {
    x: 0.35, y: 0.98, w: 9.2, h: 0.025,
    fill: { color: C.BORDER }, line: { width: 0 }
  });

  if (slide.bullets && slide.bullets.length > 0) {
    const bulletItems = slide.bullets.map((b: string) => ({
      text: b,
      options: { bullet: { type: 'number' as const, color: C.PURPLE }, fontSize: 13, color: C.DARK, paraSpaceAfter: 10 }
    }));
    s.addText(bulletItems, {
      x: 0.5, y: 1.15, w: 9, h: SLIDE_H - 1.6,
      fontFace: 'Helvetica', valign: 'top',
    });
  } else if (slide.content) {
    s.addText(slide.content, {
      x: 0.5, y: 1.15, w: 9, h: SLIDE_H - 1.6,
      fontFace: 'Helvetica', fontSize: 13, color: C.DARK,
      align: 'left', valign: 'top', wrap: true,
    });
  }
}

/**
 * Slide generator for Exercise
 */
function addExerciseSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: 'F9FAFB' }; // Very light slate

  s.addShape('rect' as any, {
    x: 0, y: 0, w: SLIDE_W, h: 1.05,
    fill: { color: C.PURPLE }, line: { width: 0 }
  });
  s.addText((slide.icon || '🛠') + '  ' + (slide.title || ''), {
    x: 0.4, y: 0, w: 9.2, h: 1.05,
    fontFace: 'Helvetica', fontSize: 24, bold: true,
    color: C.WHITE, align: 'left', valign: 'middle',
  });

  if (slide.content) {
    s.addText(slide.content, {
      x: 0.5, y: 1.2, w: 9, h: 1.2,
      fontFace: 'Helvetica', fontSize: 14, color: C.DARK,
      align: 'left', valign: 'top', wrap: true,
    });
  }
}

/**
 * Slide generator for Quote
 */
function addQuoteSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: C.DARK };

  s.addText('"', {
    x: 0.5, y: 0.5, w: 2, h: 1.5,
    fontFace: 'Helvetica', fontSize: 96, color: C.ROSE,
    align: 'left', valign: 'top', bold: true,
  });
  s.addText(slide.content || slide.title || '', {
    x: 0.9, y: 1.4, w: 8.2, h: 2.5,
    fontFace: 'Helvetica', fontSize: 22, italic: true,
    color: C.WHITE, align: 'left', valign: 'middle', wrap: true,
  });
}

/**
 * Core export function
 */
export const generatePPTX = async (presentation: IPresentation): Promise<Buffer> => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  pres.title = presentation.title || 'Formation';

  for (const slide of presentation.slides) {
    let slideObj: any;
    switch (slide.type) {
      case 'cover':
        addCoverSlide(pres, slide, presentation.title);
        break;
      case 'agenda':
        addCoverSlide(pres, slide, presentation.title); // Same layout as cover or similar
        break;
      case 'module':
        addModuleSlide(pres, slide);
        break;
      case 'exercise':
        addExerciseSlide(pres, slide);
        break;
      case 'quote':
        addQuoteSlide(pres, slide);
        break;
      case 'conclusion':
        addCoverSlide(pres, slide, presentation.title); // Use cover layout for final slide
        break;
      default:
        addContentSlide(pres, slide);
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
