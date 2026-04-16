import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ch.amazinglab.planning',
  appName: 'AL Planning',
  webDir: 'out',
  // Point the native WebView to the hosted Vercel app.
  // This means API routes, Supabase auth, etc. all work as-is.
  // No static export needed.
  server: {
    url: 'https://mazeproject.amazinglab.ch',
    cleartext: false,
  },
  ios: {
    // Respect the safe-area on iPhone (notch, home indicator)
    contentInset: 'automatic',
    // Prevent rubber-band scrolling on the root view
    scrollEnabled: false,
  },
}

export default config
