#include <algorithm>
#include <chrono>
#include <cmath>
#include <iterator>
#include <memory>
#include <stack>
#include <vector>
#include <set>
#include <cstdint>
#include <string>
#include <usylibpp/strings.hpp>

#ifdef __EMSCRIPTEN__
    #include <emscripten.h>
#else
    #define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#endif

#include "structures.hpp"
#include "algorithms/algorithms.hpp"
#include "compensation.hpp"

enum class delim_t : std::uint8_t {
    Tab = 1
};

struct ExportData {
    delim_t delim;
    Compensation compensation;
    double PPOStep, logMinFR, logMaxFR, logFRBottomValue, SPLRatio, FRRatio, SPLBottomValue, SPLBottomPixel, FRBottomPixel;

    constexpr ExportData(
        const int PPO,
        const delim_t delim,
        const Compensation compensation,
        const double lowFRExport,
        const double highFRExport,
        const double SPLTopValue,
        const double SPLTopPixel,
        const double SPLBottomValue,
        const double SPLBottomPixel,
        const double FRTopValue,
        const double FRTopPixel,
        const double FRBottomValue,
        const double FRBottomPixel
    ) noexcept
        : delim(delim),
          compensation(compensation),
          PPOStep(log10(pow(2, 1.0 / PPO))),
          logMinFR(log10(lowFRExport)),
          logMaxFR(log10(highFRExport)),
          logFRBottomValue(log10(FRBottomValue)),
          SPLRatio((SPLTopValue - SPLBottomValue) / (SPLTopPixel - SPLBottomPixel)),
          FRRatio((log10(FRTopValue) - logFRBottomValue) / (FRTopPixel - FRBottomPixel)),
          SPLBottomValue(SPLBottomValue),
          SPLBottomPixel(SPLBottomPixel),
          FRBottomPixel(FRBottomPixel) {}
};

// delim 1 = tab, else = space
struct ExportString {
    std::string data;
    std::string_view delim{" "};

    constexpr explicit ExportString(const delim_t delim = delim_t::Tab) {
        if (delim == delim_t::Tab) this->delim = "\t";
        data = ulp::str::concat_strings("* Exported with UsyTrace, available at https://usyless.uk/trace\n* Freq(Hz)", this->delim, "SPL(dB)");
    }

    constexpr void addData(auto&& freq, auto&& spl) {
        data += ulp::str::concat_strings("\n", std::to_string(freq), delim, std::to_string(spl));
    }
};

struct TraceHistory {
    std::stack<Trace> history;
    std::stack<Trace> future;
    std::chrono::steady_clock::time_point last_full_add{std::chrono::steady_clock::now()};
    std::chrono::steady_clock::time_point last_add{last_full_add};
    const ImageData<4>& imageData;

    static constexpr std::chrono::steady_clock::duration ignore_time{std::chrono::milliseconds{100}};
    static constexpr std::chrono::steady_clock::duration max_ignore_time{std::chrono::milliseconds{500}};

    TraceHistory(const ImageData<4>& data) : imageData(data) {
        history.emplace(Trace{data});
    }

    const Trace& getLatest() const {
        return history.top();
    }

    void clearFuture() {
        while (!future.empty()) future.pop();
    }

    const Trace& add(Trace&& trace) {
        if ((history.top().empty() && trace.empty()) || (history.top() == trace)) {
            return history.top();
        }

        auto now = std::chrono::steady_clock::now();

        if ((now - last_full_add) >= max_ignore_time) {
            last_full_add = now;
        } else if ((now - last_add) < ignore_time) {
            if (undoAvailable()) history.pop();
            last_add = now;
        } else {
            last_add = now;
        }

        clearFuture();
        history.emplace(std::move(trace));
        return getLatest();
    }

    const Trace& undo() {
        if (history.size() > 1) {
            future.emplace(std::move(history.top()));
            history.pop();
        }
        return getLatest();
    }

    const Trace& redo() {
        if (!future.empty()) {
            history.emplace(std::move(future.top()));
            future.pop();
        }
        return getLatest();
    }

    inline bool redoAvailable() {
        return !future.empty();
    }

    inline bool undoAvailable() {
        return history.size() > 1;
    }
};

auto contiguousLinearInterpolation(const std::vector<std::pair<double, double>>& FRxSPL) {
    const auto firstF = FRxSPL.front().first;
    const auto lastF = FRxSPL.back().first;
    const auto firstV = FRxSPL.front().second;
    const auto lastV = FRxSPL.back().second;
    const auto l = FRxSPL.size();

    uint32_t pos = 0;
    return [&FRxSPL, firstF, lastF, firstV, lastV, l, pos] (const double freq) mutable {
        if (freq <= firstF) return firstV;
        if (freq >= lastF) return lastV;
        std::pair<double, double> lower{}, upper{};
        for (; pos < l; ++pos) {
            if (FRxSPL[pos].first < freq) lower = FRxSPL[pos];
            else {
                upper = FRxSPL[pos--];
                break;
            }
        }
        if (lower.second == upper.second) return lower.second;
        return (upper.second - lower.second) * ((freq - lower.first) / (upper.first - lower.first)) + lower.second;
    };
}

void padOutputData(const ImageData<4>& original, ImageData<1>& output) {
    const auto width = original.width, height = original.height;
    const auto maxWidthOrig = width * original.channels, maxWidthOut = width * output.channels;
    const auto data = original.data.get();
    auto outputData = output.data.get();
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

void applySobel(const ImageData<4>& original, ImageData<1>& outX, ImageData<1>& outY) {
    const size_t widthBound = original.width - 1, heightBound = original.height - 1;
    const size_t maxWidthOrig = original.width * original.channels, maxWidthOut = original.width * outX.channels;
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
        size_t origY = y * maxWidthOrig;
        size_t outYPos = y * maxWidthOut;
        for (size_t x = 1; x < widthBound; ++x) {
            int Xsum = 0;
            int Ysum = 0;
            size_t origX = x * 4;

            for (int k = -1; k <= 1; ++k) {
                size_t yPos = origY + (k * maxWidthOrig) + origX;
                const auto knX = xFilter[k + 1];
                const auto knY = yFilter[k + 1];

                for (int l = -1; l <= 1; ++l) {
                    const size_t pos = yPos + (l * 4);
                    int sum = data[pos] + data[pos + 1] + data[pos + 2];

                    Xsum += sum * knX[l + 1];
                    Ysum += sum * knY[l + 1];
                }
            }

            const size_t pos = outYPos + x;
            outputDataX[pos] = std::clamp(Xsum * 2 / 3, 0, 255);
            outputDataY[pos] = std::clamp(Ysum * 2 / 3, 0, 255);
        }
    }
}

void invertImage(ImageData<4>& data) {
    const size_t pixelCount = static_cast<size_t>(data.width) * data.height;
    auto* pixels = reinterpret_cast<uint32_t*>(data.data.get());

    for (size_t i = 0; i < pixelCount; ++i) pixels[i] = ~pixels[i];
}

template <bool vertical>
std::set<uint32_t> detectLines(const ImageData<1>& imageData, const uint32_t tolerance) {
    std::set<uint32_t> lines{};
    uint32_t length, otherDirection;
    if constexpr (vertical) { // vertical line, representing x axis
        length = imageData.width;
        otherDirection = imageData.height;
    } else {
        length = imageData.height;
        otherDirection = imageData.width;
    }

    auto comparator = [&imageData, tolerance](const uint32_t x, const uint32_t y) {
        if constexpr (vertical) {
            return imageData.getR(x, y) < tolerance;
        } else {
            return imageData.getR(y, x) < tolerance;
        }
    };

    const auto upperBound = static_cast<uint32_t>(otherDirection * 0.7), lowerBound = static_cast<uint32_t>(otherDirection * 0.3);
    const auto bound = (upperBound - lowerBound) - static_cast<uint32_t>(0.9 * (upperBound - lowerBound));
    
    uint64_t validSum = 0;
    uint32_t validCount = 0;

    for (uint32_t pos = 0; pos < length; ++pos) {
        uint32_t failedCount = 0;
        for (auto j = lowerBound; j <= upperBound; ++j) {
            if (comparator(pos, j) && ++failedCount > bound) break;
        }
        if (failedCount <= bound) {
            validSum += pos;
            ++validCount;
        } else if (validCount > 0) {
            lines.emplace_hint(lines.end(), static_cast<uint32_t>(validSum / validCount));
            validSum = 0;
            validCount = 0;
        }
    }
    if (validCount > 0) {
        lines.emplace_hint(lines.end(), static_cast<uint32_t>(validSum / validCount));
    }

    return lines;
}

struct Image {
    ImageData<4> imageData;
    TraceHistory traceHistory;
    RGB backgroundColour{255, 255, 255};
    std::optional<std::vector<ColourCluster>> colourClusters;
    std::set<uint32_t> vLines;
    std::set<uint32_t> hLines;

    Image(ImageData<4>&& _imageData, const uint32_t counter) : imageData(std::move(_imageData)), traceHistory(imageData) {
        this->backgroundColour = imageData.getBackgroundColour();

        const auto needsInverse = (this->backgroundColour.sum() / 3) < 127;

    #ifdef __EMSCRIPTEN__
        EM_ASM( onImageInverseReady($0, $1), counter, needsInverse );
    #endif

        if (needsInverse) invertImage(imageData);

        {
        auto filteredDataX = ImageData<1>{imageData.width, imageData.height};
        padOutputData(imageData, filteredDataX);
        auto filteredDataY = ImageData<1>{imageData.width, imageData.height};
        padOutputData(imageData, filteredDataY);

        applySobel(imageData, filteredDataX, filteredDataY);
        hLines = detectLines<false>(filteredDataY, 20);
        vLines = detectLines<true>(filteredDataX, 20);
        }

        if (needsInverse) invertImage(imageData);
    }

    inline TraceContext context() {
        return {imageData, ColourVec{backgroundColour}, colourClusters, hLines};
    }

    inline std::string trace(const TraceAlgorithm algorithm, const TraceData&& traceData) {
        return traceHistory.add(traceHistory.getLatest().newTrace(algorithm, context(), traceData)).toSVG();
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

    inline std::string autoTrace(const TraceData&& traceData) {
        const auto traceOneData = Algorithms::Normal::getPotentialTrace(imageData, traceData, RGB::biggestDifference);
        const auto traceTwoData = Algorithms::Normal::getPotentialTrace(imageData, traceData, [&bgRGB = backgroundColour] (const RGB& rgb) { return bgRGB.getDifference(rgb); });

        auto ctx = context();
        std::array<Trace, 4> traces{
            Trace{imageData}.newTrace(TraceAlgorithm::Normal, ctx, traceOneData, true),
            Trace{imageData}.newTrace(TraceAlgorithm::Normal, ctx, traceTwoData, true),
            Trace{imageData}.newTrace(TraceAlgorithm::Experimental, ctx, traceOneData, true),
            Trace{imageData}.newTrace(TraceAlgorithm::Experimental, ctx, traceTwoData, true),
        };

        const auto& largestTrace = *std::ranges::max_element(traces, {}, &Trace::size);
        traceHistory.add(largestTrace.standardSmooth(static_cast<int>(imageData.width)));
        return traceHistory.getLatest().toSVG();
    }

    inline std::string offsetTrace(uint8_t direction, uint32_t magnitude) {
        return traceHistory.add(traceHistory.getLatest().offsetTrace(direction, magnitude)).toSVG();
    }

    std::string exportTrace(const ExportData& exportData) const {
        const auto FRBottomPixel = exportData.FRBottomPixel, FRRatio = exportData.FRRatio,
        logFRBottomValue = exportData.logFRBottomValue, SPLBottomPixel = exportData.SPLBottomPixel,
        SPLRatio = exportData.SPLRatio, SPLBottomValue = exportData.SPLBottomValue,
        PPOStep = exportData.PPOStep, logMaxFR = exportData.logMaxFR;
        auto str = ExportString{exportData.delim};

        std::vector<std::pair<double, double>> FRxSPL{};
        const auto cleanTrace = traceHistory.getLatest().clean();
        FRxSPL.reserve(cleanTrace.size());

        for (const auto& [x, y] : cleanTrace) {
            FRxSPL.emplace_back(pow(10, (x - FRBottomPixel) * FRRatio + logFRBottomValue), (y - SPLBottomPixel) * SPLRatio + SPLBottomValue);
        }

        if (!FRxSPL.empty()) {
            auto interp = contiguousLinearInterpolation(FRxSPL);
            for (auto v = exportData.logMinFR; ; v += PPOStep) {
                const auto freq = pow(10, v);
                str.addData(freq, CompensationTools::apply(exportData.compensation, freq, interp(freq)));
                if (v >= logMaxFR) break;
            }
        }

        return std::move(str.data);
    }

    uint32_t snapLine(uint32_t pos, const int lineDir, const int moveDir) const {
        const auto& lines = (lineDir == 1) ? vLines : hLines;
        pos += moveDir;
        auto bound = lines.upper_bound(pos);
        bound = (moveDir != 1 && bound != lines.begin()) ? std::prev(bound) : bound;
        if (bound == lines.end()) return pos - moveDir;
        return *bound;
    }

    inline RGB getPixelColour(const uint32_t x, const uint32_t y) const {
        const auto clamped = TraceData{x, y}.clamp(imageData);
        return imageData.getRGB(clamped.x, clamped.y);
    }

    inline std::string getPath() const {
        return traceHistory.getLatest().toSVG();
    }

    void inline clear() {
        traceHistory.add(Trace{imageData});
    }

    inline std::string eraseRegion(uint32_t begin, uint32_t end) {
        auto result = traceHistory.getLatest().eraseRegion(begin, end);
        if (result.trace.size() != traceHistory.getLatest().trace.size()) { // explicitly use size
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
} __attribute__((packed));

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
        return ImageData<4>::allocate_buffer(width, height);
    }

    EMSCRIPTEN_KEEPALIVE void setCurrent(Image* ptr) {
        currentImage = ptr;
    }

    EMSCRIPTEN_KEEPALIVE void* addImage(Colour* data, const uint32_t width, const uint32_t height, const uint32_t counter) {
        auto ptr = new Image{ImageData<4>{data, width, height}, counter};
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
    EMSCRIPTEN_KEEPALIVE void* trace(const uint32_t x, const uint32_t y, const uint32_t colourTolerance, const TraceAlgorithm algorithm) {
        return ReturnedString::make(currentImage->trace(algorithm, TraceData{x, y, colourTolerance}));
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

    EMSCRIPTEN_KEEPALIVE void* offsetTrace(uint8_t direction, uint32_t magnitude) {
        return ReturnedString::make(currentImage->offsetTrace(direction, magnitude));
    }

    // Exporting
    EMSCRIPTEN_KEEPALIVE void* exportTrace(
        const int PPO,
        const delim_t delim,
        const int compensation,
        const double lowFRExport,
        const double highFRExport,
        const double SPLTopValue,
        const double SPLTopPixel,
        const double SPLBottomValue,
        const double SPLBottomPixel,
        const double FRTopValue,
        const double FRTopPixel,
        const double FRBottomValue,
        const double FRBottomPixel
    ) {
        return ReturnedString::make(currentImage->exportTrace(ExportData{
            PPO,
            delim,
            CompensationTools::fromInt(compensation),
            lowFRExport,
            highFRExport,
            SPLTopValue,
            SPLTopPixel,
            SPLBottomValue,
            SPLBottomPixel,
            FRTopValue,
            FRTopPixel,
            FRBottomValue,
            FRBottomPixel
        }));
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
