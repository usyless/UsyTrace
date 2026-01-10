#include <algorithm>
#include <cmath>
#include <functional>
#include <iterator>
#include <map>
#include <numeric>
#include <stack>
#include <vector>
#include <string.h>
#include <set>
#include <cstdint>
#include <string>
#include <usylibpp/strings.hpp>

#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
#else
    #define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#endif

using Colour = uint8_t;
using frTrace = std::map<uint32_t, uint32_t>;

struct RGB {
    Colour R, G, B;

    RGB(const Colour r, const Colour g, const Colour b) : R(r), G(g), B(b) {}

    static inline Colour biggestDifference(const RGB& rgb) {
        return abs(static_cast<int>(std::max(std::max(rgb.R, rgb.G), rgb.B)) - std::min(std::min(rgb.R, rgb.G), rgb.B));
    }

    inline double getDifference(const RGB& rgb) const {
        const int rmean = (static_cast<int>(R) + rgb.R) / 2;
        const int rdiff = static_cast<int>(R) - rgb.R;
        const int gdiff = static_cast<int>(G) - rgb.G;
        const int bdiff = static_cast<int>(B) - rgb.B;
        return sqrt((512 + rmean) * ((rdiff * rdiff) >> 8) + 4 * (gdiff * gdiff) + (((767 - rmean) * (bdiff * bdiff)) >> 8));
    }

    bool operator==(const RGB& rgb) const {
        return R == rgb.R && G == rgb.G && B == rgb.B;
    }

    bool operator<(const RGB& rgb) const {
        return R < rgb.R || G < rgb.G || B < rgb.B;
    }

    inline uint32_t sum() const {
        return R + G + B;
    }

    inline int toBin() const {
        return (static_cast<int>(R) << 16) | (static_cast<int>(G) << 8) | static_cast<int>(B);
    }
};

struct ImageData {
    std::unique_ptr<Colour[]> data;
    const uint32_t width, height, channels;

    ImageData(const uint32_t width, const uint32_t height, const uint32_t channels) : width(width), height(height), channels(channels) {
        data.reset(allocate_buffer(width, height, channels));
    }
    ImageData(Colour* data, const uint32_t width, const uint32_t height, const uint32_t channels) : data(data), width(width), height(height), channels(channels) {}

    inline RGB getRGB(const uint32_t x, const uint32_t y) const {
        const auto pos = (y * width + x) * channels;
        return {data[pos], data[pos + 1], data[pos + 2]};
    }

    inline Colour getR(const uint32_t x, const uint32_t y) const {
        return data[(y * width + x) * channels];
    }

    inline uint32_t getMaxPos() const {
        return width * height * channels;
    }

    inline RGB getBackgroundColour() {
        std::map<RGB, uint32_t> colours{};
        const auto mY = height, mX = width;
        const long xJump = std::max<uint32_t>(1, mX / 100), yJump = std::max<uint32_t>(1, mY / 100);

        for (uint32_t y = 0; y < mY; y += yJump) for (uint32_t x = 0; x < mX; x += xJump) ++colours[getRGB(x, y)];
        return std::max_element(colours.begin(),colours.end(),[] (const std::pair<RGB, uint32_t>& a, const std::pair<RGB, uint32_t>& b){ return a.second < b.second; } )->first;
    }

    static Colour* allocate_buffer(const uint32_t width, const uint32_t height, const uint32_t channels) {
        return new Colour[width * height * channels];
    }
};

struct RGBTools {
    RGB rgb;
    uint32_t tolerance;
    uint32_t count = 1;

    RGBTools(RGB rgb, const uint32_t tolerance) : rgb(std::move(rgb)), tolerance(tolerance) {}

    inline bool withinTolerance(const RGB& rgb) const {
        return this->rgb.getDifference(rgb) <= tolerance;
    }

    inline void addToAverage(const RGB& rgb) {
        const auto r = static_cast<int>(this->rgb.R), g = static_cast<int>(this->rgb.G), b = static_cast<int>(this->rgb.B);
        const auto oR = static_cast<int>(rgb.R), oG = static_cast<int>(rgb.G), oB = static_cast<int>(rgb.B);
        this->rgb.R += static_cast<Colour>((sqrt(((r * r) + (oR * oR)) / 2) - r) / count);
        this->rgb.G += static_cast<Colour>((sqrt(((g * g) + (oG * oG)) / 2) - g) / count);
        this->rgb.B += static_cast<Colour>((sqrt(((b * b) + (oB * oB)) / 2) - b) / count);
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
    std::string data;
    std::string delim{" "};

    explicit ExportString(const int delim = 1) {
        using namespace usylibpp::strings;
        if (delim == 1) this->delim = "\t";
        data = concat_strings("* Exported with UsyTrace, available at https://usyless.uk/trace\n* Freq(Hz)", this->delim, "SPL(dB)");
    }

    void addData(auto&& freq, auto&& spl) {
        using namespace usylibpp::strings;
        data += concat_strings("\n", std::to_string(freq), delim, std::to_string(spl));
    }

    std::string getData() const {
        return data;
    }
};

struct Trace {
    const frTrace trace;
    const ImageData& imageData;

    Trace(const ImageData& data) : imageData(data) {}
    Trace(const ImageData& data, frTrace&& _trace) : trace(std::move(_trace)), imageData(data) {}

    std::vector<std::pair<uint32_t, uint32_t>> clean() const {
        std::vector<std::pair<uint32_t, uint32_t>> simplifiedTrace{};
        if (!trace.empty()) {
            if (trace.size() > 2) {
                auto iter = trace.begin();
                simplifiedTrace.emplace_back(iter->first, iter->second);
                std::vector<uint32_t> identity{};
                const auto end = trace.end();
                for(++iter; iter != end; ++iter) {
                    identity.clear();
                    auto previousKey = iter->first;
                    const auto previousValue = iter->second;
                    do {
                        identity.emplace_back(iter->first);
                    } while(++iter != end && iter->second == previousValue && iter->first == ++previousKey);
                    --iter;
                    if (identity.size() == 1) simplifiedTrace.emplace_back(identity[0], previousValue);
                    else simplifiedTrace.emplace_back(reduce(identity.begin(), identity.end()) / identity.size(), previousValue);
                }
                if (simplifiedTrace.back().first != trace.rbegin()->first) simplifiedTrace.emplace_back(trace.rbegin()->first, trace.rbegin()->second);
            } else copy(trace.begin(), trace.end(), back_inserter(simplifiedTrace));
        }
        return simplifiedTrace;
    }

    std::string toSVG() const {
        std::string svg;
        if (const auto res = clean(); !res.empty()) {
            auto iter = res.begin();
            const auto end = res.end();
            using namespace usylibpp::strings;
            if (res.size() == 1) {
                const std::string first{to_string_view(iter->first).value_or("")};
                svg += concat_strings("M", first, " ", to_string_view(iter->second).value_or(""), "q2 0 2 2t-2 2-2-2 2-2");
            } else {
                svg += "M";
                for (; iter != end; ++iter) {
                    const std::string first{to_string_view(iter->first).value_or("")};
                    svg += concat_strings(first, " ", to_string_view(iter->second).value_or(""), " ");
                }
                if (svg.size() > 1) svg.pop_back();
            }
        }
        return svg;
    }

    static void traceFor(uint32_t startX, uint32_t startY, const int step, frTrace& trace, const ImageData& imageData, const uint32_t maxLineHeight, const uint32_t maxJump, RGBTools& colour) {
        std::vector<uint32_t> yValues{};
        uint32_t currJump = 0;
        const uint32_t maxHeight = imageData.height - 1;
        for (const auto width = imageData.width; startX >= 0 && startX < width; startX += step) {
            yValues.clear();
            auto max = static_cast<int>((maxLineHeight + (currJump * 2)) / 2);
            auto low = (max > startY) ? -static_cast<int>(startY) : -max;
            if (startY + max > maxHeight) max = maxHeight - startY;
            for (; low <= max; ++low) {
                const auto y = startY + low;
                if (colour.withinTolerance(imageData.getRGB(startX, y))) yValues.emplace_back(y);
            }
            if (!yValues.empty()) {
                currJump = 0;
                startY = yValues[yValues.size() / 2]; // is sorted already
                trace[startX] = startY;
                RGB newRGB = imageData.getRGB(startX, startY);
                if (colour.withinTolerance(newRGB)) colour.addToAverage(newRGB);
                continue;
            }
            if (currJump < maxJump) ++currJump;
            else break;
        }
    }

    Trace newTrace(const TraceData& traceData, const bool traceLeft=false) const {
        const auto maxLineHeight = std::max<uint32_t>(0, imageData.height / 20);
        const auto maxJump = std::max<uint32_t>(0, imageData.width / 50);
        auto baselineColour = RGBTools(imageData.getRGB(traceData.x, traceData.y), traceData.colourTolerance);

        frTrace newTrace{trace};
        newTrace.erase(newTrace.lower_bound(traceData.x), newTrace.end());

        if (traceLeft) Trace::traceFor(traceData.x - 1, traceData.y, -1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);
        Trace::traceFor(traceData.x, traceData.y, 1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);

        return {imageData, std::move(newTrace)};
    }

    // Gaussian smoothing
    Trace smooth(int windowSize, const double sigma) const {
        frTrace newTrace{};
        const double multi = -0.5 / (sigma * sigma);
        if (windowSize % 2 == 0) {
            ++windowSize;
        }
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
        return {imageData, std::move(newTrace)};
    }

    inline Trace standardSmooth(int width) const {
        const int windowSize = std::max(width / 150, 2);
        return smooth(windowSize, static_cast<double>(windowSize) / 2.0);
    }

    Trace eraseRegion(uint32_t begin, uint32_t end) const {
        frTrace newTrace{trace};
        const auto higher = newTrace.upper_bound(end);
        for (auto lower = newTrace.lower_bound(begin); lower != higher;) lower = newTrace.erase(lower);
        return {imageData, std::move(newTrace)};
    }

    Trace addPoint(const TraceData& traceData) const {
        frTrace newTrace{trace};
        newTrace[traceData.x] = traceData.y;
        return {imageData, std::move(newTrace)};
    }

    size_t size() const noexcept {
        return trace.size();
    }

    bool empty() const noexcept {
        return trace.empty();
    }
};

struct TraceHistory {
    std::stack<Trace> history;
    std::stack<Trace> future;
    const ImageData& imageData;

    TraceHistory(const ImageData& data) : imageData(data) {
        history.emplace(Trace{data});
    }

    const Trace& getLatest() const {
        return history.top();
    }

    void clearFuture() {
        while (!future.empty()) future.pop();
    }

    const Trace& add(Trace&& trace) {
        if (history.top().empty() && trace.empty()) {
            return history.top();
        }
        clearFuture();
        history.emplace(std::move(trace));
        return history.top();
    }

    const Trace& undo() {
        if (history.size() > 1) {
            future.emplace(std::move(history.top()));
            history.pop();
        }
        return history.top();
    }

    const Trace& redo() {
        if (!future.empty()) {
            history.emplace(std::move(future.top()));
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
};

std::function<double(double)> contiguousLinearInterpolation(const std::vector<std::pair<double, double>>& FRxSPL) {
    const auto firstF = FRxSPL.front().first, lastF = FRxSPL.back().first,
    firstV = FRxSPL.front().second, lastV = FRxSPL.back().second;
    const auto l = FRxSPL.size();

    uint32_t pos = 0;
    return [&FRxSPL, firstF, lastF, firstV, lastV, l, pos] (const double freq) mutable {
        if (freq <= firstF) return firstV;
        if (freq >= lastF) return lastV;
        std::pair<double, double> lower, upper;
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

Trace getPotentialTrace(const ImageData& imageData, TraceData traceData, const std::function<uint32_t(RGB)>& differenceFunc) {
    auto bestY = 0, currentDiff = 0;
    const auto middleX = imageData.width / 2;
    const auto yRange = imageData.height / 5;
    const auto middleY = imageData.height / 2;
    auto y = middleY - yRange;

    for(const auto endY = middleY + yRange; y <= endY; ++y) {
        if (const auto diff = differenceFunc(imageData.getRGB(middleX, y)); diff >= std::max(10, currentDiff)) {
            bestY = y;
            currentDiff = diff;
        }
    }

    if (bestY > 0) {
        traceData.x = middleX;
        traceData.y = bestY;
        return Trace{imageData}.newTrace(traceData, true);
    }
    return {imageData};
}

void padOutputData(const ImageData& original, ImageData& output) {
    const auto width = original.width, height = original.height;
    const auto maxWidthOrig = width * original.channels, maxWidthOut = width * output.channels;
    const auto data = original.data.get();
    auto outputData = output.data.get();
    // CAN ONLY TAKE 3x3 KERNELS FOR NOW DUE TO THIS
    // also cant just copy memory as input is 4 channels, output is 1
    // Copy top and bottom rows
    for (size_t x = 0; x < width; ++x) {
        size_t orx = x * 4;
        outputData[x] = (data[orx] + data[orx + 1] + data[orx + 2]) / 3;

        orx += (height - 1) * maxWidthOrig;
        outputData[x + ((height - 1) * maxWidthOut)] = (data[orx] + data[orx + 1] + data[orx + 2]) / 3;
    }
    // Copy left and right columns
    for (size_t y = 0; y < height; ++y) {
        size_t ory = y * maxWidthOrig, ouy = y * maxWidthOut;
        outputData[ouy] = (data[ory] + data[ory + 1] + data[ory + 2]) / 3;

        ory += maxWidthOrig - 4;
        outputData[ouy + maxWidthOut - 1] = (data[ory] + data[ory + 1] + data[ory + 2]) / 3;
    }
}

void applySobel(const ImageData& original, ImageData& outX, ImageData& outY) {
    const auto widthBound = original.width - 1, heightBound = original.height - 1;
    const auto maxWidthOrig = original.width * original.channels, maxWidthOut = original.width * outX.channels;
    const auto data = original.data.get();
    auto outputDataX = outX.data.get();
    auto outputDataY = outY.data.get();

    static constexpr int yFilter[3][3] = {
        {-1, -2, -1},
        { 0,  0,  0},
        { 1,  2,  1}
    };

    static constexpr int xFilter[3][3] = {
        {-1,  0,  1},
        {-2,  0,  2},
        {-1,  0,  1}
    };

    for (size_t y = 1; y < heightBound; ++y) {
        size_t origY = y * maxWidthOrig, 
                outY = y * maxWidthOut;
        for (size_t x = 1; x < widthBound; ++x) {
            int Xsum = 0, Ysum = 0;
            size_t origX = x * 4; // 4 channels assumed

            for (int k = -1; k <= 1; ++k) {
                size_t yPos = origY + (k * maxWidthOrig) + origX;
                const auto knX = xFilter[k + 1];
                const auto knY = yFilter[k + 1];
                for (int l = -1; l <= 1; ++l) {
                    const size_t pos = yPos + (l * 4); // 4 channels assumed
                    int knnX = knX[l + 1], knnY = knY[l + 1];
                    int sum = data[pos] + data[pos + 1] + data[pos + 2];

                    Xsum += sum * knnX;
                    Ysum += sum * knnY;
                }
            }

            const size_t pos = outY + x; // 1 channel assumed
            outputDataX[pos] = static_cast<Colour>(std::clamp(Xsum * 2 / 3, 0, 255));
            outputDataY[pos] = static_cast<Colour>(std::clamp(Ysum * 2 / 3, 0, 255));
        }
    }
}

void invertImage(const ImageData& data) {
    const size_t maxSize = data.getMaxPos();
    for (size_t pos = 0; pos < maxSize; ++pos) data.data[pos] = 255 - data.data[pos];
}

template <bool vertical>
std::set<uint32_t> detectLines(const ImageData& imageData, const uint32_t tolerance) {
    std::set<uint32_t> lines{};
    uint32_t length, otherDirection;
    std::function<bool(uint32_t, uint32_t)> comparator;
    if constexpr (vertical) { // vertical line, representing x axis
        length = imageData.width;
        otherDirection = imageData.height;
        comparator = [&data = imageData, &tolerance = tolerance] (const uint32_t x, const uint32_t y) { return data.getR(x, y) < tolerance; };
    } else {
        length = imageData.height;
        otherDirection = imageData.width;
        comparator = [&data = imageData, &tolerance = tolerance] (const uint32_t y, const uint32_t x) { return data.getR(x, y) < tolerance; };
    }
    const auto upperBound = static_cast<uint32_t>(otherDirection * 0.7), lowerBound = static_cast<uint32_t>(otherDirection * 0.3);
    const auto bound = (upperBound - lowerBound) - static_cast<uint32_t>(0.9 * (upperBound - lowerBound));
    
    std::vector<uint32_t> valid{};
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
    ImageData imageData;
    TraceHistory traceHistory;
    RGBTools backgroundColour{RGB{0,0,0}, 0};
    std::set<uint32_t> vLines;
    std::set<uint32_t> hLines;

    Image(ImageData&& _imageData) : imageData(std::move(_imageData)), traceHistory(imageData) {
        const auto darkMode = (imageData.getBackgroundColour().sum() / 3) < 127;
        if (darkMode) invertImage(imageData);

        {
        auto filteredDataX = ImageData{imageData.width, imageData.height, 1};
        padOutputData(imageData, filteredDataX);
        {
        auto filteredDataY = ImageData{imageData.width, imageData.height, 1};
        padOutputData(imageData, filteredDataY);

        applySobel(imageData, filteredDataX, filteredDataY);
        hLines = detectLines<false>(filteredDataY, 20);
        }
        vLines = detectLines<true>(filteredDataX, 20);
        }

        if (darkMode) invertImage(imageData);

        this->backgroundColour = RGBTools{imageData.getBackgroundColour(), 10};
    }

    inline std::string trace(const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest().newTrace(traceData)).toSVG();
    }

    inline std::string point(const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest().addPoint(traceData)).toSVG();
    }

    inline std::string undo() {
        return traceHistory.undo().toSVG();
    }

    inline std::string redo() {
        return traceHistory.redo().toSVG();
    }

    inline int historyStatus() {
        return (traceHistory.undoAvailable() << 1) | traceHistory.redoAvailable();
    }

    std::string autoTrace(const TraceData&& traceData) {
        auto traceOne = getPotentialTrace(imageData, traceData, RGB::biggestDifference);
        auto traceTwo = getPotentialTrace(imageData, traceData, [&bgRGB = backgroundColour.rgb] (const RGB& rgb) { return bgRGB.getDifference(rgb); });
        if (traceOne.size() > traceTwo.size()) {
            traceHistory.add(traceOne.standardSmooth(static_cast<int>(imageData.width)));
        } else {
            traceHistory.add(traceTwo.standardSmooth(static_cast<int>(imageData.width)));
        }
        return traceHistory.getLatest().toSVG();
    }

    std::string exportTrace(const ExportData&& exportData) const {
        const auto FRBottomPixel = exportData.FRBottomPixel, FRRatio = exportData.FRRatio,
        logFRBottomValue = exportData.logFRBottomValue, SPLBottomPixel = exportData.SPLBottomPixel,
        SPLRatio = exportData.SPLRatio, SPLBottomValue = exportData.SPLBottomValue,
        PPOStep = exportData.PPOStep, logMaxFR = exportData.logMaxFR;
        auto str = ExportString{exportData.delim};

        std::vector<std::pair<double, double>> FRxSPL{};
        for (const auto& [x, y] : traceHistory.getLatest().clean()) {
            FRxSPL.emplace_back(pow(10, (x - FRBottomPixel) * FRRatio + logFRBottomValue), (y - SPLBottomPixel) * SPLRatio + SPLBottomValue);
        }

        if(!FRxSPL.empty()) {
            const auto interp = contiguousLinearInterpolation(FRxSPL);
            for(auto v = exportData.logMinFR; ; v += PPOStep) {
                const auto freq = pow(10, v);
                str.addData(freq, interp(freq));
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
        return imageData.getRGB(x, y);
    }

    inline std::string getPath() const {
        return traceHistory.getLatest().toSVG();
    }

    void inline clear() {
        traceHistory.add(Trace{imageData});
    }

    inline std::string eraseRegion(uint32_t begin, uint32_t end) {
        auto result = traceHistory.getLatest().eraseRegion(begin, end);
        if (result.size() != traceHistory.getLatest().size()) {
            traceHistory.add(std::move(result));
        }
        return traceHistory.getLatest().toSVG();
    }

    inline std::string smoothTrace() {
        return traceHistory.add(traceHistory.getLatest().standardSmooth(imageData.width)).toSVG();
    }
};

struct ReturnedString {
    const char* data;
    std::size_t size;
    std::string _str;

    inline static ReturnedString* make(std::string&& str);
};

namespace {
    Image* currentImage = nullptr;
    ReturnedString returnStr;
}

inline ReturnedString* ReturnedString::make(std::string&& str) {
    returnStr._str = std::move(str);
    returnStr.size = returnStr._str.size();
    returnStr.data = returnStr._str.data();
    return &returnStr;
}

extern "C" {
    // Image Control
    EMSCRIPTEN_KEEPALIVE void* create_buffer(const uint32_t width, const uint32_t height) {
        return ImageData::allocate_buffer(width, height, 4);
    }

    EMSCRIPTEN_KEEPALIVE void setCurrent(Image* ptr) {
        currentImage = ptr;
    }

    EMSCRIPTEN_KEEPALIVE void* addImage(Colour* data, const uint32_t width, const uint32_t height) {
        // Images come in with 4 channels (RGBA)
        auto ptr = new Image{ImageData{data, width, height, 4}};
        currentImage = ptr;
        return ptr;
    }

    EMSCRIPTEN_KEEPALIVE void removeImage(Image* ptr) {
        if (currentImage == ptr) currentImage = nullptr;
        delete ptr;
    }

    EMSCRIPTEN_KEEPALIVE int historyStatus() {
        return currentImage->historyStatus();
    }

    // Tracing
    EMSCRIPTEN_KEEPALIVE void* trace(const uint32_t x, const uint32_t y, const uint32_t colourTolerance) {
        return ReturnedString::make(currentImage->trace(TraceData{x, y, colourTolerance}));
    }

    EMSCRIPTEN_KEEPALIVE void* undo() {
        return ReturnedString::make(currentImage->undo());
    }

    EMSCRIPTEN_KEEPALIVE void* redo() {
        return ReturnedString::make(currentImage->redo());
    }

    EMSCRIPTEN_KEEPALIVE void clear() {
        currentImage->clear();
    }

    EMSCRIPTEN_KEEPALIVE void* point(const uint32_t x, const uint32_t y) {
        return ReturnedString::make(currentImage->point(TraceData{x, y}));
    }

    EMSCRIPTEN_KEEPALIVE void* autoTrace(const uint32_t colourTolerance) {
        return ReturnedString::make(currentImage->autoTrace(TraceData{colourTolerance}));
    }

    EMSCRIPTEN_KEEPALIVE void* eraseRegion(uint32_t begin, uint32_t end) {
        return ReturnedString::make(currentImage->eraseRegion(begin, end));
    }

    EMSCRIPTEN_KEEPALIVE void* smoothTrace() {
        return ReturnedString::make(currentImage->smoothTrace());
    }

    // Exporting
    EMSCRIPTEN_KEEPALIVE void* exportTrace(const int PPO, const int delim, const double lowFRExport,
        const double highFRExport, const double SPLTopValue, const double SPLTopPixel, const double SPLBottomValue,
        const double SPLBottomPixel, const double FRTopValue, const double FRTopPixel, const double FRBottomValue,
        const double FRBottomPixel) {
        return ReturnedString::make(currentImage->exportTrace(ExportData{PPO, delim, lowFRExport, highFRExport,
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

    EMSCRIPTEN_KEEPALIVE void* getCurrentPath() {
        return ReturnedString::make(currentImage->getPath());
    }
}