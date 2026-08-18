import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStore = new Map<string, string>();

export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      memoryStore.set(key, value);
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Fallback to memoryStore
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    memoryStore.set(key, value);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      try {
        return sessionStorage.getItem(key) ?? memoryStore.get(key) ?? null;
      } catch {
        return memoryStore.get(key) ?? null;
      }
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    memoryStore.delete(key);
    if (Platform.OS === 'web') {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignored
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    memoryStore.delete(key);
  }
}
