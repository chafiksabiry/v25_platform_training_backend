import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import trainingJourneyService from '../services/trainingJourneyService';
import { asyncHandler } from '../middleware/errorHandler';

/** GET /api/certifications/rep/:repId — liste les certificats d'un rep. */
export const listCertificationsByRep = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.params.repId || '').trim();
  if (!repId) {
    res.status(400).json({ success: false, error: 'repId is required' });
    return;
  }
  const result = await trainingJourneyService.listCertificationsByRep(repId);
  res.status(200).json(result);
});

/** GET /api/certifications/verify/:certificateId — vérifie un certificat par son id public. */
export const verifyCertificate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const certificateId = String(req.params.certificateId || '').trim();
  if (!certificateId) {
    res.status(400).json({ success: false, error: 'certificateId is required' });
    return;
  }
  const result = await trainingJourneyService.getCertificationByPublicId(certificateId);
  res.status(200).json(result);
});

/**
 * POST /api/certifications/issue/:repId/:journeyId — émet (ou retourne) le certificat
 * et le persiste dans la collection `certifications`.
 */
export const issueCertification = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.params.repId || '').trim();
  const journeyId = String(req.params.journeyId || '').trim();
  if (!repId || !journeyId) {
    res.status(400).json({ success: false, error: 'repId and journeyId are required' });
    return;
  }
  const result = await trainingJourneyService.getCertification(repId, journeyId);
  res.status(200).json(result);
});
