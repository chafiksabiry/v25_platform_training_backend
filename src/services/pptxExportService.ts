import PptxGenJS from 'pptxgenjs';
import { IPresentation, ISlide } from '../models/TrainingJourney';

// Color palette — warm ink/amber theme matching the app aesthetics
const C = {
  INK:        '0E0E0E',
  PAPER:      'F5F0E8',
  CREAM:      'EDE8DA',
  AMBER:      'C8860A',
  AMBER_LIGHT:'F0A832',
  SAGE:       '4A5C4E',
  RUST:       'B84C2A',
  MUTED:      '7A7060',
  BORDER:     'D5CFC0',
  WHITE:      'FFFFFF',
  DARK_BG:    '141209',
  DARK_MID:   '1E1A10',
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
  s.background = { color: C.DARK_BG };

  // Amber accent bar left
  s.addShape('rect' as any, {
    x: 0, y: 0, w: 0.18, h: SLIDE_H,
    fill: { color: C.AMBER }, line: { color: C.AMBER, width: 0 }
  });

  // Subtle geometric decoration top-right
  s.addShape('rect' as any, {
    x: 7.5, y: 0, w: 2.5, h: 2.2,
    fill: { color: C.DARK_MID }, line: { color: C.DARK_MID, width: 0 }
  });
  s.addShape('rect' as any, {
    x: 8.2, y: 0, w: 1.8, h: 2.2,
    fill: { color: C.AMBER, transparency: 88 }, line: { color: C.AMBER, width: 0, transparency: 88 }
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
      fontFace: 'Calibri', fontSize: 16, color: 'C8B890',
      align: 'left', valign: 'middle',
    });
  }

  // Bottom bar
  s.addShape('rect' as any, {
    x: 0, y: SLIDE_H - 0.55, w: SLIDE_W, h: 0.55,
    fill: { color: C.DARK_MID }, line: { color: C.DARK_MID, width: 0 }
  });
  s.addText('Généré par AI Training Platform', {
    x: 0.5, y: SLIDE_H - 0.5, w: 9, h: 0.4,
    fontFace: 'Calibri', fontSize: 11, color: C.MUTED, align: 'left',
  });
}

/**
 * Slide generator for Module divider
 */
function addModuleSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: C.DARK_BG };

  s.addShape('rect' as any, {
    x: 0, y: 0, w: SLIDE_W, h: 0.12,
    fill: { color: C.AMBER }, line: { color: C.AMBER, width: 0 }
  });
  
  s.addShape('rect' as any, {
    x: 7.5, y: 0.12, w: 2.5, h: SLIDE_H - 0.12,
    fill: { color: C.DARK_MID }, line: { color: C.DARK_MID, width: 0 }
  });

  s.addText(slide.icon || '📘', {
    x: 0.5, y: 0.7, w: 1.2, h: 1, fontSize: 36, align: 'left',
  });
  s.addText(slide.title || '', {
    x: 0.5, y: 1.7, w: 6.8, h: 1.5,
    fontFace: 'Georgia', fontSize: 36, bold: true,
    color: C.WHITE, align: 'left', valign: 'middle',
  });
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.5, y: 3.3, w: 6.8, h: 0.7,
      fontFace: 'Calibri', fontSize: 16, color: C.MUTED, align: 'left',
    });
  }
}

/**
 * Slide generator for standard Content
 */
function addContentSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: C.PAPER };

  s.addShape('rect' as any, {
    x: 0, y: 0, w: 0.07, h: SLIDE_H,
    fill: { color: C.AMBER }, line: { color: C.AMBER, width: 0 }
  });

  s.addText(slide.title || '', {
    x: 0.35, y: 0.25, w: 9.2, h: 0.75,
    fontFace: 'Georgia', fontSize: 26, bold: true,
    color: C.INK, align: 'left', valign: 'middle',
  });
  
  s.addShape('rect' as any, {
    x: 0.35, y: 0.98, w: 9.2, h: 0.025,
    fill: { color: C.BORDER }, line: { color: C.BORDER, width: 0 }
  });

  if (slide.bullets && slide.bullets.length > 0) {
    const bulletItems = slide.bullets.map((b: string) => ({
      text: b,
      options: { bullet: true, fontSize: 14, color: C.INK, paraSpaceAfter: 8 }
    }));
    s.addText(bulletItems, {
      x: 0.45, y: 1.1, w: 9, h: SLIDE_H - 1.5,
      fontFace: 'Calibri', valign: 'top',
    });
  } else if (slide.content) {
    s.addText(slide.content, {
      x: 0.45, y: 1.1, w: 9, h: SLIDE_H - 1.5,
      fontFace: 'Calibri', fontSize: 15, color: C.INK,
      align: 'left', valign: 'top', wrap: true,
    });
  }
}

/**
 * Slide generator for Exercise
 */
function addExerciseSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: 'F0F5F1' };

  s.addShape('rect' as any, {
    x: 0, y: 0, w: SLIDE_W, h: 1.05,
    fill: { color: C.SAGE }, line: { color: C.SAGE, width: 0 }
  });
  s.addText((slide.icon || '🛠') + '  ' + (slide.title || ''), {
    x: 0.4, y: 0, w: 9.2, h: 1.05,
    fontFace: 'Georgia', fontSize: 24, bold: true,
    color: C.WHITE, align: 'left', valign: 'middle',
  });

  if (slide.content) {
    s.addText(slide.content, {
      x: 0.5, y: 1.2, w: 9, h: 1.2,
      fontFace: 'Calibri', fontSize: 14, color: C.INK,
      align: 'left', valign: 'top', wrap: true,
    });
  }
}

/**
 * Slide generator for Quote
 */
function addQuoteSlide(pres: PptxGenJS, slide: ISlide) {
  const s = pres.addSlide();
  s.background = { color: C.INK };

  s.addText('"', {
    x: 0.5, y: 0.5, w: 2, h: 1.5,
    fontFace: 'Georgia', fontSize: 96, color: C.AMBER,
    align: 'left', valign: 'top', bold: true,
  });
  s.addText(slide.content || slide.title || '', {
    x: 0.9, y: 1.4, w: 8.2, h: 2.5,
    fontFace: 'Georgia', fontSize: 22, italic: true,
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
      case 'module':
        addModuleSlide(pres, slide);
        break;
      case 'exercise':
        addExerciseSlide(pres, slide);
        break;
      case 'quote':
        addQuoteSlide(pres, slide);
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
