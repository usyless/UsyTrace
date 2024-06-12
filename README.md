# UsyTrace: Online Frequency Response Tracer

- https://usyless.github.io/trace
- All Processing is done on device and no analytics are performed. 
- #### Feel free to contribute or suggest changes
- #### Found a bug? Report it to @usy_ on Discord!

## General use
- Press "Choose Image" and choose an image to trace from
- Align the top and bottom lines for SPL and Frequency to known values, then input those in the sidebar
- The line should be traced initially, if it is not, refer below
- Press "Export Trace"

### If auto trace fails
- Click "Clear Path" to make sure any auto traced line does not mess with your new trace
- Click "Select Path", then click on your line to trace
- If you find that it hasn't selected the whole line, you can click on the region it has not selected to try to select more (Adjust settings as a last resort)
- Made a mistake? The undo button can bring you back one trace
- Use "Add Point" to add points manually to the trace

### Mobile Specifics
- Move the SPL and Frequency lines by using the buttons, selecting the line to trace works as normal but may require more tries

## Trace Settings:
### Colour Tolerance
- Adjust the maximum tolerance for colours that the tracer takes into account when tracing the line
- Increase this if the tracer isn't selecting the whole line
- Decrease this if the trace is jittery
### Max Line Thickness Offset
- Adjust the offset of the maximum thickness of the line being traced in pixels
- Decrease this if your trace is jittery
### Largest Contiguous jump Offset
- The offset for the largest distance in pixels that the tracer will allow as a contiguous line
- Increase this to trace lines that have breaks in them, such as target lines
- Decrease this if the tracer is tracing stuff to the left and right of the line

## Export Settings
### Points Per Octave
- The points per octave to export data with, applied smoothing is half of the export PPO
### Delimitation
- Whether to use tab or space between exported frequency and spl pairs
### Minimum Frequency
- The minimum frequency to export to, will draw a straight line from first data point to minimum frequency
### Maximum Frequency
- The maximum frequency to export to, will draw a straight line from the last data point to maximum frequency
### SPL Precision
- With how many decimal places to save SPL values to
### Frequency Precision
- With how many decimal places to save Frequency values to
