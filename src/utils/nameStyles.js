import { existsSync, readFileSync, writeFileSync } from 'fs';

const FILE_PATH = 'nameStyles.json';
const MAX_COLOR = 0xFFFFFF;
const FONT_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const EFFECT_IDS = new Set([1, 2, 3, 4, 5, 6]);
const DEFAULT_NAME_STYLE = {
    display_name_font_id: Number(process.env.BOT_NAME_STYLE_FONT_ID || 10),
    display_name_effect_id: Number(process.env.BOT_NAME_STYLE_EFFECT_ID || 3),
    display_name_colors: String(process.env.BOT_NAME_STYLE_COLORS || '#FF7EB3')
        .split(',')
        .map((color) => parseNameStyleColor(color)),
};

function readStyles() {
    if (!existsSync(FILE_PATH)) return {};
    try {
        const data = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
        return {};
    }
}

function writeStyles(styles) {
    writeFileSync(FILE_PATH, JSON.stringify(styles, null, 2), 'utf8');
}

export function parseNameStyleColor(value) {
    const input = String(value ?? '').trim();
    const isHex = input.startsWith('#');
    const raw = input.replace(/^#/, '');
    if (!/^(?:[0-9a-f]{6}|\d{1,8})$/i.test(raw)) return null;
    const color = Number.parseInt(raw, isHex ? 16 : 10);
    return Number.isInteger(color) && color >= 0 && color <= MAX_COLOR ? color : null;
}

export function validateNameStyle(style) {
    const fontId = Number(style?.display_name_font_id);
    const effectId = Number(style?.display_name_effect_id);
    const colors = Array.isArray(style?.display_name_colors) ? style.display_name_colors.map(Number) : [];
    if (!FONT_IDS.has(fontId) || !EFFECT_IDS.has(effectId)) return null;
    if (colors.length < 1 || colors.length > 2 || colors.some((color) => !Number.isInteger(color) || color < 0 || color > MAX_COLOR)) return null;
    if (effectId === 2 && colors.length !== 2) return null;
    return {
        display_name_font_id: fontId,
        display_name_effect_id: effectId,
        display_name_colors: colors,
    };
}

export function getNameStyle(guildId) {
    return validateNameStyle(readStyles()[String(guildId)]);
}

export function getDefaultNameStyle() {
    return validateNameStyle(DEFAULT_NAME_STYLE);
}

export function getStyleForGuild(guildId) {
    const styles = readStyles();
    const key = String(guildId);
    if (Object.hasOwn(styles, key) && styles[key] === null) return null;
    return validateNameStyle(styles[key]) || getDefaultNameStyle();
}

export function setNameStyle(guildId, style) {
    const validStyle = validateNameStyle(style);
    if (!validStyle) return false;
    const styles = readStyles();
    styles[String(guildId)] = validStyle;
    writeStyles(styles);
    return validStyle;
}

export function removeNameStyle(guildId) {
    const styles = readStyles();
    const key = String(guildId);
    const existed = Object.hasOwn(styles, key);
    styles[key] = null;
    writeStyles(styles);
    return existed;
}

export function listNameStyles() {
    return readStyles();
}
