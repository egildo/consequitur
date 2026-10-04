// Vite's `?raw` suffix: a file's text, as a string.
declare module '*.json?raw' {
  const text: string;
  export default text;
}
