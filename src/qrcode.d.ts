declare module "qrcode" {
  type Level = "L" | "M" | "Q" | "H";
  export function toDataURL(
    text: string,
    opts?: {
      margin?: number;
      width?: number;
      errorCorrectionLevel?: Level;
      color?: { dark?: string; light?: string };
    },
  ): Promise<string>;
  export function toString(
    text: string,
    opts?: {
      type?: "svg" | "utf8" | "terminal";
      margin?: number;
      width?: number;
      errorCorrectionLevel?: Level;
      color?: { dark?: string; light?: string };
    },
  ): Promise<string>;
}
