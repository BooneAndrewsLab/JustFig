/** The parts of UTIF (tests only: the TIFF decoding oracle) the tests use. */
declare module 'utif' {
  export interface IFD {
    width: number;
    height: number;
    data: Uint8Array;
    [tag: string]: unknown;
  }
  export function decode(buf: ArrayBuffer | Uint8Array): IFD[];
  export function decodeImage(buf: ArrayBuffer | Uint8Array, ifd: IFD): void;
  export function toRGBA8(ifd: IFD): Uint8Array;
}
