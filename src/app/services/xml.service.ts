import { Injectable } from '@angular/core';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

@Injectable({
  providedIn: 'root'
})
export class XmlService {

  private parseOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    isArray: (name: string) => {
      const listFields = [
        'SERVICE', 
        'KEYWORD', 
        'MIME_ELEMENT', 
        'SUPPLIER', 
        'TARGET_GROUP', 
        'FEATURE', 
        'CONTACT',
        'SERVICE_CLASSIFICATION',
        'VARIANT',
        'FVALUE'
      ];
      return listFields.includes(name);
    }
  };

  private buildOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true,
    suppressBooleanAttributes: false 
  };

  private parser = new XMLParser(this.parseOptions);
  private builder = new XMLBuilder(this.buildOptions);

  parse(xmlString: string): any {
    // Vor dem Parsen: Eventuelle Fehler in der Quelldatei "weichspülen"
    if (typeof xmlString === 'string') {
      xmlString = xmlString.replace(/<EDUCATION type>/g, '<EDUCATION type="">');
      xmlString = xmlString.replace(/<EDUCATION type\s*>/g, '<EDUCATION type="">');
      xmlString = xmlString.replace(/<EDUCATION type\/>/g, '<EDUCATION type=""/>');
    }
    return this.parser.parse(xmlString);
  }

  build(jsonObj: any): string {
    let xmlContent = this.builder.build(jsonObj);

    // Reparatur vor dem Speichern
    xmlContent = xmlContent.replace(/<EDUCATION type>/g, '<EDUCATION type="">');
    xmlContent = xmlContent.replace(/<EDUCATION type\s*>/g, '<EDUCATION type="">');
    xmlContent = xmlContent.replace(/<EDUCATION type\/>/g, '<EDUCATION type=""/>');
    xmlContent = xmlContent.replace(/ type>/g, ' type="">');

    // UTF-8 Header erzwingen
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` + xmlContent;
  }
}