import { Router } from 'express';
import * as certificationController from '../controllers/certificationController';

const router = Router();

// Liste des certificats d'un rep
router.get('/rep/:repId', certificationController.listCertificationsByRep);

// Vérification publique d'un certificat via son id (ex: CERT-1A2B3C4)
router.get('/verify/:certificateId', certificationController.verifyCertificate);

// Émission / récupération d'un certificat (persiste dans la collection `certifications`)
router.post('/issue/:repId/:journeyId', certificationController.issueCertification);

export default router;
