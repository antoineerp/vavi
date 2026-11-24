/** `tz-lookup` ne publie pas de types : une fonction, des coordonnées vers le fuseau IANA du lieu. */
declare module 'tz-lookup' {
  export default function tzlookup(latitude: number, longitude: number): string;
}
