-- Restauro de versões de modelos: guarda de que versão a nova foi copiada. Aditiva.
ALTER TABLE "CertificateTemplateVersion" ADD COLUMN "restoredFromVersion" INTEGER;
