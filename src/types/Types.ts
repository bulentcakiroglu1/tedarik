export interface DocumentInfo {
  documentNumber: string;
  creationDate: string;
  documentType: string;
}

export interface CertificateInfo {
  personFullname: string;
  citizenshipNo: string;
  validTo: string;
  pkcsLibrary: string;
  slot: string;
  data?: string;
  pin?: string;
  id?: string;
}

export interface SignerAppResetResult {
  error?: string;
  certificates: CertificateInfo[];
  signerAppStatus?: number;
  signerAppPlatform?: string;
  signerAppDllVersion?: number;
}

export interface SignerAppPingResult {
  error?: string;
  signerAppStatus?: number;
}

export interface GetSignerAppVersionsResult {
  signerAppWindowsVersion: number;
  signerAppMacVersion: number;
  signerAppLinuxVersion: number;
  signerAppFreebsdVersion: number;
  signerAppWindowsUrl: string;
  signerAppMacUrl: string;
  signerAppLinuxUrl: string;
  signerAppFreebsdUrl: string;
}

export interface SignStepTwoResult {
  error?: string;
  signedData: string;
}

export interface CreateStateOnOnaylarimApiRequest {
  certificate: string;
  signatureType: string;
  xmlSignatureType?: number;
}

export interface CreateStateOnOnaylarimApiResult {
  error?: string;
  keyID: string;
  keySecret: string;
  state: string;
  operationId: string;
}

export interface FinishSignResult {
  isSuccess: boolean;
}

export function HandleError(error: any): string {
  if (error.response) {
    return error.response.data?.message || error.response.statusText || 'Bir hata oluştu';
  }
  return error.message || 'Bir hata oluştu';
} 