/**
 * i18n initialization and exports
 */
import i18next from 'i18next';
import { en, type TranslationKeys } from './locales/en.js';
import { zhCN } from './locales/zh-CN.js';
import { getLang } from '../core/config.js';

// Debug flag
const DEBUG = process.env.DEBUG?.includes('colyn:i18n');

/**
 * Supported languages
 */
const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Check if a language is supported
 */
function isSupported(lang: string): lang is SupportedLanguage {
  // Normalize language code
  const normalized = normalizeLanguage(lang);
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(normalized);
}

/**
 * Normalize language code
 * e.g., 'zh_CN.UTF-8' -> 'zh-CN', 'en_US.UTF-8' -> 'en'
 */
function normalizeLanguage(lang: string): string {
  // Remove encoding suffix (e.g., .UTF-8)
  const withoutEncoding = lang.split('.')[0];

  // Handle Chinese variants
  if (withoutEncoding.startsWith('zh')) {
    return 'zh-CN';
  }

  // Handle English variants
  if (withoutEncoding.startsWith('en')) {
    return 'en';
  }

  // Return the base language code
  return withoutEncoding.replace('_', '-');
}

/**
 * Detect language from all sources
 * Priority:
 * 1. COLYN_LANG environment variable
 * 2. Project config file (.colyn/config.json)
 * 3. User config file (~/.colyn/config.json)
 * 4. System language (LANG/LC_ALL)
 * 5. Default to English
 */
async function detectLanguage(configDir?: string): Promise<SupportedLanguage> {
  // 1. Check COLYN_LANG environment variable
  const colynLang = process.env.COLYN_LANG;
  if (colynLang) {
    const normalized = normalizeLanguage(colynLang);
    if (isSupported(normalized)) {
      if (DEBUG) {
        console.error(`[i18n] Using COLYN_LANG: ${colynLang} -> ${normalized}`);
      }
      return normalized;
    }
    if (DEBUG) {
      console.error(`[i18n] COLYN_LANG "${colynLang}" not supported, falling back`);
    }
  }

  // 2-3. Check config files (project + user)
  try {
    const configLang = await getLang(configDir);
    if (configLang && configLang !== 'en') { // Skip if it's the default value
      const normalized = normalizeLanguage(configLang);
      if (isSupported(normalized)) {
        if (DEBUG) {
          console.error(`[i18n] Using config language: ${configLang} -> ${normalized}`);
        }
        return normalized;
      }
      if (DEBUG) {
        console.error(`[i18n] Config language "${configLang}" not supported, falling back`);
      }
    }
  } catch (error) {
    // Config file read error, continue to next source
    if (DEBUG) {
      console.error(`[i18n] Error reading config: ${error}`);
    }
  }

  // 4. Check system language
  const systemLang = process.env.LC_ALL || process.env.LANG || '';
  if (systemLang) {
    const normalized = normalizeLanguage(systemLang);
    if (isSupported(normalized)) {
      if (DEBUG) {
        console.error(`[i18n] Using system language: ${systemLang} -> ${normalized}`);
      }
      return normalized;
    }
    if (DEBUG) {
      console.error(`[i18n] System language "${systemLang}" not supported, falling back to English`);
    }
  }

  // 5. Default to English
  if (DEBUG) {
    console.error('[i18n] Using default language: en');
  }
  return 'en';
}

// Initialize i18next with default language (will be updated by initI18n)
i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  debug: DEBUG,
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  interpolation: {
    escapeValue: false, // Not needed for CLI
  },
  returnNull: false,
  returnEmptyString: false,
});

/**
 * Initialize i18n with language detection from all sources
 * This should be called as early as possible in the CLI entry point
 * @param configDir .colyn directory path (optional)
 */
export async function initI18n(configDir?: string): Promise<void> {
  const detectedLanguage = await detectLanguage(configDir);

  if (detectedLanguage !== i18next.language) {
    await i18next.changeLanguage(detectedLanguage);
    if (DEBUG) {
      console.error(`[i18n] Language changed to: ${detectedLanguage}`);
    }
  }
}

/**
 * Get nested value from object using dot notation
 */
type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${K}` | `${K}.${NestedKeyOf<T[K]>}`
        : `${K}`;
    }[keyof T & string]
  : never;

type TranslationKey = NestedKeyOf<TranslationKeys>;

/**
 * Translation function with type safety
 */
export function t(key: TranslationKey, options?: Record<string, string | number>): string {
  return i18next.t(key, options);
}

/**
 * Get current language
 */
export function getCurrentLanguage(): string {
  return i18next.language;
}

/**
 * Check if current language is Chinese
 */
export function isChinese(): boolean {
  return i18next.language === 'zh-CN';
}

/**
 * Export i18next instance for advanced usage
 */
export { i18next };

// Export types
export type { TranslationKey, TranslationKeys };
