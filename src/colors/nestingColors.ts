import * as vscode from 'vscode';

const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;


const BANDS = [
    { saturation: 75, lightness: 62 }, 
    { saturation: 60, lightness: 50 }, 
] as const;


export function getLevelColor(level: number): string {

    let hue = 0.08;
    for (let i = 0; i < level; i++) {
        hue = (hue + GOLDEN_RATIO_CONJUGATE) % 1;
    }

    const { saturation, lightness } = BANDS[level % BANDS.length];
    return hslToHex(hue * 360, saturation, lightness);
}


export function getLevelColors(count: number, startLevel = 0): string[] {
    return Array.from({ length: count }, (_, i) => getLevelColor(startLevel + i));
}


function hslToHex(h: number, s: number, l: number): string {
    const sn = s / 100;
    const ln = l / 100;
    const a  = sn * Math.min(ln, 1 - ln);

    const f = (n: number): number => {
        const k = (n + h / 30) % 12;
        return ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };

    const toHex = (x: number): string =>
        Math.round(x * 255).toString(16).padStart(2, '0');

    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}





const decorationCache = new Map<number, vscode.TextEditorDecorationType>();


export function getDecorationForLevel(
    level: number,
): vscode.TextEditorDecorationType {
    if (decorationCache.has(level)) {
        return decorationCache.get(level)!;
    }

    const color = getLevelColor(level);
    const dt    = vscode.window.createTextEditorDecorationType({
        overviewRulerColor: color,
        overviewRulerLane:  vscode.OverviewRulerLane.Left,
        backgroundColor:    `${color}18`,   // 9 % opacity fill — same as before
        rangeBehavior:      vscode.DecorationRangeBehavior.ClosedClosed,
        isWholeLine:        true,
    });

    decorationCache.set(level, dt);
    return dt;
}

/**
 * Disposes every cached decoration type.  Call this from your extension's
 * `deactivate()` or from `InlineNoteProvider.dispose()`.
 */
export function disposeAllDecorations(): void {
    for (const dt of decorationCache.values()) {
        dt.dispose();
    }
    decorationCache.clear();
}