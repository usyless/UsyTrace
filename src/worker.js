let typeMap;

(async () => {
    const importObject = {
        env: {
            memory: new WebAssembly.Memory({initial: 4000, maximum: 15625})
        }
    }
    const wasmResult = await WebAssembly.instantiateStreaming(await fetch('./standalone.wasm'), importObject);
    const instance = wasmResult.instance;
    const exports = instance.exports;

    const passStringToWasm = (str) => { // must free after
        const lengthBytes = new Uint8Array(str.length + 1);
        for (let i = 0; i < str.length; ++i) lengthBytes[i] = str.charCodeAt(i);
        const bufferPointer = exports.malloc(lengthBytes.length);
        new Uint8Array(exports.memory.buffer).set(lengthBytes, bufferPointer);
        return bufferPointer;
    }

     const readStringFromMemory = (ptr) => {
         const memory = new Uint8Array(exports.memory.buffer);
         let str = '';
         let byte = memory[ptr];
         const originalPtr = ptr;
         while (byte !== 0) {
             str += String.fromCharCode(byte);
             byte = memory[++ptr];
         }
         exports.delete_return_string(originalPtr);
         return str;
     }

     typeMap = {
         removeImage: (data) => {
             const s = passStringToWasm(data.src);
             exports.removeImage(s);
             exports.free(s);
         },
         setData: (data) => {
             const p = exports.malloc(data.width * data.height * 4);
             new Uint8Array(exports.memory.buffer).set(data.data, p);
             const sp = passStringToWasm(data.src);
             exports.addImage(sp, p, parseInt(data.width), parseInt(data.height));
             exports.free(sp);
         },

         clearTrace: (data) => {
             const p = passStringToWasm(data.src);
             exports.clear(p);
             exports.free(p);
         },
         undoTrace: (data) => {
             const p = passStringToWasm(data.src);
             const r = readStringFromMemory(exports.undo(p));
             exports.free(p);
             return defaultTraceResponse(data, r);
         },

         exportTrace: (data) => {
             const p = passStringToWasm(data.src);
             data.export = readStringFromMemory(exports.exportTrace(p, data.delim === "tab" ? 1 : 0,
                 parseFloat(data.lowFR), parseFloat(data.highFR), parseFloat(data.SPL.top), parseFloat(data.SPL.topPixel),
                 parseFloat(data.SPL.bottom), parseFloat(data.SPL.bottomPixel), parseFloat(data.FR.top),
                 parseFloat(data.FR.topPixel), parseFloat(data.FR.bottom), parseFloat(data.FR.bottomPixel)));
             exports.free(p);
            return data;
         },

         addPoint: (data) => {
             const p = passStringToWasm(data.src);
             const r = readStringFromMemory(exports.point(p, parseInt(data.x), parseInt(data.y)));
             exports.free(p);
             return defaultTraceResponse(data, r);
         },
         autoTrace: (data) => {
             const p = passStringToWasm(data.src);
             const r = readStringFromMemory(exports.autoTrace(p, 0, 0, parseInt(data.colourTolerance)));
             exports.free(p);
             return defaultTraceResponse(data, r);
         },
         trace: (data) => {
             const p = passStringToWasm(data.src);
             const r = readStringFromMemory(exports.trace(p, parseInt(data.x), parseInt(data.y), 0, 0, parseInt(data.colourTolerance)));
             exports.free(p);
             return defaultTraceResponse(data, r);
         },

         snapLine: (data) => {
             const p = passStringToWasm(data.src);
             data.line.position = exports.snap(p, parseInt(data.line.position), data.line.direction === "x" ? 1 : 0, parseInt(data.direction));
             exports.free(p);
             return data;
         },

         getPixelColour: (data) => {
             const p = passStringToWasm(data.src);
             data.pixelColour = readStringFromMemory(exports.getPixelColour(p, parseInt(data.x), parseInt(data.y)));
             exports.free(p);
             return data;
         }
     }
})();

onmessage = (e) => {
    const r = typeMap?.[e.data.type]?.(e.data);
    r && postMessage(r);
}

function defaultTraceResponse(data, response) {
    response = response.split("|");
    data.svg = response[1];
    data.colour = response[0];
    return data;
}