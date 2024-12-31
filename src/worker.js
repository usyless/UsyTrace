self.importScripts('./a.out.js');

const typeMap = {
    setCurrent: setCurrent,
    removeImage: removeImage,
    setData: addImage,
    getHistoryStatus: getHistoryStatus,

    clearTrace: clear,
    undoTrace: undo,
    redoTrace: redo,
    eraseRegion: eraseRegion,
    smoothTrace: smoothTrace,

    exportTrace: exportTrace,

    addPoint: point,
    autoTrace: auto,
    trace: trace,

    snapLine: snapLine,

    getPixelColour: getPixelColour,
    getCurrentPath: getCurrentPath
}, api = {
    create_buffer: Module.cwrap("create_buffer", "number", ["number", "number"]),
    setCurrent: Module.cwrap("setCurrent", "", ["string"]),
    addImage: Module.cwrap("addImage", "", ["string", "number", "number", "number"]),
    removeImage: Module.cwrap("removeImage", "", ["string"]),
    historyStatus: Module.cwrap("historyStatus", "number"),
    trace: Module.cwrap("trace", "string", ["number", "number", "number"]),
    point: Module.cwrap("point", "string", ["number", "number"]),
    undo: Module.cwrap("undo", "string"),
    redo: Module.cwrap("redo", "string"),
    eraseRegion: Module.cwrap("eraseRegion", "string", ["number", "number"]),
    smoothTrace: Module.cwrap("smoothTrace", "string"),
    clear: Module.cwrap("clear", ""),
    auto: Module.cwrap("autoTrace", "string", ["number"]),
    exportTrace: Module.cwrap("exportTrace", "string", ["number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number"]),
    snap: Module.cwrap("snap", "number", ["number", "number", "number"]),
    getPixelColour: Module.cwrap("getPixelColour", "number", ["number", "number"]),
    getCurrentPath: Module.cwrap("getCurrentPath", "string")
};

let initialised = false;
const preInitQueue = [];
const messageListener = (e) => {
    if (initialised) {
        const d = e.data;
        let r;
        try {
            r = typeMap[d.type](d);
        } catch (e) {
            console.error(e.message);
            r = {
                type: 'error',
                message: 'Out of memory, please refresh the site. (You must have loaded a LOT of images at once)'
            }
        }
        if (r) postMessage(r);
    } else preInitQueue.push(e);
}

function onLoad() {
    console.info("WASM Initialised, ready to trace.");
    initialised = true;
    for (const e of preInitQueue) messageListener(e);
}

// onMessage handling
onmessage = messageListener;

// Image control
function setCurrent(data) {
    api.setCurrent(data.src);
}

function addImage(data) {
    const p = api.create_buffer(data.width, data.height);
    Module.HEAPU8.set(data.data, p);
    api.addImage(data.src, p, parseInt(data.width), parseInt(data.height));
    return {src: data.src, type: data.type};
}

function removeImage(data) {
    api.removeImage(data.src);
}

function getHistoryStatus(data) {
    const value = api.historyStatus();
    data.undo = Boolean((value & 2) >> 1);
    data.redo = Boolean(value & 1);
    return data;
}

// Tracing
function trace(data) {
    return defaultTraceResponse(data, api.trace(parseInt(data.x), parseInt(data.y), parseInt(data.colourTolerance)));
}

function point(data) {
    return defaultTraceResponse(data, api.point(parseInt(data.x), parseInt(data.y)));
}

function auto(data) {
    return defaultTraceResponse(data, api.auto(parseInt(data.colourTolerance)));
}

function undo(data) {
    return defaultTraceResponse(data, api.undo());
}

function redo(data) {
    return defaultTraceResponse(data, api.redo());
}

function eraseRegion(data) {
    return defaultTraceResponse(data, api.eraseRegion(parseInt(data.begin), parseInt(data.end)));
}

function smoothTrace(data) {
    return defaultTraceResponse(data, api.smoothTrace());
}

function clear(data) {
    return defaultTraceResponse(data, api.clear());
}

// Export
function exportTrace(data) {
    data.export = api.exportTrace(parseInt(data.PPO), data.delim === "tab" ? 1 : 0,
        parseFloat(data.lowFR), parseFloat(data.highFR), parseFloat(data.SPL.top), parseFloat(data.SPL.topPixel),
        parseFloat(data.SPL.bottom), parseFloat(data.SPL.bottomPixel), parseFloat(data.FR.top),
        parseFloat(data.FR.topPixel), parseFloat(data.FR.bottom), parseFloat(data.FR.bottomPixel));
    return data;
}

// Lines
function snapLine(data) {
    data.line.position = api.snap(parseInt(data.line.position), data.line.direction === "x" ? 1 : 0, parseInt(data.direction));
    return data;
}

// Image Data
function getPixelColour(data) {
    const value = api.getPixelColour(parseInt(data.x), parseInt(data.y));
    data.pixelColour = `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
    return data;
}

function getCurrentPath(data) {
    return defaultTraceResponse(data, api.getCurrentPath());
}

function defaultTraceResponse(data, response) {
    data.svg = response;
    return data;
}