'use strict';

import { createPopup, clearPopups, currentOk } from "./popups.js";
import { state } from "./state.js";

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
            /** @export */ tessedit_char_whitelist: '0123456789,.k-+',
            /** @export */ tessedit_pageseg_mode: Tesseract.PSM["SPARSE_TEXT"]
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

    /** @export */ colourTolerance: 67,

    /** @export */ line_move_speed: 100,

    /** @export */ PPO: 48,
    /** @export */ delimitation: "tab",
    /** @export */ lowFRExport: 20,
    /** @export */ highFRExport: 20000,

    /** @export */ SPLHigher: "",
    /** @export */ SPLLower: ""
}
const MAGNIFICATION = 3;
document.getElementById('restoreDefault')?.addEventListener('click', () => {
    resetToDefault();
    void createPopup("Restored settings to default");
});
function resetToDefault() {
    for (const val in defaults) document.getElementById(val).value = defaults[val];
}

// const global_canvas = 'OffscreenCanvas' in window ? new OffscreenCanvas(0, 0) : document.createElement('canvas');
// if (!global_canvas.toBlob && global_canvas.convertToBlob) {
//     global_canvas.toBlob = function (callback, type, quality) { this.convertToBlob({ type, quality }).then(callback); };
// }

const global_canvas = document.createElement('canvas');
const global_canvas_ctx_2d = global_canvas.getContext('2d');

// Global Variables
let sizeRatio, width, height, lineWidth, CURRENT_MODE = null, MODE_RESET_CB = null;

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
    updateLinePosition: (line, position) => {
        const attr = line.dataset["direction"];
        line.nextElementSibling.setAttribute(attr, position);
        line.setAttribute(`${attr}1`, position);
        line.setAttribute(`${attr}2`, position);
    },
    updateLineWidth: () => {
        for (const line of lines.parent.querySelectorAll('line')) line.setAttribute('stroke-width', sizeRatio);
        for (const text of lines.parent.querySelectorAll('text')) text.setAttribute('font-size', `${1.3 * sizeRatio}em`);
    },
    getPosition: (line) => parseFloat(line.getAttribute(`${line.dataset["direction"]}1`)),
    setPosition: (line, position) => {
        const ls = lines.lines, otherLinePos = lines.getPosition(ls[line.dataset["other"]]), sizeAttr = line.dataset["direction"] === 'x' ? width : height;
        if (line === ls["xHigh"] || line === ls["yLow"]) lines.updateLinePosition(line, Math.max(otherLinePos + 1, Math.min(sizeAttr - 1, position)));
        else lines.updateLinePosition(line, Math.max(1, Math.min(otherLinePos - 1, position)));
    },
    showLines: () => lines.parent.classList.remove('hidden'),
    hideLines: () => lines.parent.classList.add('hidden'), // potentially disable line keybinds
    initialiseTextPosition: () => {
        lines.lines["xHigh"].nextElementSibling.setAttribute('y', (height / 2).toString());
        lines.lines["xLow"].nextElementSibling.setAttribute('y', (height / 2).toString());
        lines.lines["yHigh"].nextElementSibling.setAttribute('x', (width / 2).toString());
        lines.lines["yLow"].nextElementSibling.setAttribute('x', (width / 2).toString());
    },
    initialise: () => {
        for (const line of lines.lineArray) {
            const [otherDir, sizeAttr] = line.dataset["direction"] === 'x' ? ['y', height] : ['x', width];
            line.setAttribute(`${otherDir}1`, "0");
            line.setAttribute(`${otherDir}2`, sizeAttr);
        }
        lines.initialiseTextPosition();
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
    const e_line_move_speed = document.getElementById('line_move_speed');
    const e_colourTolerance = document.getElementById('colourTolerance');
    const e_PPO = document.getElementById('PPO');
    const e_delimitation = document.getElementById('delimitation');
    const e_lowFRExport = document.getElementById('lowFRExport');
    const e_highFRExport = document.getElementById('highFRExport');

    return {
        SPLHigher: () => e_SPLHigher.value,
        SPLLower: () => e_SPLLower.value,
        FRHigher: () => e_FRHigher.value,
        FRLower: () => e_FRLower.value,

        snapToLines: () => e_snapToLines.checked,
        line_move_speed: () => parseInt(e_line_move_speed.value, 10) || defaults.line_move_speed,

        colourTolerance: () => parseInt(e_colourTolerance.value, 10) || defaults.colourTolerance,

        PPO: () => e_PPO.value || defaults.PPO,
        delimitation: () => e_delimitation.value || defaults.delimitation,
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
                            const a = document.createElement("a"),
                                url = URL.createObjectURL(new Blob([data["export"]], {
                                    /** @export */ type: "text/plain;charset=utf-8"
                                }));
                            a.href = url;
                            a.classList.add('hidden');
                            document.body.appendChild(a);

                            if (!(r?.endsWith(".txt")) && (r?.length > 0)) r += ".txt";
                            a.download = r || "trace.txt";
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

                const ocrNumbers = word_data.map((word) => ({
                    val: parseTesseractText(word['text']),
                    cx: (word['bbox']['x0'] + word['bbox']['x1']) / 2,
                    cy: (word['bbox']['y0'] + word['bbox']['y1']) / 2,
                    confidence: word['confidence']
                })).filter(w => (w.val != null) && (w.confidence >= 70));

                const findBestSequence = (isXAxis, isLog) => {
                    const alignKey = isXAxis ? 'cy' : 'cx';
                    const sortKey = isXAxis ? 'cx' : 'cy';
                    const alignTolerance = isXAxis ? 15 : 30;

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
                        group.sort((a, b) => a[sortKey] - b[sortKey]); // order spatially

                        let valid = true;
                        const scales = [];

                        const group_len = group.length;
                        for (let i = 0; i < group_len - 1; ++i) {
                            const p1 = group[i];
                            const p2 = group[i+1];
                            const pxDiff = p2[sortKey] - p1[sortKey];

                            if (isXAxis && (p1.val < 1 || p2.val < 1)) {
                                valid = false;
                                break;
                            }

                            if (pxDiff < 10) continue; // prevent division by near zero for overlapping text

                            let valDiff;
                            if (isLog) {
                                if (p1.val <= 0 || p2.val <= 0) { valid = false; break; }
                                valDiff = Math.log10(p2.val) - Math.log10(p1.val);
                                if (isXAxis && valDiff <= 0) { valid = false; break; } // increases left to right
                            } else {
                                valDiff = p2.val - p1.val;
                                // SPL increases down due to image pixels
                                if (!isXAxis && valDiff >= 0) { valid = false; break; }
                            }

                            scales.push(valDiff / pxDiff);
                        }

                        if (!valid || scales.length === 0) continue;

                        // sequence consistency
                        const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;
                        const isScaleConsistent = scales.every(s => Math.abs(s - avgScale) / Math.abs(avgScale) < 0.25);

                        if (isScaleConsistent) {
                            const spread = group[group.length - 1][sortKey] - group[0][sortKey];
                            const score = (group.length * 1000) + spread;
                            if (score > maxScore) {
                                maxScore = score;
                                bestSeq = group;
                            }
                        }
                    }
                    return bestSeq;
                };

                const interpolateValue = (pixelTarget, sequence, isXAxis, isLog) => {
                    if (!sequence) return null;

                    const p1 = sequence[0];
                    const p2 = sequence[sequence.length - 1];
                    const sortKey = isXAxis ? 'cx' : 'cy';

                    const px1 = p1[sortKey], px2 = p2[sortKey];
                    const v1 = p1.val, v2 = p2.val;

                    if (isLog) {
                        const logV1 = Math.log10(v1);
                        const logV2 = Math.log10(v2);
                        const logInterp = logV1 + ((logV2 - logV1) / (px2 - px1)) * (pixelTarget - px1);
                        return Math.pow(10, logInterp);
                    } else {
                        return v1 + ((v2 - v1) / (px2 - px1)) * (pixelTarget - px1);
                    }
                };

                const xSeq = findBestSequence(true, true);
                const ySeq = findBestSequence(false, false);

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
            /** @export */ colourTolerance: preferences.colourTolerance()
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

const imageMap = new Map();
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
    addImage: (src, display=false) => {
        const img = document.createElement('img'),
            a = document.getElementById('imageQueueInner');
        img.src = src;
        imageMap.set(img.src, {
            initial: true
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
document.getElementById('editImage').addEventListener('click', () => {
    if (image.isValid()) {
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
        // safari check
        const safari = !('filter' in CanvasRenderingContext2D.prototype);
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
            /** @export */ Invert: 'invert(1)'
        };

        const removeFilter = (filter) => {
            img.style.filter = img.style.filter.replaceAll(new RegExp(`${filter}\\(.*\\)`, 'g'), '');
        }
        for (const filter in filters) {
            const button = document.createElement('button');
            button.textContent = filter;
            button.classList.add('standardButton');
            edit_buttons.appendChild(button);
            const f = filters[filter];
            button.addEventListener('click', () => {
                if (activeFilters.has(filter)) {
                    activeFilters.delete(filter);
                    removeFilter(f.property);
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
                            } else {
                                void createPopup('Invalid value.', {overlay: true});
                            }
                        });
                    } else {
                        activeFilters.add(filter);
                        img.style.filter += `${f.property}(${f.default}${f.unit})`;
                    }
                }
            });
        }

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
            global_canvas.width = width;
            global_canvas.height = height;

            if (!safari) global_canvas_ctx_2d.filter = img.style.filter;
            global_canvas_ctx_2d.drawImage(img, 0, 0);

            if (safari) {
                // should only fire for safari, which does not support 2d context filter
                // i ain't implementing the other filters :serioussssly:
                console.log("Using fallback invert mode");
                const imageData = global_canvas_ctx_2d.getImageData(0, 0, width, height),
                    data = imageData.data, l = data.length;
                for (let i = 0; i < l; i += 4) {
                    data[i] = 255 - data[i];
                    data[i + 1] = 255 - data[i + 1];
                    data[i + 2] = 255 - data[i + 2];
                }
                global_canvas_ctx_2d.putImageData(imageData, 0, 0);
            }

            const currentlySelected = imageQueue.currentlySelected();
            global_canvas.toBlob((b) => {
                imageQueue.addImage(URL.createObjectURL(b), true);
                currentlySelected?.__usytrace_remove();
                clearPopups();

                global_canvas.width = 0;
                global_canvas.height = 0;
            });
        }, {once: true});
        void createPopup(elem, {buttons});
    } else void createPopup('No valid image selected');
});

// Initialise the page
resetToDefault();
initAll();

fileInput.loadFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const lastId = validFiles.length - 1;
    
    if (validFiles.length > 0) {
        clearPopups();
        validFiles.forEach((file, index) => {
            imageQueue.addImage(URL.createObjectURL(file), index === lastId);
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

        const src = image.src;

        imageData.words = {
            resolve_: undefined,
            reject_: undefined,
            promise: undefined,
            value: false
        };

        imageData.exportOptions = {
            /** @export **/ SPLHigher: '',
            /** @export **/ SPLLower: '',
            /** @export **/ FRHigher: '',
            /** @export **/ FRLower: ''
        };

        image.loadExportOptions(imageData);

        imageData.words.promise = new Promise((resolve, reject) => {
            imageData.words.resolve_ = resolve;
            imageData.words.reject_ = reject;
        });
        tesseract_worker.then((t) => {
            const label = `Initialise image ${++tesseract_id} OCR`;
            console.time(label);
            return t.recognize(src, {}, {
                /** @export */ blocks: true,
                /** @export */ text: false,
            }).then((d) => {
                console.timeEnd(label);
                const words = d["data"]["blocks"].map((b) => b["paragraphs"].map((p) => p["lines"].map((l) => l["words"]))).flat(3);
                console.log('Words detected in image: ', words);
                imageData.words.value = true;
                imageData.words.resolve_(words);
            });
        }).catch((err) => {
            console.log('Error detecting words in image: ', err);
            imageData.words.value = true;
            imageData.words.reject_(err);
        });
        imageData.initial = false;
    } else {
        worker.setCurrent();
        image.loadImage();
        worker.getCurrentPath();
    }
    lines.updateLineWidth();
});

image.addEventListener('error', () => {
    if (image.isValid()) {
        for (const img of imageQueue.currentlySelected()) imageQueue.deleteImage(img);
        void createPopup("Error loading this image, it may be malformed");
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
    document.addEventListener('keydown', (e) => {
        if (state.keyBindsEnabled) {
            const cb = keydownMap[e.key.toLowerCase()];
            if (!e.target.closest('input') && cb) {
                e.preventDefault();
                cb(e);
            }
        }
    });
    document.addEventListener('keyup', (e) => {
        if (state.keyBindsEnabled) {
            const cb = keyupMap[e.key.toLowerCase()];
            if (!e.target.closest('input') && cb) {
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
    erasing.hide();
    graphs.clearTracePath();
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