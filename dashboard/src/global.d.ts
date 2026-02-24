/// <reference types="typed-htmx" />
import 'hono/jsx';

declare module 'hono/jsx' {
  namespace JSX {
    interface IntrinsicElements {
      [key: string]: HtmxAttributes & Record<string, unknown>;
    }
  }
}
