'use strict';

import { createPopup, clearPopups, currentOk } from "./popups.js";
import { state } from "./state.js";

// Defaults
const defaults = {
    /** @export */ FRHigher: 20000,
    /** @export */ FRLower: 20,

    /** @export */ colourTolerance: 67,

    /** @export */ PPO: 48,
    /** @export */ delimitation: "tab",
    /** @export */ lowFRExport: 20,
    /** @export */ highFRExport: 20000,

    /** @export */ SPLHigher: "",
    /** @export */ SPLLower: ""
}
const MAGNIFICATION = 3;
document.getElementById('restoreDefault').addEventListener('click', () => {
    resetToDefault();
    createPopup("Restored settings to default");
});
function resetToDefault() {
    for (const val in defaults) document.getElementById(val).value = defaults[val];
}

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
image.saveLines = () => {
    const imageData = imageMap.get(image.src), lineData = {};
    if (imageData) {
        for (const name in lines.lines) lineData[name] = lines.getPosition(lines.lines[name]);
        imageData.lines = lineData;
    }
}
image.loadLines = () => {
    const prev = imageMap.get(image.src).lines;
    for (const name in lines.lines) lines.setPosition(lines.lines[name], prev[name]);
    lines.initialise();
    lines.showLines();
}

const preferences = {
    SPLHigher: () => document.getElementById('SPLHigher').value,
    SPLLower: () => document.getElementById('SPLLower').value,
    FRHigher: () => document.getElementById('FRHigher').value,
    FRLower: () => document.getElementById('FRLower').value,

    snapToLines: () => document.getElementById('snapToLines').checked,

    colourTolerance: () => document.getElementById('colourTolerance').value || defaults.colourTolerance,

    PPO: () => document.getElementById('PPO').value || defaults.ppo,
    delimitation: () => document.getElementById('delimitation').value || defaults.delimitation,
    lowFRExport: () => document.getElementById('lowFRExport').value || defaults.lowFRExport,
    highFRExport: () => document.getElementById('highFRExport').value || defaults.highFRExport,
}

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

const worker = {
    worker: (() => {
        const w = new Worker("./a.out.js", {type: 'module'});
        w.onmessage = (data) => {
            data = data["data"];
            const type = data["type"];

            switch (type) {
                case 'exportTrace': {
                    const a = document.createElement("a"),
                        url = URL.createObjectURL(new Blob([data["export"]], {
                            /** @export */ type: "text/plain;charset=utf-8"
                        }));
                    a.href = url;
                    a.classList.add('hidden');
                    document.body.appendChild(a);

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
                            if (!(r?.endsWith(".txt"))) r += ".txt";
                            a.download = r || "trace.txt";
                            a.click();
                        }
                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                        }, 5000);
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
                    console.timeEnd("Initialise image");
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
    addImage: (width, height) => {
        const processing_canvas = document.createElement("canvas"),
            processing_context = processing_canvas.getContext('2d');
        processing_canvas.width = width;
        processing_canvas.height = height;
        processing_context.drawImage(image, 0, 0);
        const imageData = processing_context.getImageData(0, 0, width, height);
        worker.worker.postMessage({
            /** @export */ src: image.src, // use postMessage directly to pass buffer properly
            /** @export */ type: 'setData',
            /** @export */ data: imageData.data,
            /** @export */ width,
            /** @export */ height
        }, [imageData.data.buffer]);
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
        if (hasNullOrEmpty(data)) createPopup("Please fill in all required values to export (SPL and FR values)");
        else worker.postMessage(data);
    },
    addPoint: (x, y) => worker.postMessage({
        /** @export */ type: 'addPoint',
        /** @export */ x,
        /** @export */ y
    }),
    autoTrace: () => {
        worker.postMessage({
            /** @export */ type: 'autoTrace', colourTolerance: preferences.colourTolerance()
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
    currentlySelected: () => imageQueue.elem.querySelectorAll('img[class="selectedImage"]'),
    removeSelectedImage: () => {
        for (const i of imageQueue.currentlySelected()) i.classList.remove('selectedImage');
    },
    deleteImage: (img) => {
        imageMap.delete(img.src);
        worker.removeImage(img.src);
        URL.revokeObjectURL(img.src);
        img.remove();
    },
    scrollToSelected: () => {
        imageQueue.elem.querySelector('img[class="selectedImage"]').scrollIntoView({inline: 'center', behavior: 'smooth'});
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
            image.saveLines();
            image.src = src;
            imageQueue.removeSelectedImage();
            img.classList.add('selectedImage');
            imageQueue.scrollToSelected();
        });
        img.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (img.classList.contains('selectedImage')) {
                let newImage = img.nextElementSibling;
                if (!newImage) newImage = img.previousElementSibling;
                if (!newImage) initAll();
                else newImage.click();
            }
            imageQueue.deleteImage(img);
        })
        a.appendChild(img);
        if (display) {
            img.click();
            setTimeout(() => imageQueue.scrollToSelected(), 50);
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
document.getElementById('removeImage').addEventListener('click', () => document.querySelector('img[class="selectedImage"]')?.dispatchEvent(new Event('contextmenu')));
document.getElementById('toggleImageQueue').addEventListener('click', imageQueue.toggle);
document.getElementById('editImage').addEventListener('click', () => {
    if (image.isValid()) {
        const elem = document.createElement('div'),
            header = document.createElement('h3'),
            edit_buttons = document.createElement('div'),
            img_wrapper = document.createElement('div'),
            img = document.createElement('img');
        elem.id = 'editContainer';
        elem.append(header, edit_buttons, img_wrapper);
        img_wrapper.append(img);
        img_wrapper.classList.add('cropWrapper');
        img.draggable = false;
        header.textContent = 'Edit Image';
        img.src = image.src;

        const activeFilters = new Set();
        // safari check
        const safari = !('filter' in CanvasRenderingContext2D.prototype),
            filters = !safari ? {
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
                                createPopup('Invalid value.', {overlay: true});
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
            const canvas = document.createElement("canvas"),
                ctx = canvas.getContext('2d');
            canvas.width = width;
            canvas.height = height;

            if (!safari) ctx.filter = img.style.filter;
            ctx.drawImage(img, 0, 0);

            if (safari) {
                // should only fire for safari, which does not support 2d context filter
                // i ain't implementing the other filters :serioussssly:
                console.log("Using fallback invert mode");
                const imageData = ctx.getImageData(0, 0, width, height),
                    data = imageData.data, l = data.length;
                for (let i = 0; i < l; i += 4) {
                    data[i] = 255 - data[i];
                    data[i + 1] = 255 - data[i + 1];
                    data[i + 2] = 255 - data[i + 2];
                }
                ctx.putImageData(imageData, 0, 0);
            }

            document.getElementById('removeImage').click();
            canvas.toBlob((b) => {
                imageQueue.addImage(URL.createObjectURL(b), true);
                clearPopups();
            })
        }, {once: true});
        createPopup(elem, {buttons});
    } else createPopup('No valid image selected');
});

// Initialise the page
resetToDefault();
initAll();

fileInput.loadFiles = (files) => {
    const validFiles = Array.from(files).filter((f) => f.type.startsWith("image/")), lastId = validFiles.length - 1;
    if (validFiles.length > 0) {
        clearPopups();
        validFiles.forEach((file, index) => {
            file = URL.createObjectURL(file);
            imageQueue.addImage(file, index === lastId);
        });
    }
    else createPopup("Invalid image/file(s) added!");
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

{ // Move canvas lines with buttons
    let holdInterval, line, snap = preferences.snapToLines();
    document.getElementById('snapToLines').addEventListener('change', () => snap = preferences.snapToLines());

    document.getElementById('buttonSection').addEventListener('pointerdown', (e) => {
        const t = e.target, p = t.parentNode;
        if (!holdInterval && p.classList.contains('moveButtons')) {
            e.preventDefault();
            line = lines.lines[p.dataset["for"]];
            if (!snap) {
                holdInterval = setInterval(() => {
                    lines.setPosition(line, lines.getPosition(line) + parseInt(t.dataset["direction"], 10) * sizeRatio);
                }, 10);
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
        console.time("Initialise image");
        worker.addImage(width, height); // implicitly sets as current
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
        imageData.initial = false;
    } else {
        worker.setCurrent();
        image.loadLines();
        worker.getCurrentPath();
    }
    lines.updateLineWidth();
});

image.addEventListener('error', () => {
    if (image.isValid()) {
        for (const img of imageQueue.currentlySelected()) imageQueue.deleteImage(img);
        createPopup("Error loading this image, it may be malformed");
    }
});

{ // keybindings
    const pointerDown = new PointerEvent('pointerdown', {bubbles: true}), pointerUp = new PointerEvent('pointerup', {bubbles: true});
    const keydownMap = {
        /** @export */ z: (e) => e.ctrlKey && document.getElementById(e.shiftKey ? 'redo' : 'undo').click(),
        /** @export */ a: () => document.getElementById('autoPath').click(),
        /** @export */ t: () => document.getElementById('selectPath').click(),
        /** @export */ p: () => document.getElementById('selectPoint').click(),
        /** @export */ h: () => document.getElementById('toggleImageQueue').click(),
        /** @export */ s: (e) => document.getElementById(e.ctrlKey ? 'export' : 'smoothTrace').click(),
        /** @export */ e: (e) => document.getElementById(e.ctrlKey ? 'editImage' : 'eraseRegion').click(),
        /** @export */ enter: () => document.getElementById('fileInputButton').click(),
        /** @export */ delete: () => document.getElementById('removeImage').click(),
        /** @export */ backspace: () => document.getElementById('clearPath').click(),
        /** @export */ arrowup: (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerDown),
        /** @export */ arrowdown: (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerDown),
        /** @export */ arrowleft: (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerDown),
        /** @export */ arrowright: (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerDown),
    };
    const keyupMap = {
        /** @export */ arrowup: (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerUp),
        /** @export */ arrowdown: (e) => document.querySelector(`[data-for="y${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerUp),
        /** @export */ arrowleft: (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="-1"]`).dispatchEvent(pointerUp),
        /** @export */ arrowright: (e) => document.querySelector(`[data-for="x${e.shiftKey ? 'Low' : 'High'}"] > [data-direction="1"]`).dispatchEvent(pointerUp),
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
        if (e.value < e.min) e.value = e.min;
    }

    for (const id of ['FRLower', 'colourTolerance', 'lowFRExport']) {
        document.getElementById(id).addEventListener('change', minVal);
    }
}