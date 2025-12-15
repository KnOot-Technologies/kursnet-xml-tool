import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KursService } from './services/kurs.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {
  title = 'KURSNET XML Tool';
  seqNumber: number = 10;
  showHelp = false;
  expandedParents = new Set<string>();

  // --- GLOSSAR ---
  helpGlossary = [
    { tag: '<PRODUCT_ID>', desc: 'Eindeutige ID. Darf bei bestehenden Kursen NICHT geändert werden.' },
    { tag: '<TITLE>', desc: 'Name des Angebots.' },
    { tag: '<DESCRIPTION_LONG>', desc: 'Inhaltstext. Muss min. 44 Zeichen lang sein. Keine Werbebegriffe.' },
    { tag: '<SERVICE_DATE>', desc: 'Der tatsächliche Unterrichtszeitraum.' },
    { tag: '<ANNOUNCEMENT>', desc: 'Werbe-Zeitraum (Sichtbarkeit auf der Webseite).' },
    { tag: '<FLEXIBLE_START>', desc: '"true" = Laufender Einstieg. "false" = Fester Starttermin.' },
    { tag: 'WARNUNGEN', desc: 'Das Tool prüft auf Logikfehler (z.B. keine Termine trotz festem Start).' }
  ];

  // --- LOGIK: Gruppierung ---
  groupedServices = computed(() => {
    const allServices = this.kursService.services();
    const parents: any[] = [];
    const childrenMap = new Map<string, any[]>();

    allServices.forEach(service => {
      const pid = String(service.PRODUCT_ID);
      const courseId = service.SERVICE_DETAILS?.SERVICE_MODULE?.EDUCATION?.COURSE_ID 
        ? String(service.SERVICE_DETAILS.SERVICE_MODULE.EDUCATION.COURSE_ID) 
        : null;
      
      if (courseId && courseId !== pid) {
        if (!childrenMap.has(courseId)) childrenMap.set(courseId, []);
        childrenMap.get(courseId)?.push(service);
      } else {
        parents.push(service);
      }
    });

    return parents.map(parent => ({
      parent: parent,
      children: childrenMap.get(String(parent.PRODUCT_ID)) || [] 
    }));
  });

  constructor(public kursService: KursService) {}

  // --- NEU: Wochen-Rechner ---
  calculateEndDate(item: any, weeksStr: string) {
    const weeks = parseFloat(weeksStr);
    const startStr = item.SERVICE_DETAILS?.SERVICE_DATE?.START_DATE;

    if (!startStr || isNaN(weeks) || weeks <= 0) return;

    let date: Date;

    // Datum parsen (Deutsch DD.MM.YYYY oder ISO YYYY-MM-DD)
    if (startStr.includes('.')) {
      const parts = startStr.split('.'); 
      date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else {
      date = new Date(startStr);
    }

    if (isNaN(date.getTime())) return; 

    // Wochen addieren (Wochen * 7 Tage) - 1 Tag (damit Zeitraum inklusiv ist)
    const daysToAdd = (weeks * 7) - 1; 
    date.setDate(date.getDate() + daysToAdd);

    // Formatieren zu YYYY-MM-DD (ISO)
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');

    // Wert setzen
    if (!item.SERVICE_DETAILS.SERVICE_DATE) item.SERVICE_DETAILS.SERVICE_DATE = {};
    item.SERVICE_DETAILS.SERVICE_DATE.END_DATE = `${y}-${m}-${d}`;
  }

  // --- DATEN-DETEKTIV ---
  getWarnings(group: any): string[] {
    const warnings: string[] = [];
    const parent = group.parent;
    const children = group.children;
    const details = parent.SERVICE_DETAILS || {};
    
    const isFlex = this.isFlexibleStart(parent);
    const desc = details.DESCRIPTION_LONG || '';
    const remarks = details.SERVICE_DATE?.DATE_REMARKS?.toLowerCase() || '';

    // 1. ZOMBIE-CHECK
    const hasOwnDate = details.SERVICE_DATE?.START_DATE && details.SERVICE_DATE?.START_DATE.length > 0;
    if (!isFlex && children.length === 0 && !hasOwnDate) {
      warnings.push("KRITISCH: Kurs hat weder Termine noch 'Regelmäßigen Start'. Er ist nicht buchbar!");
    }

    // 2. TEXT-WIDERSPRUCH
    if (!isFlex && (remarks.includes('laufender einstieg') || remarks.includes('alle 2 wochen') || remarks.includes('jede woche'))) {
      warnings.push("Widerspruch: Text sagt 'laufender Einstieg', aber die Option ist deaktiviert.");
    }

    // 3. BESCHREIBUNG ZU KURZ
    if (desc.length < 44) {
      warnings.push("Beschreibung ist zu kurz (min. 44 Zeichen).");
    }

    // 4. WERBUNG
    const badWords = ['Beste', 'Top-Preis', 'Garantie', 'Testsieger', 'Jobgarantie'];
    const foundBadWords = badWords.filter(w => desc.includes(w));
    if (foundBadWords.length > 0) {
      warnings.push(`Werbung verboten: ${foundBadWords.join(', ')}`);
    }

    return warnings;
  }

  // --- HELPER ---

  toggleHelp() { this.showHelp = !this.showHelp; }

  toggleRow(id: any) {
    const idStr = String(id);
    if (this.expandedParents.has(idStr)) this.expandedParents.delete(idStr);
    else this.expandedParents.add(idStr);
  }

  isExpanded(id: any): boolean { return this.expandedParents.has(String(id)); }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.kursService.loadCatalog(file);
      this.expandedParents.clear();
    }
  }

  formatChildId(id: any): string {
    if (!id) return '';
    const textId = String(id);
    return textId.includes('_') ? '...' + textId.split('_').pop() : textId;
  }

  isFlexibleStart(service: any): boolean {
    return service.SERVICE_DETAILS?.SERVICE_MODULE?.EDUCATION?.MODULE_COURSE?.FLEXIBLE_START === true;
  }

  toggleFlexibleStart(service: any, event: any) {
    const moduleCourse = this.kursService.ensureModuleStructure(service);
    moduleCourse.FLEXIBLE_START = event.target.checked;
  }

  exportGesamt() { this.kursService.exportFull(); }
  
  exportDifferenz() {
    if (!this.seqNumber) { alert("Bitte Sequenznummer angeben!"); return; }
    this.kursService.exportDiff(this.seqNumber);
  }
}