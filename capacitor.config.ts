import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.remesas.manzanoapp',
  appName: 'Cambios Manzano',
  webDir: 'public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
      iconColor: '#8cb33e',
      smallIcon: 'ic_stat_notification'
    }
  }
};

export default config;
