/// <reference types="vite/client" />
declare module 'virtual:faits' {
  const faits: import('./lib/faits').Faits;
  export default faits;
}
