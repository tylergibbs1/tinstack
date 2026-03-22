import { AwsError } from "../../core/errors";

export interface ContactInformation {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  city?: string;
  stateOrRegion?: string;
  postalCode?: string;
  countryCode?: string;
  phoneNumber?: string;
  companyName?: string;
  websiteUrl?: string;
  districtOrCounty?: string;
}

export interface AlternateContact {
  alternateContactType: string;
  emailAddress?: string;
  name?: string;
  phoneNumber?: string;
  title?: string;
}

export class AccountService {
  private contactInfo: ContactInformation = {};
  private alternateContacts = new Map<string, AlternateContact>();

  getContactInformation(): ContactInformation {
    return this.contactInfo;
  }

  putContactInformation(info: ContactInformation): void {
    this.contactInfo = { ...this.contactInfo, ...info };
  }

  getAlternateContact(type: string): AlternateContact {
    const contact = this.alternateContacts.get(type);
    if (!contact) throw new AwsError("ResourceNotFoundException", `Alternate contact ${type} not found.`, 404);
    return contact;
  }

  putAlternateContact(contact: AlternateContact): void {
    this.alternateContacts.set(contact.alternateContactType, contact);
  }

  deleteAlternateContact(type: string): void {
    if (!this.alternateContacts.has(type)) {
      throw new AwsError("ResourceNotFoundException", `Alternate contact ${type} not found.`, 404);
    }
    this.alternateContacts.delete(type);
  }
}
