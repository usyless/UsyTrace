#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdint>
#include <functional>
#include <iomanip>
#include <map>
#include <memory>
#include <numeric>
#include <stack>
#include <string>
#include <utility>
#include <vector>
#include <emscripten.h>
#include <string.h>
#include <set>

using namespace std;

using Colour = uint8_t;
using frTrace = map<uint32_t, uint32_t>;

struct RGB {
    Colour R, G, B;

    RGB(const Colour r, const Colour g, const Colour b) : R(r), G(g), B(b) {}

    static Colour biggestDifference(const RGB& rgb) {
        return max(max(rgb.R, rgb.G), rgb.B) - min(min(rgb.R, rgb.G), rgb.B);
    }

    double getDifference(const RGB& rgb) const {
        const auto rmean = (static_cast<int>(R) + static_cast<int>(rgb.R)) / 2;
        const auto rdiff = static_cast<int>(R) - static_cast<int>(rgb.R);
        const auto gdiff = static_cast<int>(G) - static_cast<int>(rgb.G);
        const auto bdiff = static_cast<int>(B) - static_cast<int>(rgb.B);
        return sqrt((512 + rmean) * ((rdiff * rdiff) >> 8) + 4 * (gdiff * gdiff) + (((767 - rmean) * (bdiff * bdiff)) >> 8));
    }

    bool operator==(const RGB& rgb) const {
        return R == rgb.R && G == rgb.G&& B == rgb.B;
    }

    bool operator<(const RGB& rgb) const {
        return R < rgb.R || G < rgb.G || B < rgb.B;
    }

    uint32_t sum() const {
        return static_cast<uint32_t>(R) + static_cast<uint32_t>(G) + static_cast<uint32_t>(B);
    }

    string toString() const {
        return to_string(R) + ", " + to_string(G) + ", " + to_string(B);
    }

    int toBin() const {
        return (static_cast<int>(R) << 16) | (static_cast<int>(G) << 8) | static_cast<int>(B);
    }
};

struct ImageData {
    Colour* data;
    const uint32_t width, height, channels;

    ImageData(Colour* data, const uint32_t width, const uint32_t height, const uint32_t channels) : data(data), width(width), height(height), channels(channels) {}

    inline RGB getRGB(const uint32_t x, const uint32_t y) const {
        const auto pos = (y * width + x) * channels;
        return RGB{data[pos], data[pos + 1], data[pos + 2]};
    }

    inline Colour getR(const uint32_t x, const uint32_t y) const {
        return data[(y * width + x) * channels];
    }

    inline size_t getMaxPos() const {
        return static_cast<size_t>(width) * static_cast<size_t>(height) * static_cast<size_t>(channels);
    }

    ~ImageData() {
        free(data);
    }
};

struct RGBTools {
    RGB rgb;
    uint32_t tolerance, count = 0;

    RGBTools(const RGB rgb, const uint32_t tolerance) : rgb(rgb), tolerance(tolerance) {}

    bool withinTolerance(const RGB& rgb) const {
        return this->rgb.getDifference(rgb) <= tolerance;
    }

    void addToAverage(const RGB& rgb) {
        const auto r1 = static_cast<int>(this->rgb.R);
        const auto r2 = static_cast<int>(rgb.R);
        const auto g1 = static_cast<int>(this->rgb.G);
        const auto g2 = static_cast<int>(rgb.G);
        const auto b1 = static_cast<int>(this->rgb.B);
        const auto b2 = static_cast<int>(rgb.B);
        this->rgb.R += static_cast<Colour>((sqrt(((r1 * r1) + (r2 * r2)) / 2) - r1) / count);
        this->rgb.G += static_cast<Colour>((sqrt(((g1 * g1) + (g2 * g2)) / 2) - g1) / count);
        this->rgb.B += static_cast<Colour>((sqrt(((b1 * b1) + (b2 * b2)) / 2) - b1) / count);
        ++count;
    }
};

struct TraceData {
    uint32_t x = 0, y = 0, colourTolerance = 0;

    TraceData(const uint32_t x, const uint32_t y) : x(x), y(y) {}
    TraceData(const uint32_t colourTolerance) : colourTolerance(colourTolerance) {}
    TraceData(const uint32_t x, const uint32_t y, const uint32_t colourTolerance) : x(x), y(y), colourTolerance(colourTolerance) {}
};

struct ExportData {
    int delim;
    double PPOStep, logMinFR, logMaxFR, logFRBottomValue, SPLRatio, FRRatio, SPLBottomValue, SPLBottomPixel, FRBottomPixel;

    ExportData(const int PPO, const int delim, const double lowFRExport,  const double highFRExport,
        const double SPLTopValue, const double SPLTopPixel, const double SPLBottomValue, const double SPLBottomPixel,
        const double FRTopValue, const double FRTopPixel, const double FRBottomValue, const double FRBottomPixel):
    delim(delim), PPOStep(log10(pow(2, 1.0 / PPO))), logMinFR(log10(lowFRExport)), logMaxFR(log10(highFRExport)),
    logFRBottomValue(log10(FRBottomValue)), SPLRatio((SPLTopValue - SPLBottomValue) / (SPLTopPixel - SPLBottomPixel)),
    FRRatio((log10(FRTopValue) - logFRBottomValue) / (FRTopPixel - FRBottomPixel)),
    SPLBottomValue(SPLBottomValue), SPLBottomPixel(SPLBottomPixel), FRBottomPixel(FRBottomPixel) {}
};

// delim 1 = tab, else = space
struct ExportString {
    string data;
    string delim;

    explicit ExportString(const int delim = 1) {
        if (delim == 1) {
            this->delim = "\t";
        } else {
            this->delim = " ";
        }
        data = "* Exported with UsyTrace, available at https://usyless.uk/trace\n* Freq(Hz)" + this->delim + "SPL(dB)";
    }

    void addData(const string&& freq, const string&& spl) {
        data += "\n" + freq + delim + spl;
    }

    string getData() const {
        return data;
    }
};

inline void checkPixel(const uint32_t x, const uint32_t y, const RGBTools& baselineColour, vector<uint32_t>& yValues, const ImageData* imageData, const uint32_t maxHeight) {
    if (const auto yVal = max<uint32_t>(0, min(maxHeight, y)); baselineColour.withinTolerance(imageData->getRGB(x, yVal))) yValues.push_back(yVal);
}

void traceFor(uint32_t startX, uint32_t startY, const uint32_t step, frTrace& trace, const ImageData* imageData, const uint32_t maxLineHeight, const uint32_t maxJump, RGBTools& colour) {
    vector<uint32_t>&& yValues{};
    uint32_t currJump = 0;
    const uint32_t maxHeight = imageData->height - 1;
    for (const auto width = imageData->width; startX >= 0 && startX < width; startX += step) {
        yValues.clear();
        const auto max = maxLineHeight + currJump * 2;
        checkPixel(startX, startY, colour, yValues, imageData, maxHeight);
        for (uint32_t z = 1; z <= max; ++z) {
            checkPixel(startX, startY + z, colour, yValues, imageData, maxHeight);
            checkPixel(startX, startY - z, colour, yValues, imageData, maxHeight);
        }
        if (!yValues.empty()) {
            currJump = 0;
            startY = reduce(yValues.begin(), yValues.end()) / static_cast<int>(yValues.size());
            trace[startX] = startY;
            colour.addToAverage(imageData->getRGB(startX, startY));
            continue;
        }
        if (currJump < maxJump) ++currJump;
        else break;
    }
}

struct Trace {
    const frTrace trace;

    Trace() : trace(std::move(frTrace{})) {}
    Trace(const frTrace& trace) : trace(trace) {}

    vector<pair<uint32_t, uint32_t>> clean() const {
        vector<pair<uint32_t, uint32_t>>&& simplifiedTrace{};
        if (!trace.empty()) {
            if (trace.size() > 2) {
                auto iter = trace.begin();
                simplifiedTrace.emplace_back(iter->first, iter->second);
                vector<uint32_t>&& identity{};
                const auto& end = trace.end();
                for(++iter; iter != end; ++iter) {
                    identity.clear();
                    const auto previousValue = iter->second;
                    do {
                        identity.emplace_back(iter->first);
                        ++iter;
                    } while(iter != end && iter->second == previousValue);
                    --iter;
                    if (identity.size() == 1) simplifiedTrace.emplace_back(identity[0], previousValue);
                    else simplifiedTrace.emplace_back(reduce(identity.begin(), identity.end()) / identity.size(), previousValue);
                }
                if (simplifiedTrace.back().first != trace.rbegin()->first) simplifiedTrace.emplace_back(trace.rbegin()->first, trace.rbegin()->second);
            } else copy(trace.begin(), trace.end(), back_inserter(simplifiedTrace));
        }
        return simplifiedTrace;
    }

    string toSVG() const {
        string svg;
        if (const auto& res = clean(); !res.empty()) {
            auto iter = res.begin();
            const auto& end = res.end();
            if (res.size() == 1) {
                svg += "M" + to_string(iter->first) + " " + to_string(iter->second) + "q2 0 2 2t-2 2-2-2 2-2";
            } else {
                svg += "M" + to_string(iter->first) + " " + to_string(iter->second);
                for (++iter; iter != end; ++iter) svg += " " + to_string(iter->first) + " " + to_string(iter->second);
            }
        }
        return svg;
    }

    Trace* newTrace(const ImageData* imageData, const TraceData& traceData, const bool traceLeft=false) const {
        const auto maxLineHeight = max<uint32_t>(0, imageData->height / 20);
        const auto maxJump = max<uint32_t>(0, imageData->width / 50);
        auto baselineColour = RGBTools(imageData->getRGB(traceData.x, traceData.y), traceData.colourTolerance);
        auto newTrace = map{trace};
        newTrace.erase(newTrace.lower_bound(traceData.x), newTrace.end());

        if (traceLeft) traceFor(traceData.x - 1, traceData.y, -1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);
        traceFor(traceData.x, traceData.y, 1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);

        return new Trace{newTrace};
    }

    // Gaussian smoothing
    Trace* smooth(const int windowSize, const double sigma) {
        frTrace newTrace{};
        const double multi = -0.5 / (sigma * sigma);
        if (trace.size() > windowSize) {
            int halfWindow = windowSize / 2;

            const auto end = prev(trace.end(), halfWindow);
            for (auto it = next(trace.begin(), halfWindow); it != end; ++it) {
                double smoothed = 0.0;
                double sumWeights = 0.0;

                double currX = it->first;
                for (int i = -halfWindow; i <= halfWindow; ++i) {
                    const auto other = next(it, i);
                    double distance = other->first - currX;
                    double weight = exp(multi * (distance * distance));
                    smoothed += other->second * weight;
                    sumWeights += weight;
                }
                newTrace[it->first] = static_cast<uint32_t>(smoothed / sumWeights);
            }
        }
        return new Trace{newTrace};
    }

    Trace* eraseRegion(uint32_t begin, uint32_t end) {
        auto newTrace = map{trace};
        const auto& higher = newTrace.upper_bound(end);
        for (auto lower = newTrace.lower_bound(begin); lower != higher;) lower = newTrace.erase(lower);
        return new Trace{newTrace};
    }

    Trace* addPoint(const TraceData& traceData) const {
        auto newTrace = map{trace};
        newTrace[traceData.x] = traceData.y;
        return new Trace{newTrace};
    }

    size_t size() const {
        return trace.size();
    }
};

struct TraceHistory {
    stack<Trace*> history;
    stack<Trace*> future;

    TraceHistory() {
        history.push(new Trace{});
    }

    Trace* getLatest() const {
        return history.top();
    }

    void clearFuture() {
        while (!future.empty()) {
            delete future.top();
            future.pop();
        }
    }

    Trace* add(Trace* trace) {
        if (history.top()->size() == 0 && trace->size() == 0) {
            delete trace;
            return history.top();
        }
        clearFuture();
        history.push(trace);
        return trace;
    }

    Trace* undo() {
        if (history.size() > 1) {
            future.push(history.top());
            history.pop();
        }
        return history.top();
    }

    Trace* redo() {
        if (!future.empty()) {
            history.push(future.top());
            future.pop();
        }
        return history.top();
    }

    inline bool redoAvailable() {
        return !future.empty();
    }

    inline bool undoAvailable() {
        return history.size() > 1;
    }

    ~TraceHistory() {
        while(!history.empty()) {
            delete history.top();
            history.pop();
        }
        clearFuture();
    }
};

RGB getBackgroundColour(const ImageData* imageData) {
    map<RGB, uint32_t>&& colours{};
    const auto mY = imageData->height, mX = imageData->width;
    const long xJump = max<uint32_t>(1, mX / 100), yJump = max<uint32_t>(1, mY / 100);

    for (uint32_t y = 0; y < mY; y += yJump) for (uint32_t x = 0; x < mX; x += xJump) ++colours[imageData->getRGB(x, y)];
    return max_element(colours.begin(),colours.end(),[] (const std::pair<RGB, uint32_t>& a, const std::pair<RGB, uint32_t>& b){ return a.second < b.second; } )->first;
}

function<double(double, uint32_t&)> contiguousLinearInterpolation(const vector<pair<double, double>>& FRxSPL) {
    const auto firstF = FRxSPL.front().first, lastF = FRxSPL.back().first,
    firstV = FRxSPL.front().second, lastV = FRxSPL.back().second;
    const auto l = FRxSPL.size();

    return [&FRxSPL, firstF, lastF, firstV, lastV, l] (const double freq, uint32_t& pos) {
        if (freq <= firstF) return firstV;
        if (freq >= lastF) return lastV;
        pair<double, double> lower, upper;
        for (; pos < l; ++pos) {
            if (FRxSPL.at(pos).first < freq) lower = FRxSPL.at(pos);
            else {
                upper = FRxSPL.at(pos--);
                break;
            }
        }
        if (lower.second == upper.second) return lower.second;
        return (upper.second - lower.second) * ((freq - lower.first) / (upper.first - lower.first)) + lower.second;
    };
}

Trace* getPotentialTrace(const ImageData* imageData, TraceData traceData, const function<uint32_t(RGB)>& differenceFunc) {
    auto bestY = 0, currentDiff = 0;
    const auto middleX = imageData->width / 2;
    const auto yRange = imageData->height / 5;
    const auto middleY = imageData->height / 2;
    auto y = middleY - yRange;

    for(const auto endY = middleY + yRange; y <= endY; ++y) {
        if (const auto diff = differenceFunc(imageData->getRGB(middleX, y)); diff >= max(10, currentDiff)) {
            bestY = y;
            currentDiff = diff;
        }
    }
    auto* trace = new Trace{};
    if (bestY > 0) {
        traceData.x = middleX;
        traceData.y = bestY;
        const auto newTrace = trace->newTrace(imageData, traceData, true);
        delete trace; // prevent memory leak i guess
        trace = newTrace;
    }
    return trace;
}

void padOutputData(const ImageData* original, ImageData* output) {
    const auto width = original->width, height = original->height;
    const auto maxWidthOrig = width * 4, maxWidthOut = width * 3;
    const auto data = original->data;
    auto outputData = output->data;
    // CAN ONLY TAKE 3x3 KERNELS FOR NOW DUE TO THIS
    // also cant just copy memory as input is 4 channels, output is 3
    // Copy top and bottom rows
    for (size_t x = 0; x < width; ++x) {
        size_t orx = x * 4, oux = x * 3;
        outputData[oux] = data[orx];
        outputData[oux + 1] = data[orx + 1];
        outputData[oux + 2] = data[orx + 2];

        orx += (height - 1) * maxWidthOrig;
        oux += (height - 1) * maxWidthOut;
        outputData[oux] = data[orx];
        outputData[oux + 1] = data[orx + 1];
        outputData[oux + 2] = data[orx + 2];
    }
    // Copy left and right columns
    for (size_t y = 0; y < height; ++y) {
        size_t ory = y * maxWidthOrig, ouy = y * maxWidthOut;
        outputData[ouy] = data[ory];
        outputData[ouy + 1] = data[ory + 1];
        outputData[ouy + 2] = data[ory + 2];

        ory += maxWidthOrig - 4;
        ouy += maxWidthOut - 3;
        outputData[ouy] = data[ory];
        outputData[ouy + 1] = data[ory + 1];
        outputData[ouy + 2] = data[ory + 2];
    }
}

void applyFilter(const ImageData* original, ImageData* output, const double multiplier, const vector<vector<int>>&& kernel) {
    const auto widthBound = original->width - 1, heightBound = original->height - 1;
    const auto maxWidthOrig = original->width * 4, maxWidthOut = original->width * 3;
    const auto data = original->data;
    auto outputData = output->data;

    // Apply kernel, only supports 3x3 for now
    for (size_t y = 1; y < heightBound; ++y) {
        size_t origY = y * maxWidthOrig, outY = y * maxWidthOut;
        for (size_t x = 1; x < widthBound; ++x) {
            int sumR = 0, sumG = 0, sumB = 0;
            size_t origX = x * 4;

            for (int k = -1; k <= 1; ++k) {
                size_t yPos = origY + (k * maxWidthOrig) + origX;
                auto kn = kernel[k + 1];
                for (int l = -1; l <= 1; ++l) {
                    size_t pos = yPos + (l * 4);
                    auto knn = kn[l + 1];
                    sumR += data[pos] * knn;
                    sumG += data[pos + 1] * knn;
                    sumB += data[pos + 2] * knn;
                }
            }

            size_t pos = outY + (x * 3);
            outputData[pos] = static_cast<Colour>(max<uint32_t>(0, min<uint32_t>(sumR * multiplier, 255)));
            outputData[pos + 1] = static_cast<Colour>(max<uint32_t>(0, min<uint32_t>(sumG * multiplier, 255)));
            outputData[pos + 2] = static_cast<Colour>(max<uint32_t>(0, min<uint32_t>(sumB * multiplier, 255)));
        }
    }
}

void invertImage(ImageData* data) {
    const auto maxSize = data->getMaxPos();
    const auto d = data->data;
    for (size_t pos = 0; pos < maxSize; ++pos) d[pos] = 255 - d[pos];
}

set<uint32_t> detectLines(const ImageData* imageData, const string&& direction, const uint32_t tolerance) {
    set<uint32_t>&& lines{};
    uint32_t length, otherDirection;
    function<bool(uint32_t, uint32_t)> comparator;
    if(direction == "X") { // vertical line, representing x axis
        length = imageData->width;
        otherDirection = imageData->height;
        comparator = [&data = imageData, &tolerance = tolerance] (const uint32_t x, const uint32_t y) { return data->getR(x, y) < tolerance; };
    } else {
        length = imageData->height;
        otherDirection = imageData->width;
        comparator = [&data = imageData, &tolerance = tolerance] (const uint32_t y, const uint32_t x) { return data->getR(x, y) < tolerance; };
    }
    const auto upperBound = static_cast<uint32_t>(otherDirection * 0.7), lowerBound = static_cast<uint32_t>(otherDirection * 0.3);
    const auto bound = (upperBound - lowerBound) - static_cast<uint32_t>(0.9 * (upperBound - lowerBound));
    
    vector<uint32_t>&& valid{};
    for (uint32_t pos = 0; pos < length; ++pos) {
        auto failedCount = 0;
        for (auto j = lowerBound; j <= upperBound; ++j) if (comparator(pos, j) && ++failedCount > bound) break;
        if (failedCount <= bound) valid.emplace_back(pos);
        else if (!valid.empty()) {
            lines.insert(reduce(valid.begin(), valid.end()) / valid.size());
            valid.clear();
        }
    }
    return lines;
}

struct Image {
    ImageData* imageData;
    TraceHistory traceHistory;
    RGBTools backgroundColour = RGBTools{RGB{0,0,0}, 0};
    set<uint32_t> vLines;
    set<uint32_t> hLines;

    Image(ImageData* imageData) {
        auto* filteredData = new ImageData{static_cast<Colour*>(malloc((imageData->width) * (imageData->height) * 3 * sizeof(Colour))), imageData->width, imageData->height, 3};
        padOutputData(imageData, filteredData);

        const auto darkMode = getBackgroundColour(imageData).sum() / 3 < 127;
        if (darkMode) invertImage(imageData);
        applyFilter(imageData, filteredData, 2, vector<vector<int>>{
            {-1, -2, -1},
            { 0,  0,  0},
            { 1,  2,  1}
        });
        hLines = detectLines(filteredData, "Y", 20);

        applyFilter(imageData, filteredData, 2, vector<vector<int>>{
            {-1,  0,  1},
            {-2,  0,  2},
            {-1,  0,  1}
        });
        vLines = detectLines(filteredData, "X", 20);

        if (darkMode) invertImage(imageData);
        applyFilter(imageData, filteredData, 0.1, vector<vector<int>>{
            {1, 1, 1},
            {1, 2, 1},
            {1, 1, 1}
        });

        delete imageData;

        this->imageData = filteredData;
        this->backgroundColour = RGBTools{getBackgroundColour(filteredData), 10};
    }

    inline string trace(const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest()->newTrace(imageData, traceData))->toSVG();
    }

    inline string point(const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest()->addPoint(traceData))->toSVG();
    }

    inline string undo() {
        return traceHistory.undo()->toSVG();
    }

    inline string redo() {
        return traceHistory.redo()->toSVG();
    }

    inline int historyStatus() {
        return (traceHistory.undoAvailable() << 1) | traceHistory.redoAvailable();
    }

    string autoTrace(const TraceData&& traceData) {
        auto* traceOne = getPotentialTrace(imageData, traceData, RGB::biggestDifference);
        auto* traceTwo = getPotentialTrace(imageData, traceData, [&bgRGB = backgroundColour.rgb] (const RGB& rgb) { return bgRGB.getDifference(rgb); });
        if (traceOne->size() > traceTwo->size()) {
            traceHistory.add(traceOne);
            delete traceTwo;
        } else {
            traceHistory.add(traceTwo);
            delete traceOne;
        }
        return traceHistory.getLatest()->toSVG();
    }

    string exportTrace(const ExportData&& exportData) const {
        const auto FRBottomPixel = exportData.FRBottomPixel, FRRatio = exportData.FRRatio,
        logFRBottomValue = exportData.logFRBottomValue, SPLBottomPixel = exportData.SPLBottomPixel,
        SPLRatio = exportData.SPLRatio, SPLBottomValue = exportData.SPLBottomValue,
        PPOStep = exportData.PPOStep, logMaxFR = exportData.logMaxFR;
        auto str = ExportString{exportData.delim};

        vector<pair<double, double>>&& FRxSPL{};
        const auto& clean = traceHistory.getLatest()->clean();
        for (const auto& [x, y] : clean) {
            FRxSPL.emplace_back(pow(10, (x - FRBottomPixel) * FRRatio + logFRBottomValue), (y - SPLBottomPixel) * SPLRatio + SPLBottomValue);
        }

        if(!FRxSPL.empty()) {
            const auto& interp = contiguousLinearInterpolation(FRxSPL);
            uint32_t pos = 0;
            for(auto v = exportData.logMinFR; ; v += PPOStep) {
                const auto freq = pow(10, v);
                str.addData(to_string(freq), to_string(interp(freq, pos)));
                if (v >= logMaxFR) break;
            }
        }

        return str.getData();
    }

    uint32_t snapLine(uint32_t pos, const int lineDir, const int moveDir) const {
        auto lines = (lineDir == 1) ? vLines : hLines;
        pos += moveDir;
        auto bound = lines.upper_bound(pos);
        bound = (moveDir != 1 && bound != lines.begin()) ? prev(bound) : bound;
        if (bound == lines.end()) return pos -= moveDir;
        return *bound;
    }

    inline RGB getPixelColour(const uint32_t x, const uint32_t y) const {
        return imageData->getRGB(x, y);
    }

    inline string getPath() const {
        return traceHistory.getLatest()->toSVG();
    }

    void inline clear() {
        traceHistory.add(new Trace{});
    }

    inline string eraseRegion(uint32_t begin, uint32_t end) {
        const auto result = traceHistory.getLatest()->eraseRegion(begin, end);
        if (result->size() == traceHistory.getLatest()->size()) {
            delete result;
        } else {
            traceHistory.add(result);
        }
        return traceHistory.getLatest()->toSVG();
    }

    inline string smoothTrace() {
        const int windowSize = max(static_cast<int>(imageData->width) / 100, 2);
        traceHistory.add(traceHistory.getLatest()->smooth(windowSize, static_cast<double>(windowSize) / 2.0));
        return traceHistory.getLatest()->toSVG();
    }

    ~Image() {
        delete imageData;
    }
};

struct ImageQueue {
    map<string, unique_ptr<Image>> images;

    void add(const char* id, unique_ptr<Image> image) {
        images.insert({string{id}, std::move(image)});
    }

    void remove(const char* id) {
        images.erase(string{id});
    }

    Image* get(const char* id) const {
        return images.at(string{id}).get();
    }
} imageQueue;

Image* currentImage = nullptr;

inline const char* stringReturn(string str) {
    char* buffer = new char[str.size() + 1];
    strcpy(buffer, str.c_str());
    return buffer;
}

extern "C" {
    // Image Control
    EMSCRIPTEN_KEEPALIVE void* create_buffer(const uint32_t width, const uint32_t height) {
        return malloc(width * height * 4 * sizeof(Colour));
    }

    EMSCRIPTEN_KEEPALIVE void setCurrent(const char* id) {
        currentImage = imageQueue.get(id);
    }

    EMSCRIPTEN_KEEPALIVE void addImage(const char* id, Colour* data, const uint32_t width, const uint32_t height) {
        // Images come in with 4 channels (RGBA)
        imageQueue.add(id, make_unique<Image>(new ImageData{data, width, height, 4}));
        setCurrent(id);
    }

    EMSCRIPTEN_KEEPALIVE void removeImage(const char* id) {
        if (currentImage == imageQueue.get(id)) currentImage = nullptr;
        imageQueue.remove(id);
    }

    EMSCRIPTEN_KEEPALIVE int historyStatus() {
        return currentImage->historyStatus();
    }

    // Tracing
    EMSCRIPTEN_KEEPALIVE const char* trace(const uint32_t x, const uint32_t y, const uint32_t colourTolerance) {
        return stringReturn(currentImage->trace(TraceData{x, y, colourTolerance}));
    }

    EMSCRIPTEN_KEEPALIVE const char* undo() {
        return stringReturn(currentImage->undo());
    }

    EMSCRIPTEN_KEEPALIVE const char* redo() {
        return stringReturn(currentImage->redo());
    }

    EMSCRIPTEN_KEEPALIVE void clear() {
        currentImage->clear();
    }

    EMSCRIPTEN_KEEPALIVE const char* point(const uint32_t x, const uint32_t y) {
        return stringReturn(currentImage->point(TraceData{x, y}));
    }

    EMSCRIPTEN_KEEPALIVE const char* autoTrace(const uint32_t colourTolerance) {
        return stringReturn(currentImage->autoTrace(TraceData{colourTolerance}));
    }

    EMSCRIPTEN_KEEPALIVE const char* eraseRegion(uint32_t begin, uint32_t end) {
        return stringReturn(currentImage->eraseRegion(begin, end));
    }

    EMSCRIPTEN_KEEPALIVE const char* smoothTrace() {
        return stringReturn(currentImage->smoothTrace());
    }

    // Exporting
    EMSCRIPTEN_KEEPALIVE const char* exportTrace(const int PPO, const int delim, const double lowFRExport,
        const double highFRExport, const double SPLTopValue, const double SPLTopPixel, const double SPLBottomValue,
        const double SPLBottomPixel, const double FRTopValue, const double FRTopPixel, const double FRBottomValue,
        const double FRBottomPixel) {
        return stringReturn(currentImage->exportTrace(ExportData{PPO, delim, lowFRExport, highFRExport,
            SPLTopValue, SPLTopPixel, SPLBottomValue, SPLBottomPixel, FRTopValue, FRTopPixel, FRBottomValue,
            FRBottomPixel}));
    }

    // Lines
    EMSCRIPTEN_KEEPALIVE int snap(const uint32_t pos, const int lineDir, const int moveDir) {
        return currentImage->snapLine(pos, lineDir, moveDir);
    }

    // Image Data
    EMSCRIPTEN_KEEPALIVE int getPixelColour(const uint32_t x, const uint32_t y) {
        return currentImage->getPixelColour(x, y).toBin();
    }

    EMSCRIPTEN_KEEPALIVE const char* getCurrentPath() {
        return stringReturn(currentImage->getPath());
    }
}

int main() {
    EM_ASM( onLoad() );
}
