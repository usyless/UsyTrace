const api = {
    create_buffer: Module["_create_buffer"], // ["cwrap"]("create_buffer", "number", ["number", "number"]),
    setCurrent: Module["cwrap"]("setCurrent", "", ["string"]),
    addImage: Module["cwrap"]("addImage", "", ["string", "number", "number", "number"]),
    removeImage: Module["cwrap"]("removeImage", "", ["string"]),
    historyStatus: Module["_historyStatus"], // ["cwrap"]("historyStatus", "number"),
    trace: Module["cwrap"]("trace", "string", ["number", "number", "number"]),
    point: Module["cwrap"]("point", "string", ["number", "number"]),
    undo: Module["cwrap"]("undo", "string"),
    redo: Module["cwrap"]("redo", "string"),
    eraseRegion: Module["cwrap"]("eraseRegion", "string", ["number", "number"]),
    smoothTrace: Module["cwrap"]("smoothTrace", "string"),
    clear: Module["_clear"], // ["cwrap"]("clear", ""),
    auto: Module["cwrap"]("autoTrace", "string", ["number"]),
    exportTrace: Module["cwrap"]("exportTrace", "string", Array(12).fill("number")),
    snap: Module["_snap"], // ["cwrap"]("snap", "number", ["number", "number", "number"]),
    getPixelColour: Module["_getPixelColour"], // ["cwrap"]("getPixelColour", "number", ["number", "number"]),
    getCurrentPath: Module["cwrap"]("getCurrentPath", "string")
}

const defaultTraceResponse = (data, response) => {
    data["svg"] = response;
    return data;
}

const typeMap = {
    /** @export */
    setCurrent: (data) => api.setCurrent(data["src"]),
    /** @export */
    removeImage: (data) => api.removeImage(data["src"]),
    /** @export */
    setData: (data) => {
        const p = api.create_buffer(parseInt(data["width"], 10), parseInt(data["height"], 10));
        Module["HEAPU8"]["set"](data["data"], p);
        api.addImage(data["src"], p, parseInt(data["width"], 10), parseInt(data["height"], 10));
        return {
            /** @export */
            src: data["src"],
            /** @export */
            type: data["type"]
        };
    },
    /** @export */
    getHistoryStatus: (data) => {
        const value = api.historyStatus();
        data["undo"] = Boolean((value & 2) >> 1);
        data["redo"] = Boolean(value & 1);
        return data;
    },

    /** @export */
    clearTrace: (data) => defaultTraceResponse(data, api.clear()),
    /** @export */
    undoTrace: (data) => defaultTraceResponse(data, api.undo()),
    /** @export */
    redoTrace: (data) => defaultTraceResponse(data, api.redo()),
    /** @export */
    eraseRegion: (data) => defaultTraceResponse(data, api.eraseRegion(parseInt(data["begin"], 10), parseInt(data["end"], 10))),
    /** @export */
    smoothTrace: (data) => defaultTraceResponse(data, api.smoothTrace()),

    /** @export */
    exportTrace: (data) => {
        data["export"] = api.exportTrace(parseInt(data["PPO"], 10), data["delim"] === "tab" ? 1 : 0,
            parseFloat(data["lowFR"]), parseFloat(data["highFR"]), parseFloat(data["SPL"]["top"]), parseFloat(data["SPL"]["topPixel"]),
            parseFloat(data["SPL"]["bottom"]), parseFloat(data["SPL"]["bottomPixel"]), parseFloat(data["FR"]["top"]),
            parseFloat(data["FR"]["topPixel"]), parseFloat(data["FR"]["bottom"]), parseFloat(data["FR"]["bottomPixel"]));
        return data;
    },

    /** @export */
    addPoint: (data) => defaultTraceResponse(data, api.point(parseInt(data["x"], 10), parseInt(data["y"], 10))),
    /** @export */
    autoTrace: (data) => defaultTraceResponse(data, api.auto(parseInt(data["colourTolerance"], 10))),
    /** @export */
    trace: (data) => defaultTraceResponse(data, api.trace(parseInt(data["x"], 10), parseInt(data["y"], 10), parseInt(data["colourTolerance"], 10))),

    /** @export */
    snapLine: (data) => {
        data["line"]["position"] = api.snap(parseInt(data["line"]["position"]), data["line"]["direction"] === "x" ? 1 : 0, parseInt(data["direction"], 10));
        return data;
    },

    /** @export */
    getPixelColour: (data) => {
        const value = api.getPixelColour(parseInt(data["x"], 10), parseInt(data["y"], 10));
        data["pixelColour"] = `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
        return data;
    },
    /** @export */
    getCurrentPath: (data) => defaultTraceResponse(data, api.getCurrentPath())
}

let initialised = false;
const preInitQueue = [];
const messageListener = (e) => {
    if (initialised) {
        e = e["data"];
        let r;
        try {
            r = typeMap[e["type"]](e);
        } catch (err) {
            console.error(err["message"]);
            r = {
                /** @export */
                type: 'error',
                /** @export */
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

self.onmessage = messageListener;