<h1 align="center"><a href="https://usyless.uk/trace"><img src="https://github.com/usyless/UsyTrace/blob/main/src/favicon.svg?raw=true" alt="logo" width="160" height="160"></a><br>UsyTrace</h1><h3 align="center">Online Frequency Response Tracer</h3>

- https://usyless.uk/trace
- All Processing is done on device and no analytics are performed. 
- #### Feel free to contribute or suggest changes
- #### Found a bug? Report it to @usy_ on Discord!

# General use
- Press "Choose Image" and choose an image to trace from, drop any images onto the page, or paste an image into the page using Ctrl+V
- Align the top and bottom lines for SPL and Frequency to known values, then input those in the sidebar
- The line should be traced initially, if it is not, refer below
- Press "Export Trace"

### If auto trace fails
- Click "Clear Path" to make sure any auto traced line does not mess with your new trace
- Click "Select Path", then click on your line to trace
- If you find that it hasn't selected the whole line, you can click on the region it has not selected to try to select more (Adjust settings as a last resort)
- Made a mistake or cleared the trace? Use the "Undo" button
- Undone too much? Use the "Redo" button
- Use "Add Point" to add points manually to the trace

### Mobile Specifics
- Move the SPL and Frequency lines by using the buttons, selecting the line to trace works as normal but may require more tries

# Trace Settings:
### Colour Tolerance
- Adjust the maximum tolerance for colours that the tracer takes into account when tracing the line
- Increase this if the tracer isn't selecting the whole line
- Decrease this if the trace is jittery

# Export Settings
### Points Per Octave
- The points per octave to export data with, applied smoothing is half of the export PPO
### Delimitation
- Whether to use tab or space between exported frequency and spl pairs
### Minimum Frequency
- The minimum frequency to export to, will draw a straight line from first data point to minimum frequency
### Maximum Frequency
- The maximum frequency to export to, will draw a straight line from the last data point to maximum frequency

# Compiling Instructions
1. Download and install [emscripten](https://emscripten.org/)
2. Make sure to install `3.1.74`, newer versions perform worse with tracing (this will be fixed eventually)
3. Compile with build.bat, or for linux, follow the compiling commands in .github/workflows/main.yml

### Info/Extras
- Default heap size set to 100mb
- Set stack size with -sSTACK_SIZE=size in bytes
- Set max memory with -sMAXIMUM_MEMORY=size in bytes (2gb by default, >2gb has performance penalty afaik)
- To use c++20 features: -std=c++20
- Pass -msimd128 to auto add SIMD, seems to make no noticeable performance difference for now
