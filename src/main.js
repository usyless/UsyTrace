'use strict';

import { createPopup, clearPopups, currentOk } from "./popups.js";
import { state } from "./state.js";
import { INPUT_COMPENSATION } from "./compensation.js";

/** @type {Promise<tesseract_object>} */
const tesseract_worker = new Promise(async (resolve, reject) => {
    try {
        console.time("Initialise Tesseract OCR");
        const tesseract_worker = await Tesseract.createWorker('eng', Tesseract.OEM["LSTM_ONLY"], {
            /** @export */ corePath: './tesseract',
            /** @export */ langPath: './tesseract',
            /** @export */ workerPath: './tesseract/worker.min.js'
        });

        await tesseract_worker.setParameters({
            /** @export */ tessedit_char_whitelist: '0123456789,.kK-+ hzHZdbDBsplSPL',
            /** @export */ tessedit_pageseg_mode: Tesseract.PSM["SPARSE_TEXT"],
            /** @export */ user_defined_dpi: '300',
            /** @export */ preserve_interword_spaces: '1'
        });

        console.timeEnd("Initialise Tesseract OCR");
        resolve(tesseract_worker);
    } catch (error) {
        console.timeEnd("Initialise Tesseract OCR");
        console.error("Failed to load Tesseract OCR:", error);
        reject(error);
    }
});

// Defaults
const defaults = {
    /** @export */ FRHigher: "",
    /** @export */ FRLower: "",

    /** @export */ traceAlgorithm: 0,
    /** @export */ colourTolerance: 67,

    /** @export */ line_move_speed: 100,

    /** @export */ PPO: 48,
    /** @export */ delimitation: "tab",
    /** @export */ inputCompensation: INPUT_COMPENSATION.NONE,
    /** @export */ lowFRExport: 20,
    /** @export */ highFRExport: 20000,

    /** @export */ SPLHigher: "",
    /** @export */ SPLLower: "",

    /** @export */ showOcrDebug: false
}
const MAGNIFICATION = 3;
document.getElementById('restoreDefault')?.addEventListener('click', () => {
    resetToDefault();
    void createPopup("Restored settings to default");
});
function resetToDefault() {
    for (const val in defaults) {
        const elem = document.getElementById(val);
        if (!elem) continue;
        if (elem.type === 'checkbox') elem.checked = defaults[val];
        else elem.value = defaults[val];
    }
    ocrDebug?.update?.();
}

// const global_canvas = 'OffscreenCanvas' in window ? new OffscreenCanvas(0, 0) : document.createElement('canvas');
// if (!global_canvas.toBlob && global_canvas.convertToBlob) {
//     global_canvas.toBlob = function (callback, type, quality) { this.convertToBlob({ type, quality }).then(callback); };
// }

const global_canvas = document.createElement('canvas');
const global_canvas_ctx_2d = global_canvas.getContext('2d');

const global_canvas_2 = document.createElement('canvas');
const global_canvas_ctx_2d_2 = global_canvas_2.getContext('2d');
global_canvas_ctx_2d_2.imageSmoothingEnabled = false;

// safari check
const safari = !('filter' in CanvasRenderingContext2D.prototype);

const safariInverse = () => {
    // should only fire for safari, which does not support 2d context filter
    // i ain't implementing the other filters :serioussssly:
    console.log("Using fallback invert mode");
    const imageData = global_canvas_ctx_2d.getImageData(0, 0, global_canvas.width, global_canvas.height),
        data = imageData.data, l = data.length;
    for (let i = 0; i < l; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
    global_canvas_ctx_2d.putImageData(imageData, 0, 0);
};

// Global Variables
let sizeRatio, width, height, lineWidth, CURRENT_MODE = null, MODE_RESET_CB = null;

const imageMap = new Map();

const LINE_BASE_LABELS = {
    /** @export */ xHigh: 'High',
    /** @export */ xLow: 'Low',
    /** @export */ yHigh: 'High',
    /** @export */ yLow: 'Low'
};

const glass = document.getElementById('glass');
glass.img = glass.querySelector('img');
glass.setColour = (colour) => glass.style.borderColor = `rgb(${colour})`;
glass.updateImage = () => {
    if (image.isValid()) {
        glass.img.src = image.src;
        glass.img.width = image.clientWidth * MAGNIFICATION;
        glass.img.height = image.clientHeight * MAGNIFICATION;
    }
}

const waitingOverlay = {
    createOverlay: () => document.querySelector('.waiting-overlay[data-for="trace"]').classList.add('enabled'),
    removeOverlays: () => document.querySelector('.waiting-overlay[data-for="trace"]').classList.remove('enabled')
}

const lines = {
    parent: document.getElementById('lines'),
    lines: {
        /** @export */ xHigh: document.getElementById('xHigh'),
        /** @export */ xLow: document.getElementById('xLow'),
        /** @export */ yHigh: document.getElementById('yHigh'),
        /** @export */ yLow: document.getElementById('yLow'),
    },
    getTextWidth: (textElem) => {
        try {
            const bbox = textElem.getBBox();
            if (bbox && bbox.width > 0) return bbox.width;
        } catch {}
        const len = (textElem.textContent || '').length;
        return len * 18 * (sizeRatio || 1) * 0.65;
    },
    updateLinePosition: (line, position) => {
        const attr = line.dataset["direction"];
        line.firstElementChild.setAttribute(`${attr}1`, position);
        line.firstElementChild.setAttribute(`${attr}2`, position);
        lines.updateTextPositions();
    },
    updateLineWidth: () => {
        document.getElementById('imageContainerInner').style.setProperty('--overlayScale', sizeRatio.toString());
        lines.updateTextPositions();
    },
    getPosition: (line) => parseFloat(line.firstElementChild.getAttribute(`${line.dataset["direction"]}1`)),
    setPosition: (line, position) => {
        const ls = lines.lines, otherLinePos = lines.getPosition(ls[line.dataset["other"]]), sizeAttr = line.dataset["direction"] === 'x' ? width : height;
        if (line === ls["xHigh"] || line === ls["yLow"]) lines.updateLinePosition(line, Math.max(otherLinePos + 1, Math.min(sizeAttr - 1, position)));
        else lines.updateLinePosition(line, Math.max(1, Math.min(otherLinePos - 1, position)));
        lines.updateLineLabel(line);
    },
    showLines: () => lines.parent.classList.remove('hidden'),
    hideLines: () => lines.parent.classList.add('hidden'), // potentially disable line keybinds
    updateLineLabel: (line) => {
        const baseLabel = LINE_BASE_LABELS[line.id] || (line.id.endsWith('High') ? 'High' : 'Low');
        if (!preferences.showEstimatedValues()) {
            line.lastElementChild.textContent = baseLabel;
            lines.updateTextPositions();
            return;
        }

        if (!image.isValid() || !imageMap.has(image.src)) {
            line.lastElementChild.textContent = `${baseLabel} (N/A)`;
            lines.updateTextPositions();
            return;
        }

        const imgData = imageMap.get(image.src);
        if (!imgData.words || !imgData.words.value) {
            line.lastElementChild.textContent = `${baseLabel} (Loading)`;
            lines.updateTextPositions();
            return;
        }

        if (imgData.words_failed) {
            line.lastElementChild.textContent = `${baseLabel} (N/A)`;
            lines.updateTextPositions();
            return;
        }

        const isX = line.dataset["direction"] === 'x';
        const seq = isX ? imgData.xSeq : imgData.ySeq;
        const pos = lines.getPosition(line);
        const val = interpolateValue(pos, seq, isX, isX);

        if (val === null || !Number.isFinite(val) || (isX && val <= 0)) {
            line.lastElementChild.textContent = `${baseLabel} (N/A)`;
        } else {
            const rounded = Math.round(val * 10) / 10;
            const unit = isX ? 'Hz' : 'dB';
            line.lastElementChild.textContent = `${baseLabel} (${rounded} ${unit})`;
        }
        lines.updateTextPositions();
    },
    updateLabels: () => {
        for (const line of lines.lineArray) {
            lines.updateLineLabel(line);
        }
    },
    updateTextPositions: () => {
        if (!width || !height) return;
        const scale = sizeRatio || 1;
        const pad = 8 * scale;
        const textH = 22 * scale;
        const offsetPx = 0.7 * 18 * scale;

        const xLowLine = lines.lines["xLow"];
        const xHighLine = lines.lines["xHigh"];
        const yHighLine = lines.lines["yHigh"];
        const yLowLine = lines.lines["yLow"];

        if (!xLowLine || !xHighLine || !yHighLine || !yLowLine) return;

        const xLowPos = lines.getPosition(xLowLine);
        const xHighPos = lines.getPosition(xHighLine);
        const yHighPos = lines.getPosition(yHighLine);
        const yLowPos = lines.getPosition(yLowLine);

        if (isNaN(xLowPos) || isNaN(xHighPos) || isNaN(yHighPos) || isNaN(yLowPos)) return;

        const xLowText = xLowLine.lastElementChild;
        const xHighText = xHighLine.lastElementChild;
        const yHighText = yHighLine.lastElementChild;
        const yLowText = yLowLine.lastElementChild;

        const wXLow = lines.getTextWidth(xLowText);
        const wXHigh = lines.getTextWidth(xHighText);
        const wYHigh = lines.getTextWidth(yHighText);
        const wYLow = lines.getTextWidth(yLowText);

        const midX = (xLowPos + xHighPos) / 2;
        const midY = (yHighPos + yLowPos) / 2;

        let xYHigh = Math.max(wYHigh / 2 + pad, Math.min(width - wYHigh / 2 - pad, midX));
        let xYLow = Math.max(wYLow / 2 + pad, Math.min(width - wYLow / 2 - pad, midX));

        const vGap = yLowPos - yHighPos;
        const yHighSpaceAbove = yHighPos - pad;
        const yLowSpaceBelow = height - yLowPos - pad;

        let yHighDy = "1.3em";
        let yLowDy = "-0.7em";
        let yHighBelow = true;
        let yLowAbove = true;

        const minVGap = textH * 2.2;
        if (vGap < minVGap) {
            if (yHighSpaceAbove >= textH) {
                yHighDy = "-0.7em";
                yHighBelow = false;
            }
            if (yLowSpaceBelow >= textH) {
                yLowDy = "1.3em";
                yLowAbove = false;
            }
        }

        if (yHighBelow && yHighPos + textH + pad > height && yHighSpaceAbove >= textH) {
            yHighDy = "-0.7em";
            yHighBelow = false;
        }
        if (yLowAbove && yLowPos - textH - pad < 0 && yLowSpaceBelow >= textH) {
            yLowDy = "1.3em";
            yLowAbove = false;
        }

        if (yHighBelow === !yLowAbove) {
            const stagger = Math.max(wYHigh, wYLow) * 0.55;
            xYHigh = Math.max(wYHigh / 2 + pad, Math.min(width - wYHigh / 2 - pad, midX - stagger));
            xYLow = Math.max(wYLow / 2 + pad, Math.min(width - wYLow / 2 - pad, midX + stagger));
        }

        yHighText.setAttribute('x', xYHigh.toString());
        yHighText.setAttribute('y', yHighPos.toString());
        yHighText.setAttribute('dy', yHighDy);
        yHighText.setAttribute('text-anchor', 'middle');

        yLowText.setAttribute('x', xYLow.toString());
        yLowText.setAttribute('y', yLowPos.toString());
        yLowText.setAttribute('dy', yLowDy);
        yLowText.setAttribute('text-anchor', 'middle');

        let yXLow = Math.max(textH / 2 + pad, Math.min(height - textH / 2 - pad, midY));
        let yXHigh = Math.max(textH / 2 + pad, Math.min(height - textH / 2 - pad, midY));

        const hGap = xHighPos - xLowPos;
        const xLowSpaceLeft = xLowPos - pad;
        const xHighSpaceRight = width - xHighPos - pad;

        let xLowDx = "0.7em";
        let xLowAnchor = "start";
        let xLowRight = true;

        let xHighDx = "-0.7em";
        let xHighAnchor = "end";
        let xHighLeft = true;

        const minHGap = wXLow + wXHigh + offsetPx * 2 + pad;
        if (hGap < minHGap) {
            if (xLowSpaceLeft >= wXLow + offsetPx) {
                xLowDx = "-0.7em";
                xLowAnchor = "end";
                xLowRight = false;
            }
            if (xHighSpaceRight >= wXHigh + offsetPx) {
                xHighDx = "0.7em";
                xHighAnchor = "start";
                xHighLeft = false;
            }
        }

        if (xLowRight && xLowPos + offsetPx + wXLow + pad > width && xLowSpaceLeft >= wXLow + offsetPx) {
            xLowDx = "-0.7em";
            xLowAnchor = "end";
            xLowRight = false;
        }
        if (xHighLeft && xHighPos - offsetPx - wXHigh - pad < 0 && xHighSpaceRight >= wXHigh + offsetPx) {
            xHighDx = "0.7em";
            xHighAnchor = "start";
            xHighLeft = false;
        }

        const xLowMinX = xLowRight ? xLowPos : xLowPos - offsetPx - wXLow;
        const xLowMaxX = xLowRight ? xLowPos + offsetPx + wXLow : xLowPos;
        const xHighMinX = xHighLeft ? xHighPos - offsetPx - wXHigh : xHighPos;
        const xHighMaxX = xHighLeft ? xHighPos : xHighPos + offsetPx + wXHigh;

        const hOverlap = Math.max(0, Math.min(xLowMaxX, xHighMaxX) - Math.max(xLowMinX, xHighMinX));
        if (hOverlap > 0) {
            const staggerY = textH * 1.1;
            yXLow = Math.max(textH / 2 + pad, Math.min(height - textH / 2 - pad, midY - staggerY));
            yXHigh = Math.max(textH / 2 + pad, Math.min(height - textH / 2 - pad, midY + staggerY));
        }

        xLowText.setAttribute('x', xLowPos.toString());
        xLowText.setAttribute('y', yXLow.toString());
        xLowText.setAttribute('dx', xLowDx);
        xLowText.setAttribute('text-anchor', xLowAnchor);

        xHighText.setAttribute('x', xHighPos.toString());
        xHighText.setAttribute('y', yXHigh.toString());
        xHighText.setAttribute('dx', xHighDx);
        xHighText.setAttribute('text-anchor', xHighAnchor);
    },
    initialiseTextPosition: () => {
        lines.updateTextPositions();
    },
    initialise: () => {
        for (const line of lines.lineArray) {
            const [otherDir, sizeAttr] = line.dataset["direction"] === 'x' ? ['y', height] : ['x', width];
            line.firstElementChild.setAttribute(`${otherDir}1`, "0");
            line.firstElementChild.setAttribute(`${otherDir}2`, sizeAttr);
        }
        lines.updateLabels();
    },
    fixPositioning: () => {
        // need to make sure snapped lines aren't bad
        if (lines.getPosition(lines.lines["xHigh"]) < width * 0.2) {
            lines.setPosition(lines.lines["xHigh"], width);
        }
        if (lines.getPosition(lines.lines["xLow"]) > width * 0.8) {
            lines.setPosition(lines.lines["xLow"], 0);
        }
        if (lines.getPosition(lines.lines["yHigh"]) > height * 0.8) {
            lines.setPosition(lines.lines["yHigh"], 0);
        }
        if (lines.getPosition(lines.lines["yLow"]) < height * 0.2) {
            lines.setPosition(lines.lines["yLow"], height);
        }
    }
}
lines.lineArray = [lines.lines["xHigh"], lines.lines["xLow"], lines.lines["yHigh"], lines.lines["yLow"]];

const erasing = {
    show: () => {
        erasing.elem.classList.remove('hidden');
        erasing.svg.setAttributeNS(null, 'width', '0');
    },
    hide: () => {
        document.getElementById('erasing').classList.add('hidden');
    },
    begin: (x) => {
        erasing.show();
        erasing.x = Math.max(Math.min(+x, width), 0);
        erasing.svg.setAttributeNS(null, 'x', x);
    },
    move: (x) => {
        x = +x;
        if (x < erasing.x) {
            erasing.svg.setAttributeNS(null, 'width', `${erasing.x - x}px`);
            erasing.svg.setAttributeNS(null, 'x', x);
        } else {
            erasing.svg.setAttributeNS(null, 'width', `${x - erasing.x}px`);
            erasing.svg.setAttributeNS(null, 'x', (erasing.x).toString());
        }
    },
    finish: (x) => {
        x = Math.max(Math.min(+x, width), 0);
        worker.eraseRegion(...(erasing.x < x) ? [erasing.x, x] : [x, erasing.x]);
        erasing.svg.setAttributeNS(null, 'width', '0');
    },
    init: () => {
        erasing.elem = document.getElementById('erasing');
        erasing.svg = erasing.elem.firstElementChild;
    }
}
erasing.init();

const ocrDebug = {
    elem: document.getElementById('ocrDebug'),
    show: () => {
        ocrDebug.elem?.classList.remove('hidden');
        ocrDebug.update();
    },
    hide: () => {
        ocrDebug.elem?.classList.add('hidden');
    },
    clear: () => {
        ocrDebug.elem?.replaceChildren();
    },
    update: () => {
        if (!preferences.showOcrDebug()) {
            ocrDebug.hide();
            return;
        }
        ocrDebug.elem?.classList.remove('hidden');
        if (!image.isValid() || !imageMap.has(image.src)) {
            ocrDebug.clear();
            return;
        }
        const imgData = imageMap.get(image.src);
        if (!imgData || !imgData.words || !imgData.words.value || imgData.words_failed) {
            ocrDebug.clear();
            return;
        }
        if (imgData.cachedWords) {
            ocrDebug.render(imgData, imgData.cachedWords);
        } else if (imgData.words.promise) {
            imgData.words.promise.then((words) => {
                if (image.src === imgData.src) {
                    ocrDebug.render(imgData, words);
                }
            }).catch(() => ocrDebug.clear());
        }
    },
    render: (imgData, wordsData) => {
        if (!preferences.showOcrDebug()) {
            ocrDebug.hide();
            return;
        }
        ocrDebug.elem?.classList.remove('hidden');
        ocrDebug.clear();

        const words = wordsData || imgData?.cachedWords;
        if (!words || !Array.isArray(words)) return;

        const xSeqWords = new Set((imgData.xSeq || []).map(item => item['word']));
        const ySeqWords = new Set((imgData.ySeq || []).map(item => item['word']));

        const scale = sizeRatio || 1;
        const fragment = document.createDocumentFragment();

        for (const word of words) {
            const bbox = word['bbox'];
            if (!bbox) continue;

            const x0 = bbox['x0'];
            const y0 = bbox['y0'];
            const w = bbox['x1'] - x0;
            const h = bbox['y1'] - y0;
            const rawText = word['text'] || '';
            const parsedVal = parseTesseractText(rawText);

            const isXSeq = xSeqWords.has(word);
            const isYSeq = ySeqWords.has(word);

            let groupClass = 'ocrBoxIgnored';
            let labelText = '';

            if (isXSeq) {
                groupClass = 'ocrBoxUsedX';
                labelText = `X: "${rawText}" → ${parsedVal}`;
            } else if (isYSeq) {
                groupClass = 'ocrBoxUsedY';
                labelText = `Y: "${rawText}" → ${parsedVal}`;
            } else if (parsedVal !== null) {
                groupClass = 'ocrBoxUnusedParsed';
                labelText = `Unused: "${rawText}" → ${parsedVal}`;
            } else {
                groupClass = 'ocrBoxIgnored';
                labelText = `Ignored: "${rawText}" → N/A`;
            }

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', `ocrDebugGroup ${groupClass}`);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x0.toString());
            rect.setAttribute('y', y0.toString());
            rect.setAttribute('width', Math.max(1, w).toString());
            rect.setAttribute('height', Math.max(1, h).toString());

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const textY = (y0 > 14 * scale) ? y0 - 3 * scale : y0 + h + 11 * scale;
            text.setAttribute('x', x0.toString());
            text.setAttribute('y', textY.toString());
            text.textContent = labelText;

            g.append(rect, text);
            fragment.appendChild(g);
        }

        ocrDebug.elem?.appendChild(fragment);
    }
};

/** @type {HTMLImageElement & {
 * getMouseCoords: (MouseEvent) => any,
 * isValid: () => boolean,
 * saveLines: (any) => void,
 * loadLines: (any) => void,
 * saveExportOptions: (any) => void,
 * loadExportOptions: (any) => void,
 * saveImage: () => void,
 * loadImage: () => void
 }} */
const image = document.getElementById('uploadedImage');
image.getMouseCoords = (e) => {
    const r = image.getBoundingClientRect(), x = e.clientX, y = e.clientY;
    return {
        /** @export */ x,
        /** @export */ y,
        /** @export */ xRel: x - r.left,
        /** @export */ yRel: y - r.top
    }
}
image.isValid = () => image.src.startsWith('blob:');
image.saveLines = (imageMapData) => {
    const lineData = {};
    for (const name in lines.lines) lineData[name] = lines.getPosition(lines.lines[name]);
    imageMapData.lines = lineData;
}
image.loadLines = (imageMapData) => {
    const prev = imageMapData.lines;
    for (const name in lines.lines) lines.setPosition(lines.lines[name], prev[name]);
    lines.initialise();
    lines.showLines();
}

image.saveExportOptions = (imageMapData) => {
    const opts = imageMapData.exportOptions;
    for (const name in opts) {
        opts[name] = document.getElementById(name)?.value;
    }
}

image.loadExportOptions = (imageMapData) => {
    const opts = imageMapData.exportOptions;
    for (const name in opts) {
        document.getElementById(name).value = opts[name];
    }
}

image.saveImage = () => {
    const data = imageMap.get(image.src);
    if (!data) return;
    image.saveLines(data);
    image.saveExportOptions(data);
}

image.loadImage = () => {
    const data = imageMap.get(image.src);
    if (!data) return; // shouldnt ever happen??
    image.loadLines(data);
    image.loadExportOptions(data);
}

const preferences = (() => {
    const e_SPLHigher = document.getElementById('SPLHigher');
    const e_SPLLower = document.getElementById('SPLLower');
    const e_FRHigher = document.getElementById('FRHigher');
    const e_FRLower = document.getElementById('FRLower');
    const e_snapToLines = document.getElementById('snapToLines');
    const e_showEstimatedValues = document.getElementById('showEstimatedValues');
    const e_showOcrDebug = document.getElementById('showOcrDebug');
    const e_line_move_speed = document.getElementById('line_move_speed');
    const e_traceAlgorithm = document.getElementById('traceAlgorithm');
    const e_colourTolerance = document.getElementById('colourTolerance');
    const e_PPO = document.getElementById('PPO');
    const e_delimitation = document.getElementById('delimitation');
    const e_inputCompensation = document.getElementById('inputCompensation');
    const e_lowFRExport = document.getElementById('lowFRExport');
    const e_highFRExport = document.getElementById('highFRExport');

    return {
        SPLHigher: () => e_SPLHigher.value,
        SPLLower: () => e_SPLLower.value,
        FRHigher: () => e_FRHigher.value,
        FRLower: () => e_FRLower.value,

        snapToLines: () => e_snapToLines.checked,
        showEstimatedValues: () => e_showEstimatedValues.checked,
        showOcrDebug: () => e_showOcrDebug.checked,
        line_move_speed: () => parseInt(e_line_move_speed.value, 10) || defaults.line_move_speed,

        traceAlgorithm: () => parseInt(e_traceAlgorithm.value, 10) || defaults.traceAlgorithm,
        colourTolerance: () => parseInt(e_colourTolerance.value, 10) || defaults.colourTolerance,

        PPO: () => e_PPO.value || defaults.PPO,
        delimitation: () => e_delimitation.value || defaults.delimitation,
        inputCompensation: () => e_inputCompensation.value || defaults.inputCompensation,
        lowFRExport: () => e_lowFRExport.value || defaults.lowFRExport,
        highFRExport: () => e_highFRExport.value || defaults.highFRExport,
    };
})();

const indefinitePopup = (message) => {
    createPopup(message).then(_ => indefinitePopup(message)).catch(_ => indefinitePopup(message));
}

const buttons = {
    resetButtons: () => {
        for (const b of document.querySelectorAll('#sidebar [data-default]')) b.textContent = b.dataset["default"]
        CURRENT_MODE = null;
        MODE_RESET_CB?.();
    },
    enableButtons: () => {
        for (const b of document.querySelectorAll('[data-disabled]')) b.disabled = false;
    },
    disableButtons: () => {
        for (const b of document.querySelectorAll('[data-disabled]')) b.disabled = true;
    },
    toggleHistory: (data) => {
        document.getElementById('undo').disabled = !data["undo"];
        document.getElementById('redo').disabled = !data["redo"];
    }
}
{ // Handling modes with buttons
    const MODE_BUTTON_IDS = ['selectPath', 'selectPoint', 'eraseRegion'];
    const ENABLE_CALLBACK = {
        /** @export */ path: lines.hideLines,
        /** @export */ point: lines.hideLines,
        /** @export */ erase: () => {
            lines.hideLines();
            erasing.show();
        }
    }
    const DISABLE_CALLBACK = {
        /** @export */ path: lines.showLines,
        /** @export */ point: lines.showLines,
        /** @export */ erase: () => {
            erasing.hide();
            lines.showLines();
        }
    }
    const cb = (e) => {
        const button = e.target, mode = button.dataset["mode"], previousMode = JSON.parse(JSON.stringify(CURRENT_MODE));
        buttons.resetButtons();
        if (previousMode === mode) {
            MODE_RESET_CB?.();
            CURRENT_MODE = null;
        } else {
            button.textContent = button.dataset["active"];
            MODE_RESET_CB?.();
            MODE_RESET_CB = DISABLE_CALLBACK[mode];
            CURRENT_MODE = mode;
            ENABLE_CALLBACK[mode]();
        }
    }

    for (const button of MODE_BUTTON_IDS) document.getElementById(button).addEventListener('click', cb);
}

const parseTesseractText = (text) => {
    let cleaned = text.toLowerCase().trim();

    if (cleaned.endsWith('hz')) cleaned = cleaned.slice(0, -2);
    if (cleaned.endsWith('spl')) cleaned = cleaned.slice(0, -3);
    if (cleaned.endsWith('db')) cleaned = cleaned.slice(0, -2);

    const hasK = cleaned.endsWith('k');
    if (hasK) cleaned = cleaned.slice(0, -1);

    cleaned = cleaned.replace(/\s+/g, '');

    if (/[.,]\d{3}$/.test(cleaned)) { // if followed by 3 digits, just remove
        cleaned = cleaned.replace(/[.,]/g, '');
    } else {
        cleaned = cleaned.replace(/,/g, '.'); // replace all comma by dot for parsing
    }

    const val = parseFloat(cleaned);
    return isNaN(val) ? null : (hasK ? val * 1000 : val);
};

const splitOcrWords = (rawWords) => {
    const result = [];

    for (const rawWord of rawWords) {
        if (!rawWord || !rawWord['bbox']) continue;

        rawWord['bbox']['x0'] /= 2.5;
        rawWord['bbox']['x1'] /= 2.5;
        rawWord['bbox']['y0'] /= 2.5;
        rawWord['bbox']['y1'] /= 2.5;

        const symbols = rawWord['symbols'];
        if (Array.isArray(symbols) && symbols.length > 0) {
            for (const sym of symbols) {
                if (sym && sym['bbox']) {
                    sym['bbox']['x0'] /= 2.5;
                    sym['bbox']['x1'] /= 2.5;
                    sym['bbox']['y0'] /= 2.5;
                    sym['bbox']['y1'] /= 2.5;
                }
            }

            const clusters = [];
            let currentCluster = [];

            for (let i = 0; i < symbols.length; i++) {
                const sym = symbols[i];
                if (!sym) continue;
                const symText = sym['text'] || '';

                if (symText.trim() === '') {
                    if (currentCluster.length > 0) {
                        clusters.push(currentCluster);
                        currentCluster = [];
                    }
                    continue;
                }

                if (currentCluster.length > 0) {
                    const prevSym = currentCluster[currentCluster.length - 1];
                    const prevText = prevSym['text'] || '';
                    const gap = (sym['bbox'] && prevSym['bbox']) ? (sym['bbox']['x0'] - prevSym['bbox']['x1']) : 0;
                    const prevW = prevSym['bbox'] ? (prevSym['bbox']['x1'] - prevSym['bbox']['x0']) : 10;
                    const prevH = prevSym['bbox'] ? (prevSym['bbox']['y1'] - prevSym['bbox']['y0']) : 12;

                    const isDot = (t) => t === '.' || t === ',';
                    const isDigit = (t) => /[0-9]/.test(t);
                    const isDecimal = (isDot(prevText) && isDigit(symText)) || (isDigit(prevText) && isDot(symText));

                    const isLargeGap = !isDecimal && (gap > Math.max(8, prevW * 1.1, prevH * 0.6));
                    const isUnitBoundary = /[kK]/i.test(prevText) && /[0-9+\-]/.test(symText);
                    const isSignBoundary = /[+\-]/.test(symText) && /[0-9kK]/i.test(prevText);

                    if (isLargeGap || isUnitBoundary || isSignBoundary) {
                        clusters.push(currentCluster);
                        currentCluster = [];
                    }
                }

                currentCluster.push(sym);
            }

            if (currentCluster.length > 0) {
                clusters.push(currentCluster);
            }

            if (clusters.length > 1) {
                for (const cluster of clusters) {
                    const validBboxes = cluster.filter(s => s && s['bbox']);
                    if (validBboxes.length === 0) continue;
                    const clusterText = cluster.map(s => s['text'] || '').join('').trim();
                    if (!clusterText) continue;

                    const x0 = Math.min(...validBboxes.map(s => s['bbox']['x0']));
                    const y0 = Math.min(...validBboxes.map(s => s['bbox']['y0']));
                    const x1 = Math.max(...validBboxes.map(s => s['bbox']['x1']));
                    const y1 = Math.max(...validBboxes.map(s => s['bbox']['y1']));
                    const confidence = Math.round(cluster.reduce((sum, s) => sum + (s['confidence'] || rawWord['confidence'] || 80), 0) / cluster.length);

                    result.push({
                        /** @export */ text: clusterText,
                        /** @export */ bbox: {
                            /** @export */ x0: x0,
                            /** @export */ y0: y0,
                            /** @export */ x1: x1,
                            /** @export */ y1: y1
                        },
                        /** @export */ confidence: confidence,
                        /** @export */ symbols: cluster
                    });
                }
                continue;
            }
        }

        const rawText = (rawWord['text'] || '').trim();
        const matches = [...rawText.matchAll(/[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[kK](?:Hz)?)?|[^\s0-9.,kK\-+]+/g)];

        if (matches.length > 1) {
            const w = rawWord['bbox']['x1'] - rawWord['bbox']['x0'];
            const len = Math.max(1, rawText.length);

            for (const match of matches) {
                const tokenText = match[0].trim();
                if (!tokenText) continue;
                const startIdx = match.index || 0;
                const endIdx = startIdx + tokenText.length;

                result.push({
                    /** @export */ text: tokenText,
                    /** @export */ bbox: {
                        /** @export */ x0: rawWord['bbox']['x0'] + (startIdx / len) * w,
                        /** @export */ y0: rawWord['bbox']['y0'],
                        /** @export */ x1: rawWord['bbox']['x0'] + (endIdx / len) * w,
                        /** @export */ y1: rawWord['bbox']['y1']
                    },
                    /** @export */ confidence: rawWord['confidence'] || 80
                });
            }
        } else {
            result.push(rawWord);
        }
    }

    return result;
};

const extractOcrNumbers = (word_data) => {
    return word_data.map((word) => ({
        /** @export */ val: parseTesseractText(word['text']),
        /** @export */ cx: (word['bbox']['x0'] + word['bbox']['x1']) / 2,
        /** @export */ cy: (word['bbox']['y0'] + word['bbox']['y1']) / 2,
        /** @export */ confidence: word['confidence'],
        /** @export */ rawText: word['text'],
        /** @export */ bbox: word['bbox'],
        /** @export */ word: word
    })).filter(w => (w['val'] != null) && (w['confidence'] >= 70));
};

const findBestSequence = (ocrNumbers, isXAxis, isLog) => {
    const alignKey = isXAxis ? 'cy' : 'cx';
    const sortKey = isXAxis ? 'cx' : 'cy';
    const alignTolerance = isXAxis ? 25 : 40;

    const groups = [];
    for (const num of ocrNumbers) {
        let placed = false;
        for (const group of groups) {
            const avgAlign = group.reduce((sum, n) => sum + n[alignKey], 0) / group.length;
            if (Math.abs(num[alignKey] - avgAlign) <= alignTolerance) {
                group.push(num);
                placed = true;
                break;
            }
        }
        if (!placed) groups.push([num]);
    }

    let bestSeq = null;
    let maxScore = -1;

    for (const group of groups) {
        if (group.length < 2) continue;
        group.sort((a, b) => a[sortKey] - b[sortKey]);

        const validGroup = group.filter(p => !(isLog && p['val'] <= 0));
        const len = validGroup.length;
        if (len < 2) continue;

        for (let i = 0; i < len; ++i) {
            for (let j = i + 1; j < len; ++j) {
                const p1 = validGroup[i];
                const p2 = validGroup[j];
                const pxDiff = p2[sortKey] - p1[sortKey];

                if (pxDiff < 8) continue;

                const y1 = isLog ? Math.log10(p1['val']) : p1['val'];
                const y2 = isLog ? Math.log10(p2['val']) : p2['val'];
                const slope = (y2 - y1) / pxDiff;

                if (isXAxis && slope <= 0) continue;
                if (!isXAxis && slope >= 0) continue;

                const intercept = y1 - slope * p1[sortKey];

                const inliers = [];
                let lastVal = null;
                let lastPx = null;

                for (let k = 0; k < len; ++k) {
                    const cand = validGroup[k];
                    const candPx = cand[sortKey];
                    const candVal = cand['val'];
                    const candY = isLog ? Math.log10(candVal) : candVal;

                    const expectedPx = (candY - intercept) / slope;
                    const pxError = Math.abs(candPx - expectedPx);

                    if (pxError <= 6.0) {
                        if (lastVal !== null) {
                            if (candPx <= lastPx) continue;
                            if (isXAxis && candVal <= lastVal) continue;
                            if (!isXAxis && candVal >= lastVal) continue;
                        }
                        inliers.push(cand);
                        lastVal = candVal;
                        lastPx = candPx;
                    }
                }

                if (inliers.length >= 2) {
                    const spread = inliers[inliers.length - 1][sortKey] - inliers[0][sortKey];
                    const score = (inliers.length * 1000) + spread;
                    if (score > maxScore) {
                        maxScore = score;
                        bestSeq = inliers;
                    }
                }
            }
        }
    }
    return bestSeq;
};

const interpolateValue = (pixelTarget, sequence, isXAxis, isLog) => {
    if (!sequence || sequence.length < 2) return null;

    const sortKey = isXAxis ? 'cx' : 'cy';
    const sorted = [...sequence].sort((a, b) => a[sortKey] - b[sortKey]);

    const interpSeg = (p1, p2) => {
        const px1 = p1[sortKey], px2 = p2[sortKey];
        const v1 = p1['val'], v2 = p2['val'];
        if (px1 === px2) return v1;

        const frac = (pixelTarget - px1) / (px2 - px1);
        if (isLog) {
            if (v1 <= 0 || v2 <= 0) return null;
            const logV1 = Math.log10(v1);
            const logV2 = Math.log10(v2);
            return Math.pow(10, logV1 + frac * (logV2 - logV1));
        } else {
            return v1 + frac * (v2 - v1);
        }
    };

    if (pixelTarget <= sorted[0][sortKey]) {
        return interpSeg(sorted[0], sorted[1]);
    }
    if (pixelTarget >= sorted[sorted.length - 1][sortKey]) {
        return interpSeg(sorted[sorted.length - 2], sorted[sorted.length - 1]);
    }

    for (let i = 0; i < sorted.length - 1; i++) {
        if (pixelTarget >= sorted[i][sortKey] && pixelTarget <= sorted[i + 1][sortKey]) {
            return interpSeg(sorted[i], sorted[i + 1]);
        }
    }

    return null;
};

const worker = {
    worker: (() => {
        const w = new Worker("./usytrace.js", {type: 'module'});
        w.onmessage = (data) => {
            data = data["data"];
            const type = data["type"];

            switch (type) {
                case 'exportTrace': {
                    const content = document.createElement('div'),
                        inner = document.createElement('div'),
                        input = document.createElement('input');
                    inner.textContent = "Export file name";
                    input.placeholder = "trace";
                    input.type = 'text';
                    input.classList.add('sidebarSection');
                    content.append(inner, input);
                    content.classList.add('exportBox');
                    content.serialise = () => input.value;

                    createPopup(content, {buttons: "Save Trace", listeners: [
                            {
                                target: document, type: 'keydown', listener: (e) => {
                                    if (e.key.toLowerCase() === 'enter') currentOk.click();
                                }
                            }
                        ]}).then((r) => {
                        if (r !== false) {
                            const a = document.createElement("a");
                            const url = URL.createObjectURL(new Blob([data["export"]], {
                                /** @export */ type: "text/csv;charset=utf-8"
                            }));
                            a.href = url;
                            a.classList.add('hidden');
                            document.body.appendChild(a);

                            if (!(r?.endsWith(".csv")) && (r?.length > 0)) r += ".csv";
                            a.download = r || "trace.csv";
                            a.click();

                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            }, 5000);
                        }
                    });
                    setTimeout(() => {
                        input.focus();
                    }, 50);
                    break;
                }
                case 'error': {
                    waitingOverlay.removeOverlays();
                    indefinitePopup(data["message"]);
                    break;
                }
                case 'getHistoryStatus': {
                    buttons.toggleHistory(data);
                    break;
                }
                case 'setData': {
                    console.timeEnd(`Initialise image ${data["image_id"]}`);
                    break;
                }
                case 'needsInverse': {
                    const src = data["src"];
                    const imageData = imageMap.get(src);
                    if (!imageData) return; // idk how

                    const needsInverse = data["inverse"];

                    Promise.all([tesseract_worker, imageData.bitmap]).then(([t, bitmap]) => {
                        const label = `Initialise image ${++tesseract_id} OCR`;
                        console.time(label);

                        if (needsInverse) {
                            global_canvas.width = imageData.width;
                            global_canvas.height = imageData.height;

                            console.log('Inversing image for tesseract');
                            if (!safari) global_canvas_ctx_2d.filter = 'invert(100%)';
                            global_canvas_ctx_2d.drawImage(bitmap, 0, 0);
                            if (!safari) global_canvas_ctx_2d.filter = 'none';

                            if (safari) safariInverse();

                            global_canvas_2.width = imageData.width * 2.5;
                            global_canvas_2.height = imageData.height * 2.5;

                            global_canvas_ctx_2d_2.drawImage(global_canvas, 0, 0, imageData.width * 2.5, imageData.height * 2.5);

                            global_canvas.width = 0;
                            global_canvas.height = 0;
                        } else {
                            global_canvas_2.width = imageData.width * 2.5;
                            global_canvas_2.height = imageData.height * 2.5;

                            global_canvas_ctx_2d_2.drawImage(bitmap, 0, 0, imageData.width * 2.5, imageData.height * 2.5);
                        }
                        bitmap.close();
                        delete imageData.bitmap;

                        return t.recognize(global_canvas_2, {}, {
                            /** @export */ blocks: true,
                            /** @export */ text: false,
                        }).then((d) => {
                            global_canvas_2.width = 0;
                            global_canvas_2.height = 0;

                            console.timeEnd(label);
                            const rawWords = d["data"]["blocks"].map((b) => b["paragraphs"].map((p) => p["lines"].map((l) => l["words"]))).flat(3);
                            const words = splitOcrWords(rawWords);
                            console.log('Words detected in image: ', words);
                            imageData.cachedWords = words;
                            imageData.words.value = true;
                            imageData.words.resolve_(words);
                            const ocrNumbers = extractOcrNumbers(words);
                            imageData.xSeq = findBestSequence(ocrNumbers, true, true);
                            imageData.ySeq = findBestSequence(ocrNumbers, false, false);
                            if (image.src === src) {
                                lines.updateLabels();
                                ocrDebug.render(imageData, words);
                            }
                        });
                    }).catch((err) => {
                        global_canvas_2.width = 0;
                        global_canvas_2.height = 0;
                        console.log('Error detecting words in image: ', err);
                        imageData.words.value = true;
                        imageData.words_failed = true;
                        imageData.words.reject_(err);
                        if (image.src === src) {
                            lines.updateLabels();
                            ocrDebug.clear();
                        }
                    });
                    break;
                }
                default: {
                    if (image.src === data["src"]) {
                        if (type === 'getPixelColour') glass.setColour(data["pixelColour"]);
                        else if (type === 'snapLine') {
                            lines.setPosition(lines.lines[data["line"]["name"]], data["line"]["position"]);
                            if (data["final"]) lines.fixPositioning();
                        }
                        else {
                            graphs.setTracePath(data["svg"]);
                            waitingOverlay.removeOverlays();
                            worker.postMessage({
                                /** @export */ type: 'getHistoryStatus'
                            });
                        }
                        break;
                    }
                }
            }
        }
        return w;
    })(),
    postMessage: (data) => image.isValid() && worker.worker.postMessage({
        /** @export */ src: image.src, ...data
    }),
    setCurrent: () => worker.postMessage({
        /** @export */ type: 'setCurrent'
    }),
    removeImage: (src) => worker.postMessage({
        /** @export */ type: 'removeImage',
        /** @export */ src: src
    }),
    addImage: (width, height, image_id) => {
        global_canvas.width = width;
        global_canvas.height = height;
        global_canvas_ctx_2d.drawImage(image, 0, 0);
        const imageData = global_canvas_ctx_2d.getImageData(0, 0, width, height);
        worker.worker.postMessage({
            /** @export */ src: image.src, // use postMessage directly to pass buffer properly
            /** @export */ type: 'setData',
            /** @export */ data: imageData.data,
            /** @export */ width,
            /** @export */ height,
            /** @export */ image_id,
        }, [imageData.data.buffer]);

        global_canvas.width = 0;
        global_canvas.height = 0;
    },
    needsInverse: (src) => worker.postMessage({
        /** @export */ type: 'needsInverse',
        /** @export */ src
    }),
    clearTrace: () => worker.postMessage({
        /** @export */ type: 'clearTrace'
    }),
    undoTrace: () => worker.postMessage({
        /** @export */ type: 'undoTrace'
    }),
    redoTrace: () => worker.postMessage({
        /** @export */ type: 'redoTrace'
    }),
    eraseRegion: (begin, end) => worker.postMessage({
        /** @export */ type: 'eraseRegion',
        /** @export */ begin,
        /** @export */ end
    }),
    smoothTrace: () => worker.postMessage({
        /** @export */ type: 'smoothTrace'
    }),
    exportTrace: () => {
        const hasNullOrEmpty = (obj) =>
            Object.values(obj).some(v => (v && typeof v === 'object') ? hasNullOrEmpty(v) : v == null || v === '');

        const data = {
            /** @export */ type: 'exportTrace',
            /** @export */ PPO: preferences.PPO(),
            /** @export */ delim: preferences.delimitation(),
            /** @export */ inputCompensation: preferences.inputCompensation(),
            /** @export */ lowFR: preferences.lowFRExport(),
            /** @export */ highFR: preferences.highFRExport(),
            /** @export */ SPL: {
                /** @export */ top: preferences.SPLHigher(),
                /** @export */ topPixel: lines.getPosition(lines.lines["yHigh"]),
                /** @export */ bottom: preferences.SPLLower(),
                /** @export */ bottomPixel: lines.getPosition(lines.lines["yLow"])
            },
            /** @export */ FR: {
                /** @export */ top: preferences.FRHigher(),
                /** @export */ topPixel: lines.getPosition(lines.lines["xHigh"]),
                /** @export */ bottom: preferences.FRLower(),
                /** @export */ bottomPixel: lines.getPosition(lines.lines["xLow"]),
            }
        }
        if (hasNullOrEmpty(data)) void createPopup("Please fill in all required values to export (SPL and FR values)");
        else {
            const words = imageMap.get(image.src).words;

            const on_words = (word_data) => {
                if (word_data.length === 0) {
                    worker.postMessage(data);
                    return;
                }

                const imgData = imageMap.get(image.src);
                let xSeq = imgData?.xSeq;
                let ySeq = imgData?.ySeq;
                if (!xSeq || !ySeq) {
                    const ocrNumbers = extractOcrNumbers(word_data);
                    xSeq = xSeq || findBestSequence(ocrNumbers, true, true);
                    ySeq = ySeq || findBestSequence(ocrNumbers, false, false);
                }

                const bounds = [
                    { name: 'FR High', userVal: data.FR.top, ocrVal: interpolateValue(data.FR.topPixel, xSeq, true, true), isLog: true },
                    { name: 'FR Low', userVal: data.FR.bottom, ocrVal: interpolateValue(data.FR.bottomPixel, xSeq, true, true), isLog: true },
                    { name: 'SPL High', userVal: data.SPL.top, ocrVal: interpolateValue(data.SPL.topPixel, ySeq, false, false), isLog: false },
                    { name: 'SPL Low', userVal: data.SPL.bottom, ocrVal: interpolateValue(data.SPL.bottomPixel, ySeq, false, false), isLog: false }
                ];

                const validationErrors = [];

                for (const bound of bounds) {
                    if (bound.ocrVal === null || !bound.userVal) continue;

                    const userVal = parseFloat(bound.userVal);
                    if (isNaN(userVal)) continue;

                    let isClose = false;

                    if (bound.isLog && userVal > 0 && bound.ocrVal > 0) {
                        const logDiff = Math.abs(Math.log10(userVal) - Math.log10(bound.ocrVal));
                        isClose = logDiff <= 0.01;
                    } else {
                        isClose = Math.abs(userVal - bound.ocrVal) < 1;
                    }

                    if (!isClose) {
                        validationErrors.push(`${bound.name}: inputted '${userVal}', but OCR suggests roughly '${Math.round(bound.ocrVal * 10) / 10}'`);
                    }
                }

                if (validationErrors.length > 0) {
                    const buttons = document.createElement('div');
                    buttons.classList.add('popupButtons');
                    const cancel = document.createElement('button'), confirm = document.createElement('button');
                    cancel.classList.add('standardButton');
                    cancel.textContent = 'Cancel';
                    confirm.classList.add('standardButton');
                    confirm.textContent = 'Save Anyway';
                    buttons.append(confirm, cancel);

                    confirm.addEventListener('click', () => {
                        clearPopups();
                        worker.postMessage(data);
                    });

                    cancel.addEventListener('click', clearPopups);

                    void createPopup(
                        `Detected a potential mismatch between your inputted bounds and the image text:\n\n${validationErrors.join('\n')}\n\nSave anyway or go back?`,
                        { buttons: buttons }
                    );
                    return;
                }

                worker.postMessage(data);
            };

            if (words.value) {
                words.promise.then(on_words).catch((err) => {
                    console.error(err);
                    worker.postMessage(data);
                });
            } else {
                createPopup("Image text detection has not yet finished... Skip?", {
                    buttons: 'Skip'
                }).then(() => {
                    worker.postMessage(data);
                });

                words.promise.then((words_data) => {
                    clearPopups();
                    on_words(words_data);
                }).catch(() => {
                    clearPopups();
                    worker.postMessage(data);
                });
            }
        }
    },
    addPoint: (x, y) => worker.postMessage({
        /** @export */ type: 'addPoint',
        /** @export */ x,
        /** @export */ y
    }),
    autoTrace: () => {
        worker.postMessage({
            /** @export */ type: 'autoTrace', 
            /** @export */ colourTolerance: preferences.colourTolerance()
        });
    },
    trace: (x, y) => {
        worker.postMessage({
            /** @export */ type: 'trace',
            /** @export */ x,
            /** @export */ y,
            /** @export */ colourTolerance: preferences.colourTolerance(),
            /** @export */ traceAlgorithm: preferences.traceAlgorithm()
        });
    },
    offsetTrace: (direction, magnitude) => worker.postMessage({
        /** @export */ type: 'offsetTrace', 
        /** @export */ direction,
        /** @export */ magnitude
    }),
    snapLine: (line, direction, final = false) => {
        worker.postMessage({
            /** @export */ type: 'snapLine',
            /** @export */ line: {
                /** @export */ name: line.id,
                /** @export */ position: lines.getPosition(line),
                /** @export */ direction: line.dataset["direction"]
            },
            /** @export */ direction,
            /** @export */ final
        });
    },
    getPixelColour: (x, y) => worker.postMessage({
        /** @export */ type: 'getPixelColour',
        /** @export */ x,
        /** @export */ y
    }),
    getCurrentPath: () => worker.postMessage({
        /** @export */ type: 'getCurrentPath'
    })
}

const graphs = {
    updateSize: () => {
        for (const e of document.querySelectorAll('svg')) {
            e.setAttribute("width", width);
            e.setAttribute("height", height);
            e.setAttribute("viewBox", `0 0 ${width} ${height}`);
        }
    },
    setTracePath: (d) => {
        const trace = document.getElementById('trace'), path = trace.lastElementChild, path2 = trace.firstElementChild;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#ff0000');
        path.setAttribute('stroke-width', lineWidth);
        path2.setAttribute('d', d);
        path2.setAttribute('stroke-width', (lineWidth * 1.5).toString());
    },
    clearTracePath: () => {
        graphs.setTracePath('');
    }
}

document.getElementById('autoPath').addEventListener('click', worker.autoTrace);
document.getElementById('undo').addEventListener('click', worker.undoTrace);
document.getElementById('redo').addEventListener('click', worker.redoTrace);
document.getElementById('clearPath').addEventListener('click', worker.clearTrace);
document.getElementById('export').addEventListener('click', worker.exportTrace);
document.getElementById('smoothTrace').addEventListener('click', worker.smoothTrace);

const fileInput = document.getElementById('fileInput');

const imageQueue = {
    elem: document.getElementById('imageQueueInner'),
    currentlySelected: () => imageQueue.elem.querySelector('img.selectedImage'),
    currentlyAllSelected: () => imageQueue.elem.querySelectorAll('img.selectedImage'),
    removeSelectedImage: () => {
        for (const i of imageQueue.currentlyAllSelected()) i.classList.remove('selectedImage');
    },
    deleteImage: (img) => {
        imageMap.delete(img.src);
        worker.removeImage(img.src);
        URL.revokeObjectURL(img.src);
        img.remove();
    },
    scrollToSelected: () => {
        (imageQueue.currentlySelected())?.scrollIntoView({inline: 'center', behavior: 'smooth'});
    },
    addImage: (blob, src, display=false) => {
        const img = document.createElement('img'),
            a = document.getElementById('imageQueueInner');
        img.src = src;
        imageMap.set(img.src, {
            src: img.src,
            initial: true,
            bitmap: createImageBitmap(blob)
        });
        img.addEventListener('dragstart', (e) => e.preventDefault());
        img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            image.saveImage();
            image.src = src;
            imageQueue.removeSelectedImage();
            img.classList.add('selectedImage');
            imageQueue.scrollToSelected();
        });
        img.__usytrace_remove = (e) => {
            e?.preventDefault();
            if (img.classList.contains('selectedImage')) {
                let newImage = img.nextElementSibling;
                if (!newImage) newImage = img.previousElementSibling;
                if (!newImage) initAll();
                else newImage.click();
            }
            imageQueue.deleteImage(img);
        };
        img.addEventListener('contextmenu', img.__usytrace_remove);
        a.appendChild(img);
        if (display) {
            img.click();
            setTimeout(imageQueue.scrollToSelected, 50);
        }
        return img;
    },
    toggle: (e) => {
        const button = e.target;
        document.getElementById('imageContainer').addEventListener('transitionend', () => window.dispatchEvent(new Event('resize')), {once: true});
        if (button.textContent === button.dataset["active"]) {
            button.textContent = button.dataset["default"];
            button.removeAttribute('active');
        } else {
            button.textContent = button.dataset["active"];
            button.setAttribute('active', '');
        }
    }
}
document.getElementById('removeImage').addEventListener('click', () => imageQueue.currentlySelected()?.__usytrace_remove());
document.getElementById('toggleImageQueue').addEventListener('click', imageQueue.toggle);
const getPerspectiveMatrix = (p0, p1, p2, p3) => {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const dy3 = p0.y - p1.y + p2.y - p3.y;

    if (Math.abs(dx3) < 1e-7 && Math.abs(dy3) < 1e-7) {
        return {
            /** @export */ a11: p1.x - p0.x, /** @export */ a21: p3.x - p0.x, /** @export */ a31: p0.x,
            /** @export */ a12: p1.y - p0.y, /** @export */ a22: p3.y - p0.y, /** @export */ a32: p0.y,
            /** @export */ a13: 0,          /** @export */ a23: 0
        };
    }

    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-7) {
        return {
            /** @export */ a11: p1.x - p0.x, /** @export */ a21: p3.x - p0.x, /** @export */ a31: p0.x,
            /** @export */ a12: p1.y - p0.y, /** @export */ a22: p3.y - p0.y, /** @export */ a32: p0.y,
            /** @export */ a13: 0,          /** @export */ a23: 0
        };
    }

    const g = (dx3 * dy2 - dx2 * dy3) / det;
    const h = (dx1 * dy3 - dx3 * dy1) / det;

    return {
        /** @export */ a11: p1.x - p0.x + g * p1.x,
        /** @export */ a21: p3.x - p0.x + h * p3.x,
        /** @export */ a31: p0.x,
        /** @export */ a12: p1.y - p0.y + g * p1.y,
        /** @export */ a22: p3.y - p0.y + h * p3.y,
        /** @export */ a32: p0.y,
        /** @export */ a13: g,
        /** @export */ a23: h
    };
};

const mapPerspectivePoint = (m, u, v) => {
    const denom = m.a13 * u + m.a23 * v + 1;
    const invDenom = Math.abs(denom) > 1e-7 ? 1.0 / denom : 1.0;
    return {
        /** @export */ x: (m.a11 * u + m.a21 * v + m.a31) * invDenom,
        /** @export */ y: (m.a12 * u + m.a22 * v + m.a32) * invDenom
    };
};

const isQuadConvex = (p0, p1, p2, p3) => {
    const cp = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const z0 = cp(p0, p1, p2);
    const z1 = cp(p1, p2, p3);
    const z2 = cp(p2, p3, p0);
    const z3 = cp(p3, p0, p1);
    return (z0 > 0 && z1 > 0 && z2 > 0 && z3 > 0) || (z0 < 0 && z1 < 0 && z2 < 0 && z3 < 0);
};

const applyPerspectiveWarp = (srcCanvas, dstCanvas, corners, outW, outH) => {
    const srcCtx = srcCanvas.getContext('2d');
    const dstCtx = dstCanvas.getContext('2d');
    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;

    const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcData = srcImageData.data;
    const dstImageData = dstCtx.createImageData(outW, outH);
    const dstData = dstImageData.data;

    const m = getPerspectiveMatrix(corners[0], corners[1], corners[2], corners[3]);
    const invW = 1.0 / (outW > 1 ? outW - 1 : 1);
    const invH = 1.0 / (outH > 1 ? outH - 1 : 1);

    let outIdx = 0;
    for (let y = 0; y < outH; y++) {
        const vn = y * invH;
        const a21_vn_a31 = m.a21 * vn + m.a31;
        const a22_vn_a32 = m.a22 * vn + m.a32;
        const a23_vn_1 = m.a23 * vn + 1;

        for (let x = 0; x < outW; x++) {
            const un = x * invW;
            const denom = m.a13 * un + a23_vn_1;
            const invDenom = Math.abs(denom) > 1e-7 ? 1.0 / denom : 1.0;
            const sx = (m.a11 * un + a21_vn_a31) * invDenom;
            const sy = (m.a12 * un + a22_vn_a32) * invDenom;

            if (sx >= 0 && sx <= srcW - 1 && sy >= 0 && sy <= srcH - 1) {
                const x0 = Math.floor(sx);
                const y0 = Math.floor(sy);
                const x1 = Math.min(x0 + 1, srcW - 1);
                const y1 = Math.min(y0 + 1, srcH - 1);
                const fx = sx - x0;
                const fy = sy - y0;
                const fx1 = 1 - fx;
                const fy1 = 1 - fy;

                const w00 = fx1 * fy1;
                const w10 = fx * fy1;
                const w01 = fx1 * fy;
                const w11 = fx * fy;

                const idx00 = (y0 * srcW + x0) * 4;
                const idx10 = (y0 * srcW + x1) * 4;
                const idx01 = (y1 * srcW + x0) * 4;
                const idx11 = (y1 * srcW + x1) * 4;

                dstData[outIdx]     = (w00 * srcData[idx00]     + w10 * srcData[idx10]     + w01 * srcData[idx01]     + w11 * srcData[idx11]) | 0;
                dstData[outIdx + 1] = (w00 * srcData[idx00 + 1] + w10 * srcData[idx10 + 1] + w01 * srcData[idx01 + 1] + w11 * srcData[idx11 + 1]) | 0;
                dstData[outIdx + 2] = (w00 * srcData[idx00 + 2] + w10 * srcData[idx10 + 2] + w01 * srcData[idx01 + 2] + w11 * srcData[idx11 + 2]) | 0;
                dstData[outIdx + 3] = (w00 * srcData[idx00 + 3] + w10 * srcData[idx10 + 3] + w01 * srcData[idx01 + 3] + w11 * srcData[idx11 + 3]) | 0;
            } else {
                dstData[outIdx] = 0;
                dstData[outIdx + 1] = 0;
                dstData[outIdx + 2] = 0;
                dstData[outIdx + 3] = 0;
            }
            outIdx += 4;
        }
    }
    dstCtx.putImageData(dstImageData, 0, 0);
};

document.getElementById('editImage').addEventListener('click', () => {
    if (image.isValid()) {
        const img_w = image.naturalWidth || width;
        const img_h = image.naturalHeight || height;

        const elem = document.createElement('div');
        const header = document.createElement('h3');
        const edit_buttons = document.createElement('div');
        const img_wrapper = document.createElement('div');
        const img = document.createElement('img');
        elem.id = 'editContainer';
        elem.append(header, edit_buttons, img_wrapper);
        img_wrapper.append(img);
        img_wrapper.classList.add('cropWrapper');
        img.draggable = false;
        header.textContent = 'Edit Image';
        img.src = image.src;

        const activeFilters = new Set();
        const filters = !safari ? {
            /** @export */ Invert: {
                property: 'invert',
                default: 1,
                unit: '',
            },
            // /** @export */ Blur: 'blur(1px)', would need to normalise this wrt image size
            /** @export */ Brightness: {
                property: 'brightness',
                default: 120,
                unit: '%',
                description: 'Enter value for brightness in %',
                validate: (v) => Math.max(0, v)
            },
            /** @export */ Contrast: {
                property: 'contrast',
                default: 120,
                unit: '%',
                description: 'Enter value for contrast in %',
                validate: (v) => Math.max(0, v)
            },
            /** @export */ Saturate: {
                property: 'saturate',
                default: 120,
                unit: '%',
                description: 'Enter value for saturation in %',
                validate: (v) => Math.max(0, v)
            },
            /** @export */ Hue: {
                property: 'hue-rotate',
                default: 5,
                unit: 'deg',
                description: 'Enter value for hue rotation in degrees',
                validate: (v) => Math.abs(v) % 360
            },
        } : {
            /** @export */ Invert: {
                property: 'invert',
                default: 1,
                unit: '',
            }
        };

        const removeFilter = (filter) => {
            img.style.filter = img.style.filter.replaceAll(new RegExp(`${filter}\\(.*\\)`, 'g'), '');
        };

        for (const filter in filters) {
            const button = document.createElement('button');
            button.textContent = filter;
            button.classList.add('standardButton');
            edit_buttons.appendChild(button);
            const f = filters[filter];
            button.addEventListener('click', () => {
                if (activeFilters.has(filter)) {
                    activeFilters.delete(filter);
                    removeFilter(f.property || 'invert');
                    button.removeAttribute('active');
                    button.textContent = filter;
                } else {
                    if (f.validate) {
                        const input = document.createElement('input');
                        input.placeholder = f.default;
                        input.type = 'number';
                        const things = [document.createTextNode(f.description), input];
                        things.serialise = () => input.value || f.default;
                        createPopup(things, {overlay: true}).then((v) => {
                            if (v !== false && Number.isFinite(Number(v))) {
                                v = f.validate(v);
                                activeFilters.add(filter);
                                img.style.filter += `${f.property}(${v}${f.unit})`;
                                button.setAttribute('active', '');
                                button.textContent = `${filter}: ${v}${f.unit}`;
                            } else if (v !== false) {
                                void createPopup('Invalid value.', {overlay: true});
                            }
                        });
                    } else {
                        activeFilters.add(filter);
                        img.style.filter += `${f.property || 'invert'}(${f.default ?? 1}${f.unit ?? ''})`;
                        button.setAttribute('active', '');
                        button.textContent = `${filter} (On)`;
                    }
                }
            });
        }

        // 3D Transform tool
        let isTransformActive = false;
        let corners = [
            { /** @export */ x: 0,     /** @export */ y: 0 },
            { /** @export */ x: img_w, /** @export */ y: 0 },
            { /** @export */ x: img_w, /** @export */ y: img_h },
            { /** @export */ x: 0,     /** @export */ y: img_h }
        ];

        const transformButton = document.createElement('button');
        transformButton.textContent = '3D Transform';
        transformButton.classList.add('standardButton');
        edit_buttons.appendChild(transformButton);

        const resetGridButton = document.createElement('button');
        resetGridButton.textContent = 'Reset Grid';
        resetGridButton.classList.add('standardButton');
        resetGridButton.style.display = 'none';
        edit_buttons.appendChild(resetGridButton);

        const svgNS = 'http://www.w3.org/2000/svg';
        const svgOverlay = document.createElementNS(svgNS, 'svg');
        svgOverlay.setAttribute('class', 'transformOverlay');
        svgOverlay.setAttribute('viewBox', `0 0 ${img_w} ${img_h}`);
        svgOverlay.setAttribute('preserveAspectRatio', 'none');
        svgOverlay.style.display = 'none';

        const quadPolygon = document.createElementNS(svgNS, 'polygon');
        quadPolygon.setAttribute('class', 'transformQuad');
        svgOverlay.appendChild(quadPolygon);

        const gridLinesGroup = document.createElementNS(svgNS, 'g');
        svgOverlay.appendChild(gridLinesGroup);

        const SUBDIVS = 4;
        const gridLinesH = [];
        const gridLinesV = [];
        for (let i = 1; i < SUBDIVS; i++) {
            const lineH = document.createElementNS(svgNS, 'line');
            lineH.setAttribute('class', 'transformGridLine');
            gridLinesGroup.appendChild(lineH);
            gridLinesH.push(lineH);

            const lineV = document.createElementNS(svgNS, 'line');
            lineV.setAttribute('class', 'transformGridLine');
            gridLinesGroup.appendChild(lineV);
            gridLinesV.push(lineV);
        }

        const handleLabels = ['TL', 'TR', 'BR', 'BL'];
        const handleGroups = [];
        for (let i = 0; i < 4; i++) {
            const g = document.createElementNS(svgNS, 'g');
            g.setAttribute('class', 'transformHandle');
            g.dataset['index'] = i.toString();

            const touchCircle = document.createElementNS(svgNS, 'circle');
            touchCircle.setAttribute('class', 'transformHandleTouch');
            touchCircle.setAttribute('r', '22');

            const coreCircle = document.createElementNS(svgNS, 'circle');
            coreCircle.setAttribute('class', 'transformHandleCore');
            coreCircle.setAttribute('r', '7');

            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('class', 'transformHandleText');
            text.textContent = handleLabels[i];
            const dx = (i === 0 || i === 3) ? -16 : 16;
            const dy = (i === 0 || i === 1) ? -16 : 16;
            text.setAttribute('x', dx.toString());
            text.setAttribute('y', dy.toString());

            g.append(touchCircle, coreCircle, text);
            svgOverlay.appendChild(g);
            handleGroups.push(g);
        }

        img_wrapper.appendChild(svgOverlay);

        const updateTransformOverlay = () => {
            if (!isTransformActive) return;

            const convex = isQuadConvex(corners[0], corners[1], corners[2], corners[3]);
            if (convex) {
                quadPolygon.classList.remove('invalid');
            } else {
                quadPolygon.classList.add('invalid');
            }

            quadPolygon.setAttribute('points', `${corners[0].x},${corners[0].y} ${corners[1].x},${corners[1].y} ${corners[2].x},${corners[2].y} ${corners[3].x},${corners[3].y}`);

            const m = getPerspectiveMatrix(corners[0], corners[1], corners[2], corners[3]);

            for (let i = 1; i < SUBDIVS; i++) {
                const vn = i / SUBDIVS;
                const pL = mapPerspectivePoint(m, 0, vn);
                const pR = mapPerspectivePoint(m, 1, vn);
                const lineH = gridLinesH[i - 1];
                lineH.setAttribute('x1', pL.x.toString());
                lineH.setAttribute('y1', pL.y.toString());
                lineH.setAttribute('x2', pR.x.toString());
                lineH.setAttribute('y2', pR.y.toString());

                const un = i / SUBDIVS;
                const pT = mapPerspectivePoint(m, un, 0);
                const pB = mapPerspectivePoint(m, un, 1);
                const lineV = gridLinesV[i - 1];
                lineV.setAttribute('x1', pT.x.toString());
                lineV.setAttribute('y1', pT.y.toString());
                lineV.setAttribute('x2', pB.x.toString());
                lineV.setAttribute('y2', pB.y.toString());
            }

            const rect = svgOverlay.getBoundingClientRect();
            const dispW = rect.width > 0 ? rect.width : (img.clientWidth > 0 ? img.clientWidth : (img_wrapper.clientWidth > 0 ? img_wrapper.clientWidth : 0));
            const scale = dispW > 0 ? (img_w / dispW) : 1;

            for (let i = 0; i < 4; i++) {
                const g = handleGroups[i];
                g.setAttribute('transform', `translate(${corners[i].x}, ${corners[i].y}) scale(${scale})`);
            }
        };

        let draggingHandle = null;

        for (let i = 0; i < 4; i++) {
            const g = handleGroups[i];
            g.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                draggingHandle = i;
                g.classList.add('dragging');
                try { g.setPointerCapture(e.pointerId); } catch {}
            });

            g.addEventListener('pointermove', (e) => {
                if (draggingHandle === i) {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = svgOverlay.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        const mouseX = ((e.clientX - rect.left) / rect.width) * img_w;
                        const mouseY = ((e.clientY - rect.top) / rect.height) * img_h;
                        corners[i].x = Math.max(0, Math.min(img_w, mouseX));
                        corners[i].y = Math.max(0, Math.min(img_h, mouseY));
                        updateTransformOverlay();
                    }
                }
            });

            const stopDrag = (e) => {
                if (draggingHandle === i) {
                    e.preventDefault();
                    g.classList.remove('dragging');
                    draggingHandle = null;
                    try { g.releasePointerCapture(e.pointerId); } catch {}
                }
            };

            g.addEventListener('pointerup', stopDrag);
            g.addEventListener('pointercancel', stopDrag);
        }

        transformButton.addEventListener('click', () => {
            isTransformActive = !isTransformActive;
            if (isTransformActive) {
                transformButton.setAttribute('active', '');
                resetGridButton.style.display = '';
                svgOverlay.style.display = '';
                requestAnimationFrame(updateTransformOverlay);
            } else {
                transformButton.removeAttribute('active');
                resetGridButton.style.display = 'none';
                svgOverlay.style.display = 'none';
            }
        });

        resetGridButton.addEventListener('click', () => {
            corners = [
                { /** @export */ x: 0,     /** @export */ y: 0 },
                { /** @export */ x: img_w, /** @export */ y: 0 },
                { /** @export */ x: img_w, /** @export */ y: img_h },
                { /** @export */ x: 0,     /** @export */ y: img_h }
            ];
            updateTransformOverlay();
        });

        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
            if (isTransformActive) updateTransformOverlay();
        }) : null;
        ro?.observe(img_wrapper);
        ro?.observe(img);

        const onResize = () => {
            if (isTransformActive) updateTransformOverlay();
        };
        window.addEventListener('resize', onResize);

        const buttons = document.createElement('div');
        buttons.classList.add('popupButtons');
        const cancel = document.createElement('button'), confirm = document.createElement('button');
        cancel.classList.add('standardButton');
        cancel.textContent = 'Cancel';
        confirm.classList.add('standardButton');
        confirm.textContent = 'Save';
        buttons.append(cancel, confirm);
        cancel.addEventListener('click', clearPopups);

        confirm.addEventListener('click', () => {
            const isModified = corners[0].x !== 0 || corners[0].y !== 0 ||
                               corners[1].x !== img_w || corners[1].y !== 0 ||
                               corners[2].x !== img_w || corners[2].y !== img_h ||
                               corners[3].x !== 0 || corners[3].y !== img_h;

            if (isTransformActive && isModified) {
                if (!isQuadConvex(corners[0], corners[1], corners[2], corners[3])) {
                    void createPopup('Invalid corners: 3D grid must form a non-overlapping quadrilateral.', {overlay: true});
                    return;
                }

                const dTop = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
                const dBottom = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
                const dLeft = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
                const dRight = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);
                const outW = Math.max(10, Math.round(Math.max(dTop, dBottom)));
                const outH = Math.max(10, Math.round(Math.max(dLeft, dRight)));

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = img_w;
                srcCanvas.height = img_h;
                const srcCtx = srcCanvas.getContext('2d');

                if (!safari) srcCtx.filter = img.style.filter;
                srcCtx.drawImage(img, 0, 0);
                if (!safari) srcCtx.filter = 'none';

                global_canvas.width = outW;
                global_canvas.height = outH;
                applyPerspectiveWarp(srcCanvas, global_canvas, corners, outW, outH);

                if (safari) safariInverse();
            } else {
                global_canvas.width = width;
                global_canvas.height = height;

                if (!safari) global_canvas_ctx_2d.filter = img.style.filter;
                global_canvas_ctx_2d.drawImage(img, 0, 0);
                if (!safari) global_canvas_ctx_2d.filter = 'none';

                if (safari) safariInverse();
            }

            const currentlySelected = imageQueue.currentlySelected();
            global_canvas.toBlob((b) => {
                imageQueue.addImage(b, URL.createObjectURL(b), true);
                currentlySelected?.__usytrace_remove();
                clearPopups();

                global_canvas.width = 0;
                global_canvas.height = 0;
            });
        });
        void createPopup(elem, {
            buttons,
            onclose: () => {
                window.removeEventListener('resize', onResize);
                ro?.disconnect();
            }
        });
    } else void createPopup('No valid image selected');
});

// Initialise the page
resetToDefault();

try {
    const savedShowEstimated = window.localStorage.getItem('showEstimatedValues');
    if (savedShowEstimated !== null) {
        document.getElementById('showEstimatedValues').checked = savedShowEstimated === 'true';
    }
} catch {}

initAll();

const updateTraceAlgorithm = (() => {
    const elem = document.getElementById('traceAlgorithm');
    const tol = document.getElementById('colourTolerance');
    const tolLabel = document.querySelector('[for="colourTolerance"]');

    try {
        elem.value = parseInt(window.localStorage.getItem('traceAlgorithm') ?? 0, 10).toString();
    } catch {}

    return () => {
        let int = parseInt(elem.value, 10);
        if (Number.isNaN(int) || int < 0 || int > 1) {
            elem.value = "0";
            int = 0;
        }

        try {
            window.localStorage.setItem('traceAlgorithm', int.toString());
        } catch {}

        if (int === 0) {
            tol.disabled = false;
            tolLabel.removeAttribute('disabled');
            return;
        } else if (int === 1) {
            tol.disabled = true;
            tolLabel.setAttribute('disabled', "");
            return;
        }
    }
})();
document.getElementById('traceAlgorithm').addEventListener('change', updateTraceAlgorithm);
updateTraceAlgorithm();

fileInput.loadFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const lastId = validFiles.length - 1;
    
    if (validFiles.length > 0) {
        clearPopups();
        validFiles.forEach((file, index) => {
            imageQueue.addImage(file, URL.createObjectURL(file), index === lastId);
        });
    }
    else void createPopup("Invalid image/file(s) added!");
    fileInput.value = ''; // reset value of input to allow re-input of the same item in chromium
}
fileInput.addEventListener('change', (e) => {
    fileInput.loadFiles(e.target.files);
});

image.addEventListener('dragstart',(e) => e.preventDefault());

document.getElementById('fileInputButton').addEventListener('click', () => fileInput.click());

{ // Pasting file stuff
    document.addEventListener('paste', (e) => {
        e.preventDefault();
        const d = new DataTransfer();
        for (const item of e.clipboardData.items) {
            if (item.kind === 'file') d.items.add(item.getAsFile());
        }
        if (d.files.length > 0) fileInput.loadFiles(d.files);
    });
}

{ // Drag and drop stuff
    multiEventListener('dragover', document.body, (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('lowOpacity');
    });
    multiEventListener(['dragleave', 'dragend'], document.body, (e) => {
        e.preventDefault();
        document.body.classList.remove('lowOpacity');
    });
    multiEventListener('drop', document.body, (e) => {
        e.preventDefault();
        document.body.classList.remove('lowOpacity');
        fileInput.loadFiles(e.dataTransfer.files);
    });
}

{ // magnifying glass stuff
    image.addEventListener('pointermove', (e) => {
        if (CURRENT_MODE !== 'erase') {
            e.preventDefault();
            const parentElement = image.parentElement,
                parentRect = parentElement.getBoundingClientRect(), m = image.getMouseCoords(e);
            glass.style.left = `${Math.min(m["x"] - parentRect.left, parentElement.clientWidth - glass.clientWidth)}px`;
            glass.style.top = `${Math.min(m["y"] - parentRect.top, parentElement.clientHeight - glass.clientHeight)}px`;
            glass.img.style.left = `${(m["xRel"] * MAGNIFICATION - (glass.clientWidth / 2)) * -1}px`;
            glass.img.style.top = `${(m["yRel"] * MAGNIFICATION - (glass.clientHeight / 2)) * -1}px`;
            worker.getPixelColour(m["xRel"] * sizeRatio, m["yRel"] * sizeRatio);
            glass.classList.remove('hidden');
        }
    });
    multiEventListener(['pointerleave', 'pointerout', 'pointercancel'], image, () => glass.classList.add('hidden'));
}

{ // Move canvas lines
    let selectedLine = null, getCoords = image.getMouseCoords;

    lines.parent.addEventListener('pointerdown', (e) => {
        const m = getCoords(e);
        const sizes = {
            /** @export */ x: width * 0.02,
            /** @export */ y: height * 0.02
        }
        for (const line of lines.lineArray) line.offset = m[`${line.dataset["direction"]}Rel`] * sizeRatio - lines.getPosition(line);
        const closest = lines.lineArray.reduce((acc, curr) => Math.abs(curr.offset) < Math.abs(acc.offset) ? curr : acc, lines.lineArray[0]);
        if (Math.abs(closest.offset) < sizes[closest.dataset["direction"]]) selectedLine = closest;
    });

    lines.parent.addEventListener('pointermove', (e) => {
        if (selectedLine) lines.setPosition(selectedLine, getCoords(e)[`${selectedLine.dataset["direction"]}Rel`] * sizeRatio - selectedLine.offset);
    });

    multiEventListener(['pointerup', 'pointerleave', 'pointercancel'], lines.parent, (e) => {
        e.preventDefault();
        selectedLine = null;
    });
}

{ // Move canvas lines with buttons and offset trace
    let holdInterval, line, snap = preferences.snapToLines();
    document.getElementById('snapToLines').addEventListener('change', () => snap = preferences.snapToLines());
    document.getElementById('showEstimatedValues').addEventListener('change', () => {
        try {
            window.localStorage.setItem('showEstimatedValues', preferences.showEstimatedValues().toString());
        } catch {}
        lines.updateLabels();
    });
    document.getElementById('showOcrDebug')?.addEventListener('change', ocrDebug.update);

    document.getElementById('buttonSection').addEventListener('pointerdown', (e) => {
        const t = e.target, p = t.parentNode;
        if (!holdInterval && p.classList.contains('moveButtons')) {
            e.preventDefault();
            const dataset_for = p.dataset["for"];
            if (!dataset_for) {
                // Global trace offset
                const direction = parseInt(t.dataset["direction"], 10);
                holdInterval = setInterval(() => {
                    worker.offsetTrace(direction, sizeRatio);
                }, (100 / preferences.line_move_speed()) * 10);
                return;
            }
            line = lines.lines[dataset_for];
            if (!snap) {
                const direction = parseInt(t.dataset["direction"], 10);
                holdInterval = setInterval(() => {
                    lines.setPosition(line, lines.getPosition(line) + direction * sizeRatio);
                }, (100 / preferences.line_move_speed()) * 10);
            } else worker.snapLine(lines.lines[p.dataset["for"]], parseInt(t.dataset["direction"], 10));
        }
    });

    multiEventListener(['pointerup', 'pointerleave', 'pointerout', 'pointercancel'], document.getElementById('buttonSection'), (e) => {
        e.preventDefault();
        clearInterval(holdInterval);
        holdInterval = null;
    });
}

window.addEventListener('resize', () => {
    updateSizeRatio();
    lines.updateLineWidth();
    glass.updateImage();
});

{ // Image click handling
    const callbacks = {
        /** @export */ path: worker.trace,
        /** @export */ point: worker.addPoint
    }
    image.addEventListener('pointerup', (e) => {
        if (CURRENT_MODE != null) {
            const m = image.getMouseCoords(e);
            callbacks[CURRENT_MODE]?.(m["xRel"] * sizeRatio, m["yRel"] * sizeRatio);
        }
    });
    let holding = false;
    image.addEventListener('pointerdown', (e) => {
        if (CURRENT_MODE === 'erase') {
            e.preventDefault();
            holding = true;
            erasing.begin(image.getMouseCoords(e)["xRel"] * sizeRatio);
            document.addEventListener('pointerup', eraseStop, {once: true});
        }
    });
    image.addEventListener('pointermove', (e) => {
        if (holding && CURRENT_MODE === 'erase') {
            e.preventDefault();
            erasing.move(image.getMouseCoords(e)["xRel"] * sizeRatio);
        }
    });
    const eraseStop = (e) => {
        if (holding && CURRENT_MODE === 'erase') {
            e.preventDefault();
            holding = false;
            erasing.finish(image.getMouseCoords(e)["xRel"] * sizeRatio);
        }
    }
}

let image_id = 0;
let tesseract_id = 0;

// where everything starts
image.addEventListener('load', () => {
    document.getElementById('defaultMainText').classList.add('hidden');
    buttons.enableButtons();
    buttons.resetButtons();
    updateSizes();
    erasing.hide();
    graphs.updateSize();
    graphs.clearTracePath();
    glass.updateImage();

    const imageData = imageMap.get(image.src);
    if (imageData.initial) {
        waitingOverlay.createOverlay();
        console.time(`Initialise image ${++image_id}`);
        worker.addImage(width, height, image_id); // implicitly sets as current
        lines.setPosition(lines.lines["xHigh"], width);
        lines.setPosition(lines.lines["xLow"], 0);
        lines.setPosition(lines.lines["yHigh"], 0);
        lines.setPosition(lines.lines["yLow"], height);
        lines.initialise();
        lines.showLines();
        worker.snapLine(lines.lines["xHigh"], -1);
        worker.snapLine(lines.lines["xLow"], 1);
        worker.snapLine(lines.lines["yHigh"], 1);
        worker.snapLine(lines.lines["yLow"], -1, true);
        worker.autoTrace();

        imageData.words = {
            resolve_: undefined,
            reject_: undefined,
            promise: undefined,
            value: false
        };

        imageData.width = image.naturalWidth;
        imageData.height = image.naturalHeight;

        imageData.exportOptions = {
            /** @export */ SPLHigher: '',
            /** @export */ SPLLower: '',
            /** @export */ FRHigher: '',
            /** @export */ FRLower: ''
        };

        image.loadExportOptions(imageData);

        imageData.words.promise = new Promise((resolve, reject) => {
            imageData.words.resolve_ = resolve;
            imageData.words.reject_ = reject;
        });

        imageData.initial = false;
    } else {
        worker.setCurrent();
        image.loadImage();
        worker.getCurrentPath();
    }
    lines.updateLineWidth();
    ocrDebug.update();
});

image.addEventListener('error', () => {
    if (image.isValid()) {
        for (const img of imageQueue.currentlySelected()) imageQueue.deleteImage(img);
        void createPopup("Error loading this image, it may be malformed");
        ocrDebug.clear();
    }
});

{ // keybindings
    const pointerDown = new PointerEvent('pointerdown', {bubbles: true});
    const pointerUp = new PointerEvent('pointerup', {bubbles: true});

    const e_redo = document.getElementById('redo');
    const e_undo = document.getElementById('undo');
    const e_autoPath = document.getElementById('autoPath');
    const e_selectPath = document.getElementById('selectPath');
    const e_selectPoint = document.getElementById('selectPoint');
    const e_toggleImageQueue = document.getElementById('toggleImageQueue');
    const e_export = document.getElementById('export');
    const e_smoothTrace = document.getElementById('smoothTrace');
    const e_editImage = document.getElementById('editImage');
    const e_eraseRegion = document.getElementById('eraseRegion');
    const e_fileInputButton = document.getElementById('fileInputButton');
    const e_removeImage = document.getElementById('removeImage');
    const e_clearPath = document.getElementById('clearPath');

    const e_offsetUp = document.querySelector('[data-id="offset_trace"] > [data-direction="1"]');
    const e_offsetDown = document.querySelector('[data-id="offset_trace"] > [data-direction="0"]');
    const e_offsetLeft = document.querySelector('[data-id="offset_trace"] > [data-direction="2"]');
    const e_offsetRight = document.querySelector('[data-id="offset_trace"] > [data-direction="3"]');

    const e_lowUp = document.querySelector('[data-for="yLow"] > [data-direction="-1"]');
    const e_lowDown = document.querySelector('[data-for="yLow"] > [data-direction="1"]');
    const e_lowLeft = document.querySelector('[data-for="xLow"] > [data-direction="-1"]');
    const e_lowRight = document.querySelector('[data-for="xLow"] > [data-direction="1"]');

    const e_highUp = document.querySelector('[data-for="yHigh"] > [data-direction="-1"]');
    const e_highDown = document.querySelector('[data-for="yHigh"] > [data-direction="1"]');
    const e_highLeft = document.querySelector('[data-for="xHigh"] > [data-direction="-1"]');
    const e_highRight = document.querySelector('[data-for="xHigh"] > [data-direction="1"]');

    const keydownMap = {
        /** @export */ z: (e) => e.ctrlKey && (e.shiftKey ? e_redo : e_undo).click(),
        /** @export */ a: () => e_autoPath.click(),
        /** @export */ t: () => e_selectPath.click(),
        /** @export */ p: () => e_selectPoint.click(),
        /** @export */ h: () => e_toggleImageQueue.click(),
        /** @export */ s: (e) => (e.ctrlKey ? e_export : e_smoothTrace).click(),
        /** @export */ e: (e) => (e.ctrlKey ? e_editImage : e_eraseRegion).click(),
        /** @export */ enter: () => e_fileInputButton.click(),
        /** @export */ delete: () => e_removeImage.click(),
        /** @export */ backspace: () => e_clearPath.click(),
        /** @export */ arrowup: (e) => ((e.ctrlKey) ? e_offsetUp : (e.shiftKey ? e_lowUp : e_highUp)).dispatchEvent(pointerDown),
        /** @export */ arrowdown: (e) => ((e.ctrlKey) ? e_offsetDown : (e.shiftKey ? e_lowDown : e_highDown)).dispatchEvent(pointerDown),
        /** @export */ arrowleft: (e) => ((e.ctrlKey) ? e_offsetLeft : (e.shiftKey ? e_lowLeft : e_highLeft)).dispatchEvent(pointerDown),
        /** @export */ arrowright: (e) => ((e.ctrlKey) ? e_offsetRight : (e.shiftKey ? e_lowRight : e_highRight)).dispatchEvent(pointerDown),
    };
    const keyupMap = {
        /** @export */ arrowup: (e) => ((e.ctrlKey) ? e_offsetUp : (e.shiftKey ? e_lowUp : e_highUp)).dispatchEvent(pointerUp),
        /** @export */ arrowdown: (e) => ((e.ctrlKey) ? e_offsetDown : (e.shiftKey ? e_lowDown : e_highDown)).dispatchEvent(pointerUp),
        /** @export */ arrowleft: (e) => ((e.ctrlKey) ? e_offsetLeft : (e.shiftKey ? e_lowLeft : e_highLeft)).dispatchEvent(pointerUp),
        /** @export */ arrowright: (e) => ((e.ctrlKey) ? e_offsetRight : (e.shiftKey ? e_lowRight : e_highRight)).dispatchEvent(pointerUp),
    };

    const melvin = "melvin.";
    const melvin_len = melvin.length;
    let melvin_idx = 0;
    let melvin_enabled = false;
    let melvin_style;

    const setMelvin = async () => {
        if (!melvin_style) {
            try {
                const response = await fetch('assets/melvin');
                if (!response.ok) {
                    melvin_enabled = false;
                    return;
                }
                melvin_style = `*:not(#main):not(.waiting-overlay){background-image:url("${URL.createObjectURL(new Blob([await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).blob()], { type: 'image/png' }))}") !important;background-size:100% 100% !important;background-repeat:no-repeat !important;background-color:transparent !important}`;
            } catch {
                melvin_style = '*:not(#main):not(.waiting-overlay){background-image:url("assets/32.png") !important;background-size:100% 100% !important;background-repeat:no-repeat !important;background-color:transparent !important}';
            }
        }

        const style = document.createElement('style');
        style.setAttribute('melvin', 'melvin');
        style.textContent = melvin_style;
        document.head.appendChild(style);
    };
    
    document.addEventListener('keydown', (e) => {
        const keyLower = e.key.toLowerCase();
        if (state.keyBindsEnabled) {
            const cb = keydownMap[keyLower];
            if (cb && !e.target.closest('input')) {
                e.preventDefault();
                cb(e);
            }
        }

        if (melvin[melvin_idx] === keyLower) {
            if (++melvin_idx === melvin_len) {
                melvin_idx = 0;
                melvin_enabled = !melvin_enabled;

                if (melvin_enabled) {
                    console.log("Your did it!!!!!!1111");
                    setMelvin();
                } else {
                    console.log("Ok fine goodbye....");
                    document.querySelector('style[melvin="melvin"]')?.remove();
                }
            }
        } else {
            melvin_idx = 0;
        }
    });
    document.addEventListener('keyup', (e) => {
        if (state.keyBindsEnabled) {
            const cb = keyupMap[e.key.toLowerCase()];
            if (cb && !e.target.closest('input')) {
                e.preventDefault();
                cb(e);
            }
        }
    });
}

// Helper Functions
function multiEventListener(events, target, callback) {
    for (const ev of Array.isArray(events) ? events : [events]) target.addEventListener(ev, callback);
}

function initAll() {
    document.getElementById('defaultMainText').classList.remove('hidden');
    buttons.disableButtons();
    buttons.resetButtons();
    lines.hideLines();
    lines.updateLabels();
    erasing.hide();
    graphs.clearTracePath();
    ocrDebug.clear();
    ocrDebug.hide();
    image.src = '';
}

function updateSizes() {
    width = image.naturalWidth;
    height = image.naturalHeight;
    lineWidth = Math.max(width, height) * 0.003;
    updateSizeRatio();
}

function updateSizeRatio() {
    sizeRatio = width / image.clientWidth;
}

{
    const minVal = (e) => {
        e = e.target;
        if (parseInt(e.value, 10) < e.min) e.value = e.min;
    }

    const maxVal = (e) => {
        e = e.target;
        if (parseInt(e.value, 10) > e.max) e.value = e.max;
    }

    for (const id of ['FRLower', 'colourTolerance', 'lowFRExport', 'line_move_speed']) {
        document.getElementById(id).addEventListener('change', minVal);
    }

    for (const id of ['line_move_speed']) {
        document.getElementById(id).addEventListener('change', maxVal);
    }
}
