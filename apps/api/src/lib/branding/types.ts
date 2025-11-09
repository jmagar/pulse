import { BrandingProfile } from "../../types/branding";

export interface ButtonSnapshot {
  index: number;
  text: string;
  html: string;
  classes: string;
  background: string;
  textColor: string;
  borderColor?: string | null;
  borderRadius?: string;
  shadow?: string | null;
}

export interface BrandingLLMInput {
  jsAnalysis: BrandingProfile;
  buttons: ButtonSnapshot[];

  screenshot?: string;
  url: string;
}

/**
 * Data structure returned by the branding script
 */
export interface BrandingScriptReturn {
  cssData: {
    colors: string[];
    spacings: number[];
    radii: number[];
  };
  snapshots: Array<{
    tag: string;
    classes: string;
    text: string;
    rect: { w: number; h: number };
    colors: {
      text: string;
      background: string;
      border: string;
      borderWidth: number | null;
    };
    typography: {
      fontStack: string[];
      size: string | null;
      weight: number | null;
    };
    radius: number | null;
    shadow: string | null;
    isButton: boolean;
    isNavigation?: boolean;
    hasCTAIndicator?: boolean;
    isInput: boolean;
    isLink: boolean;
  }>;
  images: Array<{ type: string; src: string }>;
  typography: {
    stacks: {
      body: string[];
      heading: string[];
      paragraph: string[];
    };
    sizes: {
      h1: string;
      h2: string;
      body: string;
    };
  };
  frameworkHints: string[];
  colorScheme: "light" | "dark";
}
