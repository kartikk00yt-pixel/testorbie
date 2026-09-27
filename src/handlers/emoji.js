// : ! Shivay 乂 Development !
// + Discord: vaadiyanl_
// + Community: https://discord.gg/PduCym9ue4 (Shivay 乂 Development)
// + for any queries reach out Community or DM me.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performanceOptimizer } from '../utils/performanceOptimizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EMOJI_PATH = join(__dirname, '../../data/emoji.json');
const EMOJI_CACHE_KEY = 'emojis_data';

const ALIASES = {
  source: 'package',
  menu_icon: 'help',
  link_icon: 'link',
  error: 'cross',
  error_icon: 'cross',
  success: 'check',
  success_icon: 'check',
  warning: 'info',
  warning_icon: 'info',
  sparkle: 'spark',
  phone: 'mobile',
  ios: 'apple',
  search: 'info',
  clock: 'calendar',
  computer: 'desktop',
  heart: 'help',
  chart_icon: 'chart',
  task_icon: 'task',
  calendar_icon: 'calendar',
  gift_icon: 'gift',
  premium_icon: 'premium',
  crown_icon: 'crown',
  red_circle: 'cross',
  circle: 'info',
  timer: 'calendar',
  unlock: 'lock',
  previous: 'arrow',
  next: 'arrow',
  Overview: 'Overview'
};

/**
 * Load emoji data from file (with caching)
 */
function loadEmojisFromFile() {
  try {
    return JSON.parse(readFileSync(EMOJI_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Get emoji from cache or file
 */
export function getEmoji(name) {
  try {
    // Try to get from cache first (fast path - no file I/O!)
    let data = performanceOptimizer.getCache(EMOJI_CACHE_KEY);
    
    // If not in cache, load from file and cache it (1 minute TTL)
    if (!data) {
      data = loadEmojisFromFile();
      performanceOptimizer.setCache(EMOJI_CACHE_KEY, data, 60 * 1000);
    }
    
    return data[name] ?? data[ALIASES[name]] ?? '•';
  } catch {
    return '';
  }
}

export function getAllEmojis() {
  try {
    // Try cache first
    let data = performanceOptimizer.getCache(EMOJI_CACHE_KEY);
    if (!data) {
      data = loadEmojisFromFile();
      performanceOptimizer.setCache(EMOJI_CACHE_KEY, data, 60 * 1000);
    }
    return data;
  } catch {
    return {};
  }
}

export function setEmoji(name, emoji) {
  try {
    const data = loadEmojisFromFile();
    data[name] = emoji;
    writeFileSync(EMOJI_PATH, JSON.stringify(data, null, 2));
    
    // Invalidate cache so next read gets fresh data
    performanceOptimizer.clearCache(EMOJI_CACHE_KEY);
    performanceOptimizer.setCache(EMOJI_CACHE_KEY, data, 60 * 1000);
    return true;
  } catch {
    return false;
  }
}

// : ! Shivay 乂 Development !
// + Discord: vaadiyanl_
// + Community: https://discord.gg/PduCym9ue4 (Shivay 乂 Development)
// + for any queries reach out Community or DM me.
