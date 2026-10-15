declare module "qrcode" {
  export function toDataURL(
    text: string,
    opts?: {
      margin?: number;
      width?: number;
      color?: { dark?: string; light?: string };
    },
  ): Promise<string>;
}
