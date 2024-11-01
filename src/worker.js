let typeMap;

(async () => {
    const importObject = {
        env: {
            memory: new WebAssembly.Memory({initial: 1602, maximum: 15625})
        }
    }
    const wasmResult = await WebAssembly.instantiateStreaming(await fetch('./standalone.wasm'), importObject);
    const instance = wasmResult.instance;
    const exports = instance.exports;
    exports._initialize(); // emscripten thing (?)
    const memory = new Uint8Array(exports.memory.buffer);

    const passStringToWasm = (str) => { // must free after
        const lengthBytes = new Uint8Array(str.length + 1);
        for (let i = 0; i < str.length; ++i) lengthBytes[i] = str.charCodeAt(i);
        const bufferPointer = exports.malloc(lengthBytes.length);
        memory.set(lengthBytes, bufferPointer);
        return bufferPointer;
    }

     const readStringFromMemory = (ptr) => {
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

     const callFunction = (name, src, ...args) => {
         const p = passStringToWasm(src), r = exports[name](p, ...args);
         exports.free(p);
         return r;
     }

     typeMap = {
         removeImage: (data) => callFunction('removeImage', data.src),
         setData: (data) => {
             const p = exports.malloc(parseInt(data.data.length));
             memory.set(data.data, p);
             callFunction('addImage', data.src, p, parseInt(data.width), parseInt(data.height));
         },

         clearTrace: (data) => callFunction('clear', data.src),
         undoTrace: (data) => defaultTraceResponse(data, readStringFromMemory(callFunction('undo', data.src))),

         exportTrace: (data) => {
             data.export = readStringFromMemory(callFunction('exportTrace', data.src, data.delim === "tab" ? 1 : 0,
                 parseFloat(data.lowFR), parseFloat(data.highFR), parseFloat(data.SPL.top), parseFloat(data.SPL.topPixel),
                 parseFloat(data.SPL.bottom), parseFloat(data.SPL.bottomPixel), parseFloat(data.FR.top),
                 parseFloat(data.FR.topPixel), parseFloat(data.FR.bottom), parseFloat(data.FR.bottomPixel)));
            return data;
         },

         addPoint: (data) => defaultTraceResponse(data, readStringFromMemory(callFunction('point', data.src, parseInt(data.x), parseInt(data.y)))),
         autoTrace: (data) => defaultTraceResponse(data, readStringFromMemory(callFunction('autoTrace', data.src, 0, 0, parseInt(data.colourTolerance)))),
         trace: (data) => defaultTraceResponse(data, readStringFromMemory(callFunction('trace', data.src, parseInt(data.x), parseInt(data.y), 0, 0, parseInt(data.colourTolerance)))),

         snapLine: (data) => {
             data.line.position = callFunction('snap', data.src, parseInt(data.line.position), data.line.direction === "x" ? 1 : 0, parseInt(data.direction));
             return data;
         },

         getPixelColour: (data) => {
             data.pixelColour = readStringFromMemory(callFunction('getPixelColour', data.src, parseInt(data.x), parseInt(data.y)));
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