#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdint>
#include <map>
#include <numeric>
#include <string>
#include <utility>
#include <vector>
#include "emscripten.h"

// test:
// emcc imageTracer.cpp -O0 -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS='["cwrap"]' -s ASSERTIONS=1 -sNO_DISABLE_EXCEPTION_CATCHING
// release:
// emcc imageTracer.cpp -O3 -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS='["cwrap"]'


using namespace std;

typedef uint8_t Colour;

static inline string DEFAULT_COLOUR = "#ff0000";
static inline string ALT_COLOUR = "#00ff7b";

struct ImageData {
    vector<Colour> data;
    const int width, height;

    ImageData(const Colour* data, const int width, const int height) : width(width), height(height) {
        this->data = vector<Colour>();
        const auto max = width * height * 4;
        for (auto i = 0; i < max; ++i) {
            this->data.emplace_back(data[i]);
        }
    }
};

struct RGB {
    Colour R, G, B;

    RGB(const Colour r, const Colour g, const Colour b) : R(r), G(g), B(b) {}

    static Colour biggestDifference(const RGB& rgb) {
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
        return to_string(R) + " " + to_string(G) + " " + to_string(B);
    }
};

struct RGBTools {
    RGB rgb;
    const long tolerance;
    int count = 1;

    RGBTools(const RGB rgb, const long tolerance) : rgb(rgb), tolerance(tolerance) {}

    [[nodiscard]] bool withinTolerance(const RGB& rgb) const {
        return this->rgb.getDifference(rgb) <= tolerance;
    }

    void addToAverage(const RGB& rgb) {
        this->rgb.R += static_cast<Colour>((sqrt((pow(this->rgb.R, 2) + pow(rgb.R, 2)) / 2) - this->rgb.R) / count);
        this->rgb.G += static_cast<Colour>((sqrt((pow(this->rgb.G, 2) + pow(rgb.G, 2)) / 2) - this->rgb.G) / count);
        this->rgb.B += static_cast<Colour>((sqrt((pow(this->rgb.B, 2) + pow(rgb.B, 2)) / 2) - this->rgb.B) / count);
        ++count;
    }

    [[nodiscard]] string getTraceColour() const {
        if (min(min(this->rgb.R, this->rgb.G), this->rgb.B) == this->rgb.R) return DEFAULT_COLOUR;
        return ALT_COLOUR;
    }

    static RGB getRGB(const long& x, const long& y, const ImageData& imageData) {
        const auto pos = y * imageData.width * 4 + x * 4;
        return RGB{imageData.data.at(pos), imageData.data.at(pos + 1), imageData.data.at(pos + 2)};
    }
};

struct TraceData {
    int x, y, maxLineHeightOffset = 0, maxJumpOffset = 0, colourTolerance = 0;

    TraceData(const int x, const int y) : x(x), y(y) {}
    TraceData(const int x, const int y, const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) : x(x), y(y), maxLineHeightOffset(maxLineHeightOffset), maxJumpOffset(maxJumpOffset), colourTolerance(colourTolerance) {}
};

class Trace {
private:
    static void checkPixel(const int& x, const int& y, const RGBTools& baselineColour, vector<RGB>& colours, vector<int>& yValues, const ImageData& imageData) {
        const auto yVal = max(0, min(imageData.height - 1, y));
        if (const auto col = RGBTools::getRGB(x, yVal, imageData); baselineColour.withinTolerance(col)) {
            colours.push_back(col);
            yValues.push_back(yVal);
        }
    }

    static void traceFor(int startX, int startY, const int step, map<int, int>& trace, const ImageData& imageData, const int maxLineHeight, const int maxJump, RGBTools& colour) {
        vector<RGB> colours{};
        vector<int> yValues{};
        int currJump = 0;
        for (; startX >= 0 && startX < imageData.width; startX += step) {
            colours.clear();
            yValues.clear();
            const auto max = maxLineHeight + (currJump * 2);
            checkPixel(startX, startY, colour, colours, yValues, imageData);
            for (auto z = 1; z <= max; ++z) {
                checkPixel(startX, startY + z, colour, colours, yValues, imageData);
                checkPixel(startX, startY - z, colour, colours, yValues, imageData);
            }
            if (!colours.empty()) {
                currJump = 0;
                for_each(colours.begin(), colours.end(), [&colour] (const RGB& col){ colour.addToAverage(col); });
                startY = static_cast<int>(floor(reduce(yValues.begin(), yValues.end()) / static_cast<int>(yValues.size())));
                trace[startX] = startY;
                continue;
            }
            if (currJump < maxJump) ++currJump;
            else break;
        }
    }

    [[nodiscard]] vector<pair<int, int>> clean() const {
        vector<pair<int, int>> simplifiedTrace{};
        if (!trace.empty()) {
            if (trace.size() > 2) {
                auto iter = trace.begin();
                simplifiedTrace.emplace_back(iter->first, iter->second);
                auto identity = vector<int>();
                for(++iter; iter != trace.end(); ++iter) {
                    identity.clear();
                    const auto previousValue = iter->second;
                    do {
                        identity.emplace_back(iter->first);
                        ++iter;
                    } while(iter != trace.end() && iter->second == previousValue);
                    --iter;
                    if (identity.size() == 1) {
                        simplifiedTrace.emplace_back(identity[0], previousValue);
                    } else {
                        simplifiedTrace.emplace_back(static_cast<int>(reduce(identity.begin(), identity.end()) / identity.size()), previousValue);
                    }
                }
                if (simplifiedTrace.back().first != trace.rbegin()->first) {
                    simplifiedTrace.emplace_back(trace.rbegin()->first, trace.rbegin()->second);
                }
            } else {
                copy(trace.begin(), trace.end(), back_inserter(simplifiedTrace));
            }
        }
        return simplifiedTrace;
    }
public:
    const map<int, int> trace;
    const string colour;

    Trace(const map<int, int>& trace, string colour) : trace(trace), colour(std::move(colour)) {}

    [[nodiscard]] string toSVG() const {
        if (const auto res = clean(); !res.empty()) {
            auto iter = res.begin();
            auto svg = "M" + to_string(iter->first) + " " + to_string(iter->second);
            for (++iter; iter != res.end(); ++iter) {
                svg += " L" + to_string(iter->first) + " " + to_string(iter->second);
            }
            return svg;
        }
        return "";
    }

    [[nodiscard]] Trace* traceFrom(const ImageData& imageData, const TraceData& traceData) const {
        const auto maxLineHeight = max(0, static_cast<int>(floor(imageData.height * 0.05)) + traceData.maxLineHeightOffset);
        const auto maxJump = max(0, static_cast<int>(floor(imageData.width * 0.02)) + traceData.maxJumpOffset);
        auto baselineColour = RGBTools(RGBTools::getRGB(traceData.x, traceData.y, imageData), traceData.colourTolerance);
        auto newTrace = map(trace);

        traceFor(traceData.x, traceData.y, -1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);
        traceFor(traceData.x + 1, traceData.y, 1, newTrace, imageData, maxLineHeight, maxJump, baselineColour);

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
};

struct ExportString {
    string data;
    string delim;

    explicit ExportString(const string& delim = "tab") {
        if (delim == "tab") {
            this->delim = "\t";
        } else {
            this->delim = " ";
        }
        data = "* Exported with UsyTrace, available at https://usyless.github.io/trace\n* Freq(Hz)" + this->delim + "SPL(dB)";
    }

    void addData(const double freq, const double spl) { // make sure to setprecision() before using
        data += "\n" + to_string(freq) + delim + to_string(spl);
    }

    [[nodiscard]] string getData() const {
        return data;
    }
};

struct TraceHistory {
    vector<Trace*> history;

    TraceHistory() {
        history = vector<Trace*>();
        history.emplace_back(new Trace{map<int, int>(), DEFAULT_COLOUR});
    }

    void add(Trace* trace) {
        history.push_back(trace);
    }

    [[nodiscard]] Trace* getLatest() const {
        return history.back();
    }

    Trace* undo() {
        Trace* last = getLatest();
        if (history.size() > 1) {
            delete last;
            history.pop_back();
            last = getLatest();
        }
        return last;
    }

    ~TraceHistory() {
        for_each(history.begin(), history.end(), [] (const Trace* trace){ delete trace; });
    }
};

RGB getBackgroundColour(const ImageData& imageData) {
    auto colours = map<RGB, int>();
    const auto mY = imageData.height;
    const auto mX = imageData.width;
    const long xJump = static_cast<long>(floor(mX * 0.01));
    const long yJump = static_cast<long>(floor(mY * 0.01));

    for (auto y = 0; y < mY; y += yJump) {
        for (auto x = 0; x < mX; x += xJump) {
            ++colours[RGBTools::getRGB(x, y, imageData)];
        }
    }
    return max_element(colours.begin(),colours.end(),[] (const std::pair<RGB, int>& a, const std::pair<RGB, int>& b){ return a.second < b.second; } )->first;
}

struct Image {
    const ImageData imageData;
    TraceHistory traceHistory;
    const RGBTools backgroundColour;

    explicit Image(const ImageData& imageData) : imageData(imageData), traceHistory(TraceHistory()), backgroundColour(RGBTools(getBackgroundColour(imageData), 10)) {}

    [[nodiscard]] string trace(const int x, const int y, const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) {
        const auto latest = traceHistory.getLatest()->traceFrom(imageData, TraceData{x, y, maxLineHeightOffset, maxJumpOffset, colourTolerance});
        traceHistory.add(latest);
        return latest->getDefaultReturn();
    }

    [[nodiscard]] string point(const int x, const int y) {
        const auto latest = traceHistory.getLatest()->addPoint(TraceData{x, y});
        traceHistory.add(latest);
        return latest->getDefaultReturn();
    }

    [[nodiscard]] string undo() {
        const auto prev = traceHistory.undo();
        return prev->getDefaultReturn();
    }

    void clear() {
        traceHistory.add(new Trace{map<int, int>(), DEFAULT_COLOUR});
    }
};

struct ImageQueue {
    map<int, Image*> images;

    ImageQueue() : images(map<int, Image*>()) {}

    void add(const int id, Image* image) {
        images.insert({id, image});
    }

    void remove(const int id) {
        delete images.at(id);
        images.erase(id);
    }

    [[nodiscard]] Image* get(const int id) const {
        return images.at(id);
    }

    ~ImageQueue() {
        for(auto& [_, image] : images) {
            delete image;
        }
    }
} imageQueue;

#define EXTERN extern "C"

EXTERN EMSCRIPTEN_KEEPALIVE char* trace(const int id, const int x, const int y, const int maxLineHeightOffset, const int maxJumpOffset, const int colourTolerance) {
    const auto s = new string(imageQueue.get(id)->trace(x, y, maxLineHeightOffset, maxJumpOffset, colourTolerance));
    return s->data();
}

EXTERN EMSCRIPTEN_KEEPALIVE void addImage(const int id, const Colour* data, const int width, const int height) {
    imageQueue.add(id, new Image{ImageData{data, width, height}});
}

EXTERN EMSCRIPTEN_KEEPALIVE char* undo(const int id) {
    const auto s = new string(imageQueue.get(id)->undo());
    return s->data();
}

EXTERN EMSCRIPTEN_KEEPALIVE void clear(const int id) {
    imageQueue.get(id)->clear();
}

EXTERN EMSCRIPTEN_KEEPALIVE char* point(const int id, const int x, const int y) {
    const auto s = new string(imageQueue.get(id)->point(x, y));
    return s->data();
}

EXTERN EMSCRIPTEN_KEEPALIVE void removeImage(const int id) {
    imageQueue.remove(id);
}

EXTERN EMSCRIPTEN_KEEPALIVE void* create_buffer(const int width, const int height) {
    return malloc(width * height * 4 * sizeof(uint8_t));
}

EXTERN EMSCRIPTEN_KEEPALIVE void destroy_buffer(uint8_t* p) {
    free(p);
}
