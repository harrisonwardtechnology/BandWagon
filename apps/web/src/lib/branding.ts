import { env } from "./env";

export type OrganizationBrand = {
  name: string;
  tagline?: string;
  communityName?: string;
  primaryDomain?: string;
  accent?: string;
};

export const platformBrand = {
  name: env.APP_NAME,
  tagline: env.APP_TAGLINE,
  vendorName: env.PLATFORM_VENDOR_NAME,
  vendorUrl: env.PLATFORM_VENDOR_URL
};

export const floMoGoBrand: OrganizationBrand = {
  name: "FloMoGo",
  tagline: "Hop on the BandWagon.",
  communityName: "Flower Mound Band Community",
  primaryDomain: "flomogo.app"
};
