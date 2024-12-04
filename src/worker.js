// emscripten wasm glue code
var Module=typeof Module!="undefined"?Module:{};var ENVIRONMENT_IS_WEB=false;var ENVIRONMENT_IS_WORKER=true;var moduleOverrides=Object.assign({},Module);var arguments_=[];var thisProgram="./this.program";var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){if(ENVIRONMENT_IS_WORKER){scriptDirectory=self.location.href}else if(typeof document!="undefined"&&document.currentScript){scriptDirectory=document.currentScript.src}if(scriptDirectory.startsWith("blob:")){scriptDirectory=""}else{scriptDirectory=scriptDirectory.substr(0,scriptDirectory.replace(/[?#].*/,"").lastIndexOf("/")+1)}{if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=url=>fetch(url,{credentials:"same-origin"}).then(response=>{if(response.ok){return response.arrayBuffer()}return Promise.reject(new Error(response.status+" : "+response.url))})}}else{}var out=Module["print"]||console.log.bind(console);var err=Module["printErr"]||console.error.bind(console);Object.assign(Module,moduleOverrides);moduleOverrides=null;if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];var wasmBinary=Module["wasmBinary"];var wasmMemory;var ABORT=false;var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;function updateMemoryViews(){var b=wasmMemory.buffer;Module["HEAP8"]=HEAP8=new Int8Array(b);Module["HEAP16"]=HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);Module["HEAPU16"]=HEAPU16=new Uint16Array(b);Module["HEAP32"]=HEAP32=new Int32Array(b);Module["HEAPU32"]=HEAPU32=new Uint32Array(b);Module["HEAPF32"]=HEAPF32=new Float32Array(b);Module["HEAPF64"]=HEAPF64=new Float64Array(b)}var __ATPRERUN__=[];var __ATINIT__=[];var __ATPOSTRUN__=[];var runtimeInitialized=false;function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}callRuntimeCallbacks(__ATPRERUN__)}function initRuntime(){runtimeInitialized=true;callRuntimeCallbacks(__ATINIT__)}function postRun(){if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}callRuntimeCallbacks(__ATPOSTRUN__)}function addOnPreRun(cb){__ATPRERUN__.unshift(cb)}function addOnInit(cb){__ATINIT__.unshift(cb)}function addOnPostRun(cb){__ATPOSTRUN__.unshift(cb)}var runDependencies=0;var runDependencyWatcher=null;var dependenciesFulfilled=null;function addRunDependency(id){runDependencies++;Module["monitorRunDependencies"]?.(runDependencies)}function removeRunDependency(id){runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0){if(runDependencyWatcher!==null){clearInterval(runDependencyWatcher);runDependencyWatcher=null}if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}}function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);throw e}var dataURIPrefix="data:application/octet-stream;base64,";var isDataURI=filename=>filename.startsWith(dataURIPrefix);function findWasmBinary(){var f="a.out.wasm";if(!isDataURI(f)){return locateFile(f)}return f}var wasmBinaryFile;function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}function getBinaryPromise(binaryFile){if(!wasmBinary){return readAsync(binaryFile).then(response=>new Uint8Array(response),()=>getBinarySync(binaryFile))}return Promise.resolve().then(()=>getBinarySync(binaryFile))}function instantiateArrayBuffer(binaryFile,imports,receiver){return getBinaryPromise(binaryFile).then(binary=>WebAssembly.instantiate(binary,imports)).then(receiver,reason=>{err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)})}function instantiateAsync(binary,binaryFile,imports,callback){if(!binary&&typeof WebAssembly.instantiateStreaming=="function"&&!isDataURI(binaryFile)&&typeof fetch=="function"){return fetch(binaryFile,{credentials:"same-origin"}).then(response=>{var result=WebAssembly.instantiateStreaming(response,imports);return result.then(callback,function(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation");return instantiateArrayBuffer(binaryFile,imports,callback)})})}return instantiateArrayBuffer(binaryFile,imports,callback)}function getWasmImports(){return{a:wasmImports}}function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmMemory=wasmExports["d"];updateMemoryViews();addOnInit(wasmExports["e"]);removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");function receiveInstantiationResult(result){receiveInstance(result["instance"])}var info=getWasmImports();if(Module["instantiateWasm"]){try{return Module["instantiateWasm"](info,receiveInstance)}catch(e){err(`Module.instantiateWasm callback failed with error: ${e}`);return false}}wasmBinaryFile??=findWasmBinary();instantiateAsync(wasmBinary,wasmBinaryFile,info,receiveInstantiationResult);return{}}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var noExitRuntime=Module["noExitRuntime"]||true;var stackRestore=val=>__emscripten_stack_restore(val);var stackSave=()=>_emscripten_stack_get_current();var __abort_js=()=>abort("");var __emscripten_memcpy_js=(dest,src,num)=>HEAPU8.copyWithin(dest,src,src+num);var getHeapMax=()=>2147483648;var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var growMemory=size=>{var b=wasmMemory.buffer;var pages=(size-b.byteLength+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){}};var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false};var getCFunc=ident=>{var func=Module["_"+ident];return func};var writeArrayToMemory=(array,buffer)=>{HEAP8.set(array,buffer)};var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343){var u1=str.charCodeAt(++i);u=65536+((u&1023)<<10)|u1&1023}if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}}heap[outIdx]=0;return outIdx-startIdx};var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var UTF8Decoder=typeof TextDecoder!="undefined"?new TextDecoder:undefined;var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead=NaN)=>{var endIdx=idx+maxBytesToRead;var endPtr=idx;while(heapOrArray[endPtr]&&!(endPtr>=endIdx))++endPtr;if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var UTF8ToString=(ptr,maxBytesToRead)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead):"";var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return ret},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return ret}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(ret)}if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type==="number"||type==="boolean");var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return(...args)=>ccall(ident,returnType,argTypes,args,opts)};var wasmImports={c:__abort_js,b:__emscripten_memcpy_js,a:_emscripten_resize_heap};var wasmExports=createWasm();var ___wasm_call_ctors=()=>(___wasm_call_ctors=wasmExports["e"])();var _create_buffer=Module["_create_buffer"]=(a0,a1)=>(_create_buffer=Module["_create_buffer"]=wasmExports["g"])(a0,a1);var _addImage=Module["_addImage"]=(a0,a1,a2,a3)=>(_addImage=Module["_addImage"]=wasmExports["h"])(a0,a1,a2,a3);var _removeImage=Module["_removeImage"]=a0=>(_removeImage=Module["_removeImage"]=wasmExports["i"])(a0);var _trace=Module["_trace"]=(a0,a1,a2,a3,a4,a5)=>(_trace=Module["_trace"]=wasmExports["j"])(a0,a1,a2,a3,a4,a5);var _undo=Module["_undo"]=a0=>(_undo=Module["_undo"]=wasmExports["k"])(a0);var _redo=Module["_redo"]=a0=>(_redo=Module["_redo"]=wasmExports["l"])(a0);var _clear=Module["_clear"]=a0=>(_clear=Module["_clear"]=wasmExports["m"])(a0);var _point=Module["_point"]=(a0,a1,a2)=>(_point=Module["_point"]=wasmExports["n"])(a0,a1,a2);var _autoTrace=Module["_autoTrace"]=(a0,a1,a2,a3)=>(_autoTrace=Module["_autoTrace"]=wasmExports["o"])(a0,a1,a2,a3);var _exportTrace=Module["_exportTrace"]=(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12)=>(_exportTrace=Module["_exportTrace"]=wasmExports["p"])(a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12);var _snap=Module["_snap"]=(a0,a1,a2,a3)=>(_snap=Module["_snap"]=wasmExports["q"])(a0,a1,a2,a3);var _getPixelColour=Module["_getPixelColour"]=(a0,a1,a2)=>(_getPixelColour=Module["_getPixelColour"]=wasmExports["r"])(a0,a1,a2);var __emscripten_stack_restore=a0=>(__emscripten_stack_restore=wasmExports["s"])(a0);var __emscripten_stack_alloc=a0=>(__emscripten_stack_alloc=wasmExports["t"])(a0);var _emscripten_stack_get_current=()=>(_emscripten_stack_get_current=wasmExports["u"])();Module["cwrap"]=cwrap;var calledRun;dependenciesFulfilled=function runCaller(){if(!calledRun)run();if(!calledRun)dependenciesFulfilled=runCaller};function run(){if(runDependencies>0){return}preRun();if(runDependencies>0){return}function doRun(){if(calledRun)return;calledRun=true;Module["calledRun"]=true;if(ABORT)return;initRuntime();Module["onRuntimeInitialized"]?.();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun()},1)}else{doRun()}}if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].pop()()}}run();

const typeMap = {
    removeImage: removeImage,
    setData: addImage,

    clearTrace: clear,
    undoTrace: undo,
    redoTrace: redo,

    exportTrace: exportTrace,

    addPoint: point,
    autoTrace: auto,
    trace: trace,

    snapLine: snapLine,

    getPixelColour: getPixelColour
}, api = {
    create_buffer: Module.cwrap("create_buffer", "number", ["number", "number"]),
    trace: Module.cwrap("trace", "string", ["string", "number", "number", "number", "number", "number"]),
    addImage: Module.cwrap("addImage", "", ["string", "number", "number", "number"]),
    removeImage: Module.cwrap("removeImage", "", ["string"]),
    point: Module.cwrap("point", "string", ["string", "number", "number"]),
    undo: Module.cwrap("undo", "string", ["string"]),
    redo: Module.cwrap("redo", "string", ["string"]),
    clear: Module.cwrap("clear", "", ["string"]),
    auto: Module.cwrap("autoTrace", "string", ["string", "number", "number", "number"]),
    exportTrace: Module.cwrap("exportTrace", "string", ["string", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number"]),
    snap: Module.cwrap("snap", "number", ["string", "number", "number", "number"]),
    getPixelColour: Module.cwrap("getPixelColour", "string", ["string", "number", "number"])
};

// onMessage handling
onmessage = (e) => {
    const d = e.data;
    const r = typeMap[d.type](d);
    if (r) {
        postMessage(r);
    }
}

// Image control
function addImage(data) {
    const p = api.create_buffer(data.width, data.height);
    Module.HEAPU8.set(data.data, p);
    api.addImage(data.src, p, parseInt(data.width), parseInt(data.height));
}

function removeImage(data) {
    api.removeImage(data.src);
}

// Tracing
function trace(data) {
    return defaultTraceResponse(data, api.trace(data.src, parseInt(data.x), parseInt(data.y),
        0, 0, parseInt(data.colourTolerance))); // Zeros replacing line jump and thickness
}

function point(data) {
    return defaultTraceResponse(data, api.point(data.src, parseInt(data.x), parseInt(data.y)));
}

function auto(data) {
    return defaultTraceResponse(data, api.auto(data.src, 0, 0, parseInt(data.colourTolerance)));
}

function undo(data) {
    return defaultTraceResponse(data, api.undo(data.src));
}

function redo(data) {
    return defaultTraceResponse(data, api.redo(data.src));
}

function clear(data) {
    api.clear(data.src);
}

function defaultTraceResponse(data, response) {
    response = response.split("|");
    data.svg = response[1];
    data.colour = response[0];
    return data;
}

// Export
function exportTrace(data) {
    data.export = api.exportTrace(data.src, parseInt(data.PPO), data.delim === "tab" ? 1 : 0,
        parseFloat(data.lowFR), parseFloat(data.highFR), parseFloat(data.SPL.top), parseFloat(data.SPL.topPixel),
        parseFloat(data.SPL.bottom), parseFloat(data.SPL.bottomPixel), parseFloat(data.FR.top),
        parseFloat(data.FR.topPixel), parseFloat(data.FR.bottom), parseFloat(data.FR.bottomPixel));
    return data;
}

// Lines
function snapLine(data) {
    data.line.position = api.snap(data.src, parseInt(data.line.position), data.line.direction === "x" ? 1 : 0, parseInt(data.direction));
    return data;
}

// Image Data
function getPixelColour(data) {
    data.pixelColour = api.getPixelColour(data.src, parseInt(data.x), parseInt(data.y));
    return data;
}