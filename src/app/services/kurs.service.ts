import { Injectable, signal, NgZone } from '@angular/core';
import { XmlService } from './xml.service';
import saveAs from 'file-saver';

@Injectable({
  providedIn: 'root'
})
export class KursService {
  public rawData = signal<any>(null);
  public services = signal<any[]>([]); 
  
  public originalServices: any[] = [];
  public deletedServiceIds: string[] = [];

  constructor(private xmlService: XmlService, private zone: NgZone) { }

  // 1. DATEI LADEN
  loadCatalog(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        this.zone.run(() => {
          try {
            let xmlContent = e.target.result;

            // Import-Reparatur: Leere Attribute beim Laden abfangen
            if (typeof xmlContent === 'string') {
              xmlContent = xmlContent.replace(/<EDUCATION type>/g, '<EDUCATION type="false">');
              xmlContent = xmlContent.replace(/<EDUCATION type\s*>/g, '<EDUCATION type="false">');
              xmlContent = xmlContent.replace(/<EDUCATION type="">/g, '<EDUCATION type="false">');
              xmlContent = xmlContent.replace(/<EDUCATION type\/>/g, '<EDUCATION type="false"/>');
            }

            const parsedData = this.xmlService.parse(xmlContent);
            this.rawData.set(parsedData);

            const root = parsedData?.OPENQCAT;
            if (!root) {
              alert('Fehler: Kein <OPENQCAT> Element gefunden.');
              return;
            }

            let foundServices: any[] = [];

            if (root.NEW_CATALOG && root.NEW_CATALOG.SERVICE) {
              foundServices = this.ensureArray(root.NEW_CATALOG.SERVICE);
            } 
            else if (root.UPDATE_CATALOG && root.UPDATE_CATALOG.NEW && root.UPDATE_CATALOG.NEW.SERVICE) {
              foundServices = this.ensureArray(root.UPDATE_CATALOG.NEW.SERVICE);
            } 
            else {
              console.warn('Keine Kurse gefunden.');
            }

            this.services.set(foundServices);
            this.originalServices = JSON.parse(JSON.stringify(foundServices));
            this.deletedServiceIds = []; 
            console.log(`${foundServices.length} Kurse geladen.`);
            resolve();
          } catch (err) {
            console.error(err);
            alert("Fehler beim Parsen der XML.");
            reject(err);
          }
        });
      };
      reader.readAsText(file, 'ISO-8859-15'); 
    });
  }

  // --- LOGIK: NEUEN TERMIN ANLEGEN ---
  addTermin(parentService: any) {
    const currentServices = [...this.services()];
    
    // 1. Kopie vom Eltern-Kurs erstellen
    const child = JSON.parse(JSON.stringify(parentService));

    // 2. IDs setzen
    const baseId = (parentService.PRODUCT_ID + '').split('_')[0];
    const newId = `${baseId}_${Math.floor(Math.random() * 9900) + 100}`;
    
    child.PRODUCT_ID = newId;
    child.SUPPLIER_ALT_PID = newId;

    // 3. Verknüpfung zur Mutter herstellen
    this.ensureModuleStructure(child).COURSE_ID = baseId;

    // 4. Texte leeren
    if (child.SERVICE_DETAILS) {
        child.SERVICE_DETAILS.TITLE = ''; 
        child.SERVICE_DETAILS.DESCRIPTION_LONG = '';
        
        if (child.SERVICE_DETAILS.SERVICE_DATE) {
            child.SERVICE_DETAILS.SERVICE_DATE.START_DATE = '';
            child.SERVICE_DETAILS.SERVICE_DATE.END_DATE = '';
        }
    }

    currentServices.push(child);
    this.services.set(currentServices);
  }

  // Löschen
  removeService(serviceToDelete: any) {
    const currentServices = [...this.services()];
    const index = currentServices.indexOf(serviceToDelete);
    
    if (index > -1) {
      if (serviceToDelete.PRODUCT_ID) {
        this.deletedServiceIds.push(serviceToDelete.PRODUCT_ID);
      }
      currentServices.splice(index, 1);
      this.services.set(currentServices);
    }
  }

  // --- HILFSFUNKTIONEN ---

  ensureModuleStructure(service: any) {
    if (!service.SERVICE_DETAILS) service.SERVICE_DETAILS = {};
    if (!service.SERVICE_DETAILS.SERVICE_MODULE) service.SERVICE_DETAILS.SERVICE_MODULE = {};
    if (Array.isArray(service.SERVICE_DETAILS.SERVICE_MODULE)) {
        service.SERVICE_DETAILS.SERVICE_MODULE = service.SERVICE_DETAILS.SERVICE_MODULE[0];
    }
    if (!service.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION) {
      // Standardmäßig auf false setzen, nicht leer!
      service.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION = { '@_type': 'false' };
    }
    if (!service.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION.MODULE_COURSE) {
      service.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION.MODULE_COURSE = {};
    }
    return service.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION.MODULE_COURSE;
  }

  private sanitizeForExport(services: any[]): any[] {
    const deepCopy = JSON.parse(JSON.stringify(services));
    
    return deepCopy.map((s: any) => {
      
      // REPARATUR-LOGIK FÜR EXPORT
      if (s.SERVICE_DETAILS?.SERVICE_MODULE?.EDUCATION) {
        const edu = s.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION;
        
        // WICHTIG: Hier stand vorher, dass es '' (leer) wird. Das war der Fehler.
        // Jetzt: Wenn explizit true -> true. Sonst -> false. Niemals leer.
        if (edu['@_type'] === true || edu['@_type'] === "true") {
           edu['@_type'] = 'true';
        } else {
           edu['@_type'] = 'false'; 
        }
      }

      // Date Fix (ISO)
      if (s.SERVICE_DETAILS?.SERVICE_DATE) {
        const sd = s.SERVICE_DETAILS.SERVICE_DATE;
        if (sd.START_DATE) sd.START_DATE = this.toIsoDate(sd.START_DATE);
        if (sd.END_DATE) sd.END_DATE = this.toIsoDate(sd.END_DATE);
      }
      return s;
    });
  }

  private toIsoDate(val: string): string {
    if (!val) return '';
    if (val.match(/^\d{4}-\d{2}-\d{2}/)) return val; // Ist schon ISO
    // Prüfen ob deutsches Format TT.MM.JJJJ
    const parts = val.split('.');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return val;
  }

  private ensureArray(element: any): any[] {
    return Array.isArray(element) ? element : [element];
  }

  // --- EXPORT ---

  exportFull() {
    alert("Diese Funktion ist aktuell deaktiviert ('Aktuell nicht möglich').\n\nBitte nutzen Sie die Differenzlieferung, um Datenfehler zu vermeiden.");
    return; 
  }

  exportDiff(seqNumber: number) {
    const data = this.rawData(); if (!data) return;
    const header = { ...data.OPENQCAT.HEADER };
    const currentServices = this.services();

    const changedOrNewServices = currentServices.filter((currentService: any) => {
      const original = this.originalServices.find((o: any) => o.PRODUCT_ID === currentService.PRODUCT_ID);
      if (!original) return true; 
      if (JSON.stringify(currentService) !== JSON.stringify(original)) return true;
      return false;
    });

    if (changedOrNewServices.length === 0 && this.deletedServiceIds.length === 0) {
      alert("Es wurden keine Änderungen festgestellt.");
      return;
    }

    // Hier wird jetzt die reparierte sanitize-Funktion aufgerufen
    const cleanServices = this.sanitizeForExport(changedOrNewServices);
    
    const updateObj = {
      OPENQCAT: {
        '@_version': '1.1',
        HEADER: header,
        UPDATE_CATALOG: {
          '@_seq_number': seqNumber,
          DELETE: this.deletedServiceIds.length > 0 ? {
            SERVICE: this.deletedServiceIds.map(id => ({ PRODUCT_ID: id }))
          } : undefined,
          NEW: cleanServices.length > 0 ? {
            SERVICE: cleanServices.map((s: any) => ({ ...s, '@_mode': 'new' }))
          } : undefined
        }
      }
    };
    const xml = this.xmlService.build(updateObj);
    const blob = new Blob([xml], { type: 'text/xml;charset=UTF-8' });
    saveAs(blob, `differenz_seq_${seqNumber}.xml`);
  }
}