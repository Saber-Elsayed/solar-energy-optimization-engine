import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (explicit) {
    return explicit;
  }

  const port = process.env.EXPO_PUBLIC_API_PORT?.trim() || '8000';
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const metroHost = hostUri.split(':')[0];

  if (metroHost && metroHost !== 'localhost' && metroHost !== '127.0.0.1') {
    return `http://${metroHost}:${port}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${port}`;
  }
  return `http://127.0.0.1:${port}`;
}

export const API_BASE_URL = getApiBaseUrl();

export const DEVICES_URL = `${API_BASE_URL}/devices`;
export const ENERGY_LATEST_URL = `${API_BASE_URL}/energy-data/latest`;
export const SOLAR_SYSTEM_URL = `${API_BASE_URL}/solar-system`;
export const CITIES_URL = `${API_BASE_URL}/cities`;
export const NIGHT_WINDOW_URL = `${API_BASE_URL}/weather/night-window`;
export const OPTIMIZE_URL = `${API_BASE_URL}/optimize`;
export const OPTIMIZE_BEST_URL = `${API_BASE_URL}/optimize/best-combination`;
export const ADMIN_REGISTRATIONS_URL = `${API_BASE_URL}/admin/registrations`;
export const FIREBASE_REGISTRATION_SUBMIT_URL = `${API_BASE_URL}/firebase/registration/submit`;
export const FIREBASE_REGISTRATION_STATUS_URL = `${API_BASE_URL}/firebase/registration/status`;

export const DEFAULT_INVERTER_MAX_POWER_W = 2000;
