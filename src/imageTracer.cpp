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
#include "emscripten.h"
#include <set>

using namespace std;

typedef uint8_t Colour;

static inline string DEFAULT_COLOUR = "#ff0000";
static inline string ALT_COLOUR = "#00ff7b";

struct ImageData {
    Colour* data;
    const int width, height;

    ImageData(Colour* data, const int width, const int height) : data(data), width(width), height(height) {}

    ~ImageData() {
        free(data);
    }

    // ONLY USE ON GREYSCALE IMAGES
    inline Colour getGreyscale(const long x, const long y) const {
        return data[y * width + x];
    }
};

struct RGB {
    Colour R, G, B;

    RGB(const Colour r, const Colour g, const Colour b) : R(r), G(g), B(b) {}

    [[nodiscard]] static Colour biggestDifference(const RGB& rgb) {
        return max(max(rgb.R, rgb.G), rgb.B) - min(min(rgb.R, rgb.G), rgb.B);
    }

    [[nodiscard]] double getDifference(const RGB& rgb) const {
        const auto rmean = (R + rgb.R) / 2;
        return sqrt(((512 + rmean) * static_cast<int>(pow(R - rgb.R, 2)) >> 8) + 4 * pow(G - rgb.G, 2) + ((767 - rmean) * static_cast<int>(pow(B - rgb.B, 2)) >> 8));
    }

    bool operator==(const RGB& rgb) const {
        return R == rgb.R && G == rgb.G&& B == rgb.B;
    }

    bool operator<(const RGB& rgb) const {
        return R < rgb.R || G < rgb.G || B < rgb.B;
    }

    [[nodiscard]] string toString() const {
        return to_string(R) + ", " + to_string(G) + ", " + to_string(B);
    }
};

struct RGBTools {
    RGB rgb;
    const long tolerance;
    int count = 1;

    RGBTools(const RGB rgb, const long tolerance) : rgb(rgb), tolerance(tolerance) {}

    [[nodiscard]] bool withinTolerance(const RGB&& rgb) const {
        return this->rgb.getDifference(rgb) <= tolerance;
    }

    void addToAverage(const RGB&& rgb) {
        this->rgb.R += static_cast<Colour>((sqrt((pow(this->rgb.R, 2) + pow(rgb.R, 2)) / 2) - this->rgb.R) / count);
        this->rgb.G += static_cast<Colour>((sqrt((pow(this->rgb.G, 2) + pow(rgb.G, 2)) / 2) - this->rgb.G) / count);
        this->rgb.B += static_cast<Colour>((sqrt((pow(this->rgb.B, 2) + pow(rgb.B, 2)) / 2) - this->rgb.B) / count);
        ++count;
    }

    bool isDark() const {
        return 0.2126 * rgb.R + 0.7152 * rgb.G + 0.0722 * rgb.B <= 128;
    }

    [[nodiscard]] string getTraceColour() const {
        if (min(min(this->rgb.R, this->rgb.G), this->rgb.B) == this->rgb.R) return DEFAULT_COLOUR;
        return ALT_COLOUR;
    }

    static inline RGB getRGB(const long& x, const long& y, const ImageData& imageData) {
        const auto pos = y * imageData.width * 4 + x * 4;
        return RGB{imageData.data[pos], imageData.data[pos + 1], imageData.data[pos + 2]};
    }

    static inline Colour getGreyScale(const long& x, const long& y, const ImageData& imageData) {
        const auto RGB = RGBTools::getRGB(x, y, imageData);
        return 0.2989 * RGB.R + 0.5870 * RGB.G + 0.1140 * RGB.B;
    }
};

struct TraceData {
    int x = 0, y = 0, maxLineHeightOffset = 0, maxJumpOffset = 0, colourTolerance = 0;

    TraceData(const int x, const int y) : x(x), y(y) {}
    TraceData(const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) : maxLineHeightOffset(maxLineHeightOffset), maxJumpOffset(maxJumpOffset), colourTolerance(colourTolerance) {}
    TraceData(const int x, const int y, const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) : x(x), y(y), maxLineHeightOffset(maxLineHeightOffset), maxJumpOffset(maxJumpOffset), colourTolerance(colourTolerance) {}
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

    [[nodiscard]] string getData() const {
        return data;
    }
};

inline void checkPixel(const int x, const int y, const RGBTools& baselineColour, vector<int>& yValues, const ImageData& imageData) {
    if (const auto yVal = max(0, min(imageData.height - 1, y)); baselineColour.withinTolerance(RGBTools::getRGB(x, yVal, imageData))) yValues.push_back(yVal);
}

void traceFor(int startX, int startY, const int step, map<int, int>& trace, const ImageData& imageData, const int maxLineHeight, const int maxJump, RGBTools& colour) {
    vector<int>&& yValues{};
    int currJump = 0;
    for (const auto width = imageData.width; startX >= 0 && startX < width; startX += step) {
        yValues.clear();
        const auto max = maxLineHeight + currJump * 2;
        checkPixel(startX, startY, colour, yValues, imageData);
        for (auto z = 1; z <= max; ++z) {
            checkPixel(startX, startY + z, colour, yValues, imageData);
            checkPixel(startX, startY - z, colour, yValues, imageData);
        }
        if (!yValues.empty()) {
            currJump = 0;
            startY = reduce(yValues.begin(), yValues.end()) / static_cast<int>(yValues.size());
            trace[startX] = startY;
            colour.addToAverage(RGBTools::getRGB(startX, startY, imageData));
            continue;
        }
        if (currJump < maxJump) ++currJump;
        else break;
    }
}

struct Trace {
    const map<int, int> trace;
    const string colour;

    Trace() : trace(std::move(map<int, int>{})), colour(DEFAULT_COLOUR) {}
    Trace(const map<int, int>& trace, string colour) : trace(trace), colour(std::move(colour)) {}

    [[nodiscard]] vector<pair<int, int>> clean() const {
        vector<pair<int, int>>&& simplifiedTrace{};
        if (!trace.empty()) {
            if (trace.size() > 2) {
                auto iter = trace.begin();
                simplifiedTrace.emplace_back(iter->first, iter->second);
                vector<int>&& identity{};
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
                    else simplifiedTrace.emplace_back(reduce(identity.begin(), identity.end()) / static_cast<int>(identity.size()), previousValue);
                }
                if (simplifiedTrace.back().first != trace.rbegin()->first) simplifiedTrace.emplace_back(trace.rbegin()->first, trace.rbegin()->second);
            } else copy(trace.begin(), trace.end(), back_inserter(simplifiedTrace));
        }
        return simplifiedTrace;
    }

    [[nodiscard]] string toSVG() const {
        string svg;
        if (const auto& res = clean(); !res.empty()) {
            auto iter = res.begin();
            const auto& end = res.end();
            svg += "M" + to_string(iter->first) + " " + to_string(iter->second);
            for (++iter; iter != end; ++iter) svg += " L" + to_string(iter->first) + " " + to_string(iter->second);
        }
        return svg;
    }

    [[nodiscard]] Trace* newTrace(const ImageData& imageData, const TraceData& traceData, const bool traceLeft=false) const {
        const auto maxLineHeight = max(0, imageData.height / 20 + traceData.maxLineHeightOffset);
        const auto maxJump = max(0, imageData.width / 50 + traceData.maxJumpOffset);
        auto baselineColour = RGBTools(RGBTools::getRGB(traceData.x, traceData.y, imageData), traceData.colourTolerance);
        auto newTrace = map(trace);
        newTrace.erase(newTrace.lower_bound(traceData.x), newTrace.end());

        if (traceLeft) traceFor(traceData.x - 1, traceData.y, -1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);
        traceFor(traceData.x, traceData.y, 1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);

        return new Trace{newTrace, baselineColour.getTraceColour()};
    }

    [[nodiscard]] Trace* addPoint(const TraceData& traceData) const {
        auto newTrace = map(trace);
        newTrace[traceData.x] = traceData.y;
        return new Trace{newTrace, colour};
    }

    [[nodiscard]] string getDefaultReturn() const {
        return colour + "|" + toSVG();
    }

    [[nodiscard]] size_t size() const {
        return trace.size();
    }
};

struct TraceHistory {
    stack<Trace*> history;

    TraceHistory() {
        history.push(new Trace{});
    }

    Trace* add(Trace* trace) {
        if(getLatest()->size() == 0) undo();
        history.push(trace);
        return trace;
    }

    [[nodiscard]] Trace* getLatest() const {
        return history.top();
    }

    Trace* undo() {
        if (history.size() > 1) {
            delete getLatest();
            history.pop();
        }
        return getLatest();
    }

    ~TraceHistory() {
        while(!history.empty()) {
            delete getLatest();
            history.pop();
        }
    }
};

RGB getBackgroundColour(const ImageData& imageData) {
    map<RGB, int>&& colours{};
    const auto mY = imageData.height;
    const auto mX = imageData.width;
    const long xJump = max(1, mX / 100);
    const long yJump = max (1, mY / 100);

    for (auto y = 0; y < mY; y += yJump) for (auto x = 0; x < mX; x += xJump) ++colours[RGBTools::getRGB(x, y, imageData)];
    return max_element(colours.begin(),colours.end(),[] (const std::pair<RGB, int>& a, const std::pair<RGB, int>& b){ return a.second < b.second; } )->first;
}

function<double(double, int&)> contiguousLinearInterpolation(const vector<pair<double, double>>& FRxSPL) {
    const auto firstF = FRxSPL.front().first, lastF = FRxSPL.back().first,
    firstV = FRxSPL.front().second, lastV = FRxSPL.back().second;
    const auto l = FRxSPL.size();

    return [&FRxSPL, firstF, lastF, firstV, lastV, l] (const double freq, int& pos) {
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

Trace* getPotentialTrace(const ImageData& imageData, TraceData traceData, const function<int(RGB)>& differenceFunc) {
    auto bestY = 0, currentDiff = 0;
    const auto middleX = imageData.width / 2;
    const auto yRange = imageData.height / 5;
    const auto middleY = imageData.height / 2;
    auto y = middleY - yRange;

    for(const auto endY = middleY + yRange; y <= endY; ++y) {
        if (const auto diff = differenceFunc(RGBTools::getRGB(middleX, y, imageData)); diff >= max(10, currentDiff)) {
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

void getGreyScale(const ImageData& input, ImageData& output) {
    auto width = input.width;
    auto height = input.height;
    auto data = output.data;
    for (int x = 1; x < width; ++x) for (int y = 1; y < height; ++y) data[x + (width * y)] = RGBTools::getGreyScale(x, y, input);
}

void applyScharrFilter(const ImageData& input, ImageData& output, const string direction) {
    int kernel[3][3];
    if (direction == "Y") {
        int temp[3][3] = {
            {-3, 0, 3},
            {-10, 0, 10},
            {-3, 0, 3}
        };
        copy(&temp[0][0], &temp[0][0] + 3*3, &kernel[0][0]);
    } else {
        int temp[3][3] = {
            {-3, -10, -3},
            {0, 0, 0},
            {3, 10, 3}
        };
        copy(&temp[0][0], &temp[0][0] + 3*3, &kernel[0][0]);
    }

    auto width = input.width;
    auto height = input.height;
    auto maxWidth = width - 1;
    auto maxHeight = height - 1;
    auto data = output.data;
    auto inputData = input.data;

    int sum = 0;

    for (int x = 1; x < maxWidth; ++x) {
        for (int y = 1; y < maxHeight; ++y) {
            sum = 0;
            for (int k = -1; k <= 1; ++k) for (int l = -1; l <= 1; ++l) sum += input.getGreyscale(x + k, y + l) * kernel[k + 1][l + 1];
            if (sum > 40) data[x + (width * y)] = 255;
            else data[x + (width * y)] = 0;
        }
    }
}

set<int> detectLines(const ImageData& imageData, const string direction, const bool darkMode) {
    set<int>&& lines{};
    int length, otherDirection;
    function<bool(int, int)> comparator;
    if(direction == "X") { // vertical line, representing x axis
        length = imageData.width;
        otherDirection = imageData.height;
        comparator = [&data = imageData] (const int x, const int y) { return data.getGreyscale(x, y) == 255; };
    } else {
        length = imageData.height;
        otherDirection = imageData.width;
        comparator = [&data = imageData] (const int y, const int x) { return data.getGreyscale(x, y) == 255; };
    }
    const auto upperBound = static_cast<int>(otherDirection * 0.8), lowerBound = static_cast<int>(otherDirection * 0.2);
    const auto bound = static_cast<int>(0.9 * (upperBound - lowerBound));
    auto foundline = false;
    vector<int>&& valid{};
    for (int pos = 0; pos < length; ++pos) {
        auto trueCount = 0;
        for (auto j = upperBound; j >= lowerBound; --j) if (comparator(pos, j)) ++trueCount;
        if (trueCount >= bound) {
            if (darkMode) valid.emplace_back(pos);
            foundline = true;
        } else if (foundline) {
            foundline = false;
            if (!darkMode) {
                if (!valid.empty()) lines.insert(reduce(valid.begin(), valid.end()) / static_cast<int>(valid.size()));
                valid.clear();
            } else lines.insert(pos - 1);
        }
    }
    return lines;
}

struct Image {
    const ImageData* imageData;
    TraceHistory traceHistory;
    const RGBTools backgroundColour;
    set<int> vLines;
    set<int> hLines;

    explicit Image(const ImageData* imageData) : imageData(imageData), backgroundColour(RGBTools{getBackgroundColour(*imageData), 10}) {
        ImageData greyScale = ImageData{static_cast<Colour *>(malloc(imageData->width * imageData->height * sizeof(Colour))), imageData->width, imageData->height};
        getGreyScale(*imageData, greyScale);
        ImageData extraImage = ImageData{static_cast<Colour *>(malloc(imageData->width * imageData->height * sizeof(Colour))), imageData->width, imageData->height};
        applyScharrFilter(greyScale, extraImage, "X");
        vLines = detectLines(extraImage, "X", backgroundColour.isDark());
        applyScharrFilter(greyScale, extraImage, "Y");
        hLines = detectLines(extraImage, "Y", backgroundColour.isDark());
    }

    [[nodiscard]] string trace(const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest()->newTrace(*imageData, traceData))->getDefaultReturn();
    }

    [[nodiscard]] string point(const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest()->addPoint(traceData))->getDefaultReturn();
    }

    [[nodiscard]] string undo() {
        return traceHistory.undo()->getDefaultReturn();
    }

    [[nodiscard]] string autoTrace(const TraceData&& traceData) {
        auto* traceOne = getPotentialTrace(*imageData, traceData, RGB::biggestDifference);
        auto* traceTwo = getPotentialTrace(*imageData, traceData, [&bgRGB = backgroundColour.rgb] (const RGB& rgb) { return bgRGB.getDifference(rgb); });
        if (traceOne->size() > traceTwo->size()) {
            traceHistory.add(traceOne);
            delete traceTwo;
        } else {
            traceHistory.add(traceTwo);
            delete traceOne;
        }
        return traceHistory.getLatest()->getDefaultReturn();
    }

    [[nodiscard]] string exportTrace(const ExportData&& exportData) const {
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
            auto pos = 0;
            for(auto v = exportData.logMinFR; ; v += PPOStep) {
                const auto freq = pow(10, v);
                str.addData(to_string(freq), to_string(interp(freq, pos)));
                if (v >= logMaxFR) break;
            }
        }

        return str.getData();
    }

    [[nodiscard]] int snapLine(int pos, const int lineDir, const int moveDir) const {
        auto lines = (lineDir == 1) ? vLines : hLines;
        pos += moveDir;
        auto bound = lines.upper_bound(pos);
        bound = (moveDir != 1 && bound != lines.begin()) ? prev(bound) : bound;
        if (bound == lines.end()) return pos -= moveDir;
        return *bound;
    }

    [[nodiscard]] RGB getPixelColour(const int x, const int y) const {
        return RGBTools::getRGB(x, y, *imageData);
    }

    void clear() {
        traceHistory.add(new Trace{});
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

    [[nodiscard]] Image& get(const char* id) const {
        return *images.at(string{id});
    }
} imageQueue;

#define EXTERN extern "C"

// Image Control
EXTERN EMSCRIPTEN_KEEPALIVE void* create_buffer(const int width, const int height) {
    return malloc(width * height * 4 * sizeof(Colour));
}

EXTERN EMSCRIPTEN_KEEPALIVE void addImage(const char* id, Colour* data, const int width, const int height) {
    imageQueue.add(id, make_unique<Image>(new ImageData{data, width, height}));
}

EXTERN EMSCRIPTEN_KEEPALIVE void removeImage(const char* id) {
    imageQueue.remove(id);
}

// Tracing
EXTERN EMSCRIPTEN_KEEPALIVE const char* trace(const char* id, const int x, const int y, const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) {
    const auto* s = new string(imageQueue.get(id).trace(TraceData{x, y, maxLineHeightOffset, maxJumpOffset, colourTolerance}));
    return s->data();
}

EXTERN EMSCRIPTEN_KEEPALIVE const char* undo(const char* id) {
    const auto* s = new string(imageQueue.get(id).undo());
    return s->data();
}

EXTERN EMSCRIPTEN_KEEPALIVE void clear(const char* id) {
    imageQueue.get(id).clear();
}

EXTERN EMSCRIPTEN_KEEPALIVE const char* point(const char* id, const int x, const int y) {
    const auto* s = new string(imageQueue.get(id).point(TraceData{x, y}));
    return s->data();
}

EXTERN EMSCRIPTEN_KEEPALIVE const char* autoTrace(const char* id, const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) {
    const auto* s = new string(imageQueue.get(id).autoTrace(TraceData{maxLineHeightOffset, maxJumpOffset, colourTolerance}));
    return s->data();
}

// Exporting
EXTERN EMSCRIPTEN_KEEPALIVE const char* exportTrace(const char* id, const int PPO, const int delim, const double lowFRExport,
    const double highFRExport, const double SPLTopValue, const double SPLTopPixel, const double SPLBottomValue,
    const double SPLBottomPixel, const double FRTopValue, const double FRTopPixel, const double FRBottomValue,
    const double FRBottomPixel) {
    const auto* s = new string(imageQueue.get(id).exportTrace(ExportData{PPO, delim, lowFRExport, highFRExport,
        SPLTopValue, SPLTopPixel, SPLBottomValue, SPLBottomPixel, FRTopValue, FRTopPixel, FRBottomValue,
        FRBottomPixel}));
    return s->data();
}

// Lines
EXTERN EMSCRIPTEN_KEEPALIVE int snap(const char* id, const int pos, const int lineDir, const int moveDir) {
    return imageQueue.get(id).snapLine(pos, lineDir, moveDir);
}

// Image Data
EXTERN EMSCRIPTEN_KEEPALIVE const char* getPixelColour(const char* id, const int x, const int y) {
    const auto* s = new string(imageQueue.get(id).getPixelColour(x, y).toString());
    return s->data();
}
