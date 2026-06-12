export interface LocalizedString {
  en: string;
  fr: string;
  es: string;
  ar: string;
}

export interface Template {
  id: number;
  name: LocalizedString;
  shortName: LocalizedString;
  category: LocalizedString;
  price: number;
  label: LocalizedString;
  image: string;
  image_metadata: string;
  productImage: string;
  features: string[];
  demo: string;
  purchaseLink: string;
  description: LocalizedString;
  tags: string[];
  scrollSpeed: number;
  createdAt: Date;
  updatedAt: Date;
  popularity: number;
  isPaid: boolean;
  slug: string;
  framework: string;
  frameworkVersion: string;
  reactVersion: string;
  styling: string;
  hasTypeScript: boolean;
  isResponsive: boolean;
  supportPeriod: string;
  techStack: string[];
  license: string;
  developerLevel: string;
  useCases: string[];
  dependencies: Record<string, string>;
  information: LocalizedString;
  video?: string;
  videoPadding?: string;
}
