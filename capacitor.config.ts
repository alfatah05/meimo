import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.meimo.app',
  appName: 'Meimo — Catatan Pribadi',
  // webDir mengarah ke root project apa adanya (index.html, editor.html,
  // src/, assets/, dst) — stage 1 tidak exclude apa pun dulu.
  webDir: '.',
  bundledWebRuntime: false
};

export default config;
