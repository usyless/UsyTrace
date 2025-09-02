const messageQueue = [];
const onLoad = () => {
    const decode = TextDecoder.prototype.decode.bind(new TextDecoder('utf-8'));
    const readStringFromMemory = (ptr) => {
        const str = decode(new Uint8Array(HEAPU8.buffer, HEAPU32[ptr / 4], HEAPU32[(ptr / 4) + 1]));
        Module["_clean_string"](ptr);
        return str;
    }

    const stringReturn = (func) => (...args) => readStringFromMemory(func(...args));

    const srcMap = new Map();
    const api = {
        create_buffer: Module["_create_buffer"],
        setCurrent_: (src) => Module["_setCurrent"](srcMap.get(src)),
        addImage_: (src, buf, width, height) => srcMap.set(src, Module["_addImage"](buf, width, height)),
        removeImage_: (src) => {
            Module["_removeImage"](srcMap.get(src));
            srcMap.delete(src);
        },
        historyStatus: Module["_historyStatus"],
        trace_: stringReturn(Module["_trace"]),
        point: stringReturn(Module["_point"]),
        undo: stringReturn(Module["_undo"]),
        redo: stringReturn(Module["_redo"]),
        erase: stringReturn(Module["_eraseRegion"]),
        smooth: stringReturn(Module["_smoothTrace"]),
        clear: Module["_clear"],
        auto: stringReturn(Module["_autoTrace"]),
        export: stringReturn(Module["_exportTrace"]),
        snap: Module["_snap"],
        pixelColor: Module["_getPixelColour"],
        currentPath: stringReturn(Module["_getCurrentPath"]),
    }

    const defaultTraceResponse = (data, response) => {
        data["svg"] = response;
        return data;
    }

    const typeMap = {
        /** @export */ setCurrent: (data) => api.setCurrent_(data["src"]),
        /** @export */ removeImage: (data) => api.removeImage_(data["src"]),
        /** @export */ setData: (data) => {
            const p = api.create_buffer(parseInt(data["width"], 10), parseInt(data["height"], 10));
            HEAPU8.set(data["data"], p);
            api.addImage_(data["src"], p, parseInt(data["width"], 10), parseInt(data["height"], 10));
            return {
                /** @export */ src: data["src"],
                /** @export */ type: data["type"]
            };
        },
        /** @export */ getHistoryStatus: (data) => {
            const value = api.historyStatus();
            data["undo"] = Boolean((value & 2) >> 1);
            data["redo"] = Boolean(value & 1);
            return data;
        },

        /** @export */ clearTrace: (data) => defaultTraceResponse(data, api.clear()),
        /** @export */ undoTrace: (data) => defaultTraceResponse(data, api.undo()),
        /** @export */ redoTrace: (data) => defaultTraceResponse(data, api.redo()),
        /** @export */ eraseRegion: (data) => defaultTraceResponse(data, api.erase(parseInt(data["begin"], 10), parseInt(data["end"], 10))),
        /** @export */ smoothTrace: (data) => defaultTraceResponse(data, api.smooth()),

        /** @export */ exportTrace: (data) => {
            data["export"] = api.export(parseInt(data["PPO"], 10), data["delim"] === "tab" ? 1 : 0,
                parseFloat(data["lowFR"]), parseFloat(data["highFR"]), parseFloat(data["SPL"]["top"]), parseFloat(data["SPL"]["topPixel"]),
                parseFloat(data["SPL"]["bottom"]), parseFloat(data["SPL"]["bottomPixel"]), parseFloat(data["FR"]["top"]),
                parseFloat(data["FR"]["topPixel"]), parseFloat(data["FR"]["bottom"]), parseFloat(data["FR"]["bottomPixel"]));
            return data;
        },

        /** @export */ addPoint: (data) => defaultTraceResponse(data, api.point(parseInt(data["x"], 10), parseInt(data["y"], 10))),
        /** @export */ autoTrace: (data) => defaultTraceResponse(data, api.auto(parseInt(data["colourTolerance"], 10))),
        /** @export */ trace: (data) => defaultTraceResponse(data, api.trace_(parseInt(data["x"], 10), parseInt(data["y"], 10), parseInt(data["colourTolerance"], 10))),

        /** @export */ snapLine: (data) => {
            data["line"]["position"] = api.snap(parseInt(data["line"]["position"], 10), data["line"]["direction"] === "x" ? 1 : 0, parseInt(data["direction"], 10));
            return data;
        },

        /** @export */ getPixelColour: (data) => {
            const value = api.pixelColor(parseInt(data["x"], 10), parseInt(data["y"], 10));
            data["pixelColour"] = `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
            return data;
        },
        /** @export */ getCurrentPath: (data) => defaultTraceResponse(data, api.currentPath())
    }

    const messageListener = (e) => {
        e = e["data"];
        let r;
        try {
            r = typeMap[e["type"]](e);
        } catch (err) {
            console.error(err["message"]);
            r = {
                /** @export */ type: 'error',
                /** @export */ message: 'Out of memory, please refresh the site. (You must have loaded a LOT of images at once)'
            }
        }
        if (r) postMessage(r);
    }

    self.onmessage = messageListener;
    for (const e of messageQueue) messageListener(e);
    messageQueue.length = 0;
};

self.onmessage = (e) => messageQueue.push(e);