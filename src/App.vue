<script lang="ts">
import * as pdfjsLib from 'pdfjs-dist';
import axios from 'axios';
import { type CertificateInfo, type SignerAppResetResult, type SignerAppPingResult, type GetSignerAppVersionsResult, type SignStepTwoResult, type CreateStateOnOnaylarimApiResult, type FinishSignResult, HandleError, type DocumentInfo, type CreateStateOnOnaylarimApiRequest } from './types/Types';
import store from "@/types/Store";
import { defineComponent } from 'vue';

// PDF worker yapılandırması
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.12.313/build/pdf.worker.min.js';

export default defineComponent({
  name: 'App',
  data() {
    return {
      documentInfo: {
        documentNumber: '000015231',
        creationDate: '20.03.2024',
        documentType: 'Satın Alma Sözleşmesi'
      } as DocumentInfo,
      certificateInfo: null as CertificateInfo | null,
      currentPage: 1,
      totalPages: 0,
      scale: 1.5,
      certificates: [] as CertificateInfo[],
      showPinDialog: false,
      selectedCertificate: null as CertificateInfo | null,
      pin: '',
      workingUrl: '',
      loading: false,
      error: null as string | null,
      waitString: '',
      operationId: '',
      selectedFile: null as File | null,
      selectedSignatureType: { id: 'pades', title: 'Pades' },
      useEnvelopingSignature: false,
      upgradeToLtv: false,
      logs: [] as string[],
      pdfDocument: null as any,
      localSignerMode: '',
      getSignerAppVersionsResult: {} as GetSignerAppVersionsResult,
      signerAppResetResult: null as SignerAppResetResult | null,
      signatureTypes: [
        { id: 'pades', title: 'Pades' },
        { id: 'cades', title: 'Cades' },
        { id: 'xades', title: 'Xades' }
      ],
      showSuccessPopup: false,
    }
  },
  mounted() {
    this.pdfDocument = null;
    this.loadPDF();
    this.logs = [];
    this.GetSignerAppVersions();
  },
  methods: {
    async loadPDF(): Promise<void> {
  try {
    const loadingTask = pdfjsLib.getDocument('/sample.pdf');
    const pdf = await loadingTask.promise;

    this.pdfDocument = pdf;
    this.totalPages = pdf.numPages;

    const page = await pdf.getPage(1); // İlk sayfa
    const viewport = page.getViewport({ scale: this.scale });

    const canvas = this.$refs.pdfCanvas as HTMLCanvasElement;
    if (!canvas) {
      console.error('Canvas bulunamadı.');
      return;
    }
    const context = canvas.getContext('2d');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context!,
      viewport
    }).promise;
  } catch (error) {
    console.error('PDF yüklenirken hata oluştu:', error);
  }
},

    async renderPage(pageNumber: number): Promise<void> {
      try {
        const page = await this.pdfDocument.getPage(pageNumber);
        const canvas = this.$refs.pdfCanvas as HTMLCanvasElement;
        const context = canvas.getContext('2d');
        
        const viewport = page.getViewport({ scale: this.scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;
      } catch (error) {
        console.error('Sayfa render edilirken hata oluştu:', error);
      }
    },

    zoomIn() {
      this.scale += 0.25;
      this.renderPage(this.currentPage);
    },

    zoomOut() {
      if (this.scale > 0.5) {
        this.scale -= 0.25;
        this.renderPage(this.currentPage);
      }
    },

    async getCertificates(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const isConnected = await this.tryToConnect();
        if (!isConnected) {
          this.error = 'E-imza aracına bağlanılamadı';
          return;
        }
        await this.resetSigner();
      } catch (error) {
        this.error = HandleError(error);
      } finally {
        this.loading = false;
      }
    },

    async tryToConnect(): Promise<boolean> {
      try {
        const httpsResult = await this.pingSignerApp(true, false);
        if (httpsResult) {
          this.workingUrl = 'https://localsigner.onaylarim.com:8099';
          return true;
        }

        const httpResult = await this.pingSignerApp(false, false);
        if (httpResult) {
          this.workingUrl = 'http://localsigner.onaylarim.com:8099';
          return true;
        }

        const localhostResult = await this.pingSignerApp(false, true);
        if (localhostResult) {
          this.workingUrl = 'http://localhost:8099';
          return true;
        }

        return false;
      } catch {
        return false;
      }
    },

    async pingSignerApp(useHttps: boolean, useLocalhost: boolean): Promise<boolean> {
      const url = `${useHttps ? 'https' : 'http'}://${useLocalhost ? 'localhost' : 'localsigner.onaylarim.com'}:8099/ping`;
      try {
        const response = await axios.get(url, { timeout: 500 });
        return !response.data.error;
      } catch {
        return false;
      }
    },

    async resetSigner(): Promise<void> {
      try {
        const response = await axios.get(`${this.workingUrl}/reset`);
        const result = response.data as SignerAppResetResult;
        if (result.error) {
          this.error = result.error;
          return;
        }
        this.certificates = result.certificates;
        if (this.certificates.length > 0) {
          this.selectedCertificate = this.certificates[0];
          this.showPinDialog = true;
        }
      } catch (error) {
        this.error = HandleError(error);
      }
    },

    selectCertificate(certificate: CertificateInfo): void {
      this.selectedCertificate = certificate;
      this.showPinDialog = true;
    },

    async signDocument(): Promise<void> {
      if (!this.selectedCertificate) {
        await this.getCertificates();
        return;
      }
      
      if (!this.pin) {
        this.error = 'Lütfen PIN giriniz';
        return;
      }

      this.loading = true;
      this.error = null;
      this.waitString = 'İmza işlemi hazırlanıyor...';

      try {
        this.operationId = "";
        
        const createStateOnOnaylarimApiRequest: CreateStateOnOnaylarimApiRequest = {
           certificate: this.selectedCertificate!.data!, // non-null assertion (!)
          signatureType: this.selectedSignatureType.id
          };


        if(this.useEnvelopingSignature === true){
          createStateOnOnaylarimApiRequest.xmlSignatureType = 2;
        }

        this.waitString = "İmza işlemi hazırlanıyor.";
        this.logs.push("Sizin sunucu katmanına CreateStateOnOnaylarimApi isteği gönderiliyor.");
        
        const createStateResponse = await axios.post(
          store.API_URL + "/Onaylarim/CreateStateOnOnaylarimApi", 
          createStateOnOnaylarimApiRequest,
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        this.logs.push("Sizin sunucu katmanına CreateStateOnOnaylarimApi isteği gönderildi. Detaylar için console'a bakınız.");
        console.log("Sizin sunucu katmanına CreateStateOnOnaylarimApi isteği gönderildi.", createStateResponse);

        this.waitString = "İmza işlemi başladı.";
        const createStateResult = createStateResponse.data as CreateStateOnOnaylarimApiResult;
        console.log("createStateOnOnaylarimApiResult", createStateResult);

        if (createStateResult.error !== undefined && createStateResult.error !== null && createStateResult.error.length > 0) {
          this.logs.push("Sizin sunucu katmanına CreateStateOnOnaylarimApi isteği hata döndü. Hata: " + createStateResult.error);
          return;
        }

        const signStepTwoRequest = {
          keyId: createStateResult.keyID,
          keySecret: createStateResult.keySecret,
          state: createStateResult.state,
          pkcsLibrary: this.selectedCertificate.pkcsLibrary,
          slot: this.selectedCertificate.slot,
          pin: this.pin,
        };

        this.logs.push("e-İmza aracına SIGNSTEPTWO isteği gönderiliyor.");
        const signStepTwoResponse = await axios.post(
          this.workingUrl + "/signStepTwo", 
          JSON.stringify(signStepTwoRequest),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        const signStepTwoResult = signStepTwoResponse.data as SignStepTwoResult;
        if (signStepTwoResult.error !== undefined && signStepTwoResult.error !== null) {
          if (signStepTwoResult.error.search("INCORRECT_PIN") >= 0) {
            this.logs.push("e-İmza aracına SIGNSTEPTWO isteği hata döndü. Detaylar için console'a bakınız.");
            console.log("e-İmza aracına SIGNSTEPTWO isteği sonucu.", signStepTwoResult);
            this.waitString = "Hata oluştu. " + "e-İmza şifreniz yanlış.";
          } else if (signStepTwoResult.error.search("PIN_BLOCKED") >= 0) {
            this.logs.push("e-İmza aracına SIGNSTEPTWO isteği hata döndü. Detaylar için console'a bakınız.");
            console.log("e-İmza aracına SIGNSTEPTWO isteği sonucu.", signStepTwoResult);
            this.waitString = "Hata oluştu. " + "e-İmza şifreniz blokeli.";
          } else {
            this.logs.push("e-İmza aracına SIGNSTEPTWO isteği hata döndü. Detaylar için console'a bakınız.");
            console.log("e-İmza aracına SIGNSTEPTWO isteği sonucu.", signStepTwoResult);
            this.waitString = "Hata oluştu. " + signStepTwoResult.error;
          }
        } else {
          if (signStepTwoResult.error) {
            this.logs.push("e-İmza aracına SIGNSTEPTWO isteği hata döndü. Detaylar için console'a bakınız.");
            console.log("e-İmza aracına SIGNSTEPTWO isteği sonucu.", signStepTwoResult);
            this.waitString = "Hata oluştu. " + signStepTwoResult.error;
          } else {
            this.logs.push("e-İmza aracına SIGNSTEPTWO isteği başarıyla tamamlandı.");
            
            const finishSignRequest = {
              keyId: createStateResult.keyID,
              keySecret: createStateResult.keySecret,
              signedData: signStepTwoResult.signedData,
              operationId: createStateResult.operationId,
              signatureType: this.selectedSignatureType.id,
              dontUpgradeToLtv: !this.upgradeToLtv,
            };

            this.logs.push("Sizin sunucu katmanına FinishSign isteği gönderiliyor.");
            const finishSignResponse = await axios.post(
              store.API_URL + "/Onaylarim/FinishSign", 
              finishSignRequest,
              {
                headers: {
                  'Content-Type': 'application/json'
                }
              }
            );

            this.logs.push("Sizin sunucu katmanına FinishSign isteği gönderildi. Detaylar için console'a bakınız.");
            console.log("Sizin sunucu katmanına FinishSign isteği gönderildi.", createStateResponse);
            
            const finishSignResult = finishSignResponse.data as FinishSignResult;
            if (finishSignResult.isSuccess) {
              this.logs.push("Sizin sunucu katmanına FinishSign istiği sonucu: İşlem başarılı.");
              this.waitString = "İmza işlemi tamamlandı.";
              this.operationId = createStateResult.operationId;
              this.showSuccessPopup = true;
            } else {
              this.logs.push("Sizin sunucu katmanına FinishSign istiği sonucu: İşlem başarısız.");
              this.waitString = "İmza işlemi tamamlanamadı.";
            }
          }
        }
      } catch (error) {
        this.error = HandleError(error);
        this.waitString = '';
        console.error('İmza işlemi sırasında hata:', error);
      } finally {
        this.loading = false;
      }
    },

    async downloadSignedFile(): Promise<void> {
      if (!this.operationId) return;

      try {
        const response = await axios.get(
          store.API_URL + "/Onaylarim/DownloadSignedFileFromOnaylarimApi?operationId=" + this.operationId,
          { responseType: "blob" }
        );

        let filename = "imzali_dosya.pdf";
        const contentDisposition = response.headers["Content-Disposition"];
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;\n]*=(UTF-\d['"]*)?((['"]).*?[.]$\2|[^;\n]*)?/gi);
          if (match && match[1]) {
            const a1 = match[1].split("''")[1];
            if (a1) {
              filename = decodeURI(a1);
            }
          }
        }

        const fileURL = window.URL.createObjectURL(new Blob([response.data]));
        const fileLink = document.createElement("a");
        fileLink.href = fileURL;
        fileLink.setAttribute("download", filename);
        document.body.appendChild(fileLink);
        fileLink.click();
      } catch (error) {
        this.error = HandleError(error);
      }
    },

    GetSignerAppVersions() {
      this.logs.push("e-İmza aracı son sürümü alınıyor.");
      axios
        .get("https://apitest.onaylarim.com/sign/GetSignerAppVersions")
        .then((result) => {
          if (result.data.error) {
            this.logs.push("Uygulama güncel sürümü alınırken hata oluştu. Detaylar için console'a bakınız.");
            console.log("Uygulama güncel sürümü alınırken hata oluştu.", result);
          } else {
            this.getSignerAppVersionsResult = result.data.result as GetSignerAppVersionsResult;
            this.logs.push("Uygulama güncel sürümü alındı. Detaylar için console'a bakınız.");
            console.log("Uygulama güncel sürümü.", this.getSignerAppVersionsResult);
          }
        })
        .catch(async (error) => {
          this.logs.push("Uygulama güncel sürümü alınırken hata oluştu. Detaylar için console'a bakınız.");
          console.log("Uygulama güncel sürümü alınırken hata oluştu. ", error);
        });
    },

    OpenSignerApp() {
      try {
        window.location.href = 'onaylarimsignerapp:"start"';
        this.TryToConnect();
      } catch (err) {
        console.log("open signer app error.", err);
      }
    },

    async TryToConnect() {
      const httpsTryIsOk = await this.LocalSignerPing(true, false);
      if (httpsTryIsOk) {
        this.workingUrl = "https://localsigner.onaylarim.com:8099";
        this.LocalSignerReset();
      } else {
        const httpTryIsOk = await this.LocalSignerPing(false, false);
        if (httpTryIsOk) {
          this.workingUrl = "http://localsigner.onaylarim.com:8099";
          this.LocalSignerReset();
        } else {
          const httpTryWithLocalhostIsOk = await this.LocalSignerPing(false, true);
          if (httpTryWithLocalhostIsOk) {
            this.workingUrl = "http://localhost:8099";
            this.LocalSignerReset();
          }
        }
      }
    },

    async LocalSignerPing(useHttps: boolean, useLocalhost: boolean): Promise<boolean> {
      const url = (useHttps ? "https" : "http") + (useLocalhost ? "://localhost:8099/ping" : "://localsigner.onaylarim.com:8099/ping");

      this.logs.push("e-İmza aracına " + (useHttps ? "SSL" : "HTTP") + " PING isteği gönderiliyor. Url: " + url);
      try {
        const axiosResponse = await axios.get(url, { timeout: 500 });
        this.logs.push("e-İmza aracına " + (useHttps ? "SSL" : "HTTP") + " PING isteği döndü. Detaylar için console'a bakınız.");
        console.log("e-İmza aracına " + (useHttps ? "SSL" : "HTTP") + " PING isteğ sonucu.", axiosResponse);
        const signerAppPingResult = axiosResponse.data as SignerAppPingResult;
        if (signerAppPingResult.error === undefined || signerAppPingResult.error === null || signerAppPingResult.error.length === 0) {
          return true;
        }
        return false;
      } catch (error: any) {
        this.logs.push("e-İmza aracına " + (useHttps ? "SSL" : "HTTP") + " PING isteği gönderilemedi. Mesaj: " + HandleError(error) + " Detaylar için console'a bakınız.");
        console.log("e-İmza aracına " + (useHttps ? "SSL" : "HTTP") + " PING isteği gönderilemedi.", error);
        this.localSignerMode = "baglantiKurulamadı";
        return false;
      }
    },

    LocalSignerReset() {
      this.signerAppResetResult = null;
      this.operationId = "";
      this.localSignerMode = "working";
      this.waitString = "";
      this.logs.push("e-İmza aracına " + this.workingUrl + " RESET isteği gönderiliyor. ");
      axios
        .get(this.workingUrl + "/reset")
        .then((result) => {
          this.logs.push("e-İmza aracına " + this.workingUrl + " RESET isteği döndü. Detaylar için console'a bakınız.");
          console.log("e-İmza aracına " + this.workingUrl + " RESET isteğ sonucu.", result);
          this.signerAppResetResult = result.data as SignerAppResetResult;
          if (this.signerAppResetResult?.signerAppStatus === 1) {
            let counter = 0;
            while (counter < 10) {
              axios.get(this.workingUrl + "/ping").then((result) => {
                const signerAppPingResult = result.data as SignerAppPingResult;
                if (signerAppPingResult.signerAppStatus !== 1) {
                  counter = 10;
                }
              });
              counter++;
            }
          }
          let desiredVersion = 0;
          if (this.signerAppResetResult?.signerAppPlatform === "windows") {
            desiredVersion = this.getSignerAppVersionsResult.signerAppWindowsVersion;
          } else if (this.signerAppResetResult?.signerAppPlatform === "macos") {
            desiredVersion = this.getSignerAppVersionsResult.signerAppMacVersion;
          } else if (this.signerAppResetResult?.signerAppPlatform === "linux") {
            desiredVersion = this.getSignerAppVersionsResult.signerAppLinuxVersion;
          } else if (this.signerAppResetResult?.signerAppPlatform === "freebsd") {
            desiredVersion = this.getSignerAppVersionsResult.signerAppFreebsdVersion;
          }
          if (this.signerAppResetResult?.signerAppDllVersion && this.signerAppResetResult.signerAppDllVersion < desiredVersion) {
            this.localSignerMode = "varAncakVersiyonEski";
            return;
          } else {
            this.localSignerMode = "varVeVersiyonYeni";
            this.selectedCertificate = null;
            if (this.signerAppResetResult?.certificates && this.signerAppResetResult.certificates.length === 1) {
              this.selectedCertificate = this.signerAppResetResult.certificates[0];
            }
            return;
          }
        })
        .catch((error) => {
          this.logs.push("e-İmza aracına " + this.workingUrl + " RESET isteği gönderilemedi. Mesaj: " + HandleError(error) + " Detaylar için console'a bakınız.");
          console.log("e-İmza aracına " + this.workingUrl + " RESET isteği gönderilemedi.", error);
          this.localSignerMode = "baglantiKurulamadı";
        })
        .finally(() => {
          this.logs.push("e-İmza aracına durumu " + this.workingUrl + " : " + this.localSignerMode);
        });
    }
  }
})
</script>

<template>
  <div class="app-container">
    <div class="header">
      <h1>Tedarikçi Sözleşme İmzalama Platformu</h1>
    </div>
    <div class="main-content">
      <div class="pdf-viewer">
        <div class="pdf-container">
          <canvas ref="pdfCanvas"></canvas>
        </div>
      </div>
      <div class="sidebar">
        <div class="metadata">
          <h3>Belge Bilgileri</h3>
          <div class="metadata-item">
            <span class="metadata-label">Belge No:</span>
            <span>{{ documentInfo.documentNumber }}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Oluşturulma Tarihi:</span>
            <span>{{ documentInfo.creationDate }}</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Belge Türü:</span>
            <span>{{ documentInfo.documentType }}</span>
          </div>
        </div>
        <div class="signers-section">
          <h3>İmzacılar</h3>
          <div class="metadata-item">
            <span class="metadata-label">Sizden Önce İmzalayan:</span>
            <span>Bülent Çakıroğlu</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Tarih:</span>
            <span>05.04.2025</span>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Sıradaki İmzacı:</span>
            <span>Uluç Efe Öztürk</span>
          </div>
        </div>
        <div class="signature-section">
          <h3>İmzalama</h3>
          <div v-if="error" class="error-message">{{ error }}</div>
          <div v-if="loading" class="loading-message">{{ waitString }}</div>
          
          <div v-if="!showPinDialog">
            <button @click="signDocument" class="sign-btn" :disabled="loading">
              Belgeyi İmzala
            </button>
          </div>

          <div v-else class="pin-dialog">
            <div class="metadata-item">
              <span class="metadata-label">Sertifika Sahibi:</span>
              <span>{{ selectedCertificate?.personFullname }}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">TC Kimlik No:</span>
              <span>{{ selectedCertificate?.citizenshipNo }}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Geçerlilik:</span>
              <span>{{ selectedCertificate?.validTo }}</span>
            </div>
            <div class="pin-input">
              <label for="pin">PIN Kodu:</label>
              <input type="password" id="pin" v-model="pin" placeholder="PIN kodunuzu girin" :disabled="loading" />
            </div>
            <div class="pin-actions">
              <button @click="signDocument" class="sign-btn" :disabled="loading">İmzala</button>
              <button @click="showPinDialog = false; selectedCertificate = null" class="cancel-btn" :disabled="loading">İptal</button>
            </div>
          </div>

          <div v-if="operationId" class="download-section">
            <button @click="downloadSignedFile" class="download-btn">
              İmzalı Dosyayı İndir
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Success Popup -->
    <div v-if="showSuccessPopup" class="success-popup-overlay">
      <div class="success-popup">
        <div class="success-icon">✓</div>
        <h3>İmzalama İşlemi Tamamlandı</h3>
        <p>Bu belge 5070 sayılı kanuna göre elektronik olarak imzalanmıştır.</p>
        <button @click="downloadSignedFile" class="download-btn">
          İmzalı Dosyayı İndir
        </button>
        <button @click="showSuccessPopup = false" class="close-btn">
          Kapat
        </button>
      </div>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  background-color: #f5f5f5;
}

.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 2rem 4rem;
  background-color: #f5f5f5;
}

.header {
  background-color: #2c3e50;
  color: white;
  padding: 2rem;
  text-align: center;
  border-radius: 12px;
  margin-bottom: 3rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header h1 {
  font-size: 2.2rem;
  font-weight: 600;
}

.main-content {
  flex: 1;
  display: flex;
  gap: 3rem;
  padding: 0;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.pdf-viewer {
  flex: 4;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  margin-bottom: 2rem;
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.pdf-container {
  position: relative;
  width: 595.28px;
  height: 841.89px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
  margin: auto;
}

canvas {
  width: 100%;
  height: 100%;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}

.sidebar {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  min-width: 400px;
}

.metadata, .signature-section, .signers-section {
  background-color: white;
  border-radius: 12px;
  padding: 2.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.metadata h3, .signature-section h3, .signers-section h3 {
  color: #2c3e50;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #eee;
  font-size: 1.6rem;
  font-weight: 600;
}

.metadata-item {
  margin-bottom: 1.8rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
}

.metadata-label {
  font-weight: 600;
  color: #4a5568;
  font-size: 1.2rem;
}

.sign-btn {
  width: 100%;
  padding: 1.5rem;
  background-color: #27ae60;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.4rem;
  font-weight: 600;
  transition: all 0.3s ease;
  margin-top: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.sign-btn:hover {
  background-color: #2ecc71;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.certificate-info {
  margin-top: 2rem;
  padding: 2rem;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.error-message {
  color: #e74c3c;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background-color: #fdf1f0;
  border-radius: 4px;
}

.loading-message {
  color: #3498db;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background-color: #edf7fd;
  border-radius: 4px;
}

.certificates-list {
  margin-top: 1rem;
}

.certificate-item {
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.certificate-item:hover {
  background-color: #f8f9fa;
  border-color: #27ae60;
}

.pin-dialog {
  margin-top: 1rem;
}

.pin-input {
  margin: 1rem 0;
}

.pin-input label {
  display: block;
  margin-bottom: 0.5rem;
  color: #4a5568;
  font-weight: 600;
}

.pin-input input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.pin-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.cancel-btn {
  flex: 1;
  padding: 1.5rem;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.4rem;
  font-weight: 600;
  transition: all 0.3s ease;
}

.cancel-btn:hover {
  background-color: #c0392b;
}

.download-section {
  margin-top: 2rem;
  text-align: center;
}

.download-btn {
  padding: 1rem 2rem;
  background-color: #3498db;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: 600;
  transition: all 0.3s ease;
}

.download-btn:hover {
  background-color: #2980b9;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 1600px) {
  .app-container {
    padding: 2rem;
  }

  .main-content {
    max-width: 1400px;
  }

  .sidebar {
    min-width: 350px;
  }
}

@media (max-width: 1200px) {
  .main-content {
    flex-direction: column;
  }
  
  .pdf-viewer {
    padding: 2rem;
  }
  
  .sidebar {
    min-width: 100%;
  }
  
  .pdf-container {
    width: 100%;
    height: auto;
    aspect-ratio: 1 / 1.4142;
  }

  .metadata, .signature-section, .signers-section {
    padding: 2rem;
  }
}

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
  }

  .header {
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .header h1 {
    font-size: 1.8rem;
  }

  .pdf-viewer {
    padding: 1rem;
  }

  .metadata, .signature-section, .signers-section {
    padding: 1.5rem;
  }
}

/* Success Popup Styles */
.success-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.success-popup {
  background-color: white;
  padding: 2rem;
  border-radius: 12px;
  text-align: center;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.success-icon {
  font-size: 3rem;
  color: #4CAF50;
  margin-bottom: 1rem;
}

.success-popup h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
}

.success-popup p {
  color: #666;
  margin-bottom: 1.5rem;
}

.success-popup .download-btn {
  background-color: #4CAF50;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  margin-right: 1rem;
}

.success-popup .close-btn {
  background-color: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
  padding: 0.8rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}

.success-popup .download-btn:hover {
  background-color: #45a049;
}

.success-popup .close-btn:hover {
  background-color: #e0e0e0;
}
</style> 